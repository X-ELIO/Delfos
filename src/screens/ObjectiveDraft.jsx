import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useProfile } from '../context/ProfileContext'
import { suggestObjectives, scoreObjectives, improveObjective } from '../lib/delfos'
// scoreObjectives is also used inside RefineScreen for re-scoring after improvement
import Shell from '../components/Shell'

const LOAD_MESSAGES = {
  asking: [
    [0,  'This may take a moment…'],
    [20, 'This is taking a bit longer than usual (20s) — likely rate-limited. Delfos is retrying automatically.'],
    [45, 'Still working (45s). The system is busy — Delfos is automatically retrying. Please don\'t refresh.'],
    [75, 'Still working (75s). Hang tight, almost there.'],
  ],
  scoring: [
    [0,  'This may take a moment…'],
    [20, 'Scoring your portfolio… this can take up to 60s.'],
    [45, 'Still working (45s). The system is busy with many concurrent requests — Delfos is automatically retrying. Please don\'t refresh.'],
    [75, 'Still working (75s). Almost done.'],
  ],
}

// ── Loading screen ─────────────────────────────────────────────────────────
function LoadingScreen({ action, elapsed }) {
  const msgs = LOAD_MESSAGES[action] ?? []
  const msg  = [...msgs].reverse().find(([t]) => elapsed >= t)?.[1] ?? ''
  const title = action === 'asking' ? 'Asking Delfos for suggestions…' : 'Scoring your portfolio…'
  return (
    <Shell step={1}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', height: '100%', gap: 20, textAlign: 'center' }}>
        <div style={ls.spinner} />
        <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--tx)' }}>{title}</p>
        {msg && <p style={{ fontSize: 13, color: 'var(--tx2)', maxWidth: 420 }}>{msg}</p>}
      </div>
    </Shell>
  )
}

const ls = {
  spinner: {
    width: 48, height: 48, borderRadius: '50%',
    border: '3px solid var(--card-2)',
    borderTopColor: 'var(--ac)',
    animation: 'spin 0.9s linear infinite',
  },
}

