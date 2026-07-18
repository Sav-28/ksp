"""
Test the LLM-backed understanding on tricky, unrehearsed queries
(the kind that would break the old TF-IDF classifier).
"""
import requests
BASE = "http://localhost:8004"

TRICKY = [
    "which areas are seeing the most chain snatching lately?",
    "give me a rundown of murder cases in mysuru",
    "I need every burglary reported around hubli",
    "break down the crimes by type for me",
    "what's the most common crime across the state?",
    "ಬೆಂಗಳೂರಿನಲ್ಲಿ ಕಳ್ಳತನ ಎಷ್ಟು",   # Kannada: how many thefts in Bengaluru
    "good afternoon, how's it going?",   # should be UNKNOWN
]


def run():
    tok = requests.post(f"{BASE}/api/login", json={"username": "officer", "password": "ksp@2024"}).json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    for q in TRICKY:
        try:
            d = requests.post(f"{BASE}/api/chat", json={"text": q}, headers=h, timeout=120).json()
            eng = (d.get("evidence") or {}).get("engine", "?")
            print(f"Q: {q}")
            print(f"   -> intent={d.get('intent')} entities={d.get('entities')} engine={eng} results={len(d.get('results', []))}")
        except Exception as e:
            print(f"Q: {q}\n   ERROR: {e}")
        print("-" * 70)


if __name__ == "__main__":
    run()
