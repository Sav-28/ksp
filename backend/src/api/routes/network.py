"""
Criminal Network & Relationship Analysis (Challenge Area 2).

The network is GROUNDED IN REAL CASE DATA: an edge between two people exists
because they were **co-accused on the same FIR**. Every edge is therefore
traceable to actual case(s) — the linking Crime No(s) are returned on the edge,
so the graph is explainable (Area 9) rather than decorative.

  - GET /api/network/person/{id}  — ego network (people who share cases)
  - GET /api/network/gang/{id}    — a gang's member network (co-accused edges)
  - GET /api/network/overview     — most-connected offenders + gang clusters
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, Any, List, Set, Tuple
from collections import defaultdict

from src.database.session import get_db
from src.database.models import Person, CasePerson, Crime, Gang, GangMember
from src.api.auth import get_current_user

router = APIRouter()


def _node(person: Person, group: str = "person") -> Dict[str, Any]:
    return {
        "id": f"p{person.id}",
        "person_id": person.id,
        "label": person.full_name,
        "group": group,
        "district": person.district,
        "risk_score": person.risk_score,
    }


def _coaccused_index(db: Session) -> Tuple[Dict[int, Set[int]], Dict[Tuple[int, int], Set[str]]]:
    """
    Build the co-accused graph from real case data.

    Returns:
      adjacency[pid]           -> set of people who were co-accused with pid
      pair_cases[(a, b)]       -> set of Crime No(s) that link a and b (a < b)
    """
    rows = db.query(CasePerson.crime_id, CasePerson.person_id).filter(
        CasePerson.role == "accused").all()
    by_crime: Dict[int, List[int]] = defaultdict(list)
    for crime_id, person_id in rows:
        by_crime[crime_id].append(person_id)

    # crime_id -> Crime No (fir_number now holds the official CrimeNo)
    fir_by_crime: Dict[int, str] = {}
    crime_ids = list(by_crime.keys())
    if crime_ids:
        for cid, fno in db.query(Crime.id, Crime.fir_number).filter(
                Crime.id.in_(crime_ids)).all():
            fir_by_crime[cid] = fno

    adjacency: Dict[int, Set[int]] = defaultdict(set)
    pair_cases: Dict[Tuple[int, int], Set[str]] = defaultdict(set)
    for cid, pids in by_crime.items():
        uniq = list(set(pids))
        for i in range(len(uniq)):
            for j in range(i + 1, len(uniq)):
                a, b = sorted((uniq[i], uniq[j]))
                adjacency[a].add(b)
                adjacency[b].add(a)
                if fir_by_crime.get(cid):
                    pair_cases[(a, b)].add(fir_by_crime[cid])
    return adjacency, pair_cases


def _edges_within(included: Set[int], pair_cases: Dict[Tuple[int, int], Set[str]]) -> List[Dict[str, Any]]:
    """Co-accused edges where both endpoints are in the included set."""
    edges = []
    for (a, b), firs in pair_cases.items():
        if a in included and b in included:
            edges.append({
                "source": f"p{a}", "target": f"p{b}",
                "type": "co-accused",
                "strength": len(firs),          # how many cases they share
                "cases": sorted(firs),          # the linking Crime No(s)
            })
    return edges


@router.get("/network/search")
async def search_offenders(
    q: str = "",
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Search offenders by name; returns matches ranked by network connections
    so any person's network can be looked up (not just the top-10 list)."""
    q = (q or "").strip()
    if len(q) < 2:
        return {"results": []}
    adjacency, _ = _coaccused_index(db)
    matches = db.query(Person).filter(Person.full_name.ilike(f"%{q}%")).limit(40).all()
    results = [{
        "person_id": p.id, "name": p.full_name, "district": p.district,
        "connections": len(adjacency.get(p.id, set())), "risk_score": p.risk_score,
    } for p in matches]
    results.sort(key=lambda x: x["connections"], reverse=True)
    return {"results": results}


@router.get("/network/person/{person_id}")
async def person_network(
    person_id: int,
    depth: int = 1,
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Ego network: the person plus those they were co-accused with (1-2 hops)."""
    root = db.get(Person, person_id)
    if not root:
        raise HTTPException(status_code=404, detail=f"Person {person_id} not found")

    adjacency, pair_cases = _coaccused_index(db)

    depth = max(1, min(depth, 2))
    included: Set[int] = {person_id}
    frontier: Set[int] = {person_id}
    for _ in range(depth):
        nxt: Set[int] = set()
        for pid in frontier:
            for nb in adjacency.get(pid, ()):
                if nb not in included:
                    nxt.add(nb)
        included |= nxt
        frontier = nxt
        if not frontier:
            break

    persons = db.query(Person).filter(Person.id.in_(included)).all()
    nodes = [_node(p, group=("root" if p.id == person_id else "person")) for p in persons]
    edges = _edges_within(included, pair_cases)
    return {
        "root": person_id,
        "node_count": len(nodes),
        "edge_count": len(edges),
        "nodes": nodes,
        "edges": edges,
    }


@router.get("/network/gang/{gang_id}")
async def gang_network(
    gang_id: int,
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Network of a gang's members, with co-accused edges between them."""
    gang = db.get(Gang, gang_id)
    if not gang:
        raise HTTPException(status_code=404, detail=f"Gang {gang_id} not found")

    members = db.query(GangMember).filter(GangMember.gang_id == gang_id).all()
    member_ids = {m.person_id for m in members}
    role_by_id = {m.person_id: m.role for m in members}

    _, pair_cases = _coaccused_index(db)
    persons = db.query(Person).filter(Person.id.in_(member_ids)).all()
    nodes = [
        {**_node(p), "gang_role": role_by_id.get(p.id, "Member"),
         "group": "leader" if role_by_id.get(p.id) == "Leader" else "person"}
        for p in persons
    ]
    edges = _edges_within(member_ids, pair_cases)
    return {
        "gang": {"id": gang.id, "name": gang.name, "activity": gang.primary_activity,
                 "base_district": gang.base_district, "active": gang.active},
        "node_count": len(nodes),
        "edge_count": len(edges),
        "nodes": nodes,
        "edges": edges,
    }


@router.get("/network/overview")
async def network_overview(
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Network intelligence, grounded in shared cases:
      - most-connected offenders (by number of distinct co-offenders)
      - gang clusters (organized-crime overlay)
    """
    adjacency, pair_cases = _coaccused_index(db)

    # Most connected = people who share cases with the most distinct co-offenders
    top_ids = sorted(adjacency, key=lambda pid: len(adjacency[pid]), reverse=True)[:10]
    top_connected = []
    for pid in top_ids:
        p = db.get(Person, pid)
        if p:
            top_connected.append({
                "person_id": p.id, "name": p.full_name, "district": p.district,
                "connections": len(adjacency[pid]), "risk_score": p.risk_score,
            })

    # Gang clusters (organized-crime overlay)
    gang_clusters = []
    for g in db.query(Gang).all():
        count = db.query(GangMember).filter(GangMember.gang_id == g.id).count()
        gang_clusters.append({
            "id": g.id, "name": g.name, "activity": g.primary_activity,
            "base_district": g.base_district, "active": g.active, "member_count": count,
        })
    gang_clusters.sort(key=lambda x: x["member_count"], reverse=True)

    return {
        "top_connected_persons": top_connected,
        "gang_clusters": gang_clusters,
        # Distinct co-accused links (evidence-backed edges) across the dataset.
        "total_relationships": len(pair_cases),
    }