// ── Refine screen ──────────────────────────────────────────────────────────
function RefineScreen({ objectives, onBack, onContinue, onIgnore, onAcceptImproved, onRescored, cascade }) {
  const { profile } = useProfile()
  const [improving, setImproving] = useState({}) // id -> 'improving'|'scoring'|null
  const [proposals, setProposals] = useState({}) // id -> improved obj

  async function handleImprove(obj) {
    setImproving(p => ({ ...p, [obj.id]: 'improving' }))
    try {
      const improved = await improveObjective({ profile, objective: obj, cascade })
      setProposals(p => ({ ...p, [obj.id]: improved }))
    } catch (err) {
      console.error('improve error:', err)
    } finally {
      setImproving(p => ({ ...p, [obj.id]: null }))
    }
  }

  async function acceptProposal(obj) {
    const improved = proposals[obj.id]
    // Merge improved content into the objective
    const updatedObj = { ...obj, ...improved, source: 'delfos' }
    onAcceptImproved(obj.id, improved)
    setProposals(p => { const n = { ...p }; delete n[obj.id]; return n })

    // Re-score just this objective
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

  const active  = objectives.filter(o => o.status !== 'ignored')
  const total   = active.reduce((s, o) => s + (o.score ?? 0), 0)
  const avg     = active.length ? Math.round(total / active.length) : 0
  const color   = avg >= 80 ? 'var(--ok)' : avg >= 65 ? 'var(--warn)' : 'var(--err)'

  return (
    <Shell step={1}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--tx)', marginBottom: 6 }}>Refine your portfolio</h1>
            <p style={{ fontSize: 13, color: 'var(--tx2)' }}>
              Accept, edit, or ask Delfos to improve quality. The aggregate updates as you go.
            </p>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--tx2)', marginBottom: 2 }}>PORTFOLIO AGGREGATE</p>
            <p style={{ fontSize: 36, fontWeight: 800, color, lineHeight: 1 }}>{avg}%</p>
            <p style={{ fontSize: 11, color: 'var(--tx2)' }}>{active.length} of {objectives.length} active</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
          {objectives.map((obj, i) => (
            <div key={obj.id} style={{
              ...rs.card,
              opacity: obj.status === 'ignored' ? 0.4 : 1,
            }}>
              <div style={rs.cardHead}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={rs.objBadge}>OBJ {i + 1}</span>
                  {obj.source === 'delfos' && <span style={rs.delfosBadge}>DELFOS</span>}
                </div>
                <span style={{ fontSize: 22, fontWeight: 800, color: obj.score >= 80 ? 'var(--ok)' : 'var(--warn)' }}>
                  {obj.score}%
                </span>
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--tx)', margin: '10px 0 6px' }}>{obj.title}</p>
              <p style={{ fontSize: 13, color: 'var(--tx2)', marginBottom: 8 }}>{obj.description}</p>
              {obj.key_results?.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', marginBottom: 4 }}>Key Results:</p>
                  {obj.key_results.map((kr, j) => (
                    <p key={j} style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 2 }}>{kr}</p>
                  ))}
                </div>
              )}
              {obj.status !== 'ignored' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={rs.btnAi}
                      disabled={!!improving[obj.id]}
                      onClick={() => handleImprove(obj)}>
                      {improving[obj.id] === 'improving' ? '⏳ Asking Delfos…'
                        : improving[obj.id] === 'scoring' ? '⏳ Re-scoring…'
                        : '✦ Ask Delfos to improve quality'}
                    </button>
                    <button style={rs.btnIgnore} onClick={() => onIgnore(obj.id)}>Ignore</button>
                  </div>
                  {proposals[obj.id] && (
                    <div style={rs.proposal}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--ac)', marginBottom: 6, letterSpacing: '0.08em' }}>DELFOS SUGGESTS</p>
                      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx)', marginBottom: 4 }}>{proposals[obj.id].title}</p>
                      <p style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 6 }}>{proposals[obj.id].description}</p>
                      {proposals[obj.id].key_results?.map((kr, j) => (
                        <p key={j} style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 2 }}>{kr}</p>
                      ))}
                      <button style={rs.btnAccept} onClick={() => acceptProposal(obj)}>✓ Accept this improvement</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
          <button style={rs.back} onClick={onBack}>← Back</button>
          <button style={rs.submit} onClick={onContinue}>Review & Submit →</button>
        </div>

      </div>
    </Shell>
  )
}

const rs = {
  card:       { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' },
  cardHead:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  objBadge:   { background: 'var(--card-2)', color: 'var(--tx2)', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.08em', padding: '3px 8px', borderRadius: 4 },
  delfosBadge:{ background: 'var(--ac)', color: '#fff', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.06em', padding: '3px 8px', borderRadius: 4 },
  btnOutline: { background: 'none', border: '1px solid var(--border)', color: 'var(--tx2)',
                fontSize: 12, padding: '5px 12px', borderRadius: 6, cursor: 'pointer' },
  btnAi:      { background: 'rgba(99,91,255,0.15)', border: '1px solid rgba(99,91,255,0.3)',
                color: 'var(--ac)', fontSize: 12, padding: '5px 12px', borderRadius: 6, cursor: 'pointer' },
  btnIgnore:  { background: 'none', border: 'none', color: 'var(--err)', fontSize: 12,
                padding: '5px 12px', borderRadius: 6, cursor: 'pointer' },
  back:       { background: 'none', border: 'none', color: 'var(--tx2)', fontSize: 14, cursor: 'pointer' },
  submit:     { background: 'var(--ac)', color: '#fff', border: 'none', borderRadius: 8,
                fontSize: 14, fontWeight: 600, padding: '10px 24px', cursor: 'pointer' },
  proposal:   { background: 'rgba(99,91,255,0.08)', border: '1px solid rgba(99,91,255,0.25)',
                borderRadius: 8, padding: '12px 14px' },
  btnAccept:  { marginTop: 10, background: 'var(--ok)', color: '#fff', border: 'none',
                borderRadius: 6, fontSize: 12, fontWeight: 600, padding: '6px 14px', cursor: 'pointer' },
}

// ── Score gauge (SVG donut) ────────────────────────────────────────────────
function ScoreGauge({ score, size = 120 }) {
  const sw   = Math.max(5, size * 0.09)
  const r    = (size - sw * 2) / 2
  const circ = 2 * Math.PI * r
  const off  = circ * (1 - Math.min(score, 100) / 100)
  const col  = score >= 80 ? 'var(--ok)' : score >= 65 ? 'var(--warn)' : 'var(--err)'
  const cx   = size / 2
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--card-2)" strokeWidth={sw} />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={col} strokeWidth={sw}
          strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: size * 0.27, fontWeight: 800, color: col, lineHeight: 1 }}>{score}</span>
      </div>
    </div>
  )
}

