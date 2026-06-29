"""
Criminal Network & Relationship Analysis (Challenge Area 2).

Builds a graph of persons connected through co-accused links, gang membership,
and shared cases, and exposes:
  - GET /api/network/person/{id}  — ego network around a person
  - GET /api/network/gang/{id}    — a gang's member network
  - GET /api/network/overview     — top connected offenders + gang clusters

Nodes and edges are returned in a frontend-friendly shape for graph rendering.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Dict, Any, List, Set

from src.database.session import get_db
from src.database.models import (
    Person, Relationship, CasePerson, Gang, GangMember
)
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


def _edges_for_persons(db: Session, person_ids: Set[int]) -> List[Dict[str, Any]]:
    """All relationship edges where BOTH endpoints are in the set."""
    if not person_ids:
        return []
    rels = db.query(Relationship).filter(
        Relationship.person_a_id.in_(person_ids),
        Relationship.person_b_id.in_(person_ids),
    ).all()
    seen = set()
    edges = []
    for r in rels:
        key = tuple(sorted((r.person_a_id, r.person_b_id))) + (r.relationship_type,)
        if key in seen:
            continue
        seen.add(key)
        edges.append({
            "source": f"p{r.person_a_id}",
            "target": f"p{r.person_b_id}",
            "type": r.relationship_type,
            "strength": r.strength,
        })
    return edges


@router.get("/network/person/{person_id}")
async def person_network(
    person_id: int,
    depth: int = 1,
    db: Session = Depends(get_db),
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """Ego network: the person plus their direct (and optionally 2nd-degree) associates."""
    root = db.query(Person).get(person_id)
    if not root:
        raise HTTPException(status_code=404, detail=f"Person {person_id} not found")

    depth = max(1, min(depth, 2))
    included: Set[int] = {person_id}
    frontier: Set[int] = {person_id}

    for _ in range(depth):
        next_frontier: Set[int] = set()
        rels = db.query(Relationship).filter(
            (Relationship.person_a_id.in_(frontier)) | (Relationship.person_b_id.in_(frontier))
        ).all()
        for r in rels:
            for pid in (r.person_a_id, r.person_b_id):
                if pid not in included:
                    next_frontier.add(pid)
        included |= next_frontier
        frontier = next_frontier
        if not frontier:
            break

    persons = db.query(Person).filter(Person.id.in_(included)).all()
    nodes = [_node(p, group=("root" if p.id == person_id else "person")) for p in persons]
    edges = _edges_for_persons(db, included)

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
    """Network of a gang's members."""
    gang = db.query(Gang).get(gang_id)
    if not gang:
        raise HTTPException(status_code=404, detail=f"Gang {gang_id} not found")

    members = db.query(GangMember).filter(GangMember.gang_id == gang_id).all()
    member_ids = {m.person_id for m in members}
    role_by_id = {m.person_id: m.role for m in members}

    persons = db.query(Person).filter(Person.id.in_(member_ids)).all()
    nodes = [
        {**_node(p), "gang_role": role_by_id.get(p.id, "Member"),
         "group": "leader" if role_by_id.get(p.id) == "Leader" else "person"}
        for p in persons
    ]
    edges = _edges_for_persons(db, member_ids)

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
    High-level network intelligence:
      - most-connected persons (by number of relationship edges)
      - gang clusters with member counts
    """
    # Most connected persons
    a_counts = db.query(Relationship.person_a_id, func.count(Relationship.id)).group_by(Relationship.person_a_id).all()
    b_counts = db.query(Relationship.person_b_id, func.count(Relationship.id)).group_by(Relationship.person_b_id).all()
    degree: Dict[int, int] = {}
    for pid, c in a_counts:
        degree[pid] = degree.get(pid, 0) + c
    for pid, c in b_counts:
        degree[pid] = degree.get(pid, 0) + c

    top_ids = sorted(degree, key=degree.get, reverse=True)[:10]
    top_connected = []
    for pid in top_ids:
        p = db.query(Person).get(pid)
        if p:
            top_connected.append({
                "person_id": p.id, "name": p.full_name, "district": p.district,
                "connections": degree[pid], "risk_score": p.risk_score,
            })

    # Gang clusters
    gangs = db.query(Gang).all()
    gang_clusters = []
    for g in gangs:
        count = db.query(GangMember).filter(GangMember.gang_id == g.id).count()
        gang_clusters.append({
            "id": g.id, "name": g.name, "activity": g.primary_activity,
            "base_district": g.base_district, "active": g.active, "member_count": count,
        })
    gang_clusters.sort(key=lambda x: x["member_count"], reverse=True)

    return {
        "top_connected_persons": top_connected,
        "gang_clusters": gang_clusters,
        "total_relationships": db.query(Relationship).count(),
    }
