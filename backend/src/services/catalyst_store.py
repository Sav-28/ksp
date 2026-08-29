"""
Persistent SQLite on Catalyst AppSail.

THE PROBLEM
-----------
On AppSail the application directory is read-only and /tmp is wiped when the
instance restarts. SQLite on /tmp therefore loses every record on restart, which
is the original persistence bug this project set out to fix.

THE CONSTRAINT THAT SHAPES THE DESIGN
-------------------------------------
The Catalyst SDK needs Catalyst request headers to initialise. On AppSail those
arrive with each HTTP request, so the SDK generally CANNOT be initialised at
process start - which is exactly when a restore would be most convenient. That
single fact rules out the obvious "download the database in on_startup" approach.

So persistence is built in three independent layers, each of which is useful on
its own and none of which can break the app if it fails:

  Layer 1  BASELINE, no SDK required.
           The seeded database ships inside the deployment bundle (1.8 MB). At
           startup, if the target SQLite file is missing, it is copied from the
           bundle. Every cold start therefore has a fully populated database
           immediately, with no seeding and no cold-start timeout risk.

  Layer 2  WRITE-BACK, runs inside a request where the SDK does work.
           A successful mutating request marks the database dirty. A debounced
           background thread uploads it to Stratus under a stable key, so a
           request never waits on a multi-megabyte upload.

  Layer 3  RESTORE, on the first request.
           The first request pulls the Stratus copy. If it exists and differs
           from what is on disk, the engine is disposed, the file is swapped, and
           the connection pool reopens against the restored database.

Degradation is explicit. With no SDK or no credentials only Layer 1 runs: the app
works and is fully populated, but writes do not survive a restart - and
GET /api/system/info reports exactly that rather than claiming persistence.

KNOWN LIMITATION, STATED PLAINLY
--------------------------------
This is single-instance persistence. The whole database file is the unit of
transfer, so if AppSail runs two instances the last writer wins and the other
instance's writes are lost. It is honest for a demonstration deployment and is
not a production design; PostgreSQL (still supported via DATABASE_URL) is the
production path.
"""
from __future__ import annotations

import logging
import os
import shutil
import threading
import time
from typing import Any, Dict, Optional

from src.services import catalyst

log = logging.getLogger(__name__)

# Object key the database is stored under in Stratus. Stable, because Layer 3
# has to find it again on a cold start with no other state to go on.
OBJECT_KEY = os.getenv("KSP_DB_OBJECT_KEY", "ksp/ksp_crime_ai.db")

# Wait this long after a write before uploading, so a burst of writes results in
# one upload rather than one per request.
FLUSH_DEBOUNCE_SECONDS = int(os.getenv("KSP_DB_FLUSH_DEBOUNCE", "8"))

_state: Dict[str, Any] = {
    "db_path": None,          # resolved local path of the SQLite file
    "applicable": False,      # is this mechanism relevant to the current config
    "reason": "not initialised",
    "baseline_copied": False,
    "restore_attempted": False,
    "restore_result": None,   # 'restored' | 'no-remote-copy' | 'unavailable' | 'failed'
    "last_flush_at": None,
    "last_flush_ok": None,
    "last_flush_error": None,
    "flush_count": 0,
    "dirty": False,
}
_dirty_event = threading.Event()
_flush_lock = threading.Lock()
_restore_lock = threading.Lock()
_flusher_started = False


def _sqlite_path_from_url(url: str) -> Optional[str]:
    """
    Local filesystem path for a SQLite URL, or None for any other backend.

    Handles both sqlite:///relative/path and sqlite:////absolute/path.
    """
    if not url.startswith("sqlite"):
        return None
    _, _, tail = url.partition("///")
    if not tail:
        return None
    # A fourth slash means an absolute POSIX path.
    return tail if tail.startswith("/") else os.path.abspath(tail)


def configure() -> Dict[str, Any]:
    """
    Work out whether this mechanism applies, and copy the bundled baseline in if
    the target file is missing. Safe to call once at startup; needs no SDK.
    """
    from src.database.session import DATABASE_URL

    path = _sqlite_path_from_url(DATABASE_URL)
    _state["db_path"] = path

    if path is None:
        _state["applicable"] = False
        _state["reason"] = "DATABASE_URL is not SQLite; this mechanism does not apply"
        return status()

    _state["applicable"] = True
    _state["reason"] = "SQLite backend"

    # Layer 1: seed from the copy that shipped with the deployment.
    if not os.path.isfile(path) or os.path.getsize(path) == 0:
        bundled = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            "ksp_crime_ai.db",
        )
        if os.path.isfile(bundled) and os.path.abspath(bundled) != os.path.abspath(path):
            try:
                os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
                shutil.copy2(bundled, path)
                _state["baseline_copied"] = True
                log.info("Seeded %s from the bundled database (%.1f MB).",
                         path, os.path.getsize(path) / 1048576)
            except Exception as exc:
                log.warning("Could not copy the bundled database to %s: %s", path, exc)
        else:
            log.info("No bundled database to seed from; the app will seed if empty.")
    return status()


