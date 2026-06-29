"""Verify Phases 10-12: decision support, financial, forecasting."""
import requests
BASE = "http://localhost:8004"


def run():
    tok = requests.post(f"{BASE}/api/login", json={"username": "officer", "password": "ksp@2024"}).json()["token"]
    h = {"Authorization": f"Bearer {tok}"}

    print("1. Case summary (FIR0100)")
    d = requests.get(f"{BASE}/api/cases/FIR0100/summary", headers=h).json()
    print(f"   summary: {d['summary'][:90]}...")
    print(f"   timeline events: {len(d['timeline'])} | leads: {len(d['leads'])}")

    print("\n2. Similar cases (FIR0100)")
    d = requests.get(f"{BASE}/api/cases/FIR0100/similar", headers=h).json()
    print(f"   similar found: {len(d['similar_cases'])} | outcomes: {d['outcome_distribution']}")

    print("\n3. Financial trails")
    d = requests.get(f"{BASE}/api/financial/trails", headers=h).json()
    print(f"   suspicious tx: {d['suspicious_transaction_count']} | total: {d['total_suspicious_amount']} | flagged accts: {d['flagged_accounts']}")

    print("\n4. Forecast")
    d = requests.get(f"{BASE}/api/forecast", headers=h).json()
    print(f"   months: {len(d['monthly_history'])} | next-month forecast: {d['next_month_forecast']} | alerts: {d['alert_count']}")

    print("\n5. Chat follow-up: 'summarize this case' after FIR0100")
    ctx = {"last_fir": "FIR0100", "entities": {}}
    d = requests.post(f"{BASE}/api/chat", json={"text": "summarize this case", "context": ctx}, headers=h).json()
    print(f"   intent={d['intent']} answer={d['answer'][:70]}...")

    print("\n6. Chat follow-up: 'find similar cases'")
    d = requests.post(f"{BASE}/api/chat", json={"text": "find similar cases", "context": ctx}, headers=h).json()
    print(f"   intent={d['intent']} answer={d['answer'][:70]}...")

    print("\n✅ Phases 10-12 verification complete!")


if __name__ == "__main__":
    run()
