import Shell from '../components/Shell'
import { ARCHETYPE_THRESHOLDS } from '../lib/constants'

const INTEGRITY_TESTS = [
  {
    id: 1,
    name: 'Specificity',
    rule: 'Objective must describe a specific outcome, not a vague activity.',
    pass: 'Reduce voluntary turnover from 14% to <10% by Q4',
    fail: 'Improve employee retention',
  },
  {
    id: 2,
    name: 'Measurability',
    rule: 'Objective must include a baseline value, a target value, and a measurement method.',
    pass: 'Increase NPS from 42 to ≥60 — measured via quarterly survey',
    fail: 'Improve customer satisfaction',
  },
  {
    id: 3,
    name: 'Time-bound',
    rule: 'Objective must specify a deadline — a quarter (Q1–Q4) or a calendar date.',
    pass: 'Complete integration by Q2 2026',
    fail: 'Complete integration as soon as possible',
  },
  {
    id: 4,
    name: 'Role Fit',
    rule: 'Objective must be relevant to this person\'s actual job title, department, and seniority level.',
    pass: 'Finance Analyst: Close monthly accounts within 3 business days (vs 5-day baseline)',
    fail: 'Finance Analyst: Launch a company-wide digital transformation programme',
  },
  {
    id: 5,
    name: 'Cascade Alignment',
    rule: 'At least 3 of 5 objectives should connect naturally to a corporate or country strategic priority.',
    pass: 'Objective explicitly references a cascade item (e.g. Energy Transition targets)',
    fail: 'Objective has no visible link to any strategic priority',
  },
  {
    id: 6,
    name: 'Ambition Check',
    rule: 'The target must be genuinely stretching — not business-as-usual or easily achievable.',
    pass: 'Reduce process cycle time by 30% (current baseline: industry average)',
    fail: 'Maintain current process cycle time at the same level as last year',
  },
  {
    id: 7,
    name: 'People KPI Exclusion',
    rule: 'Individual objectives must NOT duplicate mandatory People Management KPIs, which are tracked separately.',
    pass: 'Any performance or learning objective that does not overlap with Engagement, Attrition, or Mobility KPIs',
    fail: 'Maintain team engagement score ≥80 — already tracked as a mandatory People KPI',
  },
]

const MEASUREMENT_ALLOWLIST = [
  { category: 'Financial',     items: ['Revenue', 'Cost reduction', 'Budget variance', 'P&L contribution', 'EBITDA'] },
  { category: 'Customer',      items: ['Net Promoter Score (NPS)', 'Customer Satisfaction (CSAT)', 'Churn rate', 'Retention rate'] },
  { category: 'Operational',   items: ['On-time delivery rate', 'Cycle time', 'Error rate / Defect rate', 'Process efficiency', 'SLA compliance'] },
  { category: 'People',        items: ['Employee Engagement Score', 'Time-to-hire', 'Training completion rate', 'Internal mobility rate'] },
  { category: 'Growth',        items: ['Market share', 'Pipeline value', 'Conversion rate', 'Adoption rate', 'Active users'] },
  { category: 'Quality',       items: ['Quality score', 'First-pass yield', 'Audit results', 'Compliance rate'] },
  { category: 'Learning',      items: ['Certification completed', 'Skill assessment score', 'Course completion', 'Project delivered using new skill'] },
]

