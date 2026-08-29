import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import { localizeCrimeType } from '../locale';
import {
  GOV, panel, panelHead, panelBody, noteText, table, th, td, tdNum,
  figure, figureLabel, figureValue, figureSub, chip,
  pageTitle, pageSubTitle, legalNote,
} from '../govStyles';

/**
 * Sociological analysis of accused persons, normalised against the population.
 *
 * The previous version of this view reported the raw distribution of accused
 * across demographic bands and labelled the largest band a "social risk factor".
 * That is the base-rate fallacy: a band that is large in the population will be
 * large among accused, and saying so carries no information. On the seeded data it
 * actually pointed the wrong way, presenting the 'Low' socio-economic band as a
 * risk factor when accused were slightly UNDER-represented there once normalised.
 *
 * Every band is now shown as three numbers - share among accused, share in the
 * population, and the index between them - and only departures that clear both an
 * effect-size floor and a significance test corrected for the number of
 * comparisons are reported as findings. Dimensions showing nothing are named
 * explicitly, because a null result is a result and it stops a reader inferring a
 * pattern from bar lengths that only reflect population size.
 */

interface DimRow {
  label: string;
  count: number;
  accused_share_pct: number;
  population_count: number;
  population_share_pct: number;
  representation_index: number | null;
  p_value: number | null;
  reliable: boolean;
  significant?: boolean;
  direction: 'over' | 'under' | 'parity' | null;
}
interface Finding {
  dimension: string; dimension_label: string; label: string;
  representation_index: number | null; direction: 'over' | 'under';
  accused_share_pct: number; population_share_pct: number; statement: string;
}
interface AgeByOffence {
  offence: string; accused: number; median_age: number;
  difference_from_overall: number; share_under_35_pct: number;
}
interface SocioData {
  dimensions: Record<string, DimRow[]>;
  findings: Finding[];
  no_material_difference: string[];
  age_by_offence: AgeByOffence[];
  overall_median_age: number;
  method: {
    counting_unit: string; baseline: string; representation_index: string;
    material_threshold: string; minimum_cell: number; significance: string;
    independence_caveat: string; caution: string;
  };
  totals: {
    accused_involvements: number; distinct_accused_persons: number; population: number;
  };
}

const DIM_ORDER = [
  'age_band', 'gender', 'socio_economic', 'education', 'occupation', 'urbanization',
];
const DIM_TITLES: Record<string, [string, string]> = {
  age_band: ['Age band', 'ವಯಸ್ಸಿನ ಶ್ರೇಣಿ'],
  gender: ['Gender', 'ಲಿಂಗ'],
  socio_economic: ['Socio-economic status', 'ಸಾಮಾಜಿಕ-ಆರ್ಥಿಕ ಸ್ಥಿತಿ'],
  education: ['Education', 'ಶಿಕ್ಷಣ'],
  occupation: ['Occupation (top 8)', 'ವೃತ್ತಿ'],
  urbanization: ['Urbanisation', 'ನಗರೀಕರಣ'],
};

/**
 * Diverging bar centred on parity.
 *
 * A plain bar would encode size, which is exactly the thing that misleads here.
 * Centring on 1.0 makes direction the primary visual: bars extend left when a
 * band appears less often among accused than its population share predicts, and
 * right when it appears more.
 */
const IndexBar = ({ index, direction }: { index: number | null; direction: DimRow['direction'] }) => {
  if (index === null) return <span style={{ color: GOV.faint }}>&mdash;</span>;
  const W = 132, mid = W / 2;
  // Clamp the drawn extent at 2.0x so one extreme band cannot flatten the rest.
  const CAP = 2;
  const clamped = Math.min(index, CAP);
  const frac = Math.min(Math.abs(clamped - 1), 1);
  const w = frac * (mid - 2);
  const over = index > 1;
  const colour = direction === 'over' ? GOV.breach
    : direction === 'under' ? GOV.navy
    : GOV.rule;
  return (
    <svg width={W} height={14} style={{ display: 'block' }} aria-hidden="true">
      <rect x={0} y={5} width={W} height={4} fill="#eef0f3" />
      {/* Parity line */}
      <line x1={mid} y1={1} x2={mid} y2={13} stroke={GOV.ruleStrong} strokeWidth={1} />
      <rect
        x={over ? mid : mid - w}
        y={4} width={Math.max(w, 1.5)} height={6}
        fill={colour}
      />
    </svg>
  );
};

