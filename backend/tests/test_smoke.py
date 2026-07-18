"""
Smoke test suite for KSP Crime AI (pytest).
Covers the core flows: auth, querying, intelligence endpoints, and RBAC.

Run:  pytest -q   (from the backend directory, with the server NOT required —
these use FastAPI's TestClient against the in-process app).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# Pin tests to the deterministic rule-based NLP so they don't depend on a
# running Ollama instance or vary with LLM output. The LLM path is tested
# separately (test_llm.py).
os.environ["KSP_NLP_PROVIDER"] = "rules"

import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def _token(username="officer", password="ksp@2024"):
    r = client.post("/api/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _auth(username="officer", password="ksp@2024"):
    return {"Authorization": f"Bearer {_token(username, password)}"}


# --- Auth ---
def test_login_success():
    r = client.post("/api/login", json={"username": "officer", "password": "ksp@2024"})
    assert r.status_code == 200
    assert "token" in r.json()


def test_login_failure():
    r = client.post("/api/login", json={"username": "officer", "password": "wrong"})
    assert r.status_code == 401


def test_chat_requires_auth():
    r = client.post("/api/chat", json={"text": "show crimes in mysuru"})
    assert r.status_code == 401


# --- Core query flows ---
def test_show_crimes():
    r = client.post("/api/chat", json={"text": "show crimes in mysuru"}, headers=_auth())
    assert r.status_code == 200
    data = r.json()
    assert data["intent"] == "SHOW_CRIMES"
    assert isinstance(data["results"], list)
    assert "evidence" in data


def test_breakdown():
    r = client.post("/api/chat", json={"text": "crimes by district"}, headers=_auth())
    assert r.json()["intent"] == "BREAKDOWN_CRIMES"


def test_kannada_query():
    r = client.post("/api/chat",
                    json={"text": "ಬೆಂಗಳೂರಿನಲ್ಲಿ ಅಪರಾಧಗಳನ್ನು ತೋರಿಸಿ", "language": "kn"},
                    headers=_auth())
    assert r.json()["intent"] == "SHOW_CRIMES"
    assert r.json()["entities"].get("location") == "Bengaluru"


def test_followup_context():
    h = _auth()
    r1 = client.post("/api/chat", json={"text": "show crimes in mysuru"}, headers=h)
    ctx = r1.json()["context"]
    r2 = client.post("/api/chat", json={"text": "and theft?", "context": ctx}, headers=h)
    ents = r2.json()["entities"]
    assert ents.get("location") == "Mysuru"
    assert ents.get("crime_type") == "Theft"


# --- Intelligence endpoints ---
def test_stats():
    assert client.get("/api/stats", headers=_auth()).status_code == 200


def test_network_overview():
    assert client.get("/api/network/overview", headers=_auth()).status_code == 200


def test_offenders():
    r = client.get("/api/offenders", headers=_auth())
    assert r.status_code == 200
    assert "offenders" in r.json()


def test_forecast():
    assert client.get("/api/forecast", headers=_auth()).status_code == 200


def test_financial_trails():
    assert client.get("/api/financial/trails", headers=_auth()).status_code == 200


# --- RBAC ---
def test_audit_admin_only():
    # officer is forbidden
    r = client.get("/api/audit", headers=_auth("officer", "ksp@2024"))
    assert r.status_code == 403
    # admin is allowed
    r = client.get("/api/audit", headers=_auth("admin", "admin@2024"))
    assert r.status_code == 200
