import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Shell from '../components/Shell'
import { ARCHETYPE_THRESHOLDS } from '../lib/constants'


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

function getSubtreeNames(rootName, orgChart) {
  const names = new Set()
  const queue = [rootName]
  while (queue.length) {
    const current = queue.shift()
    for (const emp of orgChart) {
      if (emp.manager_name === current && !names.has(emp.full_name)) {
        names.add(emp.full_name)
        queue.push(emp.full_name)
      }
    }
  }
  return names
}

export default function ManagerView({ onEmployeeView, onMyObjectivesView, onManagerView, onCoverageView, activeTab, onLogout }) {
  const [loading,         setLoading]         = useState(true)
  const [submissions,     setSubmissions]     = useState([])
  const [objMap,          setObjMap]          = useState({})
  const [expanded,        setExpanded]        = useState({})
  const [filter,          setFilter]          = useState('all')
  const [search,          setSearch]          = useState('')
  const [currentUserName, setCurrentUserName] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    const { data: self } = await supabase
      .from('org_chart').select('full_name, email, manager_name')
      .eq('email', user?.email ?? '').maybeSingle()

    if (!self?.full_name) { setLoading(false); return }
    setCurrentUserName(self.full_name)

    const { data: orgChart } = await supabase
      .from('org_chart').select('full_name, manager_name')

    const subtreeNames = getSubtreeNames(self.full_name, orgChart ?? [])
    subtreeNames.add(self.full_name)

    const namesArr = Array.from(subtreeNames)

    const [{ data: subs }, { data: allObjs }] = await Promise.all([
      supabase.from('objective_submissions').select('*')
        .in('employee_name', namesArr)
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
    setLoading(false)
  }

  async function updateObjStatus(subId, objId, approval_status) {
    const { error } = await supabase
      .from('submitted_objectives').update({ approval_status }).eq('id', objId)
    if (error) return

    // Optimistic update
    const updatedMap = {
      ...objMap,
      [subId]: (objMap[subId] ?? []).map(o => o.id === objId ? { ...o, approval_status } : o),
    }
    setObjMap(updatedMap)

    // Auto-compute submission status from individual objective statuses
    const objs = updatedMap[subId] ?? []
    const statuses = objs.map(o => o.approval_status)
    let newSubStatus = 'pending_approval'
    if (statuses.every(s => s === 'approved'))                        newSubStatus = 'approved'
    else if (statuses.some(s => s === 'rejected'))                    newSubStatus = 'rejected'
    else if (statuses.some(s => s === 'revision_requested'))          newSubStatus = 'revision_requested'
    else if (statuses.some(s => s === 'approved') && statuses.some(s => !s)) newSubStatus = 'pending_approval'

    await supabase.from('objective_submissions').update({ status: newSubStatus }).eq('id', subId)
    setSubmissions(p => p.map(s => s.id === subId ? { ...s, status: newSubStatus } : s))
  }


  const FILTERS = [
    { key: 'all',                label: 'All'      },
    { key: 'pending_approval',   label: 'Pending'  },
    { key: 'approved',           label: 'Approved' },
    { key: 'revision_requested', label: 'Revision' },
  ]

  const pendingCount = submissions.filter(s => s.status === 'pending_approval' && s.employee_name !== currentUserName).length

  const filtered = submissions
    .filter(s => filter === 'all' || s.status === filter)
    .filter(s => !search || s.employee_name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      // Own entries always first
      const aOwn = a.employee_name === currentUserName
      const bOwn = b.employee_name === currentUserName
      if (aOwn !== bOwn) return aOwn ? -1 : 1
      // Then alphabetically by name
      const nameCmp = a.employee_name.localeCompare(b.employee_name)
      if (nameCmp !== 0) return nameCmp
      // Multiple submissions from same person: most recent first
      return new Date(b.submitted_at) - new Date(a.submitted_at)
    })

  return (
    <Shell step={0} onEmployeeView={onEmployeeView} onMyObjectivesView={onMyObjectivesView}
      onManagerView={onManagerView} onCoverageView={onCoverageView} activeTab={activeTab} onLogout={onLogout}>
      <div style={{ maxWidth: 740, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={s.heading}>Team Objectives</h1>
          <p style={s.sub}>
            {loading ? 'Loading…' : pendingCount > 0
              ? `${pendingCount} submission${pendingCount !== 1 ? 's' : ''} pending your review`
              : submissions.length === 0 ? 'No submissions yet.' : 'All submissions reviewed.'}
          </p>
        </div>

        {/* Search + filters */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name…"
            style={s.searchInput}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
        </div>

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 64, color: 'var(--tx2)', fontSize: 14 }}>
            {search ? `No results for "${search}"` : 'No submissions here.'}
          </div>
        )}

        {/* Submission cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filtered.map(sub => {
            const isSelf  = sub.employee_name === currentUserName
            const sc      = scoreLabel(sub.portfolio_score, sub.archetype_code)
            const objs    = objMap[sub.id] ?? []
            const isOpen  = expanded[sub.id]

            const approved = objs.filter(o => o.approval_status === 'approved').length
            const revision = objs.filter(o => o.approval_status === 'revision_requested').length
            const rejected = objs.filter(o => o.approval_status === 'rejected').length
            const pending  = objs.filter(o => !o.approval_status).length

            return (
              <div key={sub.id} style={{ ...s.card, borderColor: isSelf ? 'var(--ac)' : 'var(--border)' }}>

                {/* Top row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx)' }}>{sub.employee_name}</span>
                      {isSelf && (
                        <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--ac)', color: '#fff',
                                       borderRadius: 4, padding: '2px 7px', letterSpacing: '0.04em' }}>YO</span>
                      )}
                      {sc && (
                        <span style={{ ...s.badge, color: sc.color, background: sc.color + '15', borderColor: sc.color + '30' }}>
                          {sc.label}
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 6 }}>
                      {[sub.job_title, sub.department, sub.country_label].filter(Boolean).join(' · ')}
                    </p>
                    {/* Per-objective status counts */}
                    {objs.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
                      const ss   = obj.sub_scores ?? {}
                      const SUB  = [
                        { label: 'Relevance',  val: ss.relevance ?? ss.role_fit },
                        { label: 'Impact',     val: ss.impact    ?? ss.business_impact },
                        { label: 'Ambition',   val: ss.ambition },
                        { label: 'Measurable', val: ss.measurability },
                        { label: 'Time-bound', val: ss.time_bound ?? ss.smart },
                      ].filter(d => d.val != null)
                      const krs  = Array.isArray(obj.key_results)    ? obj.key_results    : []
                      const tips = Array.isArray(obj.coaching_tips)  ? obj.coaching_tips  : []
                      const casc = Array.isArray(obj.linked_cascades)? obj.linked_cascades: []

                      return (
                        <div key={obj.id ?? i} style={s.objRow}>

                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ ...s.typeBadge, color: TYPE_COLOR[obj.type] ?? 'var(--ac)' }}>{obj.type}</span>
                            {obj.source === 'delfos' && <span style={s.aiBadge}>✦ AI</span>}
                            {obj.by_when && <span style={{ fontSize: 11, color: 'var(--tx2)' }}>📅 {obj.by_when}</span>}
                            {obj.score != null && obj.type !== 'learning' && (
                              <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700,
                                             fontFamily: 'var(--font-mono)', color: 'var(--tx)' }}>
                                {obj.score}%
                              </span>
                            )}
                          </div>

                          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)', marginBottom: 6 }}>{obj.title}</p>

                          {obj.description && (
                            <p style={{ fontSize: 12, color: 'var(--tx2)', lineHeight: 1.5, marginBottom: 8 }}>{obj.description}</p>
                          )}

                          {obj.metric && (
                            <div style={s.infoRow}>
                              <span style={s.infoLabel}>Metric</span>
                              <span style={s.infoVal}>{obj.metric}</span>
                            </div>
                          )}

                          {obj.value_statement && (
                            <div style={s.infoRow}>
                              <span style={s.infoLabel}>Value</span>
                              <span style={s.infoVal}>{obj.value_statement}</span>
                            </div>
                          )}

                          {krs.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                              <p style={s.sectionLabel}>Key Results</p>
                              {krs.map((kr, j) => (
                                <p key={j} style={{ fontSize: 12, color: 'var(--tx2)', lineHeight: 1.4, marginBottom: 2 }}>
                                  <span style={{ color: 'var(--ac)', fontWeight: 600 }}>·</span> {kr}
                                </p>
                              ))}
                            </div>
                          )}

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

                          {casc.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                              <p style={s.sectionLabel}>Cascade alignment</p>
                              {casc.map((c, j) => (
                                <p key={j} style={{ fontSize: 11, color: 'var(--tx2)', lineHeight: 1.4 }}>· {c}</p>
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

                          {/* Per-objective approval */}
                          <div style={{ display: 'flex', gap: 6, marginTop: 12, paddingTop: 10,
                                        borderTop: '1px solid var(--border)', alignItems: 'center', flexWrap: 'wrap' }}>
                            {obj.approval_status && (
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                                letterSpacing: '0.06em', border: '1px solid',
                                color:       obj.approval_status === 'approved' ? 'var(--ok)' : obj.approval_status === 'rejected' ? 'var(--err)' : 'var(--ac)',
                                background:  obj.approval_status === 'approved' ? 'rgba(16,185,129,0.1)' : obj.approval_status === 'rejected' ? 'rgba(239,68,68,0.1)' : 'rgba(99,102,241,0.1)',
                                borderColor: obj.approval_status === 'approved' ? 'rgba(16,185,129,0.4)' : obj.approval_status === 'rejected' ? 'rgba(239,68,68,0.4)' : 'rgba(99,102,241,0.4)',
                              }}>
                                {obj.approval_status === 'approved' ? '✓ APPROVED' : obj.approval_status === 'rejected' ? '✕ REJECTED' : '↩ REVISION'}
                              </span>
                            )}
                            <button
                              onClick={() => updateObjStatus(sub.id, obj.id, 'approved')}
                              style={{ ...s.objActionBtn, background: obj.approval_status === 'approved' ? 'var(--ok)' : 'var(--card)', color: obj.approval_status === 'approved' ? '#fff' : 'var(--ok)', border: '1px solid var(--ok)' }}>
                              ✓ Approve
                            </button>
                            <button
                              onClick={() => updateObjStatus(sub.id, obj.id, 'revision_requested')}
                              style={{ ...s.objActionBtn, background: obj.approval_status === 'revision_requested' ? 'var(--ac)' : 'var(--card)', color: obj.approval_status === 'revision_requested' ? '#fff' : 'var(--ac)', border: '1px solid var(--ac)' }}>
                              ↩ Revision
                            </button>
                            <button
                              onClick={() => updateObjStatus(sub.id, obj.id, 'rejected')}
                              style={{ ...s.objActionBtn, background: obj.approval_status === 'rejected' ? 'var(--err)' : 'var(--card)', color: obj.approval_status === 'rejected' ? '#fff' : 'var(--err)', border: '1px solid var(--err)' }}>
                              ✕ Reject
                            </button>
                          </div>
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
  searchInput: { width: '100%', background: 'var(--card)', border: '1px solid var(--border)',
                 borderRadius: 8, padding: '9px 14px', fontSize: 14, color: 'var(--tx)',
                 outline: 'none', boxSizing: 'border-box' },
  pill:        { fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 20,
                 border: '1px solid', cursor: 'pointer' },
  card:        { background: 'var(--card)', border: '1px solid', borderRadius: 12, padding: '18px 20px' },
  badge:       { fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5,
                 letterSpacing: '0.06em', border: '1px solid', textTransform: 'uppercase' },
  summary:     { fontSize: 12, color: 'var(--tx2)', lineHeight: 1.6, marginTop: 10, fontStyle: 'italic',
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
  actionBtn:   { fontSize: 12, fontWeight: 600, padding: '7px 16px', borderRadius: 7,
                 border: 'none', cursor: 'pointer', color: '#fff' },
  objActionBtn:{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 6,
                 cursor: 'pointer', transition: 'background 0.15s, color 0.15s' },
  infoRow:     { display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 4 },
  infoLabel:   { fontSize: 10, fontWeight: 700, color: 'var(--tx2)', letterSpacing: '0.06em',
                 textTransform: 'uppercase', flexShrink: 0, paddingTop: 1, minWidth: 56 },
  infoVal:     { fontSize: 12, color: 'var(--tx)', lineHeight: 1.4 },
  sectionLabel:{ fontSize: 10, fontWeight: 700, color: 'var(--tx2)', letterSpacing: '0.06em',
                 textTransform: 'uppercase', marginBottom: 5 },
  subScore:    { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6,
                 padding: '5px 10px', textAlign: 'center', minWidth: 64 },
}