const directionChip = (d: DimRow['direction'], language: 'en' | 'kn') => {
  const t = (en: string, kn: string) => (language === 'en' ? en : kn);
  if (d === 'over') return <span style={chip(GOV.breach, GOV.breachBg)}>{t('Over', 'ಹೆಚ್ಚು')}</span>;
  if (d === 'under') return <span style={chip(GOV.navy, '#e8eaf3')}>{t('Under', 'ಕಡಿಮೆ')}</span>;
  if (d === 'parity') return <span style={{ color: GOV.faint, fontSize: 11 }}>{t('No difference', 'ವ್ಯತ್ಯಾಸವಿಲ್ಲ')}</span>;
  return <span style={{ color: GOV.faint, fontSize: 11 }}>{t('Too few', 'ಕಡಿಮೆ ಸಂಖ್ಯೆ')}</span>;
};

const InsightsView = ({ language }: { language: 'en' | 'kn' }) => {
  const t = (en: string, kn: string) => (language === 'en' ? en : kn);
  const [data, setData] = useState<SocioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch('/api/sociological');
      setData(await res.json());
    } catch (e: any) {
      setError(e.message === 'UNAUTHORIZED'
        ? t('Session expired. Please sign in again.', 'ಅವಧಿ ಮುಗಿದಿದೆ. ಮತ್ತೆ ಸೈನ್ ಇನ್ ಮಾಡಿ.')
        : t('Unable to load the analysis.', 'ವಿಶ್ಲೇಷಣೆ ಲೋಡ್ ಆಗಲಿಲ್ಲ.'));
    } finally { setLoading(false); }
  };
  // Fetch once on mount; `load` closes over `language` only for the error text.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  if (loading) return (
    <div style={{ padding: 60, textAlign: 'center', color: GOV.muted, fontSize: 13 }}>
      {t('Compiling analysis...', 'ವಿಶ್ಲೇಷಣೆ ಸಂಗ್ರಹಿಸಲಾಗುತ್ತಿದೆ...')}
    </div>
  );
  if (error) return (
    <div style={{ padding: 40, textAlign: 'center', color: GOV.breach, fontSize: 13 }}>{error}</div>
  );
  if (!data || !data.dimensions) return null;

  const m = data.method;
  const totals = data.totals;

  return (
    <div style={{ padding: '22px 30px 40px', background: GOV.panelAlt, minHeight: '100%', color: GOV.ink }}>

      {/* Report header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        flexWrap: 'wrap', gap: 12, borderBottom: `2px solid ${GOV.navy}`,
        paddingBottom: 10, marginBottom: 16,
      }}>
        <div>
          <h2 style={pageTitle}>
            {t('Offender Profile Against Population Baseline', 'ಜನಸಂಖ್ಯಾ ಆಧಾರಕ್ಕೆ ಹೋಲಿಸಿ ಆರೋಪಿ ವಿವರ')}
          </h2>
          <div style={pageSubTitle}>
            {t('Which groups appear among accused more or less often than their share of the recorded population predicts',
               'ಯಾವ ಗುಂಪುಗಳು ತಮ್ಮ ಜನಸಂಖ್ಯಾ ಪಾಲಿಗಿಂತ ಹೆಚ್ಚು ಅಥವಾ ಕಡಿಮೆ ಕಾಣಿಸುತ್ತವೆ')}
          </div>
        </div>
        <div style={{ textAlign: 'right', ...noteText }}>
          <div><strong>{t('Baseline', 'ಆಧಾರ')}:</strong> {totals.population.toLocaleString('en-IN')} {t('persons on record', 'ವ್ಯಕ್ತಿಗಳು')}</div>
          <div>{t('Compared against', 'ಹೋಲಿಕೆ')} {totals.accused_involvements.toLocaleString('en-IN')} {t('accused involvements', 'ಆರೋಪಿ ಪ್ರಕರಣಗಳು')}</div>
        </div>
      </div>

      {/* Key figures */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={figure(data.findings.length ? GOV.breach : GOV.ok)}>
          <div style={figureLabel}>{t('Differences found', 'ಕಂಡುಬಂದ ವ್ಯತ್ಯಾಸ')}</div>
          <div style={{ ...figureValue, color: data.findings.length ? GOV.breach : GOV.ok }}>
            {data.findings.length}
          </div>
          <div style={figureSub}>{t('after correction for multiple tests', 'ಬಹು ಪರೀಕ್ಷೆ ತಿದ್ದುಪಡಿ ನಂತರ')}</div>
        </div>
        <div style={figure(GOV.navy)}>
          <div style={figureLabel}>{t('Dimensions showing nothing', 'ವ್ಯತ್ಯಾಸವಿಲ್ಲದ ಆಯಾಮ')}</div>
          <div style={figureValue}>{data.no_material_difference.length}</div>
          <div style={figureSub}>{t('of 6 examined', '6 ರಲ್ಲಿ')}</div>
        </div>
        <div style={figure(GOV.navy)}>
          <div style={figureLabel}>{t('Distinct accused persons', 'ಪ್ರತ್ಯೇಕ ಆರೋಪಿಗಳು')}</div>
          <div style={figureValue}>{totals.distinct_accused_persons.toLocaleString('en-IN')}</div>
          <div style={figureSub}>
            {totals.accused_involvements.toLocaleString('en-IN')} {t('involvements', 'ಪ್ರಕರಣ ಸಂಬಂಧ')}
          </div>
        </div>
        <div style={figure(GOV.navy)}>
          <div style={figureLabel}>{t('Median age of accused', 'ಆರೋಪಿಗಳ ಮಧ್ಯವರ್ತಿ ವಯಸ್ಸು')}</div>
          <div style={figureValue}>{data.overall_median_age}</div>
        </div>
      </div>

      {/* Method. Prominent by design: this analysis is only credible if the
          reader can see how a "finding" was decided. */}
      <div style={legalNote}>
        <div><strong>{t('How this is measured', 'ಇದನ್ನು ಹೇಗೆ ಅಳೆಯಲಾಗಿದೆ')}</strong></div>
        <div style={{ marginTop: 4 }}>
          {t('Representation index', 'ಪ್ರಾತಿನಿಧ್ಯ ಸೂಚ್ಯಂಕ')} = {m.representation_index}.{' '}
          {t('Baseline', 'ಆಧಾರ')}: {m.baseline}. {t('Counting unit', 'ಎಣಿಕೆ ಘಟಕ')}: {m.counting_unit}.
        </div>
        <div style={{ marginTop: 4 }}>
          {t('A band is reported as a difference only if it clears both the effect-size floor', 'ವ್ಯತ್ಯಾಸ ಎಂದು ವರದಿ ಮಾಡಲು')}
          {' '}({m.material_threshold}) {t('and', 'ಮತ್ತು')} {m.significance}.
        </div>
        <div style={{ marginTop: 4, color: GOV.muted }}>
          <em>{t('Limitation', 'ಮಿತಿ')}:</em> {m.independence_caveat}.{' '}
          {t('Cells below', 'ಇದಕ್ಕಿಂತ ಕಡಿಮೆ')} {m.minimum_cell} {t('are not assessed.', 'ಮೌಲ್ಯಮಾಪನ ಮಾಡಿಲ್ಲ.')}
        </div>
      </div>

      {/* 1. Findings */}
      <div style={panel}>
        <div style={panelHead}>
          1. {t('Groups differing from the population baseline', 'ಆಧಾರದಿಂದ ಭಿನ್ನವಾದ ಗುಂಪುಗಳು')}
        </div>
        <div style={panelBody}>
          {data.findings.length === 0 ? (
            <div style={noteText}>
              {t('No group departs materially from its population share once corrected for the number of comparisons. On this data, demographic composition alone does not distinguish accused persons from the general record.',
                 'ಯಾವುದೇ ಗುಂಪು ತನ್ನ ಜನಸಂಖ್ಯಾ ಪಾಲಿನಿಂದ ಗಣನೀಯವಾಗಿ ಭಿನ್ನವಾಗಿಲ್ಲ.')}
            </div>
          ) : (
            <div style={{ overflowX: 'auto', border: `1px solid ${GOV.rule}` }}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>{t('Dimension', 'ಆಯಾಮ')}</th>
                    <th style={th}>{t('Group', 'ಗುಂಪು')}</th>
                    <th style={th}>{t('Share of accused', 'ಆರೋಪಿಗಳ ಪಾಲು')}</th>
                    <th style={th}>{t('Share of population', 'ಜನಸಂಖ್ಯಾ ಪಾಲು')}</th>
                    <th style={th}>{t('Index', 'ಸೂಚ್ಯಂಕ')}</th>
                    <th style={th}>{t('Direction', 'ದಿಕ್ಕು')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.findings.map((f, i) => (
                    <tr key={`${f.dimension}-${f.label}`} style={{ background: i % 2 ? GOV.panelAlt : '#fff' }}>
                      <td style={{ ...td, color: GOV.muted }}>{f.dimension_label}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{f.label}</td>
                      <td style={tdNum}>{f.accused_share_pct}%</td>
                      <td style={tdNum}>{f.population_share_pct}%</td>
                      <td style={{
                        ...tdNum, fontWeight: 700,
                        color: f.direction === 'over' ? GOV.breach : GOV.navy,
                      }}>
                        {f.representation_index}&times;
                      </td>
                      <td style={td}>
                        {f.direction === 'over'
                          ? <span style={chip(GOV.breach, GOV.breachBg)}>{t('Over-represented', 'ಹೆಚ್ಚು ಪ್ರಾತಿನಿಧ್ಯ')}</span>
                          : <span style={chip(GOV.navy, '#e8eaf3')}>{t('Under-represented', 'ಕಡಿಮೆ ಪ್ರಾತಿನಿಧ್ಯ')}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* The null result, stated rather than left as an absence. */}
          {data.no_material_difference.length > 0 && (
            <div style={{
              marginTop: 14, border: `1px solid ${GOV.rule}`, background: GOV.okBg,
              borderLeft: `3px solid ${GOV.ok}`, padding: '10px 12px',
            }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: GOV.ok }}>
                {t('Examined and found to show no material difference', 'ಪರಿಶೀಲಿಸಿ ವ್ಯತ್ಯಾಸ ಕಂಡುಬಂದಿಲ್ಲ')}
              </div>
              <div style={{ fontSize: 12.5, marginTop: 4 }}>
                {data.no_material_difference.join(' \u00B7 ')}
              </div>
              <div style={{ ...noteText, marginTop: 5 }}>
                {t('These dimensions were tested and no group departed from its population share. Bar length in the tables below reflects group size, not any association with offending.',
                   'ಈ ಆಯಾಮಗಳನ್ನು ಪರೀಕ್ಷಿಸಲಾಗಿದೆ ಮತ್ತು ಯಾವುದೇ ಗುಂಪು ಭಿನ್ನವಾಗಿಲ್ಲ.')}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. Age by offence type */}
      {data.age_by_offence.length > 0 && (
        <div style={panel}>
          <div style={panelHead}>
            2. {t('Age of accused by offence type', 'ಅಪರಾಧ ಪ್ರಕಾರದ ಪ್ರಕಾರ ಆರೋಪಿಗಳ ವಯಸ್ಸು')}
          </div>
          <div style={panelBody}>
            <div style={{ ...noteText, marginBottom: 10 }}>
              {t('Where the profile differs by offence rather than in aggregate. Offences with fewer than', 'ಒಟ್ಟಾರೆಗಿಂತ ಅಪರಾಧದ ಪ್ರಕಾರ ವಿವರ ಭಿನ್ನವಾಗಿರುವ ಸ್ಥಳ.')}
              {' '}{m.minimum_cell}{' '}
              {t('accused are omitted.', 'ಆರೋಪಿಗಳಿರುವ ಅಪರಾಧಗಳನ್ನು ಬಿಡಲಾಗಿದೆ.')}
            </div>
            <div style={{ overflowX: 'auto', border: `1px solid ${GOV.rule}` }}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>{t('Offence', 'ಅಪರಾಧ')}</th>
                    <th style={th}>{t('Accused', 'ಆರೋಪಿ')}</th>
                    <th style={th}>{t('Median age', 'ಮಧ್ಯವರ್ತಿ ವಯಸ್ಸು')}</th>
                    <th style={th}>{t('vs overall', 'ಒಟ್ಟಾರೆಗೆ ಹೋಲಿಸಿ')}</th>
                    <th style={th}>{t('Under 35', '35 ಕ್ಕಿಂತ ಕಡಿಮೆ')}</th>
                    <th style={{ ...th, width: '28%' }} />
                  </tr>
                </thead>
                <tbody>
                  {data.age_by_offence.map((a, i) => (
                    <tr key={a.offence} style={{ background: i % 2 ? GOV.panelAlt : '#fff' }}>
                      <td style={{ ...td, fontWeight: 600 }}>{localizeCrimeType(a.offence, language)}</td>
                      <td style={tdNum}>{a.accused}</td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>{a.median_age}</td>
                      <td style={{
                        ...tdNum,
                        color: a.difference_from_overall < 0 ? GOV.breach
                          : a.difference_from_overall > 0 ? GOV.navy : GOV.muted,
                      }}>
                        {a.difference_from_overall > 0 ? '+' : ''}{a.difference_from_overall}
                      </td>
                      <td style={tdNum}>{a.share_under_35_pct}%</td>
                      <td style={td}>
                        <div style={{ height: 9, background: '#e8eaee' }}>
                          <div style={{
                            width: `${a.share_under_35_pct}%`, height: '100%',
                            background: a.share_under_35_pct >= 60 ? GOV.breach : GOV.navy,
                          }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ ...noteText, marginTop: 9 }}>
              {t('Overall median age of accused', 'ಆರೋಪಿಗಳ ಒಟ್ಟಾರೆ ಮಧ್ಯವರ್ತಿ ವಯಸ್ಸು')}: <strong>{data.overall_median_age}</strong>.{' '}
              {t('The bar shows the share of accused under 35 for that offence.',
                 'ಪಟ್ಟಿ 35 ವರ್ಷದೊಳಗಿನ ಆರೋಪಿಗಳ ಪಾಲನ್ನು ತೋರಿಸುತ್ತದೆ.')}
            </div>
          </div>
        </div>
      )}

      {/* 3. Full dimension detail */}
      <div style={panel}>
        <div style={panelHead}>
          3. {t('Full breakdown by dimension', 'ಆಯಾಮದ ಪ್ರಕಾರ ಪೂರ್ಣ ವಿವರ')}
        </div>
        <div style={panelBody}>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            {DIM_ORDER.filter(d => data.dimensions[d]?.length).map(dim => {
              const [en, kn] = DIM_TITLES[dim];
              const rows = data.dimensions[dim];
              const hasFinding = rows.some(r => r.direction === 'over' || r.direction === 'under');
              return (
                <div key={dim} style={{ flex: '1 1 460px', minWidth: 400 }}>
                  <div style={{
                    fontSize: 11.5, fontWeight: 700, color: GOV.navy, textTransform: 'uppercase',
                    letterSpacing: 0.3, marginBottom: 7, display: 'flex', gap: 8, alignItems: 'center',
                  }}>
                    {t(en, kn)}
                    {!hasFinding && (
                      <span style={chip(GOV.ok, GOV.okBg)}>{t('No difference', 'ವ್ಯತ್ಯಾಸವಿಲ್ಲ')}</span>
                    )}
                  </div>
                  <div style={{ border: `1px solid ${GOV.rule}` }}>
                    <table style={table}>
                      <thead>
                        <tr>
                          <th style={th}>{t('Group', 'ಗುಂಪು')}</th>
                          <th style={th}>{t('Accused', 'ಆರೋಪಿ')}</th>
                          <th style={th}>{t('Acc %', 'ಆರೋಪಿ %')}</th>
                          <th style={th}>{t('Pop %', 'ಜನ %')}</th>
                          <th style={th}>{t('Index', 'ಸೂಚ್ಯಂಕ')}</th>
                          <th style={th}>{t('vs parity', 'ಸಮಾನತೆಗೆ')}</th>
                          <th style={th} />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={r.label} style={{ background: i % 2 ? GOV.panelAlt : '#fff' }}>
                            <td style={td}>{r.label}</td>
                            <td style={tdNum}>{r.count}</td>
                            <td style={tdNum}>{r.accused_share_pct}%</td>
                            <td style={{ ...tdNum, color: GOV.muted }}>{r.population_share_pct}%</td>
                            <td style={{
                              ...tdNum, fontWeight: r.direction === 'parity' ? 400 : 700,
                              color: r.direction === 'over' ? GOV.breach
                                : r.direction === 'under' ? GOV.navy : GOV.ink,
                            }}>
                              {r.representation_index !== null ? `${r.representation_index}\u00D7` : '\u2014'}
                            </td>
                            <td style={td}>
                              <IndexBar index={r.representation_index} direction={r.direction} />
                            </td>
                            <td style={td}>{directionChip(r.direction, language)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ ...noteText, marginTop: 10 }}>
            {t('The bar is centred on parity. It extends right where a group appears among accused more often than its population share predicts, and left where it appears less often.',
               'ಪಟ್ಟಿ ಸಮಾನತೆಯ ಮೇಲೆ ಕೇಂದ್ರೀಕೃತವಾಗಿದೆ.')}
          </div>
        </div>
      </div>

      {/* Ethical caution. Not a footnote - this is a policing tool. */}
      <div style={{
        border: `1px solid ${GOV.rule}`, borderLeft: `3px solid ${GOV.breach}`,
        background: '#fff', padding: '11px 14px', fontSize: 12, lineHeight: 1.6,
      }}>
        <strong style={{ color: GOV.breach }}>{t('Interpretation', 'ವ್ಯಾಖ್ಯಾನ')}: </strong>
        {m.caution}{' '}
        {t('Over-representation reflects who has been recorded as accused, which is shaped by reporting and enforcement patterns as well as by offending. These figures support resource planning and must not be applied to individuals.',
           'ಪ್ರಾತಿನಿಧ್ಯವು ದಾಖಲಾದವರನ್ನು ಪ್ರತಿಬಿಂಬಿಸುತ್ತದೆ. ಈ ಅಂಕಿಅಂಶಗಳನ್ನು ವ್ಯಕ್ತಿಗಳಿಗೆ ಅನ್ವಯಿಸಬಾರದು.')}
      </div>
    </div>
  );
};

export default InsightsView;
