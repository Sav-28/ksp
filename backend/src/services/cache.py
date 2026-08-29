"""
Read-through cache for the expensive analytical endpoints.

Backed by Catalyst Cache, with two deliberate design points.

SECOND-LEVEL TTL OVER AN HOURLY API
-----------------------------------
Catalyst's Segment.put(key, value, expiry) takes `expiry` in HOURS, which is far
too coarse for the 2-15 minute freshness these endpoints want. So the payload is
wrapped in an envelope carrying its own absolute expiry, the entry is written with
a generous hourly expiry as a backstop, and freshness is enforced here on read.

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

import json
import logging
import threading
import time
from typing import Any, Callable, Dict, Optional, Tuple

from src.services import catalyst

log = logging.getLogger(__name__)

# Catalyst Cache stores strings and its per-value ceiling is not documented in a
# form we could confirm, so anything above this is computed and left uncached
# rather than risking a rejected write on every request. /api/hotspots is the
# only endpoint close to it, at roughly 115 KB.
MAX_VALUE_BYTES = 256 * 1024

# Bound the in-process tier so a long-running instance cannot grow without limit.
MAX_LOCAL_ENTRIES = 32

_local: Dict[str, Dict[str, Any]] = {}
_local_lock = threading.Lock()

_stats = {
    "catalyst_hits": 0,
    "local_hits": 0,
    "misses": 0,
    "writes": 0,
    "oversize_skips": 0,
    "errors": 0,
}


def _envelope(payload: Any, ttl_seconds: int) -> str:
    return json.dumps({"expires_at": time.time() + ttl_seconds, "payload": payload},
                      default=str, separators=(",", ":"))


def _unwrap(raw: str) -> Optional[Any]:
    """Return the payload if the envelope is still fresh, else None."""
    try:
        env = json.loads(raw)
        if float(env.get("expires_at", 0)) <= time.time():
            return None
        return env.get("payload")
    except (ValueError, TypeError):
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
            log.debug("Catalyst Cache read failed for %s: %s", key, exc)

    local = _local_get(key)
    if local is not None:
        _stats["local_hits"] += 1
        return local, "in-process"

    _stats["misses"] += 1
    value = producer()

    try:
        body = _envelope(value, ttl_seconds)
        if len(body.encode("utf-8")) > MAX_VALUE_BYTES:
            _stats["oversize_skips"] += 1
            return value, "computed-oversize"

        _local_put(key, value, ttl_seconds)
        if seg is not None:
            # Hourly backstop; real freshness comes from the envelope.
            hours = max(1, (ttl_seconds + 3599) // 3600)
            seg.put(key, body, hours)
            _stats["writes"] += 1
    except Exception as exc:
        _stats["errors"] += 1
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
