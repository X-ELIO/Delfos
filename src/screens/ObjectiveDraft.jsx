import * as XLSX from 'xlsx'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useProfile } from '../context/ProfileContext'
import { suggestObjectivesStream, scoreObjectives, improveObjective } from '../lib/delfos'
import Shell from '../components/Shell'
import { ARCHETYPE_THRESHOLDS } from '../lib/constants'

// ── People KPI guard ──────────────────────────────────────────────────────
const PEOPLE_KPI_SIGNALS = [
  'engagement score', 'voluntary turnover', 'regrettable attrition', 'attrition rate',
  'internal mobility', 'gender balance', 'objectives completion', 'kpi completion',
  'turnover rate', 'female pipeline', 'gender diversity',
]

function detectPeopleKpiViolation(objectives) {
  return objectives.filter(o => {
    if (o.source === 'delfos') return false  // AI-generated ones are already compliant
    const text = `${o.title} ${o.description}`.toLowerCase()
    return PEOPLE_KPI_SIGNALS.some(sig => text.includes(sig))
  })
}

// ── Threshold helpers ──────────────────────────────────────────────────────
function getThreshold(archetype_code) {
  return ARCHETYPE_THRESHOLDS[archetype_code] ?? { min: 60, green: 75 }
}

function scoreColor(score, thresh) {
  if (score == null) return 'var(--tx2)'
  if (score >= thresh.green) return 'var(--ok)'
  if (score >= thresh.min)   return 'var(--warn)'
  return 'var(--err)'
}

function getScoreLabel(score, thresh) {
  if (score >= thresh.green) return 'HIGH IMPACT'
  if (score >= thresh.min)   return 'MEDIUM'
  return 'LOW'
}

// ── Type-specific placeholders ─────────────────────────────────────────────
const PLACEHOLDERS = {
  performance: {
    title:       'e.g. Reduce voluntary turnover from 14% to <10% by Q4 2026',
    description: "What metric moves? By when? What's the baseline? Include 3 key results.",
  },
  learning: {
    title:       'e.g. Complete AWS Solutions Architect certification by Q2 2026',
    description: 'What skill are you acquiring? How will you apply it? What is the evidence of completion?',
  },
  team: {
    title:       'e.g. Improve team engagement score from 72 to ≥80 by Q3 2026',
    description: "What team metric improves? What actions drive it? How is it measured at team level?",
  },
}

const LOAD_MESSAGES = {
  asking: [
    [0,  'This may take a moment…'],
    [20, 'This is taking a bit longer than usual (20s) — likely rate-limited. Delfos is retrying automatically.'],
    [45, "Still working (45s). The system is busy — Delfos is automatically retrying. Please don't refresh."],
    [75, 'Still working (75s). Hang tight, almost there.'],
  ],
  scoring: [
    [0,  'This may take a moment…'],
    [20, 'Scoring your portfolio… this can take up to 60s.'],
    [45, "Still working (45s). The system is busy — Delfos is automatically retrying. Please don't refresh."],
    [75, 'Still working (75s). Almost done.'],
  ],
}

// ── Loading screen ─────────────────────────────────────────────────────────
function LoadingScreen({ action, elapsed, onSettings, onEmployeeView, onManagerView, onCoverageView, activeTab, onLogout }) {
  const msgs  = LOAD_MESSAGES[action] ?? []
  const msg   = [...msgs].reverse().find(([t]) => elapsed >= t)?.[1] ?? ''
  const title = action === 'asking' ? 'Asking Delfos for suggestions…' : 'Scoring your portfolio…'
  return (
    <Shell step={1} onSettings={onSettings} onEmployeeView={onEmployeeView} onManagerView={onManagerView} onCoverageView={onCoverageView} activeTab={activeTab} onLogout={onLogout}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', height: '100%', gap: 20, textAlign: 'center' }}>
        <div style={{ position: 'relative', width: 56, height: 56 }}>
          <svg width="56" height="56" style={{ position: 'absolute', inset: 0, animation: 'spin 1.2s linear infinite' }}>
            <circle cx="28" cy="28" r="23" fill="none" stroke="var(--border-mid)" strokeWidth="3" />
            <circle cx="28" cy="28" r="23" fill="none" stroke="var(--ac)" strokeWidth="3"
              strokeDasharray="38 106" strokeLinecap="round" />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: 'linear-gradient(135deg, var(--ac), var(--ac2))',
              display: 'grid', placeItems: 'center',
              color: '#fff', fontFamily: 'var(--font-display)', fontStyle: 'italic',
              fontWeight: 700, fontSize: 18,
            }}>D</div>
          </div>
        </div>
        <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--tx)' }}>{title}</p>
        {msg && <p style={{ fontSize: 13, color: 'var(--tx2)', maxWidth: 420 }}>{msg}</p>}
      </div>
    </Shell>
  )
}

// ── Score gauge (SVG donut) ────────────────────────────────────────────────
function ScoreGauge({ score, size = 120, thresh }) {
  const sw   = Math.max(5, size * 0.09)
  const r    = (size - sw * 2) / 2
  const circ = 2 * Math.PI * r
  const off  = circ * (1 - Math.min(score ?? 0, 100) / 100)
  const col  = thresh
    ? scoreColor(score, thresh)
    : (score >= 80 ? 'var(--ok)' : score >= 65 ? 'var(--warn)' : 'var(--err)')
  const cx   = size / 2

  const [animated, setAnimated] = useState(false)
  useEffect(() => {
    setAnimated(false)
    const id = requestAnimationFrame(() => setAnimated(true))
    return () => cancelAnimationFrame(id)
  }, [score])

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--card-2)" strokeWidth={sw} />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={col} strokeWidth={sw}
          strokeDasharray={circ} strokeDashoffset={animated ? off : circ} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.4, 0, 0.2, 1)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: size * 0.27, fontWeight: 800, color: col, lineHeight: 1 }}>{score}</span>
      </div>
    </div>
  )
}

// ── Sub-score bar — 5 dimensions ───────────────────────────────────────────
const SUB_SCORE_DIMS = [
  { key: 'relevance',     label: 'Relevance',       weight: 35 },
  { key: 'impact',        label: 'Business Impact',  weight: 25 },
  { key: 'ambition',      label: 'Ambition',         weight: 20 },
  { key: 'measurability', label: 'Measurability',    weight: 15 },
  { key: 'time_bound',    label: 'Time-bound',       weight: 5  },
]