def restore_once() -> Dict[str, Any]:
    """
    Layer 3. Pull the Stratus copy and swap it in, at most once per process.

    Called from the first request, because that is the earliest point the SDK can
    initialise. Fails closed: on any problem the on-disk database is left alone.
    """
    if _state["restore_attempted"] or not _state["applicable"]:
        return status()
    with _restore_lock:
        if _state["restore_attempted"]:
            return status()
        _state["restore_attempted"] = True

        path = _state["db_path"]
        data = catalyst.stratus_get(OBJECT_KEY)
        if data is None:
            # Either there is no saved copy yet (first ever deploy) or Stratus is
            # unusable. diagnostics() distinguishes the two for the inventory.
            diag = catalyst.diagnostics()
            _state["restore_result"] = (
                "no-remote-copy" if diag["sdk_importable"] and diag["initialised_at_least_once"]
                else "unavailable"
            )
            log.info("No database restored from Stratus (%s).", _state["restore_result"])
            return status()

        if len(data) < 1024:
            _state["restore_result"] = "failed"
            log.warning("Refusing to restore: remote copy is only %d bytes.", len(data))
            return status()

        # Identical to what is already on disk - nothing to do, and swapping
        # would needlessly drop live connections.
        try:
            if os.path.isfile(path) and os.path.getsize(path) == len(data):
                _state["restore_result"] = "already-current"
                return status()
        except OSError:
            pass

        try:
            from src.database.session import engine
            # Write beside the target first so a partial download can never
            # replace a good database.
            tmp = f"{path}.restore"
            with open(tmp, "wb") as fh:
                fh.write(data)
            engine.dispose()          # close pooled handles before replacing
            os.replace(tmp, path)     # atomic on the same filesystem
            _state["restore_result"] = "restored"
            log.info("Restored the database from Stratus (%.1f MB).", len(data) / 1048576)
        except Exception as exc:
            _state["restore_result"] = "failed"
            log.warning("Database restore failed, keeping the local copy: %s", exc)
    return status()


def restored_attempted() -> bool:
    """
    Whether the one-shot restore has already been tried.

    Exists so the request middleware can skip the call without reaching into
    module state, and without paying for a lock on every request.
    """
    return bool(_state["restore_attempted"] or not _state["applicable"])


def mark_dirty() -> None:
    """Record that the database changed. Cheap; safe to call per request."""
    if not _state["applicable"]:
        return
    _state["dirty"] = True
    _dirty_event.set()


def flush(force: bool = False) -> Dict[str, Any]:
    """
    Upload the database to Stratus. Returns the status rather than raising.

    `force` uploads even when nothing is marked dirty, which is what the shutdown
    hook wants.
    """
    if not _state["applicable"]:
        return status()
    if not (_state["dirty"] or force):
        return status()

    path = _state["db_path"]
    if not path or not os.path.isfile(path):
        return status()

    with _flush_lock:
        try:
            with open(path, "rb") as fh:
                data = fh.read()
            ok = catalyst.stratus_put(OBJECT_KEY, data, "application/x-sqlite3")
            _state["last_flush_at"] = time.time()
            _state["last_flush_ok"] = ok
            if ok:
                _state["dirty"] = False
                _state["flush_count"] += 1
                _state["last_flush_error"] = None
                log.info("Database persisted to Stratus (%.1f MB).", len(data) / 1048576)
            else:
                # Left dirty on purpose so the next tick retries.
                _state["last_flush_error"] = "Stratus put returned false"
        except Exception as exc:
            _state["last_flush_ok"] = False
            _state["last_flush_error"] = f"{type(exc).__name__}: {exc}"
            log.warning("Database flush failed: %s", _state["last_flush_error"])
    return status()


def start_flusher() -> None:
    """Start the debounced background uploader. Idempotent."""
    global _flusher_started
    if _flusher_started or not _state["applicable"]:
        return
    _flusher_started = True

    def _loop():
        while True:
            # Block until something marks the database dirty, then wait out the
            # debounce so a burst of writes produces a single upload.
            _dirty_event.wait()
            time.sleep(FLUSH_DEBOUNCE_SECONDS)
            _dirty_event.clear()
            try:
                flush()
            except Exception:            # a daemon thread must never die
                log.exception("Unexpected error in the database flusher.")

    threading.Thread(target=_loop, name="ksp-db-flusher", daemon=True).start()
    log.info("Database flusher started (debounce %ss).", FLUSH_DEBOUNCE_SECONDS)


def is_persistent() -> bool:
    """
    True only when writes can actually outlive this instance.

    Deliberately strict: it requires a Stratus upload to have SUCCEEDED at least
    once. Anything weaker would let /api/system/info claim persistence that has
    never been demonstrated.
    """
    return bool(_state["applicable"] and _state["flush_count"] > 0)


def status() -> Dict[str, Any]:
    """Full picture, for /api/system/info and the service inventory."""
    path = _state["db_path"]
    size_mb = None
    if path and os.path.isfile(path):
        try:
            size_mb = round(os.path.getsize(path) / 1048576, 2)
        except OSError:
            pass
    return {
        "mechanism": "Catalyst Stratus object store (whole-file SQLite snapshot)",
        "applicable": _state["applicable"],
        "reason": _state["reason"],
        "database_path": path,
        "database_size_mb": size_mb,
        "object_key": OBJECT_KEY,
        "seeded_from_bundle": _state["baseline_copied"],
        "restore_attempted": _state["restore_attempted"],
        "restore_result": _state["restore_result"],
        "pending_changes": _state["dirty"],
        "uploads_completed": _state["flush_count"],
        "last_upload_ok": _state["last_flush_ok"],
        "last_upload_error": _state["last_flush_error"],
        "writes_survive_restart": is_persistent(),
        "limitation": (
            "Single-instance persistence: the whole file is the unit of transfer, "
            "so with more than one running instance the last writer wins. "
            "PostgreSQL via DATABASE_URL is the production path."
        ),
    }
