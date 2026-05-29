import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Shell from '../components/Shell'
import { ARCHETYPE_THRESHOLDS } from '../lib/constants'


const OBJ_STATUS_META = {
  approved:           { label: '✓ Approved',  color: 'var(--ok)'  },
  revision_requested: { label: '↩ Revision',  color: 'var(--ac)'  },
  rejected:           { label: '✕ Rejected',  color: 'var(--err)' },
}

const TYPE_COLOR = {
  performance: 'var(--ac)',
  learning:    'var(--ok)',
  team:        'var(--warn)',
}

function scoreColor(score, archetype_code) {
  const t = ARCHETYPE_THRESHOLDS[archetype_code] ?? { min: 60, green: 75 }
  if (score == null) return 'var(--tx2)'
  if (score >= t.green) return 'var(--ok)'
  if (score >= t.min)   return 'var(--warn)'
  return 'var(--err)'
}

export default function MyObjectives({ onEmployeeView, onMyObjectivesView, onManagerView, onCoverageView, activeTab, onLogout, onSettings }) {
  const [loading,     setLoading]     = useState(true)
  const [submissions, setSubmissions] = useState([])
  const [objMap,      setObjMap]      = useState({})
  const [expanded,    setExpanded]    = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    const { data: orgSelf } = await supabase
      .from('org_chart').select('full_name')
      .eq('email', user?.email ?? '').maybeSingle()

    const employeeName = orgSelf?.full_name ?? ''

    const [{ data: subs }, { data: allObjs }] = await Promise.all([
      supabase.from('objective_submissions').select('*')
        .eq('employee_name', employeeName)
        .order('submitted_at', { ascending: false }),
      supabase.from('submitted_objectives').select('*'),
    ])

    const allSubs = subs ?? []
    const subIds  = allSubs.map(s => s.id)
    const grouped = {}
    for (const o of (allObjs ?? [])) {
      if (subIds.includes(o.submission_id)) {
        if (!grouped[o.submission_id]) grouped[o.submission_id] = []
        grouped[o.submission_id].push(o)
      }
    }

    setSubmissions(allSubs)
    setObjMap(grouped)
    // Auto-expand the most recent submission
    if (allSubs.length > 0) setExpanded({ [allSubs[0].id]: true })
    setLoading(false)
  }

  return (
    <Shell step={0} onSettings={onSettings}
      onEmployeeView={onEmployeeView} onMyObjectivesView={onMyObjectivesView}
      onManagerView={onManagerView} onCoverageView={onCoverageView}
      activeTab={activeTab} onLogout={onLogout}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>

        <div style={{ marginBottom: 24 }}>
          <h1 style={s.heading}>My Objectives</h1>
          <p style={s.sub}>
            {loading ? 'Loading…'
              : submissions.length === 0 ? 'You have no submitted objectives yet.'
              : `${submissions.length} submission${submissions.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {submissions.map((sub, si) => {
            const scColor  = scoreColor(sub.portfolio_score, sub.archetype_code)
            const objs     = objMap[sub.id] ?? []
            const isOpen   = expanded[sub.id]
            const isLatest = si === 0

            // Derive a readable summary of per-objective statuses
            const approved  = objs.filter(o => o.approval_status === 'approved').length
            const revision  = objs.filter(o => o.approval_status === 'revision_requested').length
            const rejected  = objs.filter(o => o.approval_status === 'rejected').length
            const pending   = objs.filter(o => !o.approval_status).length

            return (
              <div key={sub.id} style={{ ...s.card, borderColor: isLatest ? 'var(--ac)' : 'var(--border)' }}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      {isLatest && (
                        <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--ac)', color: '#fff',
                                       borderRadius: 4, padding: '2px 7px', letterSpacing: '0.04em' }}>LATEST</span>
                      )}
                      <span style={{ fontSize: 11, color: 'var(--tx2)' }}>
                        {new Date(sub.submitted_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                    {/* Per-objective status summary */}
                    {objs.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        {approved > 0 && (
                          <span style={{ ...s.badge, color: 'var(--ok)', background: 'var(--ok)18', borderColor: 'var(--ok)40' }}>
                            ✓ {approved} approved
                          </span>
                        )}
                        {revision > 0 && (
                          <span style={{ ...s.badge, color: 'var(--ac)', background: 'var(--ac)18', borderColor: 'var(--ac)40' }}>
                            ↩ {revision} revision
                          </span>
                        )}
                        {rejected > 0 && (
                          <span style={{ ...s.badge, color: 'var(--err)', background: 'var(--err)18', borderColor: 'var(--err)40' }}>
                            ✕ {rejected} rejected
                          </span>
                        )}
                        {pending > 0 && (
                          <span style={{ ...s.badge, color: 'var(--tx2)', background: 'var(--tx2)18', borderColor: 'var(--tx2)40' }}>
                            · {pending} pending
                          </span>
                        )}
                      </div>
                    )}
                    {sub.portfolio_summary && (
                      <p style={s.summary}>{sub.portfolio_summary}</p>
                    )}
                  </div>
                  {sub.portfolio_score != null && (
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 28, fontWeight: 800, color: scColor, lineHeight: 1 }}>
                        {sub.portfolio_score}%
                      </p>
                      <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: scColor, marginTop: 2 }}>
                        BONUS POTENTIAL
                      </p>
                    </div>
                  )}
                </div>

                {/* Objectives toggle */}
                {objs.length > 0 && (
                  <button style={s.toggleBtn}
                    onClick={() => setExpanded(e => ({ ...e, [sub.id]: !e[sub.id] }))}>
                    {isOpen ? '▲' : '▼'} {objs.length} objective{objs.length !== 1 ? 's' : ''}
                  </button>
                )}

                {/* Objectives */}
                {isOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                    {objs.map((obj, i) => {
                      const objStatus = obj.approval_status ? OBJ_STATUS_META[obj.approval_status] : null
                      const krs  = Array.isArray(obj.key_results)     ? obj.key_results     : []
                      const tips = Array.isArray(obj.coaching_tips)   ? obj.coaching_tips   : []

                      return (
                        <div key={obj.id ?? i} style={s.objRow}>
                          {/* Obj header */}
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                            <span style={{ ...s.typeBadge, color: TYPE_COLOR[obj.type] ?? 'var(--ac)' }}>{obj.type}</span>
                            {obj.source === 'delfos' && <span style={s.aiBadge}>✦ AI</span>}
                            {obj.by_when && <span style={{ fontSize: 11, color: 'var(--tx2)' }}>📅 {obj.by_when}</span>}
                            {objStatus && (
                              <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700,
                                             color: objStatus.color, background: objStatus.color + '18',
                                             border: `1px solid ${objStatus.color}40`,
                                             borderRadius: 4, padding: '2px 8px', letterSpacing: '0.04em' }}>
                                {objStatus.label}
                              </span>
                            )}
                            {obj.score != null && obj.type !== 'learning' && (
                              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)',
                                             color: scoreColor(obj.score, sub.archetype_code),
                                             marginLeft: objStatus ? 0 : 'auto' }}>
                                {obj.score}%
                              </span>
                            )}
                          </div>

                          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)', marginBottom: 4 }}>{obj.title}</p>

                          {obj.description && (
                            <p style={{ fontSize: 12, color: 'var(--tx2)', lineHeight: 1.5, marginBottom: 8 }}>{obj.description}</p>
                          )}

                          {obj.metric && (
                            <p style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 4 }}>
                              <span style={s.infoLabel}>Metric</span> {obj.metric}
                            </p>
                          )}

                          {krs.length > 0 && (
                            <div style={{ marginTop: 6 }}>
                              <p style={s.sectionLabel}>Key Results</p>
                              {krs.map((kr, j) => (
                                <p key={j} style={{ fontSize: 12, color: 'var(--tx2)', lineHeight: 1.4, marginBottom: 2 }}>
                                  <span style={{ color: 'var(--ac)', fontWeight: 600 }}>·</span> {kr}
                                </p>
                              ))}
                            </div>
                          )}

                          {obj.feedback && (
                            <p style={{ fontSize: 11, color: 'var(--tx2)', fontStyle: 'italic', marginTop: 8,
                                        borderLeft: '2px solid var(--border)', paddingLeft: 8, lineHeight: 1.5 }}>
                              {obj.feedback}
                            </p>
                          )}

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
              </div>
            )
          })}
        </div>
      </div>
    </Shell>
  )
}

const s = {
  heading:     { fontSize: 24, fontWeight: 700, color: 'var(--tx)', marginBottom: 6 },
  sub:         { fontSize: 13, color: 'var(--tx2)' },
  card:        { background: 'var(--card)', border: '1px solid', borderRadius: 12, padding: '18px 20px' },
  badge:       { fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5,
                 letterSpacing: '0.06em', border: '1px solid', textTransform: 'uppercase' },
  summary:     { fontSize: 12, color: 'var(--tx2)', lineHeight: 1.6, marginTop: 8, fontStyle: 'italic',
                 borderLeft: '2px solid var(--border)', paddingLeft: 10 },
  toggleBtn:   { fontSize: 12, color: 'var(--tx2)', background: 'none', border: 'none',
                 cursor: 'pointer', marginTop: 12, padding: 0 },
  objRow:      { background: 'var(--card-2)', borderRadius: 8, padding: '10px 12px',
                 border: '1px solid var(--border)' },
  typeBadge:   { fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                 background: 'var(--card)', border: '1px solid var(--border)',
                 textTransform: 'uppercase', letterSpacing: '0.06em' },
  aiBadge:     { fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                 background: 'var(--ai-soft)', border: '1px solid var(--ai-border)',
                 color: 'var(--purple)', letterSpacing: '0.06em' },
  infoLabel:   { fontSize: 10, fontWeight: 700, color: 'var(--tx2)', letterSpacing: '0.06em',
                 textTransform: 'uppercase', marginRight: 6 },
  sectionLabel:{ fontSize: 10, fontWeight: 700, color: 'var(--tx2)', letterSpacing: '0.06em',
                 textTransform: 'uppercase', marginBottom: 5 },
}
