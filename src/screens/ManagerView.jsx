import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Shell from '../components/Shell'
import { ARCHETYPE_THRESHOLDS } from '../lib/constants'

const STATUS_META = {
  pending_approval:   { label: 'Pending review',     color: 'var(--warn)' },
  approved:           { label: 'Approved',            color: 'var(--ok)'  },
  revision_requested: { label: 'Revision requested', color: 'var(--ac)'  },
  rejected:           { label: 'Rejected',            color: 'var(--err)' },
}

const TYPE_COLOR = {
  performance: 'var(--ac)',
  learning:    'var(--ok)',
  team:        'var(--warn)',
}

function scoreLabel(score, archetype_code) {
  const t = ARCHETYPE_THRESHOLDS[archetype_code] ?? { min: 60, green: 75 }
  if (score == null) return null
  if (score >= t.green) return { label: 'HIGH IMPACT', color: 'var(--ok)'  }
  if (score >= t.min)   return { label: 'MEDIUM',      color: 'var(--warn)' }
  return                       { label: 'LOW',          color: 'var(--err)' }
}

export default function ManagerView({ onEmployeeView, onManagerView, onCoverageView, activeTab, onLogout }) {
  const [loading,    setLoading]    = useState(true)
  const [submissions, setSubmissions] = useState([])
  const [objMap,     setObjMap]     = useState({})
  const [expanded,   setExpanded]   = useState({})
  const [updating,   setUpdating]   = useState(null)
  const [filter,     setFilter]     = useState('pending_approval')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: subs }, { data: objs }] = await Promise.all([
      supabase.from('objective_submissions').select('*').order('submitted_at', { ascending: false }),
      supabase.from('submitted_objectives').select('*'),
    ])
    setSubmissions(subs ?? [])
    const grouped = {}
    for (const o of (objs ?? [])) {
      if (!grouped[o.submission_id]) grouped[o.submission_id] = []
      grouped[o.submission_id].push(o)
    }
    setObjMap(grouped)
    setLoading(false)
  }

  async function updateStatus(subId, status) {
    setUpdating(subId)
    const { error } = await supabase
      .from('objective_submissions')
      .update({ status })
      .eq('id', subId)
    if (!error) setSubmissions(p => p.map(s => s.id === subId ? { ...s, status } : s))
    setUpdating(null)
  }

  const FILTERS = [
    { key: 'pending_approval',   label: 'Pending'  },
    { key: 'approved',           label: 'Approved' },
    { key: 'revision_requested', label: 'Revision' },
    { key: 'all',                label: 'All'      },
  ]

  const filtered = filter === 'all'
    ? submissions
    : submissions.filter(s => s.status === filter)

  const pendingCount = submissions.filter(s => s.status === 'pending_approval').length

  return (
    <Shell step={0} onEmployeeView={onEmployeeView} onManagerView={onManagerView}
      onCoverageView={onCoverageView} activeTab={activeTab} onLogout={onLogout}>
      <div style={{ maxWidth: 740, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={s.heading}>Team Objectives</h1>
          <p style={s.sub}>
            {loading ? 'Loading…' : pendingCount > 0
              ? `${pendingCount} submission${pendingCount !== 1 ? 's' : ''} pending your review`
              : 'All submissions reviewed — nothing pending.'}
          </p>
        </div>

        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          {FILTERS.map(f => {
            const count = f.key === 'all'
              ? submissions.length
              : submissions.filter(x => x.status === f.key).length
            const active = filter === f.key
            return (
              <button key={f.key} onClick={() => setFilter(f.key)} style={{
                ...s.pill,
                background:  active ? 'var(--ac)' : 'var(--card)',
                color:       active ? '#fff' : 'var(--tx2)',
                borderColor: active ? 'var(--ac)' : 'var(--border)',
              }}>
                {f.label} <span style={{ opacity: 0.7 }}>({count})</span>
              </button>
            )
          })}
        </div>

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 64, color: 'var(--tx2)', fontSize: 14 }}>
            {filter === 'pending_approval' ? 'No pending reviews.' : 'No submissions here.'}
          </div>
        )}

        {/* Submission cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filtered.map(sub => {
            const sc     = scoreLabel(sub.portfolio_score, sub.archetype_code)
            const status = STATUS_META[sub.status] ?? STATUS_META.pending_approval
            const objs   = objMap[sub.id] ?? []
            const isOpen = expanded[sub.id]
            const busy   = updating === sub.id

            return (
              <div key={sub.id} style={s.card}>

                {/* Top row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx)' }}>{sub.employee_name}</span>
                      <span style={{ ...s.badge, color: status.color, background: status.color + '18', borderColor: status.color + '40' }}>
                        {status.label}
                      </span>
                      {sc && (
                        <span style={{ ...s.badge, color: sc.color, background: sc.color + '15', borderColor: sc.color + '30' }}>
                          {sc.label}
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--tx2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {[sub.job_title, sub.department, sub.country_label].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {sub.portfolio_score != null && (
                      <p style={{ fontSize: 24, fontWeight: 800, color: sc?.color ?? 'var(--tx)', lineHeight: 1 }}>
                        {sub.portfolio_score}%
                      </p>
                    )}
                    <p style={{ fontSize: 10, color: 'var(--tx2)', marginTop: 2 }}>
                      {new Date(sub.submitted_at).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                </div>

                {/* AI summary */}
                {sub.portfolio_summary && (
                  <p style={s.summary}>{sub.portfolio_summary}</p>
                )}

                {/* Objectives toggle */}
                {objs.length > 0 && (
                  <button style={s.toggleBtn}
                    onClick={() => setExpanded(e => ({ ...e, [sub.id]: !e[sub.id] }))}>
                    {isOpen ? '▲' : '▼'} {objs.length} objective{objs.length !== 1 ? 's' : ''}
                  </button>
                )}

                {/* Objectives list */}
                {isOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                    {objs.map((obj, i) => {
                      const ss = obj.sub_scores ?? {}
                      const SUB = [
                        { label: 'Relevance',  val: ss.relevance ?? ss.role_fit },
                        { label: 'Impact',     val: ss.impact    ?? ss.business_impact },
                        { label: 'Ambition',   val: ss.ambition },
                        { label: 'Measurable', val: ss.measurability },
                        { label: 'Time-bound', val: ss.time_bound ?? ss.smart },
                      ].filter(d => d.val != null)
                      const krs   = Array.isArray(obj.key_results) ? obj.key_results : []
                      const tips  = Array.isArray(obj.coaching_tips) ? obj.coaching_tips : []
                      const casc  = Array.isArray(obj.linked_cascades) ? obj.linked_cascades : []

                      return (
                        <div key={obj.id ?? i} style={s.objRow}>

                          {/* Header row */}
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ ...s.typeBadge, color: TYPE_COLOR[obj.type] ?? 'var(--ac)' }}>{obj.type}</span>
                            {obj.source === 'delfos' && <span style={s.aiBadge}>✦ AI</span>}
                            {obj.by_when && <span style={{ fontSize: 11, color: 'var(--tx2)' }}>📅 {obj.by_when}</span>}
                            {obj.score != null && (
                              <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700,
                                             fontFamily: 'var(--font-mono)', color: 'var(--tx)' }}>
                                {obj.score}%
                              </span>
                            )}
                          </div>

                          {/* Title */}
                          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)', marginBottom: 6 }}>{obj.title}</p>

                          {/* Description */}
                          {obj.description && (
                            <p style={{ fontSize: 12, color: 'var(--tx2)', lineHeight: 1.5, marginBottom: 8 }}>{obj.description}</p>
                          )}

                          {/* Metric */}
                          {obj.metric && (
                            <div style={s.infoRow}>
                              <span style={s.infoLabel}>Metric</span>
                              <span style={s.infoVal}>{obj.metric}</span>
                            </div>
                          )}

                          {/* Value statement */}
                          {obj.value_statement && (
                            <div style={s.infoRow}>
                              <span style={s.infoLabel}>Value</span>
                              <span style={s.infoVal}>{obj.value_statement}</span>
                            </div>
                          )}

                          {/* Key results */}
                          {krs.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                              <p style={s.sectionLabel}>Key Results</p>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                {krs.map((kr, j) => (
                                  <p key={j} style={{ fontSize: 12, color: 'var(--tx2)', lineHeight: 1.4 }}>
                                    <span style={{ color: 'var(--ac)', fontWeight: 600 }}>·</span> {kr}
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Sub-scores */}
                          {SUB.length > 0 && (
                            <div style={{ marginTop: 10 }}>
                              <p style={s.sectionLabel}>Score breakdown</p>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {SUB.map(d => (
                                  <div key={d.label} style={s.subScore}>
                                    <span style={{ fontSize: 9, color: 'var(--tx2)', display: 'block', marginBottom: 1 }}>{d.label}</span>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: d.val >= 75 ? 'var(--ok)' : d.val >= 55 ? 'var(--warn)' : 'var(--err)' }}>{d.val}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Cascade links */}
                          {casc.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                              <p style={s.sectionLabel}>Cascade alignment</p>
                              {casc.map((c, j) => (
                                <p key={j} style={{ fontSize: 11, color: 'var(--tx2)', lineHeight: 1.4 }}>· {c}</p>
                              ))}
                            </div>
                          )}

                          {/* AI feedback */}
                          {obj.feedback && (
                            <p style={{ fontSize: 11, color: 'var(--tx2)', fontStyle: 'italic', marginTop: 8,
                                        borderLeft: '2px solid var(--border)', paddingLeft: 8, lineHeight: 1.5 }}>
                              {obj.feedback}
                            </p>
                          )}

                          {/* Coaching tips */}
                          {tips.length > 0 && (
                            <div style={{ marginTop: 8, background: 'var(--ai-soft)', border: '1px solid var(--ai-border)',
                                          borderRadius: 6, padding: '8px 10px' }}>
                              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--purple)', marginBottom: 4, letterSpacing: '0.06em' }}>
                                ✦ COACHING TIPS
                              </p>
                              {tips.map((t, j) => (
                                <p key={j} style={{ fontSize: 11, color: 'var(--tx2)', lineHeight: 1.4 }}>· {t}</p>
                              ))}
                            </div>
                          )}

                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Actions */}
                {sub.status === 'pending_approval' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                    <button style={{ ...s.actionBtn, background: 'var(--ok)' }}
                      disabled={busy} onClick={() => updateStatus(sub.id, 'approved')}>
                      ✓ Approve
                    </button>
                    <button style={{ ...s.actionBtn, background: 'var(--ac)' }}
                      disabled={busy} onClick={() => updateStatus(sub.id, 'revision_requested')}>
                      ↩ Request revision
                    </button>
                    <button style={{ ...s.actionBtn, background: 'var(--err)' }}
                      disabled={busy} onClick={() => updateStatus(sub.id, 'rejected')}>
                      ✕ Reject
                    </button>
                  </div>
                )}

                {/* Re-open if already reviewed */}
                {sub.status !== 'pending_approval' && (
                  <button style={{ ...s.actionBtn, background: 'var(--card-2)', color: 'var(--tx2)',
                                   marginTop: 14, fontSize: 11 }}
                    disabled={busy} onClick={() => updateStatus(sub.id, 'pending_approval')}>
                    ↺ Reopen
                  </button>
                )}

              </div>
            )
          })}
        </div>

      </div>
    </Shell>
  )
}

