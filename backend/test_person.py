"""Verify person-by-name query + offenders search."""
import requests
BASE = "http://localhost:8004"


def run():
    tok = requests.post(f"{BASE}/api/login", json={"username": "officer", "password": "ksp@2024"}).json()["token"]
    h = {"Authorization": f"Bearer {tok}"}

    print("1. Offenders default (all repeat offenders)")
    d = requests.get(f"{BASE}/api/offenders", headers=h).json()
    print(f"   total={d['total_repeat_offenders']} returned={len(d['offenders'])}")

    print("\n2. Offenders search 'reddy'")
    d = requests.get(f"{BASE}/api/offenders?search=reddy", headers=h).json()
    print(f"   matches={len(d['offenders'])} sample={[o['name'] for o in d['offenders'][:5]]}")

    print("\n3. Chat person query: 'all crimes done by Vikram Reddy'")
    r = requests.post(f"{BASE}/api/chat", json={"text": "all crimes done by Vikram Reddy"}, headers=h, timeout=120).json()
    print(f"   intent={r['intent']} answer={r['answer'][:90]}")
    print(f"   crimes returned={len(r.get('results', []))}")

    print("\n4. Chat person query (regex fallback style): 'show me the record of Vikram Reddy'")
    r = requests.post(f"{BASE}/api/chat", json={"text": "show me the record of Vikram Reddy"}, headers=h, timeout=120).json()
    print(f"   intent={r['intent']} crimes={len(r.get('results', []))}")

    print("\n5. Non-existent person: 'crimes by Zzxxqq Nobody'")
    r = requests.post(f"{BASE}/api/chat", json={"text": "crimes by Zzxxqq Nobody"}, headers=h, timeout=120).json()
    print(f"   intent={r['intent']} answer={r['answer'][:80]}")

    print("\nDone.")


if __name__ == "__main__":
    run()
