"""
End-to-end test for Phase 3: authentication, protected endpoints,
Kannada queries, and persisted audit log.
"""
import requests

BASE = "http://localhost:8004"


def section(t):
    print("\n" + "=" * 60)
    print(t)
    print("=" * 60)


def run():
    # 1. Unauthenticated request should be rejected
    section("1. Chat without token (expect 401)")
    r = requests.post(f"{BASE}/api/chat", json={"text": "show crimes in bengaluru"})
    print(f"   status={r.status_code} (expected 401)")
    assert r.status_code == 401, "Expected 401 for unauthenticated request"

    # 2. Login with bad credentials
    section("2. Login with wrong password (expect 401)")
    r = requests.post(f"{BASE}/api/login", json={"username": "officer", "password": "wrong"})
    print(f"   status={r.status_code} (expected 401)")
    assert r.status_code == 401

    # 3. Login with correct credentials
    section("3. Login with correct credentials")
    r = requests.post(f"{BASE}/api/login", json={"username": "officer", "password": "ksp@2024"})
    print(f"   status={r.status_code}")
    data = r.json()
    token = data["token"]
    print(f"   user={data['name']} role={data['role']}")
    print(f"   token={token[:30]}...")
    headers = {"Authorization": f"Bearer {token}"}

    # 4. Authenticated English query
    section("4. Authenticated English query")
    r = requests.post(f"{BASE}/api/chat", json={"text": "show crimes in mysuru"}, headers=headers)
    d = r.json()
    print(f"   status={r.status_code} intent={d.get('intent')} results={len(d.get('results', []))}")
    print(f"   sql field (should be None unless debug): {d.get('sql')}")

    # 5. Authenticated Kannada query
    section("5. Authenticated Kannada query")
    r = requests.post(f"{BASE}/api/chat",
                      json={"text": "ಬೆಂಗಳೂರಿನಲ್ಲಿ ಅಪರಾಧಗಳನ್ನು ತೋರಿಸಿ", "language": "kn"},
                      headers=headers)
    d = r.json()
    print(f"   status={r.status_code} intent={d.get('intent')} results={len(d.get('results', []))}")
    print(f"   entities={d.get('entities')}")

    # 6. Kannada count query
    section("6. Authenticated Kannada count query")
    r = requests.post(f"{BASE}/api/chat",
                      json={"text": "ಮೈಸೂರಿನಲ್ಲಿ ಎಷ್ಟು ಕಳ್ಳತನಗಳು", "language": "kn"},
                      headers=headers)
    d = r.json()
    print(f"   status={r.status_code} intent={d.get('intent')}")
    print(f"   answer={d.get('answer')[:60]}")

    # 7. Stats endpoint (protected)
    section("7. Stats endpoint with token")
    r = requests.get(f"{BASE}/api/stats", headers=headers)
    print(f"   status={r.status_code} total_crimes={r.json().get('total_crimes')}")

    # 8. Audit log
    section("8. Audit log (should contain our queries)")
    r = requests.get(f"{BASE}/api/audit?limit=10", headers=headers)
    d = r.json()
    print(f"   status={r.status_code} total_entries={d.get('total')}")
    for log in d.get("logs", [])[:6]:
        print(f"     [{log['username']}] '{log['query_text'][:35]}' -> {log['intent']} ({log['language']}) rows={log['row_count']}")

    print("\n✅ Phase 3 end-to-end test complete!")


if __name__ == "__main__":
    run()
