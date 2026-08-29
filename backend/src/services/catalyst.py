"""
Thin, honest wrapper over the Zoho Catalyst Python SDK.

WHY THIS FILE EXISTS
--------------------
The Catalyst Python SDK documentation pages return 404, so the API surface below
was established by introspecting the installed package (zcatalyst-sdk 1.4.0)
rather than copied from docs. The signatures are recorded here so the rest of the
codebase never has to guess:

    zcatalyst_sdk.initialize(name, scope, req) -> CatalystApp
    zcatalyst_sdk.initialize_app(credential, options, name) -> CatalystApp

    app.stratus()   -> Stratus
        .bucket(name) -> Bucket
            .put_object(key, body: BufferedReader|str|bytes, options)
            .get_object(key, options)
            .head_object(key, version_id=None, throw_err=None) -> bool
            .generate_presigned_url(key, url_action: 'PUT'|'GET', expiry_in_sec)
    app.cache()     -> Cache
        .segment(seg_id=None) -> Segment
            .put(key, value: str, expiry: int = None)   # expiry is in HOURS
            .get_value(key) -> str
            .delete(key) -> bool
    app.filestore() -> Filestore
        .folder(folder_id) -> Folder
            .upload_file(name: str, file: BufferedReader)
            .download_file(file_id)          # by ID - there is no list-by-name
    app.email()     -> Email
        .send_mail({from_email, to_email: List[str], subject, content,
                    html_mode, display_name, cc, bcc, reply_to, attachments})

TWO CONSTRAINTS THAT SHAPE EVERY CALLER
---------------------------------------
1. `initialize()` raises CatalystAppError('Catalyst headers are empty') when there
   are no Catalyst request headers in scope. On AppSail those headers arrive with
   each HTTP request, so the SDK is usable INSIDE a request and generally not at
   process start. Off-platform it can only work if CATALYST_AUTH holds a
   credential JSON. Nothing here may assume initialisation succeeds.

2. Stratus is keyed by an arbitrary string; File Store addresses files by a
   numeric id and offers no lookup by name. Anything that must be found again on
   a cold start therefore belongs in Stratus, not File Store.

Every function returns a value and records a reason on failure. Nothing raises at
import time, and nothing here may take the application down.
"""
from __future__ import annotations

import logging
import os
import threading
from typing import Any, Dict, List, Optional

log = logging.getLogger(__name__)

# Populated on first use; the SDK object is cheap to re-request but we avoid
# re-importing and re-initialising on every call.
_lock = threading.Lock()
_state: Dict[str, Any] = {
    "sdk_importable": None,   # None = not yet checked
    "import_error": None,
    "last_init_error": None,
    "init_ok_once": False,    # has initialisation EVER succeeded in this process
}


def sdk_available() -> bool:
    """True when zcatalyst_sdk can be imported. Says nothing about credentials."""
    if _state["sdk_importable"] is None:
        try:
            import zcatalyst_sdk  # noqa: F401
            _state["sdk_importable"] = True
        except Exception as exc:          # ImportError, or a broken vendored copy
            _state["sdk_importable"] = False
            _state["import_error"] = f"{type(exc).__name__}: {exc}"
        if not _state["sdk_importable"]:
            log.info("Catalyst SDK not importable (%s); Catalyst features are off.",
                     _state["import_error"])
    return bool(_state["sdk_importable"])


def get_app():
    """
    Return an initialised CatalystApp, or None.

    Returning None is a normal outcome, not an error: it is what happens on a
    developer machine and outside a request on AppSail. Callers must handle it.
    """
    if not sdk_available():
        return None
    try:
        import zcatalyst_sdk
        app = zcatalyst_sdk.initialize()
        _state["init_ok_once"] = True
        _state["last_init_error"] = None
        return app
    except Exception as exc:
        # Expected off-request. Recorded rather than raised, and logged at debug
        # so a per-request retry cannot flood the log.
        _state["last_init_error"] = f"{type(exc).__name__}: {exc}"
        log.debug("Catalyst initialize() unavailable: %s", _state["last_init_error"])
        return None


