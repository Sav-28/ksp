"""
Tests for the Catalyst service-depth work.

Two kinds of assertion live here, and the first kind is unusual enough to explain.

1. TRUTHFULNESS OF THE INVENTORY. `GET /api/system/services` is this project's
   central claim: it publishes what is and is not used, with reasons. That makes
   the reason strings load-bearing, and two of them were false - one asserting a
   Catalyst Function is required to schedule anything, one asserting FIR narrative
   extraction already worked. Both are now guarded by tests, because a false
   statement in the honesty document is worse than an admitted gap.

2. ORDINARY BEHAVIOUR of the wrappers and endpoints added by this build. The
   Catalyst SDK cannot initialise off-platform, so locally every wrapper takes its
   failure path. That is exactly what needs testing: the fallbacks must work and
   must say so.

Run from the backend directory:  python -m pytest tests -q
(bare `pytest` collects backend/vendor/sqlalchemy and dies on 33 collection errors)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

os.environ["KSP_NLP_PROVIDER"] = "rules"

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def _auth(username="admin", password="admin@2024"):
    r = client.post("/api/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _inventory():
    from src.services import service_inventory
    return service_inventory.build()


def _entry(name_fragment: str):
    for s in _inventory()["services"]:
        if name_fragment.lower() in s["service"].lower():
            return s
    raise AssertionError(f"no inventory entry matching {name_fragment!r}")


# --- 1. The inventory must not contain a false statement -------------------
def test_scheduling_entry_does_not_claim_a_function_is_required():
    """
    Job Scheduling supports TargetType.APPSAIL and TargetType.WEBHOOK, both of
    which carry a url and headers, so a schedule can call this app directly. The
    old reason - that a Function is required, meaning a second deployable - was
    wrong. Guard the correction so it cannot silently regress.
    """
    detail = _entry("Cron / Job Scheduling")["detail"].lower()
    assert "jobpool" in detail, "the real prerequisite (a jobpool) must be named"
    # The phrase may appear only while explicitly retracting it.
    if "function" in detail:
        assert "wrong" in detail or "earlier" in detail, (
            "the entry mentions a Function without marking that reason as retracted"
        )


def test_zia_entry_does_not_claim_narrative_extraction_exists():
    """
    The old entry claimed "FIR narrative entity extraction is rule-based and
    already works", which was false. Zia now genuinely analyses the statement
    typed during registration, so the entry describes that instead - but it must
    still not claim the retracted thing, and must not overstate what Zia does.
    """
    entry = _entry("Zia Text Analytics")
    detail = entry["detail"].lower()
    assert "narrative entity extraction is rule-based and already works" not in detail
    if entry["status"] == "live":
        # Zia supplies entities. It does NOT decide the offence or the section, and
        # claiming otherwise would be the same class of overstatement.
        assert "does not classify offences" in detail, (
            "the entry must be explicit that the legal classification is not Zia's"
        )
        assert entry["call_site"], "a live service must name its call site"


def test_zia_ocr_and_face_remain_listed_as_unused():
    """
    Only text analytics is used. The inventory is an account, so the parts of Zia
    that are not used stay listed with a reason rather than being folded into the
    live entry to inflate the count.
    """
    entry = _entry("Zia OCR")
    assert entry["status"] == "not-used"
    assert entry["call_site"] is None


def test_every_inventory_entry_has_a_status_and_a_reason():
    """A status with no explanation is an assertion, which is what this endpoint exists to avoid."""
    valid = {"live", "configured", "not-configured", "not-used", "platform"}
    for s in _inventory()["services"]:
        assert s["status"] in valid, f"{s['service']} has status {s['status']!r}"
        assert s["detail"] and len(s["detail"]) > 40, f"{s['service']} has no real reason"
        if s["status"] != "not-used":
            assert s["call_site"], f"{s['service']} is claimed used with no call site"


# --- 2. The cached compliance payload must not be annotated in place -------
def test_compliance_report_cache_block_is_not_written_into_the_cached_entry():
    """
    On an in-process cache hit the returned object IS the stored object, so
    annotating it with this request's cache metadata would persist the wrong tier
    into the entry and report it to the next caller.
    """
    from src.services import cache

    cache.invalidate("compliance:")
    h = _auth()

    first = client.get("/api/compliance/report", headers=h)
    assert first.status_code == 200, first.text
    assert first.json()["cache"]["source"] == "computed"

    # The stored entry must be the payload only, with no cache annotation.
    stored = cache._local_get("compliance:report:v1")
    assert stored is not None, "the report should have been cached"
    assert "cache" not in stored, (
        "request-scoped cache metadata leaked into the cached entry"
    )

    second = client.get("/api/compliance/report", headers=h)
    assert second.status_code == 200
    assert second.json()["cache"]["source"] in ("in-process", "catalyst-cache")


# --- 3. The digest must not send unless asked -------------------------------
def test_digest_defaults_to_not_sending():
    """
    Both the route and the service default to send=False. The service used to
    default to True, so any new call site that forgot the argument would have
    dispatched real mail.
    """
    import inspect
    from src.services import digest

    sig = inspect.signature(digest.build_and_maybe_send)
    assert sig.parameters["send"].default is False

    r = client.get("/api/compliance/digest", headers=_auth())
    assert r.status_code == 200
    body = r.json()
    assert body["delivery"]["sent"] is False
    assert "html" in body and body["html"], "the digest must render even when not sent"


# --- 4. Zia wrappers must fail honestly off-platform ------------------------
def test_zia_wrappers_return_none_and_record_a_reason_locally():
    """
    Off Catalyst the SDK cannot initialise, so every Zia call must return None and
    say why rather than raising into a request handler.
    """
    from src.services import catalyst

    assert catalyst.zia_ner(["a test document"]) is None
    reason = catalyst.diagnostics()["last_zia_error"]
    assert reason, "a failed Zia call must record a reason"
    assert "get_NER_prediction" in reason, "the reason must name the operation"

    assert catalyst.zia_keywords(["a test document"]) is None
    assert catalyst.zia_sentiment(["a test document"]) is None


def test_zia_wrappers_reject_empty_input_without_calling_out():
    """An empty document list is a caller error, not a service failure."""
    from src.services import catalyst

    assert catalyst.zia_ner([]) is None
    assert catalyst.zia_keywords([]) is None
    assert catalyst.zia_sentiment([]) is None


def test_zia_is_not_reported_live_without_a_successful_call():
    """
    Zia needs no env var, so configuration can never be evidence for it. Only an
    actual returned call counts.
    """
    from src.services import catalyst

    assert catalyst.zia_used_successfully() is False
    assert _entry("Zia")["status"] != "live"


def test_zia_probe_returns_raw_shapes_and_never_500s():
    """The probe is a diagnostic: it must answer even when every call fails."""
    r = client.get("/api/system/zia-probe", headers=_auth())
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body["attempts"]) == {
        "get_NER_prediction", "get_keyword_extraction", "get_sentiment_analysis"
    }
    for name, attempt in body["attempts"].items():
        assert attempt["returned"] is False, f"{name} unexpectedly returned locally"
        assert attempt["error"], f"{name} failed without a reason"


# --- 5. Narrative analysis ---------------------------------------------------
# A realistic statement, containing the things a real one does: an offence, a
# district, a person, a vehicle, a valuable and an amount.
STATEMENT = (
    "On 14 August 2026 at about 9 PM, the complainant Ramesh Kumar was returning "
    "to Jayanagar in Bengaluru when two men on a black Pulsar motorcycle snatched "
    "his gold chain worth Rs 85,000 near the bus stand and fled towards Wilson Garden."
)


def test_rules_engine_finds_the_offence_the_district_and_the_amount():
    from src.services import narrative

    r = narrative.analyse(STATEMENT)
    assert r["engine"] == "rules"
    assert r["suggested_crime_type"] == "Snatching"
    assert r["suggested_ipc"] == "356"
    assert r["suggested_district"] == "Bengaluru Urban"
    assert [m["value"] for m in r["entities"]["money"]] == [85000.0]


def test_rules_engine_reads_an_explicit_ipc_section():
    from src.services import narrative

    r = narrative.analyse("Case registered under IPC 302 following the incident.")
    assert r["suggested_crime_type"] == "Murder"
    assert r["suggested_ipc"] == "302"


def test_suggested_ipc_agrees_with_the_registration_mapping():
    """
    narrative._ipc_for imports IPC_BY_TYPE from the crimes route lazily to avoid
    inverting the layering. This guards that the two cannot drift.
    """
    from src.api.routes.crimes import IPC_BY_TYPE
    from src.services import narrative

    for crime_type, section in IPC_BY_TYPE.items():
        assert narrative._ipc_for(crime_type) == section


def test_empty_and_whitespace_input_is_handled():
    from src.services import narrative

    for text in ("", "   ", "\n\t "):
        r = narrative.analyse(text)
        assert r["suggested_crime_type"] is None
        assert r["suggested_ipc"] is None
        assert r["characters_analysed"] == 0
        assert r["entities"]["money"] == []


def test_statement_with_no_recognisable_offence_returns_nulls():
    from src.services import narrative

    r = narrative.analyse("The complainant attended the station to collect a copy.")
    assert r["suggested_crime_type"] is None
    assert r["suggested_ipc"] is None


def test_entity_envelope_always_has_every_key():
    """Callers must never have to branch on which entity fields exist."""
    from src.services import narrative

    expected = {"persons", "places", "organisations", "vehicles",
                "valuables", "money", "dates", "times"}
    for text in ("", STATEMENT, "nothing useful here"):
        assert set(narrative.analyse(text)["entities"]) == expected


def test_longer_district_name_is_not_shadowed_by_a_substring():
    from src.services import narrative

    r = narrative.analyse("Theft reported in Bengaluru Rural district last week.")
    assert r["suggested_district"] == "Bengaluru Rural"


def test_narrative_endpoint_is_gated_to_registering_roles():
    body = {"text": STATEMENT}
    # analyst may not register, so may not post case text
    r = client.post("/api/narrative/analyse", json=body, headers=_auth("analyst", "analyst@2024"))
    assert r.status_code == 403
    # investigator may
    r = client.post("/api/narrative/analyse", json=body,
                    headers=_auth("investigator", "invest@2024"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["suggested_crime_type"] == "Snatching"
    assert body["engine"] in ("rules", "zia")
    assert "advisory" in body, "the response must state that it is only a suggestion"


def test_narrative_endpoint_requires_auth():
    assert client.post("/api/narrative/analyse", json={"text": "x"}).status_code == 401


def test_narrative_endpoint_rejects_an_oversized_statement():
    r = client.post("/api/narrative/analyse", json={"text": "x" * 20001},
                    headers=_auth("investigator", "invest@2024"))
    assert r.status_code == 422


# --- 6. Zia parsing, against the shapes measured from the live probe --------
# Copied verbatim from GET /api/system/zia-probe on the deployed app, so these
# tests fail if the parsing stops matching what Catalyst actually sends. Note that
# every numeric field is a STRING - that is Zia's doing, not a transcription slip.
ZIA_NER_RESPONSE = [{"ner": {"general_entities": [
    {"start_index": "3", "confidence_score": "97", "end_index": "17",
     "ner_tag": "Date", "token": "14 August 2026"},
    {"start_index": "21", "confidence_score": "89", "end_index": "32",
     "ner_tag": "Time", "token": "about 9 PM,"},
    {"start_index": "49", "confidence_score": "98", "end_index": "61",
     "ner_tag": "Person", "token": "Ramesh Kumar"},
    {"start_index": "79", "confidence_score": "95", "end_index": "88",
     "ner_tag": "City", "token": "Jayanagar"},
    {"start_index": "92", "confidence_score": "95", "end_index": "101",
     "ner_tag": "City", "token": "Bengaluru"},
    {"start_index": "107", "confidence_score": "100", "end_index": "110",
     "ner_tag": "Number", "token": "two"},
    {"start_index": "120", "confidence_score": "100", "end_index": "125",
     "ner_tag": "Color", "token": "black"},
    {"start_index": "174", "confidence_score": "100", "end_index": "183",
     "ner_tag": "Money", "token": "Rs 85,000", "fine_entities": [
         {"start_index": "174", "end_index": "176",
          "ner_tag": "Currency_rupees", "token": "Rs"},
         {"start_index": "177", "end_index": "183",
          "ner_tag": "Value", "token": "85,000"}]},
]}}]

ZIA_KEYWORD_RESPONSE = [{"keyword_extractor": {
    "keywords": ["Bengaluru", "bus", "August"],
    "keyphrases": ["black Pulsar motorcycle", "complainant Ramesh Kumar",
                   "gold chain", "Wilson Garden"],
}}]

ZIA_SENTIMENT_RESPONSE = [{"sentiment_prediction": [{
    "document_sentiment": "Negative",
    "overall_score": 1.0,
    "sentence_analytics": [{"sentence": STATEMENT, "sentiment": "Negative",
                            "confidence_scores": {"negative": 1.0, "neutral": 0.0,
                                                  "positive": 0.0}}],
}]}]


def test_ner_parsing_maps_the_measured_shape():
    from src.services import narrative

    e = narrative._parse_ner(ZIA_NER_RESPONSE)
    assert e["persons"] == ["Ramesh Kumar"]
    assert e["places"] == ["Jayanagar", "Bengaluru"]
    assert e["dates"] == ["14 August 2026"]
    assert e["times"] == ["about 9 PM"], "trailing punctuation should be trimmed"
    assert e["money"] == [{"token": "Rs 85,000", "value": 85000.0}]
    # Number and Color have no field in the envelope and must be dropped, not
    # misfiled into places or valuables.
    assert "two" not in e["places"] and "black" not in e["valuables"]


def test_money_prefers_zias_own_value_split():
    from src.services import narrative

    entity = {"token": "Rs 85,000", "fine_entities": [
        {"ner_tag": "Currency_rupees", "token": "Rs"},
        {"ner_tag": "Value", "token": "85,000"}]}
    assert narrative._money_from_zia(entity) == {"token": "Rs 85,000", "value": 85000.0}


def test_money_falls_back_to_digits_in_the_token():
    from src.services import narrative

    assert narrative._money_from_zia({"token": "Rs 1200"})["value"] == 1200.0
    assert narrative._money_from_zia({"token": "no digits here"}) is None


def test_keyword_and_sentiment_parsing():
    from src.services import narrative

    keywords, keyphrases = narrative._parse_keywords(ZIA_KEYWORD_RESPONSE)
    assert "Bengaluru" in keywords
    assert "gold chain" in keyphrases

    s = narrative._parse_sentiment(ZIA_SENTIMENT_RESPONSE)
    assert s == {"label": "Negative", "score": 1.0, "sentences_analysed": 1}


def test_keyphrases_are_filed_as_vehicles_and_valuables():
    from src.services import narrative

    c = narrative._classify_keyphrases(
        ["black Pulsar motorcycle", "gold chain", "complainant Ramesh Kumar"])
    assert c["vehicles"] == ["black Pulsar motorcycle"]
    assert c["valuables"] == ["gold chain"]


def test_malformed_zia_responses_are_treated_as_a_failed_call():
    """
    The shape is undocumented, so anything unexpected must degrade to None rather
    than raise inside a registration request.
    """
    from src.services import narrative

    for bad in (None, [], {}, "text", [None], [{"ner": None}],
                [{"ner": {"general_entities": "not a list"}}]):
        assert narrative._parse_ner(bad) is None
    for bad in (None, [], {}, [{"keyword_extractor": None}]):
        assert narrative._parse_keywords(bad) == ([], [])
    for bad in (None, [], {}, [{"sentiment_prediction": []}],
                [{"sentiment_prediction": ["not a dict"]}]):
        assert narrative._parse_sentiment(bad) is None


def test_zia_engine_merges_entities_with_the_rule_based_canon(monkeypatch):
    """
    The merge is the point: Zia finds the people and places, the project's own
    lists decide the offence, the IPC section and the district.
    """
    from src.services import catalyst, narrative

    monkeypatch.setattr(catalyst, "zia_ner", lambda docs: ZIA_NER_RESPONSE)
    monkeypatch.setattr(catalyst, "zia_keywords", lambda docs: ZIA_KEYWORD_RESPONSE)
    monkeypatch.setattr(catalyst, "zia_sentiment", lambda docs: ZIA_SENTIMENT_RESPONSE)

    r = narrative.analyse(STATEMENT)
    assert r["engine"] == "zia"
    # From Zia
    assert r["entities"]["persons"] == ["Ramesh Kumar"]
    assert r["entities"]["vehicles"] == ["black Pulsar motorcycle"]
    assert r["entities"]["valuables"] == ["gold chain"]
    assert r["sentiment"]["label"] == "Negative"
    # From this project's lists, which Zia cannot supply
    assert r["suggested_crime_type"] == "Snatching"
    assert r["suggested_ipc"] == "356"
    assert r["suggested_district"] == "Bengaluru Urban"
    # The canonical district leads the place list even though Zia said "Bengaluru"
    assert r["entities"]["places"][0] == "Bengaluru Urban"


def test_falls_back_to_rules_when_zia_does_not_answer(monkeypatch):
    from src.services import catalyst, narrative

    monkeypatch.setattr(catalyst, "zia_ner", lambda docs: None)
    r = narrative.analyse(STATEMENT)
    assert r["engine"] == "rules"
    # Still useful without Zia
    assert r["suggested_crime_type"] == "Snatching"
    assert r["suggested_ipc"] == "356"
    assert r["entities"]["persons"] == [], "rules must not invent people"


def test_a_defect_in_zia_parsing_still_returns_a_usable_result(monkeypatch):
    """A crash in our own parsing must degrade, not fail the registration form."""
    from src.services import catalyst, narrative

    def boom(docs):
        raise RuntimeError("simulated parsing defect")

    monkeypatch.setattr(catalyst, "zia_ner", boom)
    r = narrative.analyse(STATEMENT)
    assert r["engine"] == "rules"
    assert r["suggested_crime_type"] == "Snatching"


def test_digest_horizon_includes_breaches():
    """A breach has a negative days_remaining, so the horizon comparison alone catches it."""
    from src.services import digest

    clock = {"cases": [
        {"days_remaining": -5}, {"days_remaining": 0},
        {"days_remaining": digest.DIGEST_HORIZON_DAYS},
        {"days_remaining": digest.DIGEST_HORIZON_DAYS + 1},
    ]}
    rows = digest._rows_for_digest(clock)
    assert [r["days_remaining"] for r in rows] == [-5, 0, digest.DIGEST_HORIZON_DAYS]