const s = {
  heading:   { fontSize: 24, fontWeight: 700, color: 'var(--tx)', marginBottom: 6 },
  sub:       { fontSize: 13, color: 'var(--tx2)' },
  pill:      { fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 20,
               border: '1px solid', cursor: 'pointer', transition: 'background 0.15s, color 0.15s' },
  card:      { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
               padding: '18px 20px' },
  badge:     { fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5,
               letterSpacing: '0.06em', border: '1px solid', textTransform: 'uppercase' },
  summary:   { fontSize: 12, color: 'var(--tx2)', lineHeight: 1.6, marginTop: 10, fontStyle: 'italic',
               borderLeft: '2px solid var(--border)', paddingLeft: 10 },
  toggleBtn: { fontSize: 12, color: 'var(--tx2)', background: 'none', border: 'none',
               cursor: 'pointer', marginTop: 12, padding: 0 },
  objRow:    { background: 'var(--card-2)', borderRadius: 8, padding: '10px 12px',
               border: '1px solid var(--border)' },
  typeBadge:    { fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                  background: 'var(--card)', border: '1px solid var(--border)',
                  textTransform: 'uppercase', letterSpacing: '0.06em' },
  aiBadge:      { fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                  background: 'var(--ai-soft)', border: '1px solid var(--ai-border)',
                  color: 'var(--purple)', letterSpacing: '0.06em' },
  actionBtn:    { fontSize: 12, fontWeight: 600, padding: '7px 16px', borderRadius: 7,
                  border: 'none', cursor: 'pointer', color: '#fff', transition: 'opacity 0.15s' },
  infoRow:      { display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 4 },
  infoLabel:    { fontSize: 10, fontWeight: 700, color: 'var(--tx2)', letterSpacing: '0.06em',
                  textTransform: 'uppercase', flexShrink: 0, paddingTop: 1, minWidth: 56 },
  infoVal:      { fontSize: 12, color: 'var(--tx)', lineHeight: 1.4 },
  sectionLabel: { fontSize: 10, fontWeight: 700, color: 'var(--tx2)', letterSpacing: '0.06em',
                  textTransform: 'uppercase', marginBottom: 5 },
  subScore:     { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6,
                  padding: '5px 10px', textAlign: 'center', minWidth: 64 },
}
