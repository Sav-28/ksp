"""
End-to-end test for Phase 2 features: SHOW, COUNT, BREAKDOWN intents.
"""
import requests
import json

URL = "http://localhost:8004/api/chat"

QUERIES = [
    "Show crimes in Bengaluru",
    "How many thefts in Mysuru",
    "Crimes by district",
    "Breakdown of crimes by type",
    "Monthly crime trend",
    "How many total crimes",
    "hello there",
]


def run():
    for q in QUERIES:
        print("=" * 60)
        print(f"QUERY: {q}")
        try:
            r = requests.post(URL, json={"text": q, "language": "en"}, timeout=10)
            if r.status_code != 200:
                print(f"  HTTP {r.status_code}: {r.json()}")
                continue
            data = r.json()
            print(f"  intent     : {data.get('intent')} (conf={data.get('confidence')})")
            print(f"  entities   : {data.get('entities')}")
            print(f"  answer     : {data.get('answer')[:80]}")
            results = data.get('results', [])
            print(f"  results    : {len(results)} row(s)")
            if data.get('intent') == 'BREAKDOWN_CRIMES' and results:
                for row in results[:5]:
                    print(f"     - {row.get('label')}: {row.get('count')}")
        except Exception as e:
            print(f"  ERROR: {e}")


if __name__ == "__main__":
    run()