function SubScoreBar({ label, weight, value }) {
  const col = value >= 80 ? 'var(--ok)' : value >= 65 ? 'var(--warn)' : 'var(--err)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--tx2)', width: 170, flexShrink: 0 }}>{label} ({weight}%)</span>
      <div style={{ flex: 1, height: 5, background: 'var(--card-2)', borderRadius: 3 }}>
        <div style={{ width: `${Math.min(value ?? 0, 100)}%`, height: '100%', background: col, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: col, width: 22, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

// ── BAMBU export ───────────────────────────────────────────────────────────
function downloadBambu(objectives, profile) {
  const headers = [
    'Business Goal / Priority', 'By When', 'Actions',
    'How does it add value to the overall business', 'Metric', 'Status', 'Weight (%)',
  ]
  const rows = objectives
    .filter(o => o.status !== 'ignored')
    .map(o => [
      o.title ?? '',
      o.by_when ?? '',
      (o.key_results ?? []).join('\n'),
      o.value_statement || (o.linked_cascades?.join('; ') ?? ''),
      o.metric ?? '',
      'Pending Approval',
      o.weight ?? '',
    ])

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws['!cols'] = [
    { wch: 50 }, { wch: 12 }, { wch: 60 }, { wch: 50 }, { wch: 40 }, { wch: 18 }, { wch: 10 },
  ]
  const range = XLSX.utils.decode_range(ws['!ref'])
  for (let R = 1; R <= range.e.r; R++) {
    const cell = ws[XLSX.utils.encode_cell({ r: R, c: 2 })]
    if (cell) cell.s = { alignment: { wrapText: true } }
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Objectives')
  XLSX.writeFile(wb, `delfos_bambu_${(profile?.full_name ?? 'export').replace(/\s+/g, '_')}_2026.xlsx`)
}

// ── Cascade accordion ──────────────────────────────────────────────────────
function CascadeAccordion({ cascade, country_label }) {
  const [open, setOpen] = useState(false)
  const corporate = cascade.filter(c => c.scope === 'corporate')
  const country   = cascade.filter(c => c.scope === 'country')

  return (
    <div style={ca.wrap}>
      <button style={ca.header} onClick={() => setOpen(o => !o)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={ca.dot} />
          <div>
            <span style={ca.title}>Your cascade</span>
            <span style={ca.sub}>
              {corporate.length > 0 && `Corporate: ${corporate.length}`}
              {country.length > 0 && `  ·  ${country_label}: ${country.length}`}
            </span>
          </div>
        </div>
        <span style={{ color: 'var(--tx2)', fontSize: 12 }}>{open ? '▼' : '▶'}</span>
      </button>

      {open && (
        <div style={ca.body}>
          {corporate.length > 0 && (
            <>
              <p style={ca.groupLabel}>CORPORATE</p>
              {corporate.map(item => (
                <div key={item.id} style={ca.item}>
                  <span style={{ color: item.locked ? 'var(--tx2)' : 'var(--ac)', fontSize: 10 }}>
                    {item.locked ? '🔒' : '✏'}
                  </span>
                  <span style={ca.itemText}>{item.text}</span>
                  {item.weight_percent && <span style={ca.weight}>{item.weight_percent}%</span>}
                </div>
              ))}
            </>
          )}
          {country.length > 0 && (
            <>
              <p style={{ ...ca.groupLabel, marginTop: 12 }}>{country_label?.toUpperCase()}</p>
              {country.map(item => (
                <div key={item.id} style={ca.item}>
                  <span style={{ color: item.locked ? 'var(--tx2)' : 'var(--ac)', fontSize: 10 }}>
                    {item.locked ? '🔒' : '✏'}
                  </span>
                  <span style={ca.itemText}>{item.text}</span>
                  {item.weight_percent && <span style={ca.weight}>{item.weight_percent}%</span>}
                </div>
              ))}
            </>
          )}
          {cascade.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--tx2)', padding: '8px 0' }}>No cascade data available.</p>
          )}
        </div>
      )}
    </div>
  )
}

const ca = {
  wrap:       { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' },
  header:     { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer' },
  dot:        { width: 8, height: 8, borderRadius: '50%', background: 'var(--ac)' },
  title:      { fontSize: 13, fontWeight: 600, color: 'var(--tx)', marginRight: 10 },
  sub:        { fontSize: 12, color: 'var(--tx2)' },
  body:       { borderTop: '1px solid var(--border)', padding: '12px 16px',
                display: 'flex', flexDirection: 'column', gap: 8 },
  groupLabel: { fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--tx2)' },
  item:       { display: 'flex', gap: 8, alignItems: 'flex-start' },
  itemText:   { fontSize: 12, color: 'var(--tx2)', flex: 1, lineHeight: 1.4 },
  weight:     { fontSize: 11, color: 'var(--ac)', fontWeight: 600, flexShrink: 0 },
}

// ── Report screen (Step 3) ─────────────────────────────────────────────────
function ReportScreen({ objectives, portfolioSummary, onBack, onSubmit, onAcceptImproved, onRescored, onIgnore, cascade, onSettings, onEmployeeView, onManagerView, onCoverageView, activeTab, onLogout }) {
  const { profile } = useProfile()
  const thresh = getThreshold(profile?.archetype_code)

  const [improving, setImproving] = useState({})
  const [proposals, setProposals] = useState({})
  const [editing,   setEditing]   = useState({})
  const [saving,    setSaving]    = useState(false)

  async function handleImprove(obj) {
    setImproving(p => ({ ...p, [obj.id]: 'improving' }))
    try {
      const otherTitles = objectives
        .filter(o => o.id !== obj.id && o.status !== 'ignored' && o.title?.trim())
        .map(o => o.title)
      const improved = await improveObjective({ profile, objective: obj, cascade, otherTitles })
      setProposals(p => ({ ...p, [obj.id]: improved }))
    } catch (err) {
      console.error('improve error:', err)
    } finally {
      setImproving(p => ({ ...p, [obj.id]: null }))
    }
  }

  async function acceptProposal(obj) {
    const improved   = proposals[obj.id]
    const updatedObj = { ...obj, ...improved, source: 'delfos', was_improved: true }
    onAcceptImproved(obj.id, { ...improved, was_improved: true })
    setProposals(p => { const n = { ...p }; delete n[obj.id]; return n })

    setImproving(p => ({ ...p, [obj.id]: 'scoring' }))
    try {
      const result   = await scoreObjectives({ profile, objectives: [updatedObj], cascade })
      const rescored = result?.objectives ?? result
      if (rescored?.[0]) onRescored(obj.id, rescored[0])
    } catch (err) {
      console.error('rescore error:', err)
    } finally {
      setImproving(p => ({ ...p, [obj.id]: null }))
    }
  }

  function startEdit(obj) {
    setEditing(p => ({ ...p, [obj.id]: { title: obj.title, description: obj.description ?? '' } }))
  }

  function cancelEdit(id) {
    setEditing(p => { const n = { ...p }; delete n[id]; return n })
  }

  async function saveEdit(obj) {
    const ed         = editing[obj.id]
    const updatedObj = { ...obj, title: ed.title, description: ed.description }
    onAcceptImproved(obj.id, { title: ed.title, description: ed.description, source: 'user' })
    cancelEdit(obj.id)

    setImproving(p => ({ ...p, [obj.id]: 'scoring' }))
    try {
      const result   = await scoreObjectives({ profile, objectives: [updatedObj], cascade })
      const rescored = result?.objectives ?? result
      if (rescored?.[0]) onRescored(obj.id, rescored[0])
    } catch (err) {
      console.error('rescore error:', err)
    } finally {
      setImproving(p => ({ ...p, [obj.id]: null }))
    }
  }

  const active      = objectives.filter(o => o.status !== 'ignored')
  const avg         = active.length ? Math.round(active.reduce((s, o) => s + (o.score ?? 0), 0) / active.length) : 0
  const color       = scoreColor(avg, thresh)
  const statusLabel = avg >= thresh.green ? 'GREEN' : avg >= thresh.min ? 'AMBER' : 'RED'

  async function handleSubmitClick() {
    setSaving(true)
    try { await onSubmit() } finally { setSaving(false) }
  }

  return (
    <Shell step={2} onBack={onBack} onSettings={onSettings} onEmployeeView={onEmployeeView} onManagerView={onManagerView} onCoverageView={onCoverageView} activeTab={activeTab} onLogout={onLogout}>
      <div style={{ maxWidth: 700, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── AI banner ── */}
        <div style={rs.aiBanner}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--purple)', letterSpacing: '0.06em' }}>⚡ AI-GOVERNED</span>
          <span style={{ color: 'var(--border)' }}>·</span>
          <span style={{ fontSize: 11, color: 'var(--tx2)' }}>Manager-Approved</span>
          <span style={{ fontSize: 11, color: 'var(--tx2)', marginLeft: 'auto' }}>Model: claude-haiku-4-5-20251001</span>
        </div>

        {/* ── Header ── */}
        <h1 style={{ fontSize: 26, fontWeight: 400, color: 'var(--tx)', marginBottom: 4 }}>Your Objectives</h1>

        {/* ── Portfolio score row ── */}
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <ScoreGauge score={avg} size={100} thresh={thresh} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--tx2)',
                           textAlign: 'center', lineHeight: 1.4 }}>BONUS<br/>POTENTIAL</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, paddingTop: 4 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8,
                          border: `1px solid ${color}`, borderRadius: 8, padding: '5px 14px', alignSelf: 'flex-start' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--tx2)' }}>PORTFOLIO</span>
              <span style={{ fontSize: 15, fontWeight: 800, color }}>{avg}%</span>
              <span style={{ fontSize: 11, fontWeight: 700, background: color, color: '#000',
                             borderRadius: 4, padding: '2px 7px' }}>{statusLabel}</span>
            </div>
            {portfolioSummary && (
              <p style={{ fontSize: 13, color: 'var(--tx)', lineHeight: 1.7 }}>
                {portfolioSummary}
              </p>
            )}
          </div>
        </div>

        {/* ── Objective cards ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {objectives.map((obj, i) => {
            const sc      = obj.score ?? 0
            const scCol   = scoreColor(sc, thresh)
            const ss      = obj.sub_scores ?? {}
            const belowMin = sc > 0 && sc < thresh.min
            const ed      = editing[obj.id]

            return (
              <div key={obj.id} style={{
                ...rs.card,
                opacity:     obj.status === 'ignored' ? 0.4 : 1,
                borderColor: belowMin && obj.status !== 'ignored' ? 'rgba(239,68,68,0.5)' : 'var(--border)',
              }}>
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
                    <span style={rs.objBadge}>OBJ {i + 1}</span>
                    {obj.source === 'delfos'      && <span style={rs.delfosBadge}>DELFOS</span>}
                    {obj.type   === 'performance' && <span style={rs.perfBadge}>PERFORMANCE</span>}
                    {obj.type   === 'team'        && <span style={rs.teamBadge}>TEAM</span>}
                    {obj.type   === 'learning'    && <span style={rs.learnBadge}>LEARNING</span>}
                    {belowMin && obj.status !== 'ignored' && <span style={rs.threshBadge}>BELOW THRESHOLD</span>}
                    {obj.weight > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                                     border: `1px solid ${scCol}`, color: scCol, padding: '3px 8px', borderRadius: 4 }}>
                        WEIGHT {obj.weight}%
                      </span>
                    )}
                  </div>
                  {sc > 0 && <ScoreGauge score={sc} size={52} thresh={thresh} />}
                </div>

                {ed ? (
                  /* ── Edit mode ── */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                    <input style={rs.editInput} value={ed.title}
                      onChange={e => setEditing(p => ({ ...p, [obj.id]: { ...p[obj.id], title: e.target.value } }))}
                      placeholder="Objective title" />
                    <textarea style={{ ...rs.editInput, minHeight: 72, resize: 'vertical' }} value={ed.description}
                      onChange={e => setEditing(p => ({ ...p, [obj.id]: { ...p[obj.id], description: e.target.value } }))}
                      placeholder="Description, KRs, timeline…" />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button style={rs.btnAccept} disabled={!!improving[obj.id]} onClick={() => saveEdit(obj)}>
                        {improving[obj.id] === 'scoring' ? '⏳ Re-scoring…' : '✓ Save & re-score'}
                      </button>
                      <button style={rs.btnIgnore} onClick={() => cancelEdit(obj.id)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--tx)', margin: '10px 0 4px' }}>{obj.title}</p>

                    {obj.feedback && (
                      <p style={{ fontSize: 12, fontStyle: 'italic', color: scCol, marginBottom: 8, lineHeight: 1.4 }}>
                        {obj.feedback}
                      </p>
                    )}

                    {/* Sub-score bars */}
                    {Object.keys(ss).length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, margin: '8px 0 10px' }}>
                        {SUB_SCORE_DIMS.map(dim => ss[dim.key] != null
                          ? <SubScoreBar key={dim.key} label={dim.label} weight={dim.weight} value={ss[dim.key]} />
                          : null)}
                      </div>
                    )}

                    {/* Key Results */}
                    {obj.key_results?.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx2)', marginBottom: 4, letterSpacing: '0.08em' }}>KEY RESULTS</p>
                        {obj.key_results.map((kr, j) => (
                          <p key={j} style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 2 }}>• {kr}</p>
                        ))}
                      </div>
                    )}

                    {/* Cascade links */}
                    {obj.linked_cascades?.length > 0 && (
                      <p style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 8, lineHeight: 1.4 }}>
                        <span style={{ color: 'var(--ac)', marginRight: 4 }}>🔗</span>
                        {obj.linked_cascades.join('; ')}
                      </p>
                    )}

                    {/* Coaching tips */}
                    {obj.coaching_tips?.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx2)', marginBottom: 4, letterSpacing: '0.08em' }}>TO INCREASE SCORE</p>
                        {obj.coaching_tips.map((tip, j) => (
                          <p key={j} style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 3 }}>→ {tip}</p>
                        ))}
                      </div>
                    )}

                    {/* Action row */}
                    {obj.status !== 'ignored' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8,
                                    paddingTop: 10, borderTop: '1px solid var(--border)', marginTop: 4 }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button style={rs.btnAi} disabled={!!improving[obj.id]} onClick={() => handleImprove(obj)}>
                            {improving[obj.id] === 'improving' ? '⏳ Asking Delfos…'
                              : improving[obj.id] === 'scoring' ? '⏳ Re-scoring…'
                              : '✦ Ask Delfos to improve'}
                          </button>
                          <button style={rs.btnEdit} onClick={() => startEdit(obj)}>✎ Edit</button>
                          <button style={rs.btnIgnore} onClick={() => onIgnore(obj.id)}>Ignore</button>
                        </div>

                        {/* Proposal panel */}
                        {proposals[obj.id] && (
                          <div style={rs.proposal}>
                            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--purple)', marginBottom: 6, letterSpacing: '0.08em' }}>DELFOS SUGGESTS</p>
                            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx)', marginBottom: 4 }}>{proposals[obj.id].title}</p>
                            <p style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 6 }}>{proposals[obj.id].description}</p>
                            {proposals[obj.id].key_results?.map((kr, j) => (
                              <p key={j} style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 2 }}>• {kr}</p>
                            ))}
                            <button style={rs.btnAccept} onClick={() => acceptProposal(obj)}>✓ Accept this improvement</button>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Submit panel ── */}
        {profile?.manager_full_name && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
                        padding: '14px 18px', display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', gap: 16 }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)', marginBottom: 2 }}>Ready to submit for approval?</p>
              <p style={{ fontSize: 12, color: 'var(--tx2)' }}>
                Your {active.length} objective{active.length !== 1 ? 's' : ''} will be sent to{' '}
                <strong style={{ color: 'var(--tx)' }}>{profile.manager_full_name}</strong> for review.
                {' '}Portfolio avg: <strong style={{ color }}>{avg}%</strong>
              </p>
            </div>
            <span style={{ fontSize: 22, fontWeight: 800, color, flexShrink: 0 }}>{avg}%</span>
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <button style={rs.back} onClick={onBack}>← Back to edit</button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={rs.downloadBtn} onClick={() => downloadBambu(objectives, profile)}>
              ⬇ Export to Excel (BAMBU)
            </button>
            <button style={{ ...rs.submit, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={handleSubmitClick}>
              {saving ? '⏳ Saving…' : 'Submit for approval →'}
            </button>
          </div>
        </div>

      </div>
    </Shell>
  )
}

