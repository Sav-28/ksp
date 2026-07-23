import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import NetworkGraph, { GraphNode, GraphEdge } from './NetworkGraph';
import { localizePersonName } from '../locale';

interface TopPerson {
  person_id: number;
  name: string;
  district: string;
  connections: number;
  risk_score: number;
}

interface GangCluster {
  id: number;
  name: string;
  activity: string;
  base_district: string;
  active: boolean;
  member_count: number;
}

const NetworkView = ({ language }: { language: 'en' | 'kn' }) => {
  const t = (en: string, kn: string) => (language === 'en' ? en : kn);

  const [overview, setOverview] = useState<{ top_connected_persons: TopPerson[]; gang_clusters: GangCluster[]; total_relationships: number } | null>(null);
  const [graph, setGraph] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null);
  const [title, setTitle] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<TopPerson[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const loadOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/network/overview');
      const data = await res.json();
      setOverview(data);
      // Auto-render the most-connected offender so the graph isn't empty.
      if (data.top_connected_persons?.length) {
        const top = data.top_connected_persons[0];
        loadPersonNetwork(top.person_id, top.name);
      }
    } catch (e: any) {
      setError(e.message === 'UNAUTHORIZED' ? 'Session expired. Please log in again.' : 'Unable to load network data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadOverview(); }, []);

  const doSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = searchQ.trim();
    if (q.length < 2) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const res = await apiFetch(`/api/network/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch { setSearchResults([]); }
    finally { setSearching(false); }
  };

  const loadPersonNetwork = async (personId: number, name: string) => {
    setSelectedId(personId);
    try {
      const res = await apiFetch(`/api/network/person/${personId}?depth=2`);
      const data = await res.json();
      setGraph({ nodes: data.nodes, edges: data.edges });
      setTitle(t('Network around ', 'ಸುತ್ತಲಿನ ಜಾಲ ') + localizePersonName(name, language));
    } catch { /* ignore */ }
  };

  const loadGangNetwork = async (gangId: number, name: string) => {
    setSelectedId(null);
    try {
      const res = await apiFetch(`/api/network/gang/${gangId}`);
      const data = await res.json();
      setGraph({ nodes: data.nodes, edges: data.edges });
      setTitle(t('Gang network: ', 'ಗ್ಯಾಂಗ್ ಜಾಲ: ') + name);
    } catch { /* ignore */ }
  };

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#666' }}>⏳ {t('Loading network intelligence...', 'ಜಾಲ ಗುಪ್ತಚರ ಲೋಡ್ ಆಗುತ್ತಿದೆ...')}</div>;
  if (error) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ color: '#d32f2f', marginBottom: 16 }}>⚠️ {error}</div>
      <button onClick={loadOverview} style={btn}>{t('Retry', 'ಮರುಪ್ರಯತ್ನಿಸಿ')}</button>
    </div>
  );
  if (!overview) return null;

  // Summary for the stats strip above the graph.
  const rootNode = graph?.nodes.find((n) => n.group === 'root') || graph?.nodes[0] || null;
  const directLinks = graph && rootNode
    ? new Set(
        graph.edges
          .filter((e) => e.source === rootNode.id || e.target === rootNode.id)
          .map((e) => (e.source === rootNode.id ? e.target : e.source))
      ).size
    : 0;
  const totalNetwork = graph ? Math.max(graph.nodes.length - 1, 0) : 0;
  const secondDegree = Math.max(totalNetwork - directLinks, 0);

  return (
    <div style={{ padding: '30px 40px', backgroundColor: '#fafafa', minHeight: '100%' }}>
      <h2 style={{ color: '#1a237e', fontSize: 24, marginBottom: 6 }}>
        🕸️ {t('Criminal Network Analysis', 'ಅಪರಾಧ ಜಾಲ ವಿಶ್ಲೇಷಣೆ')}
      </h2>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 20 }}>
        {t('Offenders linked by shared cases (co-accused on the same FIR)',
           'ಹಂಚಿದ ಪ್ರಕರಣಗಳಿಂದ ಜೋಡಿಸಲಾದ ಅಪರಾಧಿಗಳು (ಒಂದೇ ಎಫ್‌ಐಆರ್‌ನಲ್ಲಿ ಸಹ-ಆರೋಪಿ)')}
        {' · '}{overview.total_relationships} {t('evidence-backed links', 'ಪುರಾವೆ ಆಧಾರಿತ ಸಂಪರ್ಕಗಳು')}
      </p>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* Left: selectors */}
        <div style={{ flex: '1 1 280px', minWidth: 280 }}>
          {/* Search any offender */}
          <div style={card}>
            <div style={cardTitle}>🔍 {t('Search Offender', 'ಅಪರಾಧಿ ಹುಡುಕಿ')}</div>
            <form onSubmit={doSearch} style={{ display: 'flex', gap: 8 }}>
              <input
                value={searchQ}
                onChange={(ev) => setSearchQ(ev.target.value)}
                placeholder={t('Name, e.g. Vikram', 'ಹೆಸರು, ಉದಾ. ವಿಕ್ರಮ್')}
                style={{ flex: 1, padding: '9px 11px', fontSize: 14, border: '1px solid #c0c8d0', borderRadius: 6 }}
              />
              <button type="submit" style={{ ...btn, padding: '9px 16px' }}>
                {searching ? '…' : t('Go', 'ಹೋಗಿ')}
              </button>
            </form>
            {searchResults && (
              <div style={{ marginTop: 10 }}>
                {searchResults.length === 0 && (
                  <div style={{ color: '#999', fontSize: 13 }}>{t('No offenders found.', 'ಯಾರೂ ಸಿಗಲಿಲ್ಲ.')}</div>
                )}
                {searchResults.map((p) => (
                  <div key={p.person_id} onClick={() => loadPersonNetwork(p.person_id, p.name)}
                    style={{ ...rowItem, ...(selectedId === p.person_id ? rowActive : {}) }}>
                    <span>👤 {localizePersonName(p.name, language)}</span>
                    <span style={{ fontSize: 12, color: '#666' }}>{p.connections} {t('links', 'ಸಂಪರ್ಕ')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ ...card, marginTop: 16 }}>
            <div style={cardTitle}>🔗 {t('Most Connected Offenders', 'ಅತಿ ಹೆಚ್ಚು ಸಂಪರ್ಕಿತ ಅಪರಾಧಿಗಳು')}</div>
            {overview.top_connected_persons.map((p, i) => (
              <div key={p.person_id} onClick={() => loadPersonNetwork(p.person_id, p.name)}
                style={{ ...rowItem, ...(selectedId === p.person_id ? rowActive : {}) }}>
                <span><span style={{ color: '#9aa2b5', marginRight: 6 }}>{i + 1}</span>👤 {localizePersonName(p.name, language)}</span>
                <span style={{ fontSize: 12, color: '#666' }}>{p.connections} {t('links', 'ಸಂಪರ್ಕ')}</span>
              </div>
            ))}
          </div>

          <div style={{ ...card, marginTop: 16 }}>
            <div style={cardTitle}>🚨 {t('Organized Crime Groups', 'ಸಂಘಟಿತ ಅಪರಾಧ ಗುಂಪುಗಳು')}</div>
            {overview.gang_clusters.map((g) => (
              <div key={g.id} onClick={() => loadGangNetwork(g.id, g.name)} style={rowItem}>
                <span>🏴 {g.name}</span>
                <span style={{ fontSize: 12, color: '#666' }}>{g.member_count} · {g.activity}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: graph */}
        <div style={{ flex: '2 1 480px', minWidth: 480 }}>
          <div style={card}>
            <div style={cardTitle}>
              {title || t('Select an offender or gang to visualize their network', 'ಜಾಲವನ್ನು ನೋಡಲು ಅಪರಾಧಿ ಅಥವಾ ಗ್ಯಾಂಗ್ ಆಯ್ಕೆಮಾಡಿ')}
            </div>
            {graph ? (
              <>
                {/* Stats strip — makes the link counts unambiguous */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                  <StatPill label={t('Direct links', 'ನೇರ ಸಂಪರ್ಕ')} value={directLinks} color="#5c6bc0" />
                  <StatPill label={t('2nd-degree', 'ಎರಡನೇ ಹಂತ')} value={secondDegree} color="#90a4ae" />
                  <StatPill label={t('Total network', 'ಒಟ್ಟು ಜಾಲ')} value={totalNetwork} color="#1a237e" />
                </div>
                <NetworkGraph nodes={graph.nodes} edges={graph.edges} language={language} onNodeClick={(n) => n.person_id && loadPersonNetwork(n.person_id, n.label)} />
                <div style={{ display: 'flex', gap: 18, marginTop: 12, fontSize: 12.5, color: '#555', flexWrap: 'wrap', alignItems: 'center' }}>
                  <LegendDot color="#d32f2f" label={t('Focus person', 'ಕೇಂದ್ರ ವ್ಯಕ್ತಿ')} />
                  <LegendDot color="#fb8c00" label={t('Gang leader', 'ಗ್ಯಾಂಗ್ ನಾಯಕ')} />
                  <LegendDot color="#3949ab" label={t('Connected offender', 'ಸಂಪರ್ಕಿತ ಅಪರಾಧಿ')} />
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#3949ab', border: '3px solid #7f0000', display: 'inline-block' }} />
                    {t('High risk', 'ಹೆಚ್ಚಿನ ಅಪಾಯ')}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 22, height: 3, background: '#5c6bc0', display: 'inline-block' }} />
                    {t('direct link', 'ನೇರ ಸಂಪರ್ಕ')}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 22, height: 3, background: '#cbd0de', display: 'inline-block' }} />
                    {t('2nd-degree (thicker = more shared cases)', 'ಎರಡನೇ ಹಂತ (ದಪ್ಪ = ಹೆಚ್ಚು ಪ್ರಕರಣ)')}
                  </span>
                </div>
                <div style={{ marginTop: 6, fontSize: 11.5, color: '#98a0b3' }}>
                  💡 {t('Centre = the focus person; inner ring = direct co-accused; outer ring = second-degree links. Hover a link for the shared FIR, click a node to re-centre.',
                        'ಕೇಂದ್ರ = ಕೇಂದ್ರ ವ್ಯಕ್ತಿ; ಒಳ ಉಂಗುರ = ನೇರ ಸಹ-ಆರೋಪಿ; ಹೊರ ಉಂಗುರ = ಎರಡನೇ ಹಂತದ ಸಂಪರ್ಕ. ನೋಡ್ ಕ್ಲಿಕ್ ಮಾಡಿ ಮರುಕೇಂದ್ರೀಕರಿಸಿ.')}
                </div>
              </>
            ) : (
              <div style={{ padding: '70px 20px', textAlign: 'center', color: '#9aa2b5' }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>🕸️</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#556' }}>
                  {t('Select an offender or gang to map their network', 'ಜಾಲವನ್ನು ನೋಡಲು ಅಪರಾಧಿ ಅಥವಾ ಗ್ಯಾಂಗ್ ಆಯ್ಕೆಮಾಡಿ')}
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  {t('Pick from the lists on the left, or search by name.', 'ಎಡಭಾಗದ ಪಟ್ಟಿಯಿಂದ ಆಯ್ಕೆಮಾಡಿ ಅಥವಾ ಹೆಸರಿನಿಂದ ಹುಡುಕಿ.')}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const LegendDot = ({ color, label }: { color: string; label: string }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
    <span style={{ width: 12, height: 12, borderRadius: '50%', background: color, display: 'inline-block' }} />
    {label}
  </span>
);

const StatPill = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div style={{
    display: 'flex', alignItems: 'baseline', gap: 8, background: '#fff',
    border: `1px solid #e6e9f0`, borderLeft: `4px solid ${color}`,
    borderRadius: 8, padding: '8px 14px',
  }}>
    <span style={{ fontSize: 22, fontWeight: 800, color }}>{value}</span>
    <span style={{ fontSize: 12.5, color: '#555', fontWeight: 600 }}>{label}</span>
  </div>
);

const card: React.CSSProperties = { backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: 10, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const cardTitle: React.CSSProperties = { fontSize: 15, fontWeight: 600, color: '#1a237e', marginBottom: 12 };
const rowItem: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 14, borderBottom: '1px solid #f0f0f0' };
const rowActive: React.CSSProperties = { background: '#e8eaf6', borderLeft: '3px solid #3949ab', fontWeight: 600 };
const btn: React.CSSProperties = { backgroundColor: '#1976d2', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 24px', cursor: 'pointer', fontSize: 14, fontWeight: 600 };

export default NetworkView;
