"""Verify the AI Case Intelligence Briefing (endpoint + chat trigger)."""
import requests
BASE = "http://localhost:8004"


def run():
    tok = requests.post(f"{BASE}/api/login", json={"username": "officer", "password": "ksp@2024"}).json()["token"]
    h = {"Authorization": f"Bearer {tok}"}

    # Find Vikram Reddy's id via search
    off = requests.get(f"{BASE}/api/offenders?search=Vikram Reddy", headers=h).json()
    vik = max(off["offenders"], key=lambda o: o["cases"]) if off["offenders"] else None
    if not vik:
        print("Vikram Reddy not found"); return
    pid = vik["person_id"]
    print(f"Vikram Reddy person_id={pid}, cases={vik['cases']}, risk={vik['risk_score']}")

    print("\n1. Briefing endpoint /api/briefing/person/{id}")
    r = requests.get(f"{BASE}/api/briefing/person/{pid}", headers=h, timeout=180).json()
    print(f"   engine={r['engine']}")
    print(f"   subject={r['subject']}")
    print("   --- BRIEFING ---")
    print("   " + r["briefing"].replace("\n", "\n   "))
    print(f"   --- evidence: {r['evidence']['total_cases']} cases, "
          f"{len(r['evidence']['gangs'])} gang(s), "
          f"{r['evidence']['financial']['suspicious_transactions']} suspicious tx ---")

    print("\n2. Chat trigger: 'brief me on Vikram Reddy'")
    r = requests.post(f"{BASE}/api/chat", json={"text": "brief me on Vikram Reddy"}, headers=h, timeout=180).json()
    print(f"   intent={r['intent']}")
    print(f"   briefing present={'briefing' in r}")

    print("\nDone.")


if __name__ == "__main__":
    run()
