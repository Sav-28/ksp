import React, { useMemo, useState } from 'react';
import { localizePersonName } from '../locale';

export interface GraphNode {
  id: string;
  label: string;
  group?: string;      // root / leader / person
  risk_score?: number;
  person_id?: number;
  district?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  type?: string;
  strength?: number;
  cases?: string[];   // the Crime No(s) that link the two people (co-accused)
}

interface Pos { x: number; y: number; ring: number; angle: number; }

const NODE_FILL = {
  root: '#d32f2f',
  leader: '#fb8c00',
  person: '#3949ab',
};

/**
 * Clean radial ("hub-and-spoke") network graph.
 * The focus person sits at the centre; direct connections form an inner ring;
 * second-degree connections sit on an outer ring near the neighbour that links
 * them. Far easier to read than a force-directed tangle.
 */
const NetworkGraph = ({
  nodes,
  edges,
  width = 760,
  height = 520,
  onNodeClick,
  language = 'en',
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width?: number;
  height?: number;
  onNodeClick?: (node: GraphNode) => void;
  language?: 'en' | 'kn';
}) => {
  const [hover, setHover] = useState<string | null>(null);

  const { positions, root, rootDegree } = useMemo(() => {
    const pos: Record<string, Pos> = {};
    if (nodes.length === 0) return { positions: pos, root: null as string | null, rootDegree: 0 };

    const cx = width / 2;
    const cy = height / 2;
    const R1 = Math.min(width, height) * 0.27;   // inner ring radius
    const R2 = Math.min(width, height) * 0.44;   // outer ring radius

    // Adjacency (undirected)
    const adj = new Map<string, Set<string>>();
    nodes.forEach((n) => adj.set(n.id, new Set()));
    edges.forEach((e) => {
      if (adj.has(e.source) && adj.has(e.target)) {
        adj.get(e.source)!.add(e.target);
        adj.get(e.target)!.add(e.source);
      }
    });

    // Root = explicit 'root' node, else the highest-degree node.
    let rootId = nodes.find((n) => n.group === 'root')?.id;
    if (!rootId) {
      rootId = nodes.reduce((best, n) =>
        (adj.get(n.id)!.size > (adj.get(best)?.size ?? -1) ? n.id : best), nodes[0].id);
    }

    // BFS depth + parent from root
    const depth = new Map<string, number>();
    const parent = new Map<string, string>();
    depth.set(rootId, 0);
    const queue = [rootId];
    while (queue.length) {
      const cur = queue.shift()!;
      Array.from(adj.get(cur)!).forEach((nb) => {
        if (!depth.has(nb)) {
          depth.set(nb, depth.get(cur)! + 1);
          parent.set(nb, cur);
          queue.push(nb);
        }
      });
    }

    const ring1 = nodes.filter((n) => depth.get(n.id) === 1);
    const ring2plus = nodes.filter((n) => (depth.get(n.id) ?? 99) >= 2);
    // Disconnected (no path to root) — treat as outer ring too.
    const orphans = nodes.filter((n) => n.id !== rootId && !depth.has(n.id));

    // Root at centre
    pos[rootId] = { x: cx, y: cy, ring: 0, angle: 0 };

    // Inner ring: direct connections evenly spaced
    const angleOf: Record<string, number> = {};
    ring1.forEach((n, i) => {
      const a = (2 * Math.PI * i) / Math.max(ring1.length, 1) - Math.PI / 2;
      angleOf[n.id] = a;
      pos[n.id] = { x: cx + Math.cos(a) * R1, y: cy + Math.sin(a) * R1, ring: 1, angle: a };
    });

    // Outer ring: group second-degree nodes under their inner-ring parent and
    // fan them out in a small arc near that parent's angle.
    const childrenByParent = new Map<string, GraphNode[]>();
    ring2plus.forEach((n) => {
      const par = parent.get(n.id);
      const key = par && angleOf[par] !== undefined ? par : '__loose__';
      if (!childrenByParent.has(key)) childrenByParent.set(key, []);
      childrenByParent.get(key)!.push(n);
    });
    childrenByParent.forEach((children, par) => {
      const baseAngle = par === '__loose__' ? -Math.PI / 2 : angleOf[par];
      const spread = Math.min(0.5, 0.16 * children.length);
      children.forEach((n, i) => {
        const offset = children.length === 1 ? 0 : (i / (children.length - 1) - 0.5) * spread;
        const a = baseAngle + offset;
        pos[n.id] = { x: cx + Math.cos(a) * R2, y: cy + Math.sin(a) * R2, ring: 2, angle: a };
      });
    });

    // Orphans spread evenly on the outer ring bottom
    orphans.forEach((n, i) => {
      const a = Math.PI / 2 + (i - orphans.length / 2) * 0.25;
      pos[n.id] = { x: cx + Math.cos(a) * R2, y: cy + Math.sin(a) * R2, ring: 2, angle: a };
    });

    return { positions: pos, root: rootId, rootDegree: adj.get(rootId)!.size };
  }, [nodes, edges, width, height]);

  if (nodes.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>No network data.</div>;
  }

  const radiusFor = (node: GraphNode) => {
    if (node.id === root || node.group === 'root') return 18;
    if (node.group === 'leader') return 13;
    return positions[node.id]?.ring === 1 ? 11 : 8;
  };
  const fillFor = (node: GraphNode) => {
    if (node.id === root || node.group === 'root') return NODE_FILL.root;
    if (node.group === 'leader') return NODE_FILL.leader;
    return NODE_FILL.person;
  };

  const isConnected = (a: string, b: string) =>
    edges.some((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ background: '#fbfcff', borderRadius: 10, border: '1px solid #e6e9f0', display: 'block' }}
    >
      {/* faint ring guides */}
      <circle cx={width / 2} cy={height / 2} r={Math.min(width, height) * 0.27} fill="none" stroke="#eef1f8" strokeWidth={1} />
      <circle cx={width / 2} cy={height / 2} r={Math.min(width, height) * 0.44} fill="none" stroke="#f3f5fb" strokeWidth={1} />

      {/* Edges */}
      {edges.map((e, i) => {
        const s = positions[e.source], t = positions[e.target];
        if (!s || !t) return null;
        const active = hover && (hover === e.source || hover === e.target);
        const dim = hover && !active;
        const touchesRoot = e.source === root || e.target === root;  // direct link spoke
        const shared = e.cases && e.cases.length;
        const tip = shared
          ? `Co-accused in ${e.cases!.length} case(s): ${e.cases!.join(', ')}`
          : (e.type || 'link');
        return (
          <line
            key={i}
            x1={s.x} y1={s.y} x2={t.x} y2={t.y}
            stroke={active ? '#c62828' : touchesRoot ? '#5c6bc0' : '#cbd0de'}
            strokeWidth={Math.min(1 + (e.strength || 1), 5)}
            strokeOpacity={dim ? 0.1 : active ? 0.95 : touchesRoot ? 0.7 : 0.35}
            strokeLinecap="round"
          >
            <title>{tip}</title>
          </line>
        );
      })}

      {/* Nodes */}
      {nodes.map((node) => {
        const p = positions[node.id];
        if (!p) return null;
        const r = radiusFor(node);
        const dim = hover && hover !== node.id && !isConnected(hover, node.id);
        const showLabel = p.ring <= 1 || hover === node.id;
        const highRisk = (node.risk_score ?? 0) >= 70;
        // Label placement: outward from centre, side-aware to avoid overlap.
        const onLeft = Math.cos(p.angle) < -0.15;
        const onRight = Math.cos(p.angle) > 0.15;
        const labelAnchor = node.id === root ? 'middle' : onLeft ? 'end' : onRight ? 'start' : 'middle';
        const lx = node.id === root ? 0 : onLeft ? -(r + 6) : onRight ? (r + 6) : 0;
        const ly = node.id === root ? -(r + 8) : (!onLeft && !onRight) ? -(r + 6) : 4;
        return (
          <g
            key={node.id}
            transform={`translate(${p.x},${p.y})`}
            style={{ cursor: onNodeClick ? 'pointer' : 'default', opacity: dim ? 0.28 : 1, transition: 'opacity .15s' }}
            onMouseEnter={() => setHover(node.id)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onNodeClick && onNodeClick(node)}
          >
            <circle
              r={r}
              fill={fillFor(node)}
              stroke={highRisk ? '#7f0000' : '#fff'}
              strokeWidth={highRisk ? 3 : 2}
            />
            <title>
              {`${node.label}${node.district ? ' · ' + node.district : ''}`}
              {node.risk_score != null ? ` · risk ${node.risk_score}/100` : ''}
              {node.id === root ? ` · ${rootDegree} direct link(s)` : ''}
            </title>
            {showLabel && (
              <text
                x={lx} y={ly}
                textAnchor={labelAnchor}
                fontSize={node.id === root ? 13 : 11}
                fontWeight={node.id === root ? 700 : 500}
                fill="#26324d"
                style={{ pointerEvents: 'none', paintOrder: 'stroke', stroke: '#fbfcff', strokeWidth: 3 }}
              >
                {localizePersonName(node.label, language)}
              </text>
            )}
            {/* Direct-link count badge under the focus node */}
            {node.id === root && (
              <text
                y={r + 16}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                fill="#c62828"
                style={{ pointerEvents: 'none', paintOrder: 'stroke', stroke: '#fbfcff', strokeWidth: 3 }}
              >
                {rootDegree} direct link{rootDegree === 1 ? '' : 's'}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

export default NetworkGraph;
