import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import NetworkGraph, { GraphNode, GraphEdge } from './NetworkGraph';

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

  const loadOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/network/overview');
      setOverview(await res.json());
    } catch (e: any) {
      setError(e.message === 'UNAUTHORIZED' ? 'Session expired. Please log in again.' : 'Unable to load network data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadOverview(); }, []);

  const loadPersonNetwork = async (personId: number, name: string) => {
    try {
      const res = await apiFetch(`/api/network/person/${personId}?depth=2`);
      const data = await res.json();
      setGraph({ nodes: data.nodes, edges: data.edges });
      setTitle(t('Network around ', 'ಸುತ್ತಲಿನ ಜಾಲ ') + name);
    } catch { /* ignore */ }
  };

  const loadGangNetwork = async (gangId: number, name: string) => {
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

  return (
    <div style={{ padding: '30px 40px', backgroundColor: '#fafafa', minHeight: '100%' }}>
      <h2 style={{ color: '#1a237e', fontSize: 24, marginBottom: 6 }}>
        🕸️ {t('Criminal Network Analysis', 'ಅಪರಾಧ ಜಾಲ ವಿಶ್ಲೇಷಣೆ')}
      </h2>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 20 }}>
        {t('Associations between offenders, gangs, and cases', 'ಅಪರಾಧಿಗಳು, ಗ್ಯಾಂಗ್‌ಗಳು ಮತ್ತು ಪ್ರಕರಣಗಳ ನಡುವಿನ ಸಂಬಂಧಗಳು')}
        {' · '}{overview.total_relationships} {t('links', 'ಸಂಪರ್ಕಗಳು')}
      </p>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* Left: selectors */}
        <div style={{ flex: '1 1 280px', minWidth: 280 }}>
          <div style={card}>
            <div style={cardTitle}>🔗 {t('Most Connected Offenders', 'ಅತಿ ಹೆಚ್ಚು ಸಂಪರ್ಕಿತ ಅಪರಾಧಿಗಳು')}</div>
            {overview.top_connected_persons.map((p) => (
              <div key={p.person_id} onClick={() => loadPersonNetwork(p.person_id, p.name)} style={rowItem}>
                <span>👤 {p.name}</span>
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
                <NetworkGraph nodes={graph.nodes} edges={graph.edges} onNodeClick={(n) => n.person_id && loadPersonNetwork(n.person_id, n.label)} />
                <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: '#666', flexWrap: 'wrap' }}>
                  <span>🔴 {t('Focus', 'ಕೇಂದ್ರ')}</span>
                  <span>🟠 {t('Gang leader', 'ಗ್ಯಾಂಗ್ ನಾಯಕ')}</span>
                  <span>🔵 {t('Associate', 'ಸಹಚರ')}</span>
                  <span style={{ color: '#90a4ae' }}>— {t('co-accused', 'ಸಹ-ಆರೋಪಿ')}</span>
                  <span style={{ color: '#ff9800' }}>— {t('gang link', 'ಗ್ಯಾಂಗ್ ಸಂಪರ್ಕ')}</span>
                </div>
              </>
            ) : (
              <div style={{ padding: 60, textAlign: 'center', color: '#aaa' }}>
                👈 {t('Pick from the left to render the network graph', 'ಜಾಲ ಗ್ರಾಫ್ ತೋರಿಸಲು ಎಡದಿಂದ ಆಯ್ಕೆಮಾಡಿ')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const card: React.CSSProperties = { backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: 10, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' };
const cardTitle: React.CSSProperties = { fontSize: 15, fontWeight: 600, color: '#1a237e', marginBottom: 12 };
const rowItem: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 14, borderBottom: '1px solid #f0f0f0' };
const btn: React.CSSProperties = { backgroundColor: '#1976d2', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 24px', cursor: 'pointer', fontSize: 14, fontWeight: 600 };

export default NetworkView;
