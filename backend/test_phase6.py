"""Verify Phase 6: criminal network analysis endpoints."""
import requests

BASE = "http://localhost:8004"


def run():
    r = requests.post(f"{BASE}/api/login", json={"username": "officer", "password": "ksp@2024"})
    headers = {"Authorization": f"Bearer {r.json()['token']}"}

    print("=" * 60)
    print("1. Network overview")
    r = requests.get(f"{BASE}/api/network/overview", headers=headers)
    d = r.json()
    print(f"   status={r.status_code} total_relationships={d['total_relationships']}")
    print("   Top connected:")
    for p in d["top_connected_persons"][:3]:
        print(f"     - {p['name']} ({p['connections']} links)")
    print("   Gang clusters:")
    for g in d["gang_clusters"][:3]:
        print(f"     - {g['name']} ({g['member_count']} members, {g['activity']})")

    # Drill into top connected person
    top_id = d["top_connected_persons"][0]["person_id"]
    print(f"\n2. Person network (person {top_id}, depth=2)")
    r = requests.get(f"{BASE}/api/network/person/{top_id}?depth=2", headers=headers)
    d2 = r.json()
    print(f"   status={r.status_code} nodes={d2['node_count']} edges={d2['edge_count']}")

    # Gang network
    gid = d["gang_clusters"][0]["id"]
    print(f"\n3. Gang network (gang {gid})")
    r = requests.get(f"{BASE}/api/network/gang/{gid}", headers=headers)
    d3 = r.json()
    print(f"   status={r.status_code} gang={d3['gang']['name']} nodes={d3['node_count']} edges={d3['edge_count']}")

    print("\n✅ Phase 6 verification complete!")


if __name__ == "__main__":
    run()
