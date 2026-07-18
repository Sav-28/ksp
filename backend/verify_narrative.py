"""Verify the planted narratives are discoverable through the API."""
import requests
BASE = "http://localhost:8004"


def run():
    tok = requests.post(f"{BASE}/api/login", json={"username": "admin", "password": "admin@2024"}).json()["token"]
    h = {"Authorization": f"Bearer {tok}"}

    print("=== Dataset scale ===")
    s = requests.get(f"{BASE}/api/stats", headers=h).json()
    print(f"  total crimes={s['total_crimes']} districts={s['total_districts']}")

    print("\n=== Narrative 1: Snatching gang surge (Bengaluru) ===")
    hs = requests.get(f"{BASE}/api/hotspots", headers=h).json()
    print(f"  top hotspot: {hs['district_hotspots'][0]['district']} ({hs['district_hotspots'][0]['count']})")
    print(f"  emerging surges: {[(x['district'], x['change']) for x in hs['emerging_surges'][:4]]}")
    net = requests.get(f"{BASE}/api/network/overview", headers=h).json()
    print(f"  gangs: {[g['name'] for g in net['gang_clusters']]}")

    print("\n=== Narrative 2: Money-laundering ring ===")
    fin = requests.get(f"{BASE}/api/financial/trails", headers=h).json()
    print(f"  suspicious tx={fin['suspicious_transaction_count']} total=Rs {fin['total_suspicious_amount']:,.0f} flagged_accts={fin['flagged_accounts']}")

    print("\n=== Narrative 3: Escalating offender (Vikram Reddy) ===")
    off = requests.get(f"{BASE}/api/offenders?limit=10", headers=h).json()
    vik = [o for o in off["offenders"] if o["name"] == "Vikram Reddy"]
    if vik:
        v = vik[0]
        print(f"  Vikram Reddy: risk={v['risk_score']} cases={v['cases']} types={v['crime_types']}")
    print(f"  top offender: {off['offenders'][0]['name']} (risk {off['offenders'][0]['risk_score']})")

    print("\n=== Narrative 4: Monthly trend (festival spike) ===")
    print(f"  months tracked: {len(s['by_month'])}")
    peak = max(s['by_month'], key=lambda m: m['count'])
    print(f"  peak month: {peak['label']} ({peak['count']} crimes)")

    print("\n=== Forecast ===")
    fc = requests.get(f"{BASE}/api/forecast", headers=h).json()
    print(f"  next-month forecast={fc['next_month_forecast']} alerts={fc['alert_count']}")

    print("\nDone.")


if __name__ == "__main__":
    run()