# ---------------------------------------------------------------------------
# Stratus (object store) - keyed by name, so usable for cold-start restore
# ---------------------------------------------------------------------------
def stratus_bucket(bucket: Optional[str] = None):
    """Bucket handle, or None when Stratus is unusable."""
    name = bucket or os.getenv("KSP_STRATUS_BUCKET", "")
    if not name:
        return None
    app = get_app()
    if app is None:
        return None
    try:
        return app.stratus().bucket(name)
    except Exception as exc:
        log.warning("Stratus bucket %r unavailable: %s", name, exc)
        return None


def stratus_put(key: str, data: bytes, content_type: str = "application/octet-stream") -> bool:
    b = stratus_bucket()
    if b is None:
        return False
    try:
        b.put_object(key, data, {"overwrite": True, "content_type": content_type})
        return True
    except Exception as exc:
        log.warning("Stratus put %r failed: %s", key, exc)
        return False


def stratus_get(key: str) -> Optional[bytes]:
    b = stratus_bucket()
    if b is None:
        return None
    try:
        if not b.head_object(key):
            return None
        obj = b.get_object(key)
        # The SDK may hand back bytes, a str, or a file-like object depending on
        # the object; normalise so callers only deal with bytes.
        if isinstance(obj, bytes):
            return obj
        if isinstance(obj, str):
            return obj.encode("utf-8")
        reader = getattr(obj, "read", None)
        if callable(reader):
            return reader()
        log.warning("Stratus get %r returned unexpected type %s", key, type(obj).__name__)
        return None
    except Exception as exc:
        log.warning("Stratus get %r failed: %s", key, exc)
        return None


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------
def cache_segment():
    app = get_app()
    if app is None:
        return None
    try:
        seg_id = os.getenv("KSP_CACHE_SEGMENT_ID") or None
        return app.cache().segment(seg_id)
    except Exception as exc:
        log.debug("Catalyst Cache unavailable: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Mail
# ---------------------------------------------------------------------------
def send_mail(subject: str, content: str, to: List[str],
              html: bool = True, display_name: str = "KSP Crime Intelligence") -> Dict[str, Any]:
    """
    Send through Catalyst Mail.

    Returns {"sent": bool, "reason": str|None} - never raises, so a caller can
    always fall back to returning the rendered content as a preview.
    """
    sender = os.getenv("MAIL_FROM", "").strip()
    if not sender:
        return {"sent": False, "reason": "MAIL_FROM is not configured"}
    if not to:
        return {"sent": False, "reason": "no recipient configured"}
    app = get_app()
    if app is None:
        return {"sent": False,
                "reason": f"Catalyst SDK not initialised ({_state['last_init_error'] or 'no credentials in scope'})"}
    try:
        app.email().send_mail({
            "from_email": sender,
            "to_email": to,
            "subject": subject,
            "content": content,
            "html_mode": html,
            "display_name": display_name,
        })
        return {"sent": True, "reason": None}
    except Exception as exc:
        return {"sent": False, "reason": f"{type(exc).__name__}: {exc}"}


# ---------------------------------------------------------------------------
# Diagnostics, for the service inventory endpoint
# ---------------------------------------------------------------------------
def diagnostics() -> Dict[str, Any]:
    """Facts about SDK availability. Deliberately does not attempt a call."""
    return {
        "sdk_importable": sdk_available(),
        "import_error": _state["import_error"],
        "initialised_at_least_once": _state["init_ok_once"],
        "last_init_error": _state["last_init_error"],
        "stratus_bucket_configured": bool(os.getenv("KSP_STRATUS_BUCKET", "").strip()),
        "filestore_folder_configured": bool(os.getenv("KSP_FILESTORE_FOLDER_ID", "").strip()),
        "mail_from_configured": bool(os.getenv("MAIL_FROM", "").strip()),
        "cache_segment_configured": bool(os.getenv("KSP_CACHE_SEGMENT_ID", "").strip()),
    }
