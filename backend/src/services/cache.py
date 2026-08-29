"""
Read-through cache for the expensive analytical endpoints.

Backed by Catalyst Cache, with two deliberate design points.

SECOND-LEVEL TTL OVER AN HOURLY API
-----------------------------------
Catalyst's Segment.put(key, value, expiry) takes `expiry` in HOURS, which is far
too coarse for the 2-15 minute freshness these endpoints want. So the payload is
wrapped in an envelope carrying its own absolute expiry, the entry is written with
a generous hourly expiry as a backstop, and freshness is enforced here on read.

A 16,000-CHARACTER CEILING PER ITEM
-----------------------------------
Measured, by having a write rejected: LIMIT_REACHED at 19,812 bytes. Cache stores
strings, so the envelope is gzipped and base64'd, which is what makes the
analytical payloads fit at all. Entries carry a 'z1:' marker so plain-JSON entries
from an earlier build still read back and a deploy need not invalidate the cache.
Anything still over the ceiling after compression is reported as
computed-oversize and served from the in-process tier - it is never silently
dropped or silently retried on every request.

EVERY ANSWER NAMES ITS SOURCE
-----------------------------
get_or_compute returns (value, source) where source is one of:

    catalyst-cache   served from Catalyst Cache
    in-process       served from this instance's bounded fallback map
    computed         freshly computed
    computed-oversize  computed, and deliberately not cached (too large)

A silent substitution is the most dishonest thing a cache can do, so callers
surface the source in the response rather than hiding which path answered.

The in-process map exists so caching is real and demonstrable off-platform too -
it is a genuine second tier, not a pretence that Catalyst answered.
"""
from __future__ import annotations

import base64
import gzip
import json
import logging
import threading
import time
from typing import Any, Callable, Dict, Optional, Tuple

from src.services import catalyst

log = logging.getLogger(__name__)

# MEASURED, not guessed. A 19,812-byte write to Catalyst Cache was rejected with
#   CatalystAPIError {'code': 'LIMIT_REACHED',
#                     'message': 'Length of the cache value reached its max length'}
# Zoho's own sources disagree on the number - a support article says 16,000
# characters per item, a metrics page says 32 KB - and the observed rejection
# matches the smaller figure, so that is what is enforced here. Writing above it
# costs a wasted round trip on every miss and gains nothing.
MAX_VALUE_BYTES = 16000

# Which is small enough that the raw JSON for these endpoints does not fit, so the
# envelope is gzipped and base64'd before it is written. Typical ratio on this
# data is 6-10x, which brings /api/compliance/report from ~19.8 KB to a couple of
# KB. /api/hotspots is ~115 KB raw and still does not fit; it is reported as
# computed-oversize and served from the in-process tier rather than pretended
# about. Chunking it across several keys was rejected as more failure modes than
# the saved milliseconds justify.
_GZIP_MARKER = "z1:"

# Bound the in-process tier so a long-running instance cannot grow without limit.
MAX_LOCAL_ENTRIES = 32

_local: Dict[str, Dict[str, Any]] = {}
_local_lock = threading.Lock()

_stats: Dict[str, Any] = {
    "catalyst_hits": 0,
    "local_hits": 0,
    "misses": 0,
    "writes": 0,
    "oversize_skips": 0,
    "errors": 0,
    # Kept because a cache that silently degrades is the thing this module is
    # written to avoid, and log.debug is invisible under uvicorn's log config.
    "last_write_error": None,
    "last_write_bytes": None,       # after gzip+base64, i.e. what Catalyst sees
    "last_write_raw_bytes": None,   # before compression, so the ratio is visible
    "last_read_error": None,
}


def _envelope(payload: Any, ttl_seconds: int) -> str:
    """
    Serialise to the string Catalyst Cache stores: gzipped, base64'd JSON.

    The marker prefix keeps _unwrap able to read plain-JSON entries written by an
    earlier build, so a deploy does not have to invalidate the whole cache.
    """
    return _envelope_with_size(payload, ttl_seconds)[0]