export default function Settings({ onBack }) {
  return (
    <Shell step={0}>
      <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>

        {/* Header */}
        <div>
          <button style={s.backLink} onClick={onBack}>← Back</button>
          <h1 style={s.heading}>Settings &amp; Engine Configuration</h1>
          <p style={s.sub}>Reference configuration for the Delfos scoring engine. Changes require admin access.</p>
        </div>

        {/* Archetype Thresholds */}
        <section>
          <p style={s.sectionTitle}>Archetype Score Thresholds</p>
          <p style={s.sectionSub}>
            Minimum score required to submit, and green threshold for "HIGH IMPACT" classification.
            Varies by archetype to account for the different complexity and ambiguity of each role level.
          </p>
          <div style={s.table}>
            <div style={s.tableHead}>
              <span style={s.col1}>Archetype</span>
              <span style={s.col2}>Role Level</span>
              <span style={s.col3}>Min (Amber)</span>
              <span style={s.col3}>Green</span>
            </div>
            {Object.entries(ARCHETYPE_THRESHOLDS).map(([code, t]) => {
              const labels = { A: 'Strategic Leadership', B: 'Operational Leadership', C: 'Senior IC', D: 'Individual Contributor' }
              return (
                <div key={code} style={s.tableRow}>
                  <span style={{ ...s.col1, fontWeight: 700, color: 'var(--ac)' }}>{code}</span>
                  <span style={{ ...s.col2, color: 'var(--tx2)' }}>{labels[code]}</span>
                  <span style={{ ...s.col3, color: 'var(--warn)', fontWeight: 600 }}>{t.min}%</span>
                  <span style={{ ...s.col3, color: 'var(--ok)', fontWeight: 600 }}>{t.green}%</span>
                </div>
              )
            })}
          </div>
        </section>

        {/* Scoring Rubric */}
        <section>
          <p style={s.sectionTitle}>Scoring Dimensions</p>
          <p style={s.sectionSub}>Weights used by the AI engine to compute each objective's Bonus Potential score.</p>
          <div style={s.table}>
            <div style={s.tableHead}>
              <span style={{ flex: 2 }}>Dimension</span>
              <span style={s.col3}>Weight</span>
              <span style={{ flex: 3, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--tx2)' }}>WHAT IT MEASURES</span>
            </div>
            {[
              { dim: 'Relevance',       w: '35%', desc: 'Role fit + cascade alignment — is this the right objective for this person in this market?' },
              { dim: 'Business Impact', w: '25%', desc: 'Does it move a metric that genuinely matters for X-ELIO?' },
              { dim: 'Ambition',        w: '20%', desc: 'Is the target stretching, not just business-as-usual?' },
              { dim: 'Measurability',   w: '15%', desc: 'Clear baseline, target, and measurement method present?' },
              { dim: 'Time-bound',      w: '5%',  desc: 'Specific dates, quarters, or deadlines included?' },
            ].map(({ dim, w, desc }) => (
              <div key={dim} style={s.tableRow}>
                <span style={{ flex: 2, fontWeight: 600, color: 'var(--tx)', fontSize: 12 }}>{dim}</span>
                <span style={{ ...s.col3, color: 'var(--ac)', fontWeight: 700 }}>{w}</span>
                <span style={{ flex: 3, fontSize: 12, color: 'var(--tx2)', lineHeight: 1.4 }}>{desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 7 Integrity Tests */}
        <section>
          <p style={s.sectionTitle}>7 Integrity Tests</p>
          <p style={s.sectionSub}>
            Quality gates the engine applies when evaluating objectives.
            Objectives that fail multiple tests score below their archetype threshold.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {INTEGRITY_TESTS.map(test => (
              <div key={test.id} style={s.testCard}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
                  <span style={s.testNum}>{test.id}</span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)', marginBottom: 2 }}>{test.name}</p>
                    <p style={{ fontSize: 12, color: 'var(--tx2)', lineHeight: 1.4 }}>{test.rule}</p>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                  <div style={s.passBox}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--ok)', marginBottom: 3 }}>PASS</p>
                    <p style={{ fontSize: 11, color: 'var(--tx2)', lineHeight: 1.4 }}>{test.pass}</p>
                  </div>
                  <div style={s.failBox}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--err)', marginBottom: 3 }}>FAIL</p>
                    <p style={{ fontSize: 11, color: 'var(--tx2)', lineHeight: 1.4 }}>{test.fail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Measurement Allowlist */}
        <section>
          <p style={s.sectionTitle}>Measurement Allowlist</p>
          <p style={s.sectionSub}>
            Approved measurement methods and KPIs. Using a metric from this list improves the Measurability sub-score.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {MEASUREMENT_ALLOWLIST.map(cat => (
              <div key={cat.category}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--tx2)',
                            textTransform: 'uppercase', marginBottom: 6 }}>{cat.category}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {cat.items.map(item => (
                    <span key={item} style={s.allowChip}>{item}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <div style={{ paddingBottom: 40 }}>
          <p style={{ fontSize: 11, color: 'var(--tx2)', fontStyle: 'italic' }}>
            Delfos V03.1.0 · AI Act Annex III (High-Risk) · Art. 12, 13, 14 compliance active
          </p>
        </div>

      </div>
    </Shell>
  )
}

const s = {
  backLink:    { background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer',
                 fontSize: 13, padding: 0, marginBottom: 12 },
  heading:     { fontSize: 26, fontWeight: 700, color: 'var(--tx)', marginBottom: 8 },
  sub:         { fontSize: 13, color: 'var(--tx2)', lineHeight: 1.6 },
  sectionTitle:{ fontSize: 13, fontWeight: 700, color: 'var(--tx)', marginBottom: 6, letterSpacing: '0.02em' },
  sectionSub:  { fontSize: 12, color: 'var(--tx2)', lineHeight: 1.5, marginBottom: 12 },
  table:       { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' },
  tableHead:   { display: 'flex', gap: 12, padding: '8px 16px',
                 background: 'var(--card-2)', borderBottom: '1px solid var(--border)',
                 fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--tx2)' },
  tableRow:    { display: 'flex', gap: 12, padding: '10px 16px',
                 borderBottom: '1px solid var(--border)', alignItems: 'flex-start' },
  col1:        { width: 40, flexShrink: 0, fontSize: 12 },
  col2:        { flex: 2, fontSize: 12 },
  col3:        { width: 70, flexShrink: 0, fontSize: 12 },
  testCard:    { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' },
  testNum:     { background: 'var(--ac)', color: '#fff', width: 22, height: 22, borderRadius: '50%',
                 display: 'flex', alignItems: 'center', justifyContent: 'center',
                 fontSize: 11, fontWeight: 700, flexShrink: 0 },
  passBox:     { background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
                 borderRadius: 6, padding: '8px 10px' },
  failBox:     { background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
                 borderRadius: 6, padding: '8px 10px' },
  allowChip:   { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 5,
                 fontSize: 11, color: 'var(--tx2)', padding: '4px 10px' },
}
