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
    app.smart_browz() -> SmartBrowz          # NOT smartbrowz - underscore matters
        .convert_to_pdf(source, pdf_options, page_options, navigation_options)
        # `source` is sent as a URL when it parses as one, otherwise as raw HTML.
        # Returns the requests Response, so PDF bytes are at .content.
    app.job_scheduling() -> JobScheduling
        .get_all_jobpool() / .get_jobpool(id)
        .cron  -> .get_all() / .get(id) / .create(details) / .update(id, details)
                  .pause(id) / .resume(id) / .run(id) / .delete(id)
        .job   -> .submit_job(meta) / .get_job(id) / .delete_job(id)
        # A cron's job_meta may set target_type "AppSail" or "Webhook", each
        # taking url, params, headers, request_method and request_body - so a
        # schedule can call this app directly, with no Catalyst Function.
    app.zia()       -> Zia
        .get_NER_prediction(list_of_docs: List[str])
        .get_keyword_extraction(list_of_docs: List[str])
        .get_sentiment_analysis(list_of_docs: List[str], keywords=None)
        .get_text_analytics(list_of_docs: List[str], keywords=None)

ZIA RESPONSE SHAPES - MEASURED, not documented
----------------------------------------------
Undocumented, so these were read off a real response via
GET /api/system/zia-probe on the deployed app. Each call returns a LIST with one
element per input document. Note that every numeric field in the NER response is a
STRING, including the indices and the confidence score.

    get_NER_prediction ->
      [{"ner": {"general_entities": [
          {"token": "Ramesh Kumar", "ner_tag": "Person",
           "start_index": "49", "end_index": "61", "confidence_score": "98",
           "fine_entities": [ {token, ner_tag, start_index, end_index}, ... ]}
      ]}}]
      ner_tag values observed on a complainant statement: Person, City, Date,
      Time, Money, Number, Color. Money carries fine_entities splitting
      Currency_rupees from Value.

    get_keyword_extraction ->
      [{"keyword_extractor": {"keywords": [str], "keyphrases": [str]}}]
      keyphrases are the useful half: "black Pulsar motorcycle", "gold chain".

    get_sentiment_analysis ->
      [{"sentiment_prediction": [{"document_sentiment": "Negative"|"Positive"|"Neutral",
                                  "overall_score": float,
                                  "sentence_analytics": [{"sentence": str,
                                                          "sentiment": str,
                                                          "confidence_scores": {
                                                              "negative": float,
                                                              "neutral": float,
                                                              "positive": float}}]}}]
      Note the extra list nesting under sentiment_prediction.

TWO CONSTRAINTS THAT SHAPE EVERY CALLER
---------------------------------------
1. `initialize()` raises CatalystAppError('Catalyst headers are empty') unless the
   CALLING THREAD carries Catalyst identity headers. It reads them from a dict
   hung off threading.current_thread(), populated either by
   `initialize(req=request)` or by the Functions runtime. Measured on the
   deployed app: AppSail attaches the full x-zc-* header set to every request,
   `initialize(req=request)` succeeds, and bare `initialize()` fails - including
   in a threadpool worker or background thread serving that same request.
   This module therefore captures the headers in the middleware and replays them
   into whichever thread needs the SDK. Off-platform, CATALYST_AUTH is the only
   path. Nothing here may assume initialisation succeeds.

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
import time
from typing import Any, Dict, List, Mapping, Optional

log = logging.getLogger(__name__)

# Populated on first use; the SDK object is cheap to re-request but we avoid
# re-importing and re-initialising on every call.
_lock = threading.Lock()
_state: Dict[str, Any] = {
    "sdk_importable": None,   # None = not yet checked
    "import_error": None,
    "last_init_error": None,
    "init_ok_once": False,    # has initialisation EVER succeeded in this process
    "last_stratus_error": None,
    "last_zia_error": None,
    "zia_ok_once": False,     # has a Zia call EVER returned in this process
    "last_job_error": None,
    "jobs_ok_once": False,
    "last_mail_error": None,
    "mail_ok_once": False,
    "last_smartbrowz_error": None,
    "smartbrowz_ok_once": False,
}


def last_error() -> Optional[str]:
    """The most specific failure recorded, for callers that report a reason."""
    return _state["last_stratus_error"] or _state["last_init_error"]

# ---------------------------------------------------------------------------
# Catalyst identity headers
# ---------------------------------------------------------------------------
# Measured on the deployed app via GET /api/system/catalyst-probe: the AppSail
# gateway attaches x-zc-projectid, x-zc-project-domain, x-zc-project-key,
# x-zc-project-secret-key, x-zc-environment, x-zc-admin-cred-token/-type and
# x-zc-user-cred-token/-type to EVERY inbound request. The SDK reads them from a
# store hung off the CURRENT THREAD (zcatalyst_sdk._thread_util.ZCThreadUtil),
# which is why zcatalyst_sdk.initialize() succeeds only on the exact thread that
# is handling a request, and fails with 'Catalyst headers are empty' in a
# background thread or in a threadpool worker.
#
# So the headers of the most recent request are kept here and replayed into
# whichever thread needs them. That is what makes the background snapshot
# uploader able to talk to Stratus at all.
#
# These headers contain live credentials. They are held in process memory only:
# never logged, never written to disk, and never returned by any endpoint.
_creds_lock = threading.Lock()
_creds: Dict[str, Any] = {
    "headers": None,        # dict of lowercased x-zc-* header name -> value
    "captured_at": None,    # monotonic-ish wall clock of the last capture
    "captures": 0,
}
# The one header that proves a request really came through the Catalyst gateway.
_PROJECT_HEADER = "x-zc-projectid"


def capture_request_headers(headers: Mapping[str, str]) -> bool:
    """
    Remember the Catalyst identity headers carried by a live request.

    Called from the HTTP middleware on every request. Cheap: a dict
    comprehension over ~19 headers plus a lock. Returns False when the request
    did not come through the Catalyst gateway (local development), which is a
    normal outcome.
    """
    try:
        zc = {k.lower(): v for k, v in dict(headers).items()
              if k.lower().startswith("x-zc-")}
    except Exception:
        return False
    if _PROJECT_HEADER not in zc:
        return False
    with _creds_lock:
        _creds["headers"] = zc
        _creds["captured_at"] = time.time()
        _creds["captures"] += 1
    return True


def _seed_current_thread() -> bool:
    """
    Replay the captured headers into the SDK's per-thread store for THIS thread.

    No-op returning True when the thread already carries its own headers, so a
    request thread always uses its own (freshest) credentials.
    """
    try:
        from zcatalyst_sdk._thread_util import ZCThreadUtil
        util = ZCThreadUtil()
        if util.get_value("catalyst_headers"):
            return True
        with _creds_lock:
            headers = _creds["headers"]
        if not headers:
            return False
        util.put_value("catalyst_headers", dict(headers))
        return True
    except Exception as exc:
        _state["last_init_error"] = f"header replay failed: {type(exc).__name__}: {exc}"
        return False


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

    Works on any thread once a single request has passed through the middleware,
    because the identity headers are replayed into the calling thread first.
    Returning None is still a normal outcome: it is what happens on a developer
    machine, and on AppSail before the very first request. Callers must handle it.
    """
    if not sdk_available():
        return None
    if not _seed_current_thread():
        _state["last_init_error"] = (
            "no Catalyst request headers captured yet - either no request has "
            "reached this process or it is not running behind the Catalyst gateway"
        )
        return None
    try:
        import zcatalyst_sdk
        app = zcatalyst_sdk.initialize()
        _state["init_ok_once"] = True
        _state["last_init_error"] = None
        return app
    except Exception as exc:
        # Recorded rather than raised, and logged at debug so a per-request retry
        # cannot flood the log.
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
        _state["last_stratus_error"] = (
            f"no bucket handle ({_state['last_init_error'] or 'KSP_STRATUS_BUCKET unset'})"
        )
        return False
    try:
        # 'overwrite' MUST be the string "true", not the boolean True: the SDK
        # assigns option values directly into the outgoing HTTP headers, and
        # requests rejects a non-string header value with InvalidHeader.
        res = b.put_object(key, data, {"overwrite": "true", "content_type": content_type})
        # put_object returns True on HTTP 200, otherwise the parsed response body.
        # A non-True return is not necessarily a failure, so it is recorded rather
        # than guessed at.
        if res is not True:
            _state["last_stratus_error"] = f"put returned {str(res)[:200]}"
        else:
            _state["last_stratus_error"] = None
        return True
    except Exception as exc:
        _state["last_stratus_error"] = f"{type(exc).__name__}: {exc}"
        log.warning("Stratus put %r failed: %s", key, exc)
        return False


def stratus_get(key: str) -> Optional[bytes]:
    b = stratus_bucket()
    if b is None:
        _state["last_stratus_error"] = (
            f"no bucket handle ({_state['last_init_error'] or 'KSP_STRATUS_BUCKET unset'})"
        )
        return None
    try:
        if not b.head_object(key):
            _state["last_stratus_error"] = None
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
        _state["last_stratus_error"] = f"get returned unexpected type {type(obj).__name__}"
        return None
    except Exception as exc:
        _state["last_stratus_error"] = f"{type(exc).__name__}: {exc}"
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
# Zia (text analytics)
# ---------------------------------------------------------------------------
# The three calls used here all take a LIST of documents and are the only Zia
# surface this project needs. Their RESPONSE shapes are not documented anywhere we
# could find, so callers must treat the return as opaque JSON and the shape is
# discovered by GET /api/system/zia-probe against the deployed app rather than
# assumed here. Every wrapper returns None on any failure and records why.
def _zia_call(what: str, fn) -> Optional[Any]:
    """
    Run one Zia call, recording the outcome. Shared so all three behave alike.

    `what` names the operation for the error string; `fn` receives the Zia handle.
    """
    app = get_app()
    if app is None:
        _state["last_zia_error"] = (
            f"{what}: Catalyst SDK not initialised "
            f"({_state['last_init_error'] or 'no credentials in scope'})"
        )
        return None
    try:
        result = fn(app.zia())
        _state["last_zia_error"] = None
        _state["zia_ok_once"] = True
        return result
    except Exception as exc:
        _state["last_zia_error"] = f"{what}: {type(exc).__name__}: {exc}"[:400]
        log.debug("Zia %s failed: %s", what, exc)
        return None


def zia_ner(docs: List[str]) -> Optional[Any]:
    """Named-entity prediction over one or more documents."""
    if not docs:
        return None
    return _zia_call("get_NER_prediction", lambda z: z.get_NER_prediction(docs))


def zia_keywords(docs: List[str]) -> Optional[Any]:
    """Keyword extraction over one or more documents."""
    if not docs:
        return None
    return _zia_call("get_keyword_extraction", lambda z: z.get_keyword_extraction(docs))


def zia_sentiment(docs: List[str]) -> Optional[Any]:
    """Sentiment analysis over one or more documents."""
    if not docs:
        return None
    return _zia_call("get_sentiment_analysis", lambda z: z.get_sentiment_analysis(docs))


def zia_used_successfully() -> bool:
    """
    Whether a Zia call has actually returned in this process.

    The inventory reports Zia live only on this, never on configuration - Zia needs
    no env var, so configuration could never have been evidence of anything.
    """
    return bool(_state.get("zia_ok_once"))


# ---------------------------------------------------------------------------
# Job Scheduling
# ---------------------------------------------------------------------------
# A cron here can target this very app: job_scheduling/_types.py defines
# TargetType.APPSAIL and TargetType.WEBHOOK, both carrying url, headers,
# request_method and request_body. No Catalyst Function and no second deployable
# is needed, which corrects a claim this project previously published.
#
# ONE UNRESOLVED CONFLICT IN THE SDK: for a daily schedule, CronType.CALENDER is
# spelled "Calender" in the enum while ICatalystDailyCron declares
# cron_type: Literal["Calendar"]. One of them is wrong and the docs 404, so
# create_cron() tries both spellings and reports which the API accepted rather
# than picking one and hoping.
_CRON_TYPE_SPELLINGS = ("Calendar", "Calender")


def _job_call(what: str, fn) -> Optional[Any]:
    """Run one Job Scheduling call, recording the outcome. Never raises."""
    app = get_app()
    if app is None:
        _state["last_job_error"] = (
            f"{what}: Catalyst SDK not initialised "
            f"({_state['last_init_error'] or 'no credentials in scope'})"
        )
        return None
    try:
        result = fn(app.job_scheduling())
        _state["last_job_error"] = None
        _state["jobs_ok_once"] = True
        return result
    except Exception as exc:
        _state["last_job_error"] = f"{what}: {type(exc).__name__}: {exc}"[:400]
        log.debug("Job Scheduling %s failed: %s", what, exc)
        return None


def list_jobpools() -> Optional[List[Dict[str, Any]]]:
    """
    Every jobpool in the project, or None if the call did not return.

    A jobpool is the one prerequisite that has to be created in the console, so
    this doubles as the check for whether scheduling is usable at all.
    """
    result = _job_call("get_all_jobpool", lambda js: js.get_all_jobpool())
    return result if isinstance(result, list) else None


def list_crons() -> Optional[List[Dict[str, Any]]]:
    """Every cron in the project, or None if the call did not return."""
    result = _job_call("cron.get_all", lambda js: js.cron.get_all())
    return result if isinstance(result, list) else None


def create_daily_cron(cron_name: str, job_meta: Dict[str, Any],
                      hour: int, minute: int = 0,
                      timezone: str = "Asia/Kolkata") -> Dict[str, Any]:
    """
    Create a dynamic cron that fires once a day.

    Returns {"created": bool, "cron": dict|None, "cron_type_accepted": str|None,
             "attempts": [...]} - never raises, and always reports what was tried.

    The `cron_type` spelling is tried both ways because the SDK disagrees with
    itself: CronType.CALENDER is the string "Calender" while ICatalystDailyCron
    declares Literal["Calendar"]. Rather than pick one, this tries each and
    records the API's answer, so the attempts list documents which is correct.
    """
    attempts: List[Dict[str, Any]] = []
    for spelling in _CRON_TYPE_SPELLINGS:
        details = {
            "cron_name": cron_name,
            "cron_status": True,
            "cron_type": spelling,
            "cron_detail": {
                "hour": hour, "minute": minute, "second": 0,
                "timezone": timezone,
                "repetition_type": "daily",
            },
            "job_meta": job_meta,
        }
        created = _job_call(f"cron.create[{spelling}]",
                            lambda js, d=details: js.cron.create(d))
        if created:
            return {"created": True, "cron": created,
                    "cron_type_accepted": spelling, "attempts": attempts}
        attempts.append({"cron_type": spelling, "error": _state["last_job_error"]})
    return {"created": False, "cron": None,
            "cron_type_accepted": None, "attempts": attempts}


def run_cron(cron_id: str) -> Optional[Any]:
    """Submit a cron's job immediately, for a demo or a manual catch-up."""
    return _job_call("cron.run", lambda js: js.cron.run(cron_id))


def delete_cron(cron_id: str) -> Optional[Any]:
    """Remove a cron."""
    return _job_call("cron.delete", lambda js: js.cron.delete(cron_id))


def jobs_used_successfully() -> bool:
    """Whether any Job Scheduling call has returned in this process."""
    return bool(_state.get("jobs_ok_once"))


def appsail_target_id() -> str:
    """
    This AppSail deployment's resource id, for a job that targets it.

    Injected by the platform as X_ZOHO_CATALYST_RESOURCE_ID - confirmed present
    on the deployed app via /api/system/catalyst-probe.
    """
    return os.getenv("X_ZOHO_CATALYST_RESOURCE_ID", "").strip()


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
        reason = (f"Catalyst SDK not initialised "
                  f"({_state['last_init_error'] or 'no credentials in scope'})")
        _state["last_mail_error"] = reason
        return {"sent": False, "reason": reason}
    try:
        app.email().send_mail({
            "from_email": sender,
            "to_email": to,
            "subject": subject,
            "content": content,
            "html_mode": html,
            "display_name": display_name,
        })
        _state["last_mail_error"] = None
        _state["mail_ok_once"] = True
        return {"sent": True, "reason": None}
    except Exception as exc:
        # Recorded so the inventory can report Mail as broken rather than
        # "configured". The commonest cause is a from_email that has not been
        # verified in the Catalyst console, and the API says so in this message.
        _state["last_mail_error"] = f"{type(exc).__name__}: {exc}"[:400]
        return {"sent": False, "reason": _state["last_mail_error"]}


def mail_used_successfully() -> bool:
    """Whether a message has actually been accepted for delivery in this process."""
    return bool(_state.get("mail_ok_once"))


# ---------------------------------------------------------------------------
# SmartBrowz (headless rendering)
# ---------------------------------------------------------------------------
def html_to_pdf(html: str) -> Optional[bytes]:
    """
    Render an HTML document to PDF bytes, or None if SmartBrowz did not answer.

    convert_to_pdf treats its `source` as a URL when it looks like one and as raw
    HTML otherwise, so a full document string is passed directly - no need to host
    the report anywhere first.

    Option values here are real booleans and nested dicts, NOT strings - which is
    the opposite of the Stratus rule in this module. Stratus copies option values
    into outgoing HTTP HEADERS, where a bool raises InvalidHeader; SmartBrowz puts
    them in a JSON BODY, where a bool is correct and a stringified one is not. The
    two are different for a reason, and generalising the Stratus lesson to here is
    what produced the first failed attempt at this call.

    Shape confirmed from PdfOptions in smartbrowz/_types.py: `margin` is a nested
    dict with top/bottom/left/right, not flat margin_top keys.
    """
    return convert_to_pdf(html, **PDF_DEFAULT_OPTIONS)


# Defaults for the compliance report, as a module constant so the probe endpoint
# can render both with and without them and show which of them matters.
PDF_DEFAULT_OPTIONS: Dict[str, Any] = {
    "pdf_options": {
        "format": "A4",
        "print_background": True,
        "margin": {"top": "12mm", "bottom": "14mm",
                   "left": "12mm", "right": "12mm"},
    },
}


def convert_to_pdf(html: str, **options: Any) -> Optional[bytes]:
    """
    One SmartBrowz render with exactly the options given. PDF bytes, or None.

    Options pass through untouched so a caller can vary them and find out what the
    service actually accepts. GET /api/system/smartbrowz-probe does precisely that,
    because a 500 from a render says nothing about which option caused it and
    bisecting by redeploy is slow.
    """
    if not html:
        return None
    app = get_app()
    if app is None:
        _state["last_smartbrowz_error"] = (
            f"Catalyst SDK not initialised "
            f"({_state['last_init_error'] or 'no credentials in scope'})"
        )
        return None
    try:
        # smart_browz(), with the underscore. The class is SmartBrowz and every
        # other accessor on CatalystApp is the lowercased class name, so the
        # obvious guess (smartbrowz) raises AttributeError.
        resp = app.smart_browz().convert_to_pdf(html, **options)
        content = getattr(resp, "content", None)
        if not content:
            _state["last_smartbrowz_error"] = "convert_to_pdf returned no content"
            return None
        # A PDF starts with %PDF-. Anything else is an error page rendered as a
        # 200, which would otherwise be served to a browser as a corrupt download.
        if not bytes(content[:5]) == b"%PDF-":
            _state["last_smartbrowz_error"] = (
                f"convert_to_pdf returned {len(content)} bytes that are not a PDF "
                f"(starts with {bytes(content[:16])!r})"
            )
            return None
        _state["last_smartbrowz_error"] = None
        _state["smartbrowz_ok_once"] = True
        return bytes(content)
    except Exception as exc:
        _state["last_smartbrowz_error"] = f"{type(exc).__name__}: {exc}"[:400]
        log.debug("SmartBrowz convert_to_pdf failed: %s", exc)
        return None


def smartbrowz_used_successfully() -> bool:
    """Whether a PDF has actually been rendered in this process."""
    return bool(_state.get("smartbrowz_ok_once"))


# ---------------------------------------------------------------------------
# Diagnostics, for the service inventory endpoint
# ---------------------------------------------------------------------------
def diagnostics() -> Dict[str, Any]:
    """Facts about SDK availability. Deliberately does not attempt a call."""
    with _creds_lock:
        captured_at = _creds["captured_at"]
        captures = _creds["captures"]
    return {
        "sdk_importable": sdk_available(),
        "import_error": _state["import_error"],
        "initialised_at_least_once": _state["init_ok_once"],
        "last_init_error": _state["last_init_error"],
        "last_stratus_error": _state["last_stratus_error"],
        "zia_succeeded_at_least_once": _state["zia_ok_once"],
        "last_zia_error": _state["last_zia_error"],
        "job_scheduling_succeeded_at_least_once": _state["jobs_ok_once"],
        "last_job_error": _state["last_job_error"],
        "mail_succeeded_at_least_once": _state["mail_ok_once"],
        "last_mail_error": _state["last_mail_error"],
        "smartbrowz_succeeded_at_least_once": _state["smartbrowz_ok_once"],
        "last_smartbrowz_error": _state["last_smartbrowz_error"],
        "appsail_target_id_present": bool(appsail_target_id()),
        # Presence and age only - the header values are credentials.
        "gateway_headers_captured": captures,
        "gateway_headers_age_seconds": (
            round(time.time() - captured_at, 1) if captured_at else None
        ),
        "stratus_bucket_configured": bool(os.getenv("KSP_STRATUS_BUCKET", "").strip()),
        "filestore_folder_configured": bool(os.getenv("KSP_FILESTORE_FOLDER_ID", "").strip()),
        "mail_from_configured": bool(os.getenv("MAIL_FROM", "").strip()),
        "cache_segment_configured": bool(os.getenv("KSP_CACHE_SEGMENT_ID", "").strip()),
    }
