"""
Verify Phase 4: the normalized intelligence model and detail endpoints.
"""
import requests

BASE = "http://localhost:8004"


def run():
    # Login
    r = requests.post(f"{BASE}/api/login", json={"username": "officer", "password": "ksp@2024"})
    token = r.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Crime detail for a known FIR
    print("=" * 60)
    print("1. Crime detail (FIR0100)")
    print("=" * 60)
    r = requests.get(f"{BASE}/api/crime/FIR0100", headers=headers)
    d = r.json()
    print(f"   status={r.status_code}")
    print(f"   {d.get('crime_type')} in {d.get('district')} | FIR {d.get('fir_number')}")
    inv = d.get("investigation") or {}
    print(f"   Investigation: {inv.get('status')} | IO: {inv.get('officer')} | IPC: {inv.get('ipc_sections')}")
    print(f"   Accused: {[a['name'] for a in d.get('accused', [])]}")
    print(f"   Victims: {[v['name'] for v in d.get('victims', [])]}")

    # Find a repeat offender to inspect
    print("\n" + "=" * 60)
    print("2. Person profile (first person)")
    print("=" * 60)
    r = requests.get(f"{BASE}/api/person/1", headers=headers)
    d = r.json()
    print(f"   status={r.status_code}")
    print(f"   {d.get('name')} | demo={d.get('demographics')}")
    print(f"   repeat_offender={d.get('is_repeat_offender')} accused_in={d.get('accused_in_n_cases')}")
    print(f"   cases={len(d.get('cases', []))} associates={len(d.get('associates', []))} gangs={d.get('gangs')}")
    print(f"   accounts={d.get('financial_accounts')}")

    print("\n✅ Phase 4 verification complete!")


if __name__ == "__main__":
    run()