// ── Sub-score bar ──────────────────────────────────────────────────────────
function SubScoreBar({ label, weight, value }) {
  const col = value >= 80 ? 'var(--ok)' : value >= 65 ? 'var(--warn)' : 'var(--err)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--tx2)', width: 170, flexShrink: 0 }}>{label} ({weight}%)</span>
      <div style={{ flex: 1, height: 3, background: 'var(--card-2)', borderRadius: 2 }}>
        <div style={{ width: `${Math.min(value, 100)}%`, height: '100%', background: col, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: col, width: 22, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

// ── Report screen ──────────────────────────────────────────────────────────
function downloadBambu(objectives, profile) {
  const headers = [
    'Business Goal / Priority',
    'By When',
    'Actions',
    'How does it add value to the overall business',
    'Metric',
    'Status',
    'Weight (%)',
  ]
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  const rows = objectives
    .filter(o => o.status !== 'ignored')
    .map(o => [
      o.title,
      o.by_when ?? '',
      (o.key_results ?? []).join('\n'),
      o.value_statement || (o.linked_cascades?.join('; ') ?? ''),
      o.metric ?? '',
      'Pending Approval',
      o.weight ?? '',
    ].map(escape).join(','))

  const bom = '﻿'
  const csv = bom + [headers.map(escape).join(','), ...rows].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `delfos_bambu_${(profile?.full_name ?? 'export').replace(/\s+/g, '_')}_2026.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function ReportScreen({ objectives, portfolioSummary, onBack, onSubmit }) {
  const { profile } = useProfile()
  const active  = objectives.filter(o => o.status !== 'ignored')
  const ignored = objectives.filter(o => o.status === 'ignored')
  const avg     = active.length
    ? Math.round(active.reduce((s, o) => s + (o.score ?? 0), 0) / active.length)
    : 0
  const color       = avg >= 80 ? 'var(--ok)' : avg >= 65 ? 'var(--warn)' : 'var(--err)'
  const statusLabel = avg >= 80 ? 'GREEN' : avg >= 65 ? 'AMBER' : 'RED'
  const statusText  = avg >= 80 ? 'high-ambition portfolio.'
    : avg >= 65 ? 'solid portfolio with room to stretch.'
    : 'portfolio needs strengthening before submission.'

  function scoreLabel(s) {
    return s >= 80 ? 'HIGH IMPACT' : s >= 65 ? 'MEDIUM' : 'LOW'
  }

  return (
    <Shell step={2}>
      <div style={{ maxWidth: 700, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Top header ── */}
        <div>
          <div style={rp.tabChip}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--tx2)' }}>BONUS POTENTIAL</span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--tx)', margin: '10px 0 8px' }}>Objectives Quality Analysis</h1>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8,
                        border: `1px solid ${color}`, borderRadius: 8, padding: '5px 14px', marginBottom: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--tx2)' }}>BONUS POTENTIAL</span>
            <span style={{ fontSize: 15, fontWeight: 800, color }}>{avg}%</span>
            <span style={{ fontSize: 11, fontWeight: 700, background: color, color: '#000',
                           borderRadius: 4, padding: '2px 7px' }}>{statusLabel}</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 16 }}>
            Ceiling of bonus achievable if these objectives are fully delivered. Final bonus is calculated at year-end against actual delivery.
          </p>

          {/* Gauge + narrative */}
          <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <ScoreGauge score={avg} size={130} />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--tx2)', textAlign: 'center', lineHeight: 1.4 }}>
                BONUS<br/>POTENTIAL
              </span>
            </div>
            {portfolioSummary && (
              <p style={{ fontSize: 14, color: 'var(--tx)', lineHeight: 1.7, paddingTop: 4, flex: 1 }}>
                {portfolioSummary}
              </p>
            )}
          </div>

          {/* Info box */}
          <div style={{ ...rp.infoBox, marginTop: 16 }}>
            <span style={{ fontWeight: 700, color: 'var(--tx)', fontSize: 12 }}>About this score (Year 1): </span>
            <span style={{ color: 'var(--tx2)', fontSize: 12 }}>
              The % reflects the quality and ambition of how objectives are written, not a final payout.
              Year-end review remains the source of truth for bonus, with this score informing the broader performance conversation.
            </span>
          </div>
          <div style={{ ...rp.highlightBox, borderColor: color, marginTop: 10 }}>
            <span style={{ fontWeight: 600, color, fontSize: 13 }}>
              {avg}% of bonus can be achieved if fully delivered — {statusText}
            </span>
          </div>
          <p style={{ fontSize: 11, color: 'var(--tx2)', fontStyle: 'italic', marginTop: 6 }}>
            Bonus Potential is the ceiling — what you can reach if you deliver 100% of these objectives.
          </p>
        </div>

        {/* ── Objective breakdown ── */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--tx2)',
                      textTransform: 'uppercase', marginBottom: 14 }}>Objective Breakdown</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {active.map((obj) => {
              const sc    = obj.score ?? 0
              const scCol = sc >= 80 ? 'var(--ok)' : sc >= 65 ? 'var(--warn)' : 'var(--err)'
              const ss    = obj.sub_scores ?? {}

              return (
                <div key={obj.id} style={rp.card}>

                  {/* Top row: gauge + title + score badge */}
                  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                    <ScoreGauge score={sc} size={56} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                        <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx)', lineHeight: 1.35, flex: 1 }}>
                          {obj.title}
                        </p>
                        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
                                      background: `${scCol}20`, border: `1px solid ${scCol}`,
                                      borderRadius: 6, padding: '5px 10px' }}>
                          <span style={{ fontSize: 17, fontWeight: 800, color: scCol, lineHeight: 1 }}>{sc}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: scCol }}>{scoreLabel(sc)}</span>
                        </div>
                      </div>

                      {obj.feedback && (
                        <p style={{ fontSize: 12, fontStyle: 'italic', marginTop: 6, lineHeight: 1.4,
                                    color: sc >= 80 ? 'var(--ok)' : sc >= 65 ? 'var(--warn)' : 'var(--err)' }}>
                          {obj.feedback}
                        </p>
                      )}

                      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ ...rp.weightChip, borderColor: scCol, color: scCol }}>
                          WEIGHT {obj.weight}%
                        </span>
                        {obj.source === 'delfos' && <span style={rs.delfosBadge}>DELFOS</span>}
                      </div>

                      {obj.linked_cascades?.length > 0 && (
                        <p style={{ fontSize: 11, color: 'var(--tx2)', marginTop: 8, lineHeight: 1.4 }}>
                          <span style={{ color: 'var(--ac)', marginRight: 4 }}>🔗</span>
                          {obj.linked_cascades.join('; ')}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Sub-score bars */}
                  {Object.keys(ss).length > 0 && (
                    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {ss.role_fit      != null && <SubScoreBar label="Role Fit"          weight={25} value={ss.role_fit} />}
                      {ss.impact        != null && <SubScoreBar label="Business Impact"   weight={20} value={ss.impact} />}
                      {ss.relevance     != null && <SubScoreBar label="Cascade Alignment" weight={20} value={ss.relevance} />}
                      {ss.ambition      != null && <SubScoreBar label="Ambition"          weight={15} value={ss.ambition} />}
                      {ss.measurability != null && <SubScoreBar label="Measurability"     weight={15} value={ss.measurability} />}
                      {ss.smart         != null && <SubScoreBar label="SMART Quality"     weight={5}  value={ss.smart} />}
                    </div>
                  )}

                  {/* Increase impact + How to measure */}
                  {(obj.coaching_tips?.length > 0 || obj.key_results?.length > 0) && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
                                  marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                      {obj.coaching_tips?.length > 0 && (
                        <div>
                          <p style={rp.sectionLabel}>INCREASE IMPACT</p>
                          {obj.coaching_tips.map((tip, j) => (
                            <p key={j} style={rp.bulletText}>• {tip}</p>
                          ))}
                        </div>
                      )}
                      {obj.key_results?.length > 0 && (
                        <div>
                          <p style={rp.sectionLabel}>HOW TO MEASURE</p>
                          {obj.key_results.map((kr, j) => (
                            <p key={j} style={rp.bulletText}>• {kr}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ textAlign: 'right', marginTop: 10, paddingTop: 8,
                                borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--tx2)', letterSpacing: '0.04em' }}>
                    Overall Weight <span style={{ fontWeight: 700, color: scCol }}>{obj.weight}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      paddingTop: 8, borderTop: '1px solid var(--border)', marginTop: 4 }}>
          <button style={rp.backBtn} onClick={onBack}>← Back to Refine</button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={rp.downloadBtn} onClick={() => downloadBambu(objectives, profile)}>
              ⬇ Download for BAMBU
            </button>
            <button style={rp.submitBtn} onClick={onSubmit}>Submit for approval →</button>
          </div>
        </div>

      </div>
    </Shell>
  )
}

const rp = {
  tabChip:      { display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '3px 10px', marginBottom: 4 },
  infoBox:      { background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '10px 14px' },
  highlightBox: { background: 'transparent', border: '1px solid',
                  borderRadius: 8, padding: '12px 16px' },
  card:         { background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: '18px 20px' },
  weightChip:   { fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                  border: '1px solid', borderRadius: 4, padding: '3px 8px' },
  sectionLabel: { fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--tx2)', marginBottom: 6 },
  bulletText:   { fontSize: 12, color: 'var(--tx2)', lineHeight: 1.5, marginBottom: 4 },
  backBtn:      { background: 'none', border: 'none', color: 'var(--tx2)', fontSize: 14, cursor: 'pointer' },
  downloadBtn:  { background: 'none', border: '1px solid var(--border)', color: 'var(--tx2)',
                  borderRadius: 8, fontSize: 13, fontWeight: 500, padding: '9px 16px', cursor: 'pointer' },
  submitBtn:    { background: 'var(--ac)', color: '#fff', border: 'none', borderRadius: 8,
                  fontSize: 14, fontWeight: 600, padding: '10px 24px', cursor: 'pointer' },
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
                  {item.weight_percent && (
                    <span style={ca.weight}>{item.weight_percent}%</span>
                  )}
                </div>
              ))}
            </>
          )}
          {country.length > 0 && (
            <>
              <p style={{ ...ca.groupLabel, marginTop: 12 }}>{country_label?.toUpperCase()}</p>
              {country.map(item => (
                <div key={item.id} style={ca.item}>
                  <span style={{ color: 'var(--tx2)', fontSize: 10 }}>◉</span>
                  <span style={ca.itemText}>{item.text}</span>
                  {item.weight_percent && (
                    <span style={ca.weight}>{item.weight_percent}%</span>
                  )}
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

// ── Main component ─────────────────────────────────────────────────────────
export default function ObjectiveDraft({ onNavigate }) {
  const { profile } = useProfile()

  const [cascade,    setCascade]    = useState([])
  const [objectives, setObjectives] = useState([
    { id: 1, type: 'performance', title: '', description: '', source: 'user', status: 'active' },
  ])
  const [phase,            setPhase]            = useState('draft')  // draft | loading | refine | report
  const [loadCtx,          setLoadCtx]          = useState({ action: 'asking', elapsed: 0 })
  const [error,            setError]            = useState(null)
  const [portfolioSummary, setPortfolioSummary] = useState('')
  const timerRef = useRef(null)

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

  async function handleAskDelfos() {
    setPhase('loading'); startTimer('asking')
    try {
      const suggested = await suggestObjectives({
        profile,
        cascade,
        priorities: profile.current_priorities,
      })
      stopTimer()
      setObjectives(suggested)
      setPhase('draft')
    } catch (err) {
      stopTimer()
      console.error('suggest-objectives error:', err)
      setError(`Error: ${err?.message ?? JSON.stringify(err)}`)
      setPhase('draft')
    }
  }

  async function handleScore() {
    const filled = objectives.filter(o => o.title.trim())
    if (!filled.length) return
    setPhase('loading'); startTimer('scoring')
    try {
      const result  = await scoreObjectives({ profile, objectives: filled, cascade })
      stopTimer()
      const scored  = result?.objectives ?? result
      const summary = result?.summary ?? ''
      setObjectives(scored)
      setPortfolioSummary(summary)
      setPhase('refine')
    } catch (err) {
      stopTimer()
      console.error('score-objectives error:', err)
      setError('Error al puntuar. Inténtalo de nuevo.')
      setPhase('draft')
    }
  }

  function addObjective() {
    setObjectives(p => [...p, { id: Date.now(), type: 'performance', title: '', description: '', source: 'user', status: 'active' }])
  }

  function update(id, field, value) {
    setObjectives(p => p.map(o => o.id === id ? { ...o, [field]: value } : o))
  }

  function remove(id) {
    setObjectives(p => p.filter(o => o.id !== id))
  }

  if (phase === 'loading') return <LoadingScreen action={loadCtx.action} elapsed={loadCtx.elapsed} />

  if (phase === 'refine') return (
    <RefineScreen
      objectives={objectives}
      cascade={cascade}
      onBack={() => setPhase('draft')}
      onIgnore={(id) => update(id, 'status', 'ignored')}
      onAcceptImproved={(id, improved) =>
        setObjectives(p => p.map(o => o.id === id ? { ...o, ...improved, source: 'delfos' } : o))
      }
      onRescored={(id, rescored) =>
        setObjectives(p => p.map(o => o.id === id ? { ...o, ...rescored } : o))
      }
      onContinue={() => setPhase('report')}
    />
  )

  if (phase === 'report') return (
    <ReportScreen
      objectives={objectives}
      portfolioSummary={portfolioSummary}
      onBack={() => setPhase('refine')}
      onSubmit={() => onNavigate('submitted', { objectives })}
    />
  )

  const hasFilled = objectives.some(o => o.title.trim())

  return (
    <Shell step={1}>
      <div style={ds.page}>

        {/* Info banner */}
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

        {/* Step heading */}
        <p style={ds.stepBadge}>STEP 02</p>
        <h1 style={ds.heading}>Set Your Objectives</h1>

        {/* Cascade */}
        <CascadeAccordion cascade={cascade} country_label={profile.country_label} />

        {/* Objective cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          {objectives.map((obj, i) => (
            <div key={obj.id} style={ds.objCard}>
              <div style={ds.objCardHead}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={ds.objNumBadge}>OBJ {i + 1}</span>
                  {obj.source === 'delfos' && <span style={rs.delfosBadge}>DELFOS</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {['performance', 'learning'].map(t => (
                    <button key={t} onClick={() => update(obj.id, 'type', t)}
                      style={{
                        ...ds.typeBtn,
                        background: obj.type === t ? 'var(--ac)' : 'var(--card-2)',
                        color:      obj.type === t ? '#fff'      : 'var(--tx2)',
                      }}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                  {objectives.length > 1 && (
                    <button onClick={() => remove(obj.id)} style={ds.removeBtn}>✕</button>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={ds.fieldLabel}>Title — be specific and measurable</label>
                  <input style={ds.input}
                    value={obj.title}
                    onChange={e => update(obj.id, 'title', e.target.value)}
                    placeholder="e.g. Reduce voluntary turnover from 14% to <10% by Q4" />
                </div>
                <div>
                  <label style={ds.fieldLabel}>Description, KRs &amp; Timeline</label>
                  <textarea style={{ ...ds.input, minHeight: 80, resize: 'vertical' }}
                    value={obj.description}
                    onChange={e => update(obj.id, 'description', e.target.value)}
                    placeholder="What metric moves? By when? What's the baseline?" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Add objective */}
        <button style={ds.addBtn} onClick={addObjective}>+ Add Objective</button>

        {error && (
          <p style={{ color: 'var(--err)', fontSize: 13, textAlign: 'center' }}
             onClick={() => setError(null)}>{error} (click to dismiss)</p>
        )}

        {/* Footer */}
        <div style={ds.footer}>
          <button style={ds.backBtn} onClick={() => onNavigate('profile')}>← Back</button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={ds.aiBtn} onClick={handleAskDelfos}>
              ✦ Ask Delfos for suggestions
            </button>
            <button style={{ ...ds.scoreBtn, opacity: hasFilled ? 1 : 0.4 }}
              disabled={!hasFilled} onClick={handleScore}>
              Score Objectives →
            </button>
          </div>
        </div>

      </div>
    </Shell>
  )
}

const ds = {
  page:       { maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 },
  banner:     { display: 'flex', gap: 10, background: 'rgba(240,165,0,0.08)',
                border: '1px solid rgba(240,165,0,0.2)', borderRadius: 10, padding: '12px 16px',
                alignItems: 'flex-start', fontSize: 13 },
  stepBadge:  { fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--tx2)',
                textTransform: 'uppercase', margin: '8px 0 4px' },
  heading:    { fontSize: 26, fontWeight: 700, color: 'var(--tx)', marginBottom: 4 },
  objCard:    { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
                padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 },
  objCardHead:{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  objNumBadge:{ background: 'rgba(99,91,255,0.2)', color: 'var(--ac)', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.08em', padding: '3px 8px', borderRadius: 4 },
  typeBtn:    { fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 5,
                border: 'none', cursor: 'pointer' },
  removeBtn:  { background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer',
                fontSize: 12, padding: '4px 6px' },
  fieldLabel: { display: 'block', fontSize: 11, color: 'var(--tx2)', marginBottom: 5 },
  input:      { width: '100%', background: 'var(--card-2)', border: '1px solid var(--border)',
                borderRadius: 8, color: 'var(--tx)', fontSize: 14, padding: '9px 12px',
                outline: 'none', lineHeight: 1.5 },
  addBtn:     { background: 'none', border: '1px dashed var(--border)', color: 'var(--tx2)',
                borderRadius: 8, padding: '10px 0', cursor: 'pointer', fontSize: 13,
                fontWeight: 500, width: '100%' },
  footer:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                paddingTop: 8, borderTop: '1px solid var(--border)', marginTop: 8 },
  backBtn:    { background: 'none', border: 'none', color: 'var(--tx2)', fontSize: 14,
                cursor: 'pointer' },
  aiBtn:      { background: 'rgba(99,91,255,0.15)', border: '1px solid rgba(99,91,255,0.35)',
                color: 'var(--ac)', fontSize: 13, fontWeight: 500, padding: '9px 16px',
                borderRadius: 8, cursor: 'pointer' },
  scoreBtn:   { background: 'var(--ac)', color: '#fff', border: 'none', borderRadius: 8,
                fontSize: 14, fontWeight: 600, padding: '9px 20px', cursor: 'pointer' },
}
