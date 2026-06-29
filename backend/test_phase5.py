"""
Verify Phase 5: context-aware follow-ups and detail queries.
"""
import requests

BASE = "http://localhost:8004"


def run():
    r = requests.post(f"{BASE}/api/login", json={"username": "officer", "password": "ksp@2024"})
    headers = {"Authorization": f"Bearer {r.json()['token']}"}

    def chat(text, context=None):
        body = {"text": text, "language": "en"}
        if context is not None:
            body["context"] = context
        return requests.post(f"{BASE}/api/chat", json=body, headers=headers).json()

    print("=" * 60)
    print("1. Initial query: 'show crimes in mysuru'")
    d = chat("show crimes in mysuru")
    print(f"   intent={d['intent']} results={len(d['results'])} last_fir={d.get('context', {}).get('last_fir')}")
    ctx = d.get("context")

    print("\n2. Follow-up (carry-forward): 'and theft?'  (should stay in Mysuru)")
    d = chat("and theft?", ctx)
    print(f"   intent={d['intent']} entities={d['entities']} results={len(d['results'])}")
    ctx = d.get("context")

    print("\n3. Follow-up detail: 'who was the accused?'  (about last FIR)")
    d = chat("who was the accused?", ctx)
    print(f"   intent={d['intent']}")
    print(f"   answer={d['answer']}")

    print("\n4. Explicit detail: 'details of FIR0100'")
    d = chat("details of FIR0100")
    print(f"   intent={d['intent']}")
    print(f"   answer={d['answer']}")
    det = d.get("detail", {})
    print(f"   accused={[p['name'] for p in det.get('accused', [])]} status={(det.get('investigation') or {}).get('status')}")

    print("\n5. Follow-up: 'what is the investigation status?'  (about FIR0100)")
    d = chat("what is the investigation status?", d.get("context"))
    print(f"   intent={d['intent']}")
    print(f"   answer={d['answer']}")

    print("\n6. Broad query clears location: 'show all crimes' after Mysuru context")
    d = chat("show all crimes", {"entities": {"location": "Mysuru"}, "last_fir": None})
    print(f"   intent={d['intent']} entities={d['entities']} results={len(d['results'])}")

    print("\n✅ Phase 5 verification complete!")


if __name__ == "__main__":
    run()
