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
}

interface Pos { x: number; y: number; }

const GROUP_COLOR: Record<string, string> = {
  root: '#d32f2f',
  leader: '#ff9800',
  person: '#1a237e',
};

const EDGE_COLOR: Record<string, string> = {
  co_accused: '#90a4ae',
  gang_member: '#ff9800',
  family: '#66bb6a',
  financial: '#ab47bc',
};

/**
 * Self-contained force-directed graph rendered as SVG.
 * Runs a lightweight Fruchterman-Reingold layout once (memoized).
 */
const NetworkGraph = ({
  nodes,
  edges,
  width = 720,
  height = 460,
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

  const positions = useMemo(() => {
    const n = nodes.length;
    if (n === 0) return {} as Record<string, Pos>;

    const area = width * height;
    const k = Math.sqrt(area / n) * 0.7; // ideal edge length
    const pos: Record<string, Pos> = {};

    // Deterministic initial placement on a circle (stable layout)
    nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / n;
      pos[node.id] = {
        x: width / 2 + Math.cos(angle) * (width / 4),
        y: height / 2 + Math.sin(angle) * (height / 4),
      };
    });

    const idIndex = new Map(nodes.map((nd, i) => [nd.id, i]));
    const validEdges = edges.filter(e => idIndex.has(e.source) && idIndex.has(e.target));

    const iterations = 300;
    let temp = width / 10;
    const cool = temp / (iterations + 1);

    for (let it = 0; it < iterations; it++) {
      const disp: Record<string, Pos> = {};
      nodes.forEach(nd => (disp[nd.id] = { x: 0, y: 0 }));

      // Repulsive forces (all pairs)
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = pos[a.id].x - pos[b.id].x;
          let dy = pos[a.id].y - pos[b.id].y;
          let dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
          const rep = (k * k) / dist;
          const ux = dx / dist, uy = dy / dist;
          disp[a.id].x += ux * rep; disp[a.id].y += uy * rep;
          disp[b.id].x -= ux * rep; disp[b.id].y -= uy * rep;
        }
      }

      // Attractive forces (along edges)
      validEdges.forEach(e => {
        let dx = pos[e.source].x - pos[e.target].x;
        let dy = pos[e.source].y - pos[e.target].y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const att = (dist * dist) / k;
        const ux = dx / dist, uy = dy / dist;
        disp[e.source].x -= ux * att; disp[e.source].y -= uy * att;
        disp[e.target].x += ux * att; disp[e.target].y += uy * att;
      });

      // Apply with temperature limit
      for (let idx = 0; idx < n; idx++) {
        const nd = nodes[idx];
        const d = disp[nd.id];
        const len = Math.sqrt(d.x * d.x + d.y * d.y) || 0.01;
        pos[nd.id].x += (d.x / len) * Math.min(len, temp);
        pos[nd.id].y += (d.y / len) * Math.min(len, temp);
        // Keep within bounds
        pos[nd.id].x = Math.max(30, Math.min(width - 30, pos[nd.id].x));
        pos[nd.id].y = Math.max(30, Math.min(height - 30, pos[nd.id].y));
      }

      temp -= cool;
    }

    return pos;
  }, [nodes, edges, width, height]);

  if (nodes.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>No network data.</div>;
  }

  const radiusFor = (node: GraphNode) =>
    node.group === 'root' ? 14 : node.group === 'leader' ? 12 : 9;

  return (
    <svg width={width} height={height} style={{ background: '#fafbff', borderRadius: 8, border: '1px solid #e0e0e0', maxWidth: '100%' }}>
      {/* Edges */}
      {edges.map((e, i) => {
        const s = positions[e.source], t = positions[e.target];
        if (!s || !t) return null;
        const dim = hover && hover !== e.source && hover !== e.target;
        return (
          <line
            key={i}
            x1={s.x} y1={s.y} x2={t.x} y2={t.y}
            stroke={EDGE_COLOR[e.type || ''] || '#cfd8dc'}
            strokeWidth={1 + (e.strength || 1)}
            strokeOpacity={dim ? 0.15 : 0.7}
          />
        );
      })}
      {/* Nodes */}
      {nodes.map((node) => {
        const p = positions[node.id];
        if (!p) return null;
        const r = radiusFor(node);
        const dim = hover && hover !== node.id &&
          !edges.some(e => (e.source === hover && e.target === node.id) || (e.target === hover && e.source === node.id));
        return (
          <g
            key={node.id}
            transform={`translate(${p.x},${p.y})`}
            style={{ cursor: onNodeClick ? 'pointer' : 'default', opacity: dim ? 0.3 : 1 }}
            onMouseEnter={() => setHover(node.id)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onNodeClick && onNodeClick(node)}
          >
            <circle
              r={r}
              fill={GROUP_COLOR[node.group || 'person'] || '#1a237e'}
              stroke="#fff"
              strokeWidth={2}
            />
            {(hover === node.id || node.group === 'root' || node.group === 'leader') && (
              <text
                y={-r - 5}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill="#1a237e"
              >
                {localizePersonName(node.label, language)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

export default NetworkGraph;