def _envelope_with_size(payload: Any, ttl_seconds: int) -> Tuple[str, int]:
    """As _envelope, but also returns the uncompressed size for reporting."""
    raw = json.dumps({"expires_at": time.time() + ttl_seconds, "payload": payload},
                     default=str, separators=(",", ":"))
    encoded = raw.encode("utf-8")
    packed = gzip.compress(encoded, compresslevel=6)
    return _GZIP_MARKER + base64.b64encode(packed).decode("ascii"), len(encoded)


def _unwrap(raw: str) -> Optional[Any]:
    """Return the payload if the envelope is still fresh, else None."""
    try:
        if raw.startswith(_GZIP_MARKER):
            packed = base64.b64decode(raw[len(_GZIP_MARKER):])
            raw = gzip.decompress(packed).decode("utf-8")
        env = json.loads(raw)
        if float(env.get("expires_at", 0)) <= time.time():
            return None
        return env.get("payload")
    except Exception:
        # A corrupt or unreadable entry is a miss, never an error the caller sees.
        return None


def _local_get(key: str) -> Optional[Any]:
    with _local_lock:
        entry = _local.get(key)
        if not entry:
            return None
        if entry["expires_at"] <= time.time():
            _local.pop(key, None)
            return None
        return entry["payload"]


def _local_put(key: str, payload: Any, ttl_seconds: int) -> None:
    with _local_lock:
        if len(_local) >= MAX_LOCAL_ENTRIES and key not in _local:
            # Drop whichever entry expires soonest; cheap and good enough here.
            oldest = min(_local, key=lambda k: _local[k]["expires_at"])
            _local.pop(oldest, None)
        _local[key] = {"expires_at": time.time() + ttl_seconds, "payload": payload}


def get_or_compute(key: str, ttl_seconds: int,
                   producer: Callable[[], Any]) -> Tuple[Any, str]:
    """
    Return (value, source). Never raises on a cache problem - a cache that can
    take an endpoint down is worse than no cache.
    """
    seg = catalyst.cache_segment()

    if seg is not None:
        try:
            raw = seg.get_value(key)
            if raw:
                payload = _unwrap(raw)
                if payload is not None:
                    _stats["catalyst_hits"] += 1
                    return payload, "catalyst-cache"
        except Exception as exc:
            _stats["errors"] += 1
            _stats["last_read_error"] = f"{key}: {type(exc).__name__}: {exc}"[:300]
            log.debug("Catalyst Cache read failed for %s: %s", key, exc)

    local = _local_get(key)
    if local is not None:
        _stats["local_hits"] += 1
        return local, "in-process"

    _stats["misses"] += 1
    value = producer()

    body, raw_size = _envelope_with_size(value, ttl_seconds)
    size = len(body.encode("utf-8"))
    _stats["last_write_bytes"] = size
    _stats["last_write_raw_bytes"] = raw_size
    if size > MAX_VALUE_BYTES:
        _stats["oversize_skips"] += 1
        # Still cached locally below would be wrong to skip, so fall through to
        # the in-process tier rather than returning uncached.
        _local_put(key, value, ttl_seconds)
        return value, "computed-oversize"

    # The in-process tier is written first and outside the try: it must not be
    # skipped just because the Catalyst write fails, otherwise a rejected remote
    # write would leave the endpoint with no cache at all.
    _local_put(key, value, ttl_seconds)
    if seg is not None:
        try:
            # Hourly backstop; real freshness comes from the envelope.
            hours = max(1, (ttl_seconds + 3599) // 3600)
            seg.put(key, body, hours)
            _stats["writes"] += 1
            _stats["last_write_error"] = None
        except Exception as exc:
            _stats["errors"] += 1
            _stats["last_write_error"] = f"{key} ({size} bytes): {type(exc).__name__}: {exc}"[:300]
            log.debug("Catalyst Cache write failed for %s: %s", key, exc)

    return value, "computed"


def invalidate(prefix: str = "") -> int:
    """Drop in-process entries. Catalyst entries age out via their envelope."""
    with _local_lock:
        keys = [k for k in _local if k.startswith(prefix)]
        for k in keys:
            _local.pop(k, None)
    return len(keys)


def stats() -> Dict[str, Any]:
    """Counters for the service inventory endpoint."""
    seg_available = catalyst.cache_segment() is not None
    return {
        "catalyst_cache_available": seg_available,
        "max_value_bytes": MAX_VALUE_BYTES,
        "local_entries": len(_local),
        **_stats,
    }