const rs = {
  aiBanner:    { display: 'flex', alignItems: 'center', gap: 8,
                 background: 'var(--ai-soft)', border: '1px solid var(--ai-border)',
                 borderRadius: 8, padding: '7px 14px' },
  card:        { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' },
  objBadge:    { background: 'var(--card-2)', color: 'var(--tx2)', fontSize: 10, fontWeight: 700,
                 letterSpacing: '0.08em', padding: '3px 8px', borderRadius: 4 },
  delfosBadge: { background: 'var(--ac)', color: '#fff', fontSize: 10, fontWeight: 700,
                 letterSpacing: '0.06em', padding: '3px 8px', borderRadius: 4 },
  perfBadge:   { background: 'rgba(16,185,129,0.12)', color: 'var(--ok)', fontSize: 10, fontWeight: 700,
                 letterSpacing: '0.06em', padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(16,185,129,0.3)' },
  teamBadge:   { background: 'var(--purple)', color: '#fff', fontSize: 10, fontWeight: 700,
                 letterSpacing: '0.06em', padding: '3px 8px', borderRadius: 4 },
  learnBadge:  { background: 'var(--blue)', color: '#fff', fontSize: 10, fontWeight: 700,
                 letterSpacing: '0.06em', padding: '3px 8px', borderRadius: 4 },
  threshBadge: { background: 'rgba(239,68,68,0.12)', color: 'var(--err)', fontSize: 10, fontWeight: 700,
                 letterSpacing: '0.06em', padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(239,68,68,0.4)' },
  editInput:   { background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 8,
                 color: 'var(--tx)', fontSize: 14, padding: '9px 12px', outline: 'none',
                 lineHeight: 1.5, width: '100%' },
  btnAi:       { background: 'var(--ai-soft)', border: '1px solid var(--ai-border)',
                 color: 'var(--purple)', fontSize: 12, padding: '5px 12px', borderRadius: 6, cursor: 'pointer' },
  btnEdit:     { background: 'none', border: '1px solid var(--border)', color: 'var(--tx2)',
                 fontSize: 12, padding: '5px 12px', borderRadius: 6, cursor: 'pointer' },
  btnIgnore:   { background: 'none', border: 'none', color: 'var(--err)', fontSize: 12,
                 padding: '5px 12px', borderRadius: 6, cursor: 'pointer' },
  back:        { background: 'none', border: 'none', color: 'var(--tx2)', fontSize: 14, cursor: 'pointer' },
  submit:      { background: 'var(--ac)', color: '#fff', border: 'none', borderRadius: 8,
                 fontSize: 14, fontWeight: 600, padding: '10px 24px', cursor: 'pointer' },
  proposal:    { background: 'var(--ai-soft)', border: '1px solid var(--ai-border)',
                 borderRadius: 8, padding: '12px 14px' },
  btnAccept:   { marginTop: 10, background: 'var(--ok)', color: '#fff', border: 'none',
                 borderRadius: 6, fontSize: 12, fontWeight: 600, padding: '6px 14px', cursor: 'pointer' },
  downloadBtn: { background: 'none', border: '1px solid var(--border)', color: 'var(--tx2)',
                 borderRadius: 8, fontSize: 13, fontWeight: 500, padding: '9px 16px', cursor: 'pointer' },
}

// ── Main component ─────────────────────────────────────────────────────────
export default function ObjectiveDraft({ onNavigate, onSettings, onEmployeeView, onManagerView, onCoverageView, activeTab, onLogout }) {
  const { profile } = useProfile()

  const [cascade,          setCascade]          = useState([])
  const [delfosType,       setDelfosType]       = useState('performance')
  const [objectives,       setObjectives]       = useState(() => {
    try {
      const saved = sessionStorage.getItem('delfos_objectives_draft')
      if (saved) return JSON.parse(saved)
    } catch (_) {}
    return [{ id: 1, type: 'performance', title: '', description: '', source: 'user', status: 'active' }]
  })
  const [phase,            setPhase]            = useState('draft')
  const [loadCtx,          setLoadCtx]          = useState({ action: 'asking', elapsed: 0 })
  const [error,            setError]            = useState(null)
  const [portfolioSummary, setPortfolioSummary] = useState('')
  const [draftImproving,   setDraftImproving]   = useState({})
  const [draftProposals,   setDraftProposals]   = useState({})
  const [draftRegenPicker, setDraftRegenPicker] = useState({})
  const [delfosStreaming,  setDelfosStreaming]   = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    const s = document.createElement('style')
    s.textContent = '@keyframes objIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}'
    document.head.appendChild(s)
    return () => { try { document.head.removeChild(s) } catch(_){} }
  }, [])

  useEffect(() => {
    try { sessionStorage.setItem('delfos_objectives_draft', JSON.stringify(objectives)) } catch (_) {}
  }, [objectives])

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('cascade_objectives')
        .select('id, text, category, scope, country, locked, weight_percent')
        .order('scope', { ascending: false })
      const relevant = (data ?? []).filter(
        c => c.scope === 'corporate' || c.country === profile.country_code
      )
      setCascade(relevant)
    }
    load()
  }, [])

  function startTimer(action) {
    let elapsed = 0
    setLoadCtx({ action, elapsed })
    timerRef.current = setInterval(() => {
      elapsed += 1
      setLoadCtx({ action, elapsed })
    }, 1000)
  }

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  // ── handleAskDelfos: streams objectives one by one, then auto-scores ──
  async function handleAskDelfos() {
    setDelfosStreaming(true)
    setError(null)
    const existing = objectives.filter(o => o.title.trim())
    setObjectives(existing)
    const streamed = []
    try {
      await suggestObjectivesStream(
        { profile, cascade, priorities: profile.current_priorities, typePreference: delfosType },
        (obj) => {
          streamed.push(obj)
          setObjectives(prev => [...prev, obj])
        }
      )
      const allObjs = [...existing, ...streamed]
      setObjectives(allObjs)
      setDelfosStreaming(false)
      await handleScoreWith(allObjs)
    } catch (err) {
      console.error('suggest-objectives error:', err)
      setError(`Error: ${err?.message ?? JSON.stringify(err)}`)
      setDelfosStreaming(false)
    }
  }

  // ── handleDraftImprove: improve a card, then score the proposal ──
  async function handleDraftImprove(obj) {
    setDraftImproving(p => ({ ...p, [obj.id]: 'improving' }))
    try {
      const otherTitles = objectives.filter(o => o.id !== obj.id && o.title?.trim()).map(o => o.title)
      const improved = await improveObjective({ profile, objective: obj, cascade, otherTitles })
      setDraftImproving(p => ({ ...p, [obj.id]: 'scoring' }))
      const sr = await scoreObjectives({ profile, objectives: [{ ...obj, ...improved }], cascade })
      const sc = (sr?.objectives ?? sr)?.[0]
      setDraftProposals(p => ({ ...p, [obj.id]: { ...improved, score: sc?.score ?? null } }))
    } catch (err) {
      console.error('draft improve error:', err)
    } finally {
      setDraftImproving(p => ({ ...p, [obj.id]: null }))
    }
  }

  // ── handleDraftRegenerate: generate fresh objective of selected type, then score ──
  async function handleDraftRegenerate(obj, type) {
    setDraftRegenPicker(p => ({ ...p, [obj.id]: false }))
    setDraftImproving(p => ({ ...p, [obj.id]: 'regenerating' }))
    try {
      const otherTitles = objectives.filter(o => o.id !== obj.id && o.title?.trim()).map(o => o.title)
      const skeleton = { type, title: '', description: '', key_results: [],
        feedback: `Generate a completely new ${type} objective from scratch. Do not reference any previous objective.` }
      const generated = await improveObjective({ profile, objective: skeleton, cascade, otherTitles })
      setDraftImproving(p => ({ ...p, [obj.id]: 'scoring' }))
      const sr = await scoreObjectives({ profile, objectives: [{ ...generated, type }], cascade })
      const sc = (sr?.objectives ?? sr)?.[0]
      setDraftProposals(p => ({ ...p, [obj.id]: { ...generated, type, score: sc?.score ?? null } }))
    } catch (err) {
      console.error('draft regen error:', err)
    } finally {
      setDraftImproving(p => ({ ...p, [obj.id]: null }))
    }
  }

  // ── acceptDraftProposal: apply proposal including type and score ──
  function acceptDraftProposal(objId) {
    const proposal = draftProposals[objId]
    if (!proposal) return
    setObjectives(p => p.map(o => o.id === objId
      ? { ...o, title: proposal.title, description: proposal.description,
          key_results: proposal.key_results ?? [], type: proposal.type ?? o.type,
          source: 'delfos', score: proposal.score ?? null }
      : o
    ))
    setDraftProposals(p => { const n = { ...p }; delete n[objId]; return n })
  }

  // ── handleScoreWith: score given objectives → 'report' ──
  async function handleScoreWith(toScore) {
    const filled = toScore.filter(o => o.title?.trim())
    if (!filled.length) return
    setPhase('loading'); startTimer('scoring')
    try {
      const result  = await scoreObjectives({ profile, objectives: filled, cascade })
      stopTimer()
      let scored    = result?.objectives ?? result
      const summary = result?.summary ?? ''

      const weightSum = scored.reduce((s, o) => s + (o.weight ?? 0), 0)
      if (weightSum > 0 && weightSum !== 100) {
        const scale = 100 / weightSum
        let remaining = 100
        scored = scored.map((o, i) => {
          if (i === scored.length - 1) return { ...o, weight: remaining }
          const w = Math.round((o.weight ?? 0) * scale)
          remaining -= w
          return { ...o, weight: w }
        })
      }

      setObjectives(scored)
      setPortfolioSummary(summary)
      setPhase('report')
    } catch (err) {
      stopTimer()
      console.error('score-objectives error:', err)
      setError('Error al puntuar. Inténtalo de nuevo.')
      setPhase('draft')
    }
  }

  async function handleScore() { await handleScoreWith(objectives) }

  function addObjective() {
    setObjectives(p => [...p, { id: Date.now(), type: 'performance', title: '', description: '', source: 'user', status: 'active' }])
  }

  function update(id, field, value) {
    setObjectives(p => p.map(o => o.id === id ? { ...o, [field]: value } : o))
  }

  function remove(id) {
    setObjectives(p => p.filter(o => o.id !== id))
  }

  // ── handleSubmit: save to supabase, clear sessionStorage ──
  async function handleSubmit() {
    const active   = objectives.filter(o => o.status !== 'ignored')
    const ignored  = objectives.filter(o => o.status === 'ignored')
    const aiObjs   = objectives.filter(o => o.source === 'delfos')
    const manual   = objectives.filter(o => o.source !== 'delfos')
    const improved = objectives.filter(o => o.was_improved)
    const avg      = active.length
      ? Math.round(active.reduce((s, o) => s + (o.score ?? 0), 0) / active.length)
      : 0

    try {
      const { data: sub, error: subErr } = await supabase
        .from('objective_submissions')
        .insert({
          employee_name:       profile.full_name,
          job_title:           profile.job_title ?? null,
          department:          profile.department ?? null,
          country_code:        profile.country_code ?? null,
          country_label:       profile.country_label ?? null,
          archetype_code:      profile.archetype_code ?? null,
          archetype_label:     profile.archetype_label ?? null,
          manager_name:        profile.manager_full_name ?? null,
          portfolio_score:     avg,
          portfolio_summary:   portfolioSummary || null,
          objectives_total:    objectives.length,
          objectives_ai:       aiObjs.length,
          objectives_manual:   manual.length,
          objectives_improved: improved.length,
          objectives_ignored:  ignored.length,
        })
        .select('id')
        .single()

      if (subErr) throw subErr

      const objRows = active.map((obj, i) => ({
        submission_id:   sub.id,
        seq:             i + 1,
        title:           obj.title,
        description:     obj.description ?? null,
        type:            obj.type ?? 'performance',
        key_results:     obj.key_results ?? [],
        by_when:         obj.by_when ?? null,
        metric:          obj.metric ?? null,
        value_statement: obj.value_statement ?? null,
        source:          obj.source ?? 'user',
        score:           obj.score ?? null,
        weight:          obj.weight ?? null,
        feedback:        obj.feedback ?? null,
        coaching_tips:   obj.coaching_tips ?? [],
        linked_cascades: obj.linked_cascades ?? [],
        sub_scores:      obj.sub_scores ?? null,
      }))

      const { error: objErr } = await supabase
        .from('submitted_objectives')
        .insert(objRows)

      if (objErr) throw objErr

      try { sessionStorage.removeItem('delfos_objectives_draft') } catch (_) {}
      onNavigate('submitted', { objectives })
    } catch (err) {
      console.error('submit error:', err)
      setError(`Error al guardar: ${err?.message ?? String(err)}`)
    }
  }

  // ── Phase: loading ──
  if (phase === 'loading') return (
    <LoadingScreen action={loadCtx.action} elapsed={loadCtx.elapsed}
      onSettings={onSettings} onEmployeeView={onEmployeeView} onManagerView={onManagerView}
      onCoverageView={onCoverageView} activeTab={activeTab} onLogout={onLogout} />
  )

  // ── Phase: report (Step 3) ──
  if (phase === 'report') return (
    <ReportScreen
      objectives={objectives}
      portfolioSummary={portfolioSummary}
      cascade={cascade}
      onBack={() => setPhase('draft')}
      onSubmit={handleSubmit}
      onAcceptImproved={(id, improved) => setObjectives(p => p.map(o => o.id === id ? { ...o, ...improved } : o))}
      onRescored={(id, rescored) => setObjectives(p => p.map(o => o.id === id ? { ...o, ...rescored } : o))}
      onIgnore={(id) => setObjectives(p => p.map(o => o.id === id ? { ...o, status: 'ignored' } : o))}
      onSettings={onSettings}
      onEmployeeView={onEmployeeView}
      onManagerView={onManagerView}
      onCoverageView={onCoverageView}
      activeTab={activeTab}
      onLogout={onLogout}
    />
  )

  // ── Phase: draft (Step 2) ──
  const needsTeam     = ['A', 'B'].includes(profile?.archetype_code)
  const hasTeamObj    = objectives.some(o => o.type === 'team' && o.title.trim())
  const hasFilled     = objectives.some(o => o.title.trim())
  const kpiViolations = detectPeopleKpiViolation(objectives.filter(o => o.title.trim()))
  const canScore      = hasFilled && (!needsTeam || hasTeamObj) && kpiViolations.length === 0

  return (
    <Shell step={1} onBack={() => onNavigate('profile')} onSettings={onSettings} onEmployeeView={onEmployeeView} onManagerView={onManagerView} onCoverageView={onCoverageView} activeTab={activeTab} onLogout={onLogout}>
      <div style={ds.page}>

        {/* Bonus info banner */}
        <div style={ds.banner}>
          <span style={{ color: 'var(--warn)', fontSize: 14 }}>⚡</span>
          <div>
            <span style={{ fontWeight: 600, color: 'var(--warn)' }}>Bonus Potential: how it works</span>
            <span style={{ color: 'var(--tx2)', fontSize: 13 }}>
              {' '}A <strong style={{ color: 'var(--tx)' }}>100% Bonus Potential</strong> means your objectives are framed well enough
              to unlock your full bonus if you deliver them. Final bonus depends on year-end delivery, not setup. Delfos suggests tweaks as you go.
            </span>
          </div>
        </div>

        {/* Step badge + Edit profile */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={ds.stepBadge}>STEP 02</p>
          <button style={ds.editProfileBtn} onClick={() => onNavigate('profile')}>✎ Edit profile</button>
        </div>

        <h1 style={ds.heading}>Set Your Objectives</h1>

        {/* Cascade accordion */}
        <CascadeAccordion cascade={cascade} country_label={profile.country_label} />

        {/* Team objective required banner (A/B archetypes) */}
        {needsTeam && !hasTeamObj && hasFilled && (
          <div style={ds.teamGateBanner}>
            <strong>Team objective required</strong> — Archetype{' '}
            {profile.archetype_code} must include at least 1 Team objective before scoring.
          </div>
        )}

        {/* People KPI violation banner */}
        {kpiViolations.length > 0 && (
          <div style={ds.kpiViolationBanner}>
            <p style={{ fontWeight: 700, marginBottom: 4 }}>
              ⚠ People KPI conflict — remove before scoring
            </p>
            <p style={{ fontSize: 12, marginBottom: 6 }}>
              The following objective{kpiViolations.length > 1 ? 's' : ''} duplicate{kpiViolations.length === 1 ? 's' : ''} a mandatory HR KPI tracked separately.
              These cannot be included in individual objectives portfolios:
            </p>
            {kpiViolations.map(o => (
              <p key={o.id} style={{ fontSize: 12, fontWeight: 600 }}>· {o.title || '(untitled)'}</p>
            ))}
            <p style={{ fontSize: 11, marginTop: 6, color: 'rgba(239,68,68,0.7)' }}>
              Mandatory KPIs excluded: Engagement Score, Voluntary Turnover, Regrettable Attrition, Objectives Completion, Internal Mobility, Gender Balance.
            </p>
          </div>
        )}

        {/* Streaming indicator */}
        {delfosStreaming && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10,
                        background: 'var(--ai-soft)', border: '1px solid var(--ai-border)',
                        borderRadius: 8, padding: '10px 14px' }}>
            <svg width="16" height="16" style={{ animation: 'spin 1.2s linear infinite', flexShrink: 0 }}>
              <circle cx="8" cy="8" r="6" fill="none" stroke="var(--purple)" strokeWidth="2"
                strokeDasharray="10 28" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 13, color: 'var(--purple)', fontWeight: 500 }}>
              ✦ Delfos is generating your objectives…
            </span>
          </div>
        )}

        {/* Objective cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {objectives.map((obj, i) => {
            const ph = PLACEHOLDERS[obj.type] ?? PLACEHOLDERS.performance
            return (
              <div key={obj.id} style={{ ...ds.objCard, animation: obj.source === 'delfos' ? 'objIn 0.4s ease' : undefined }}>
                {/* Score at top center */}
                {obj.score != null && (
                  <div style={{ textAlign: 'center', paddingBottom: 10,
                                borderBottom: '1px solid var(--border)', marginBottom: 2 }}>
                    <span style={{ fontSize: 28, fontWeight: 800, lineHeight: 1,
                                   color: scoreColor(obj.score, getThreshold(profile?.archetype_code)) }}>
                      {obj.score}%
                    </span>
                    <span style={{ display: 'block', fontSize: 9, fontWeight: 700,
                                   letterSpacing: '0.1em', marginTop: 2,
                                   color: scoreColor(obj.score, getThreshold(profile?.archetype_code)) }}>
                      QUALITY
                    </span>
                  </div>
                )}
                {/* Card header */}
                <div style={ds.objCardHead}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={ds.objNumBadge}>OBJ {i + 1}</span>
                    {obj.source === 'delfos' && <span style={rs.delfosBadge}>DELFOS</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {obj.type === 'learning' && <span style={rs.learnBadge}>LEARNING</span>}
                    {obj.type === 'team'     && <span style={rs.teamBadge}>TEAM</span>}
                    {obj.type === 'performance' && <span style={rs.perfBadge}>PERFORMANCE</span>}
                    {objectives.length > 1 && (
                      <button onClick={() => remove(obj.id)} style={ds.removeBtn}>✕</button>
                    )}
                  </div>
                </div>

                {/* Type info banners */}
                {obj.type === 'learning' && (
                  <div style={ds.learnBanner}>
                    Learning objective — focus on skill acquisition and measurable competency growth.
                  </div>
                )}
                {obj.type === 'team' && (
                  <div style={ds.teamBanner}>
                    Team objective — tracks people management outcomes. Required for Archetype A/B.
                  </div>
                )}

                {/* Fields */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={ds.fieldLabel}>Title — be specific and measurable</label>
                    <input style={ds.input}
                      value={obj.title}
                      onChange={e => update(obj.id, 'title', e.target.value)}
                      placeholder={ph.title} />
                  </div>
                  <div>
                    <label style={ds.fieldLabel}>Description</label>
                    <textarea style={{ ...ds.input, minHeight: 60, resize: 'vertical' }}
                      value={obj.description}
                      onChange={e => update(obj.id, 'description', e.target.value)}
                      placeholder={ph.description} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={ds.fieldLabel}>By when</label>
                      <input style={ds.input}
                        value={obj.by_when ?? ''}
                        onChange={e => update(obj.id, 'by_when', e.target.value)}
                        placeholder="e.g. Q3 2026" />
                    </div>
                    <div>
                      <label style={ds.fieldLabel}>Primary metric &amp; target</label>
                      <input style={ds.input}
                        value={obj.metric ?? ''}
                        onChange={e => update(obj.id, 'metric', e.target.value)}
                        placeholder="e.g. Turnover from 14% to <10%" />
                    </div>
                  </div>
                  <div>
                    <label style={ds.fieldLabel}>Key Results (one per line)</label>
                    <textarea style={{ ...ds.input, minHeight: 60, resize: 'vertical' }}
                      value={(obj.key_results ?? []).join('\n')}
                      onChange={e => update(obj.id, 'key_results', e.target.value.split('\n').filter(Boolean))}
                      placeholder={'KR1: ...\nKR2: ...\nKR3: ...'} />
                  </div>
                </div>

                {/* Per-card Delfos row */}
                <div style={{ paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      style={{ ...ds.aiBtn, fontSize: 12, padding: '5px 12px' }}
                      disabled={!!draftImproving[obj.id]}
                      onClick={() => setDraftRegenPicker(p => ({ ...p, [obj.id]: !p[obj.id] }))}>
                      {draftImproving[obj.id] === 'regenerating' ? '⏳ Generando…'
                        : draftImproving[obj.id] === 'scoring'   ? '⏳ Puntuando…'
                        : '↻ Regenerar'}
                    </button>
                    <button
                      style={{ ...ds.aiBtn, fontSize: 12, padding: '5px 12px' }}
                      disabled={!!draftImproving[obj.id] || !obj.title?.trim()}
                      onClick={() => handleDraftImprove(obj)}>
                      {draftImproving[obj.id] === 'improving' ? '⏳ Mejorando…'
                        : draftImproving[obj.id] === 'scoring' ? '⏳ Puntuando…'
                        : '✦ Mejorar'}
                    </button>
                  </div>

                  {draftRegenPicker[obj.id] && !draftImproving[obj.id] && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: 'var(--tx2)' }}>Tipo:</span>
                      {['performance', 'learning', ...(needsTeam ? ['team'] : [])].map(t => (
                        <button key={t}
                          style={{ ...ds.typeBtn,
                            background: t === 'team' ? 'var(--purple)' : t === 'learning' ? 'var(--blue)' : 'var(--ac)',
                            color: '#fff' }}
                          onClick={() => handleDraftRegenerate(obj, t)}>
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                      ))}
                    </div>
                  )}

                  {draftProposals[obj.id] && (
                    <div style={{ background: 'var(--ai-soft)', border: '1px solid var(--ai-border)', borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--purple)', letterSpacing: '0.08em' }}>DELFOS SUGGESTS</p>
                        {draftProposals[obj.id].score != null && (
                          <span style={{ fontSize: 18, fontWeight: 800,
                                         color: scoreColor(draftProposals[obj.id].score, getThreshold(profile?.archetype_code)) }}>
                            {draftProposals[obj.id].score}%
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx)', marginBottom: 4 }}>{draftProposals[obj.id].title}</p>
                      <p style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 6 }}>{draftProposals[obj.id].description}</p>
                      {draftProposals[obj.id].key_results?.map((kr, j) => (
                        <p key={j} style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 2 }}>• {kr}</p>
                      ))}
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button
                          style={{ background: 'var(--ok)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, padding: '6px 14px', cursor: 'pointer' }}
                          onClick={() => acceptDraftProposal(obj.id)}>
                          ✓ Aceptar
                        </button>
                        <button
                          style={{ background: 'none', border: 'none', color: 'var(--err)', fontSize: 12, cursor: 'pointer', padding: '6px 0' }}
                          onClick={() => setDraftProposals(p => { const n = { ...p }; delete n[obj.id]; return n })}>
                          Rechazar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <button style={ds.addBtn} onClick={addObjective}>+ Add Objective</button>

        {error && (
          <p style={{ color: 'var(--err)', fontSize: 13, textAlign: 'center', cursor: 'pointer' }}
             onClick={() => setError(null)}>{error} (click to dismiss)</p>
        )}

        {/* Footer */}
        <div style={ds.footer}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {['performance', 'learning', 'team'].map(t => {
              const disabled = t === 'team' && !needsTeam
              return (
                <button key={t}
                  disabled={disabled}
                  onClick={() => !disabled && setDelfosType(t)}
                  style={{
                    ...ds.typeBtn,
                    opacity: disabled ? 0.3 : 1,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    background: delfosType === t
                      ? (t === 'team' ? 'var(--purple)' : t === 'learning' ? 'var(--blue)' : 'var(--ac)')
                      : 'var(--card-2)',
                    color: delfosType === t ? '#fff' : 'var(--tx2)',
                  }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              )
            })}
            <button style={{ ...ds.aiBtn, opacity: delfosStreaming ? 0.5 : 1 }}
              disabled={delfosStreaming}
              onClick={handleAskDelfos}>
              {delfosStreaming ? '⏳ Generando…' : '✦ Añadir sugerencias de Delfos'}
            </button>
          </div>
          <button style={{ ...ds.scoreBtn, opacity: (canScore && !delfosStreaming) ? 1 : 0.4 }}
            disabled={!canScore || delfosStreaming} onClick={handleScore}
            title={
              kpiViolations.length > 0 ? 'Remove People KPI duplicates first'
              : needsTeam && !hasTeamObj ? 'Add a Team objective first'
              : undefined
            }>
            Score &amp; Review →
          </button>
        </div>

      </div>
    </Shell>
  )
}

const ds = {
  page:              { maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 },
  banner:            { display: 'flex', gap: 10, background: 'rgba(240,165,0,0.08)',
                       border: '1px solid rgba(240,165,0,0.2)', borderRadius: 10, padding: '12px 16px',
                       alignItems: 'flex-start', fontSize: 13 },
  teamGateBanner:    { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                       borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--err)' },
  kpiViolationBanner:{ background: 'rgba(239,68,68,0.08)', border: '2px solid rgba(239,68,68,0.4)',
                       borderRadius: 8, padding: '12px 14px', fontSize: 13, color: 'var(--err)' },
  stepBadge:         { fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--tx2)',
                       textTransform: 'uppercase', margin: '8px 0 4px' },
  heading:           { fontSize: 26, fontWeight: 400, color: 'var(--tx)', marginBottom: 4 },
  objCard:           { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
                       padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 },
  objCardHead:       { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  objNumBadge:       { background: 'var(--card-2)', color: 'var(--tx2)', fontSize: 10, fontWeight: 700,
                       letterSpacing: '0.08em', padding: '3px 8px', borderRadius: 4 },
  typeBtn:           { fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 5,
                       border: 'none', cursor: 'pointer' },
  removeBtn:         { background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer',
                       fontSize: 12, padding: '4px 6px' },
  learnBanner:       { background: 'var(--blue-soft)', border: '1px solid var(--blue-border)',
                       borderRadius: 6, padding: '7px 11px', fontSize: 12, color: 'var(--blue)' },
  teamBanner:        { background: 'var(--ac-soft)', border: '1px solid var(--border-mid)',
                       borderRadius: 6, padding: '7px 11px', fontSize: 12, color: 'var(--purple)' },
  fieldLabel:        { display: 'block', fontSize: 11, color: 'var(--tx2)', marginBottom: 5 },
  input:             { width: '100%', background: 'var(--card-2)', border: '1px solid var(--border)',
                       borderRadius: 8, color: 'var(--tx)', fontSize: 14, padding: '9px 12px',
                       outline: 'none', lineHeight: 1.5 },
  addBtn:            { background: 'none', border: '1px dashed var(--border)', color: 'var(--tx2)',
                       borderRadius: 8, padding: '10px 0', cursor: 'pointer', fontSize: 13,
                       fontWeight: 500, width: '100%' },
  footer:            { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                       paddingTop: 8, borderTop: '1px solid var(--border)', marginTop: 8 },
  backBtn:           { background: 'none', border: 'none', color: 'var(--tx2)', fontSize: 14, cursor: 'pointer' },
  aiBtn:             { background: 'var(--ai-soft)', border: '1px solid var(--ai-border)',
                       color: 'var(--purple)', fontSize: 13, fontWeight: 500, padding: '9px 16px',
                       borderRadius: 8, cursor: 'pointer' },
  scoreBtn:          { background: 'var(--ac)', color: '#fff', border: 'none', borderRadius: 8,
                       fontSize: 14, fontWeight: 600, padding: '9px 20px', cursor: 'pointer' },
  editProfileBtn:    { background: 'none', border: 'none', color: 'var(--tx2)', fontSize: 11,
                       cursor: 'pointer', padding: '2px 0', textDecoration: 'underline', textDecorationStyle: 'dotted' },
}
