import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import Shell from '../components/Shell'
import { ARCHETYPE_THRESHOLDS } from '../lib/constants'

// ── Helpers ────────────────────────────────────────────────────────────────
function pct(n, total) {
  return total === 0 ? 0 : Math.round((n / total) * 100)
}

function scoreColor(score, archetype_code) {
  const t = ARCHETYPE_THRESHOLDS[archetype_code] ?? { min: 60, green: 75 }
  if (score == null) return 'var(--tx2)'
  if (score >= t.green) return 'var(--ok)'
  if (score >= t.min)   return 'var(--warn)'
  return 'var(--err)'
}

function classifyScore(score, archetype_code) {
  const t = ARCHETYPE_THRESHOLDS[archetype_code] ?? { min: 60, green: 75 }
  if (score == null) return 'unknown'
  if (score >= t.green) return 'green'
  if (score >= t.min)   return 'amber'
  return 'red'
}

function avg(arr) {
  return arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null
}

const STATUS_META = {
  pending_approval:    { label: 'Pending approval',    color: 'var(--warn)' },
  approved:            { label: 'Approved',             color: 'var(--ok)'   },
  revision_requested:  { label: 'Revision requested',  color: 'var(--ac)'   },
  rejected:            { label: 'Rejected',             color: 'var(--err)'  },
}

const ARCHETYPE_LABELS = {
  A: 'Strategic Leadership',
  B: 'Operational Leadership',
  C: 'Senior IC',
  D: 'Individual Contributor',
}

// ── Sub-components ─────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = 'var(--tx)' }) {
  return (
    <div style={s.statCard}>
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--tx2)',
                  textTransform: 'uppercase', marginBottom: 8 }}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1, marginBottom: sub ? 6 : 0 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--tx2)' }}>{sub}</p>}
    </div>
  )
}

function BarRow({ label, count, total, color }) {
  const p = pct(count, total)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--tx2)' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{count} <span style={{ fontWeight: 400, color: 'var(--tx2)' }}>({p}%)</span></span>
      </div>
      <div style={{ height: 5, background: 'var(--card-2)', borderRadius: 3 }}>
        <div style={{ width: `${p}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
    </div>
  )
}

function StatusPill({ status }) {
  const m = STATUS_META[status] ?? { label: status, color: 'var(--tx2)' }
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: m.color,
                   background: `${m.color}18`, border: `1px solid ${m.color}40`,
                   borderRadius: 4, padding: '2px 7px', letterSpacing: '0.04em' }}>
      {m.label.toUpperCase()}
    </span>
  )
}

// ── CSV export ─────────────────────────────────────────────────────────────
function downloadCsv(submissions) {
  const headers = ['Employee', 'Job Title', 'Department', 'Archetype', 'Country', 'Score', 'Status', 'Submitted At', 'AI Objectives', 'Manual Objectives', 'Improved']
  const rows = submissions.map(s => [
    s.employee_name ?? '',
    s.job_title ?? '',
    s.department ?? '',
    s.archetype_code ?? '',
    s.country_label ?? '',
    s.portfolio_score != null ? s.portfolio_score : '',
    s.status ?? '',
    s.submitted_at ? new Date(s.submitted_at).toISOString().slice(0, 10) : '',
    s.objectives_ai ?? 0,
    s.objectives_manual ?? 0,
    s.objectives_improved ?? 0,
  ])
  const csv = [headers, ...rows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: `delfos_coverage_${new Date().toISOString().slice(0,10)}.csv` })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Main component ─────────────────────────────────────────────────────────
// ── Hierarchy helpers ──────────────────────────────────────────────────────
function buildOrgMap(orgChart) {
  const map = {}
  for (const emp of orgChart) {
    const mgr = emp.manager_name ?? '__root__'
    if (!map[mgr]) map[mgr] = []
    map[mgr].push(emp)
  }
  return map
}

function getSubtree(name, map, visited = new Set()) {
  if (visited.has(name)) return []
  visited.add(name)
  const direct = map[name] ?? []
  const all = [...direct]
  for (const p of direct) all.push(...getSubtree(p.full_name, map, visited))
  return all
}

export default function CoverageView({ onEmployeeView, onManagerView, activeTab, onLogout }) {
  const [loading,          setLoading]          = useState(true)
  const [submissions,      setSubmissions]      = useState([])
  const [objBySubmission,  setObjBySubmission]  = useState({})
  const [orgChart,         setOrgChart]         = useState([])
  const [lastRefresh,      setLastRefresh]      = useState(null)
  const [autoRefresh,      setAutoRefresh]      = useState(false)
  const autoRefreshRef = useRef(null)

  async function load() {
    setLoading(true)
    const [{ data: subs }, { data: objs }, { data: org }] = await Promise.all([
      supabase.from('objective_submissions').select('*').order('submitted_at', { ascending: false }),
      supabase.from('submitted_objectives').select('submission_id, type, source'),
      supabase.from('org_chart').select('full_name, email, manager_name, department, job_title, direct_reports'),
    ])
    setSubmissions(subs ?? [])
    setOrgChart(org ?? [])
    const grouped = {}
    for (const o of (objs ?? [])) {
      if (!grouped[o.submission_id]) grouped[o.submission_id] = []
      grouped[o.submission_id].push(o)
    }
    setObjBySubmission(grouped)
    setLastRefresh(new Date())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(load, 30000)
    } else {
      clearInterval(autoRefreshRef.current)
    }
    return () => clearInterval(autoRefreshRef.current)
  }, [autoRefresh])

  // ── C-suite coverage ───────────────────────────────────────────────────
  const csuiteLeaders = orgChart.filter(e => e.department?.toLowerCase() === 'c-suite')
  const orgMap        = buildOrgMap(orgChart)
  const submittedNames = new Set(submissions.map(s => s.employee_name))

  const csuiteAreas = csuiteLeaders.map(leader => {
    const subtree   = getSubtree(leader.full_name, orgMap)
    const total     = subtree.length
    const submitted = subtree.filter(e => submittedNames.has(e.full_name)).length
    const pctVal    = total > 0 ? Math.round((submitted / total) * 100) : 0
    return { leader, total, submitted, pct: pctVal }
  }).sort((a, b) => b.pct - a.pct)

  // ── Aggregates ─────────────────────────────────────────────────────────
  const total = submissions.length

  const byStatus = Object.fromEntries(
    Object.keys(STATUS_META).map(k => [k, submissions.filter(s => s.status === k).length])
  )

  const scoreClasses = submissions.reduce((acc, s) => {
    const cls = classifyScore(s.portfolio_score, s.archetype_code)
    acc[cls] = (acc[cls] ?? 0) + 1
    return acc
  }, {})

  const scores        = submissions.map(s => s.portfolio_score).filter(v => v != null)
  const portfolioAvg  = avg(scores)

  // AI Act
  const totalAi       = submissions.reduce((s, sub) => s + (sub.objectives_ai       ?? 0), 0)
  const totalManual   = submissions.reduce((s, sub) => s + (sub.objectives_manual   ?? 0), 0)
  const totalImproved = submissions.reduce((s, sub) => s + (sub.objectives_improved ?? 0), 0)
  const totalIgnored  = submissions.reduce((s, sub) => s + (sub.objectives_ignored  ?? 0), 0)
  const totalObjs     = totalAi + totalManual

  // Team compliance (A/B)
  const managerSubs        = submissions.filter(s => s.archetype_code === 'A' || s.archetype_code === 'B')
  const managerWithTeam    = managerSubs.filter(s =>
    (objBySubmission[s.id] ?? []).some(o => o.type === 'team')
  )
  const teamCompliancePct  = managerSubs.length ? pct(managerWithTeam.length, managerSubs.length) : null

  // By country
  const byCountry = submissions.reduce((acc, s) => {
    const k = s.country_label ?? 'Unknown'
    if (!acc[k]) acc[k] = { count: 0, scores: [] }
    acc[k].count++
    if (s.portfolio_score != null) acc[k].scores.push(s.portfolio_score)
    return acc
  }, {})

  // By archetype
  const byArchetype = submissions.reduce((acc, s) => {
    const k = s.archetype_code ?? '?'
    if (!acc[k]) acc[k] = { count: 0, scores: [] }
    acc[k].count++
    if (s.portfolio_score != null) acc[k].scores.push(s.portfolio_score)
    return acc
  }, {})

  return (
    <Shell step={0} onEmployeeView={onEmployeeView} onManagerView={onManagerView} activeTab={activeTab} onLogout={onLogout}>
      <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Header */}
        <div>
          <h1 style={s.heading}>Coverage Dashboard</h1>
          <p style={s.sub}>2026 Objectives cycle · Real-time submission tracking</p>
        </div>

        {/* C-suite area coverage */}
        {csuiteAreas.length > 0 && (
          <section>
            <p style={s.sectionTitle}>Coverage by C-Suite Area</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {csuiteAreas.map(({ leader, total, submitted, pct: p }) => (
                <div key={leader.full_name} style={s.areaCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)' }}>{leader.full_name}</span>
                      <span style={{ fontSize: 11, color: 'var(--tx2)', marginLeft: 8 }}>{leader.job_title}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12, color: 'var(--tx2)' }}>{submitted} / {total}</span>
                      <span style={{
                        fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-mono)',
                        color: p >= 80 ? 'var(--ok)' : p >= 50 ? 'var(--warn)' : 'var(--err)',
                        minWidth: 40, textAlign: 'right',
                      }}>{p}%</span>
                    </div>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--card-2)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 3,
                      width: `${p}%`,
                      background: p >= 80 ? 'var(--ok)' : p >= 50 ? 'var(--warn)' : 'var(--err)',
                      transition: 'width 0.6s ease',
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}><div></div>
          <div style={{ textAlign: 'right' }}>
            {lastRefresh && (
              <p style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 6 }}>
                Last refresh: {lastRefresh.toLocaleTimeString()}
              </p>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {submissions.length > 0 && (
                <button style={s.refreshBtn} onClick={() => downloadCsv(submissions)}>
                  ⬇ Export CSV
                </button>
              )}
              <button style={s.refreshBtn} onClick={load} disabled={loading}>
                {loading ? '⏳ Loading…' : '↺ Refresh'}
              </button>
              <button
                onClick={() => setAutoRefresh(a => !a)}
                style={{ ...s.refreshBtn, borderColor: autoRefresh ? 'var(--ok)' : 'var(--border)',
                         color: autoRefresh ? 'var(--ok)' : 'var(--tx2)' }}>
                {autoRefresh ? '● Auto 30s' : '○ Auto'}
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
            <p style={{ color: 'var(--tx2)', fontSize: 14 }}>Loading coverage data…</p>
          </div>
        ) : total === 0 ? (
          <div style={s.emptyState}>
            <p style={{ fontSize: 32, marginBottom: 12 }}>📊</p>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--tx)', marginBottom: 6 }}>No submissions yet</p>
            <p style={{ fontSize: 13, color: 'var(--tx2)' }}>
              Coverage data will appear here once employees start submitting their objectives.
            </p>
          </div>
        ) : (
          <>
            {/* ── Top stat cards ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <StatCard label="Total submissions" value={total} />
              <StatCard
                label="Pending approval"
                value={byStatus.pending_approval}
                sub={`${pct(byStatus.pending_approval, total)}% of total`}
                color="var(--warn)"
              />
              <StatCard
                label="Approved"
                value={byStatus.approved}
                sub={`${pct(byStatus.approved, total)}% of total`}
                color="var(--ok)"
              />
              <StatCard
                label="Avg bonus potential"
                value={portfolioAvg != null ? `${portfolioAvg}%` : '—'}
                color={portfolioAvg != null ? (portfolioAvg >= 70 ? 'var(--ok)' : 'var(--warn)') : 'var(--tx2)'}
              />
            </div>

            {/* ── Score distribution + Approval status ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

              <div style={s.card}>
                <p style={s.cardTitle}>Score Distribution</p>
                <p style={s.cardSub}>Categorised per archetype threshold</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
                  <BarRow label="Green — high ambition"      count={scoreClasses.green   ?? 0} total={total} color="var(--ok)"   />
                  <BarRow label="Amber — meets threshold"    count={scoreClasses.amber   ?? 0} total={total} color="var(--warn)" />
                  <BarRow label="Red — below threshold"      count={scoreClasses.red     ?? 0} total={total} color="var(--err)"  />
                  {(scoreClasses.unknown ?? 0) > 0 && (
                    <BarRow label="Unscored"                 count={scoreClasses.unknown ?? 0} total={total} color="var(--tx2)"  />
                  )}
                </div>
              </div>

              <div style={s.card}>
                <p style={s.cardTitle}>Approval Status</p>
                <p style={s.cardSub}>Workflow stage breakdown</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                  {Object.entries(STATUS_META).map(([key, meta]) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: 'var(--tx2)' }}>{meta.label}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: 'var(--tx2)' }}>{pct(byStatus[key] ?? 0, total)}%</span>
                        <span style={{ fontSize: 15, fontWeight: 800, color: meta.color, width: 28, textAlign: 'right' }}>
                          {byStatus[key] ?? 0}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── AI Act — Art. 14 ── */}
            <div style={s.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <div>
                  <p style={s.cardTitle}>⚡ AI Act — Art. 14 Human Oversight</p>
                  <p style={s.cardSub}>AI vs human authorship across all submitted objectives</p>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ac)', letterSpacing: '0.08em',
                               background: 'rgba(99,91,255,0.1)', border: '1px solid rgba(99,91,255,0.25)',
                               borderRadius: 4, padding: '3px 8px' }}>
                  Model: claude-haiku-4-5-20251001
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 14 }}>
                {[
                  { label: 'Total objectives',  value: totalObjs,     color: 'var(--tx)' },
                  { label: 'AI-generated',       value: `${totalAi} (${totalObjs ? pct(totalAi, totalObjs) : 0}%)`,       color: 'var(--ac)'   },
                  { label: 'Human-written',      value: `${totalManual} (${totalObjs ? pct(totalManual, totalObjs) : 0}%)`,  color: 'var(--ok)'   },
                  { label: 'AI then improved',   value: totalImproved, color: 'var(--warn)' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={s.miniStat}>
                    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--tx2)',
                                textTransform: 'uppercase', marginBottom: 6 }}>{label}</p>
                    <p style={{ fontSize: 20, fontWeight: 800, color }}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Team objective compliance */}
              {managerSubs.length > 0 && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)',
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)', marginBottom: 3 }}>
                      Team objective compliance — Archetype A/B
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--tx2)' }}>
                      People managers with a mandatory Team objective in their portfolio
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{
                      fontSize: 24, fontWeight: 800, lineHeight: 1,
                      color: teamCompliancePct === 100 ? 'var(--ok)' : teamCompliancePct >= 80 ? 'var(--warn)' : 'var(--err)',
                    }}>
                      {managerWithTeam.length} / {managerSubs.length}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--tx2)', marginTop: 2 }}>{teamCompliancePct}% compliant</p>
                  </div>
                </div>
              )}

              {totalIgnored > 0 && (
                <p style={{ fontSize: 11, color: 'var(--tx2)', marginTop: 12 }}>
                  {totalIgnored} objective{totalIgnored !== 1 ? 's' : ''} ignored by employees (not submitted)
                </p>
              )}
            </div>

            {/* ── Country + Archetype ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

              <div style={s.card}>
                <p style={s.cardTitle}>By Country / Market</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                  {Object.entries(byCountry)
                    .sort((a, b) => b[1].count - a[1].count)
                    .map(([country, data]) => {
                      const a = avg(data.scores)
                      return (
                        <div key={country} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, color: 'var(--tx2)', flex: 1, minWidth: 0,
                                         overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {country}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--tx2)', flexShrink: 0 }}>
                            {data.count} sub{data.count !== 1 ? 's' : ''}
                          </span>
                          {a != null && (
                            <span style={{ fontSize: 12, fontWeight: 700, flexShrink: 0, width: 44, textAlign: 'right',
                                           color: a >= 70 ? 'var(--ok)' : 'var(--warn)' }}>
                              {a}%
                            </span>
                          )}
                        </div>
                      )
                    })}
                </div>
              </div>

              <div style={s.card}>
                <p style={s.cardTitle}>By Archetype</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                  {['A', 'B', 'C', 'D'].map(code => {
                    const data = byArchetype[code]
                    if (!data) return null
                    const a = avg(data.scores)
                    const t = ARCHETYPE_THRESHOLDS[code]
                    const col = a != null
                      ? (a >= t.green ? 'var(--ok)' : a >= t.min ? 'var(--warn)' : 'var(--err)')
                      : 'var(--tx2)'
                    return (
                      <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ac)', width: 16, flexShrink: 0 }}>{code}</span>
                        <span style={{ fontSize: 12, color: 'var(--tx2)', flex: 1 }}>{ARCHETYPE_LABELS[code]}</span>
                        <span style={{ fontSize: 11, color: 'var(--tx2)', flexShrink: 0 }}>{data.count}</span>
                        {a != null && (
                          <span style={{ fontSize: 12, fontWeight: 700, color: col, width: 44, textAlign: 'right', flexShrink: 0 }}>
                            {a}%
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* ── Recent submissions table ── */}
            <div style={s.card}>
              <p style={s.cardTitle}>Recent Submissions</p>

              <div style={{ marginTop: 12, overflowX: 'auto' }}>
                <div style={{ ...s.tableHead,
                              display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr 0.8fr 1.4fr 0.8fr' }}>
                  <span>Employee</span>
                  <span>Archetype</span>
                  <span>Country</span>
                  <span>Score</span>
                  <span>Status</span>
                  <span>Date</span>
                </div>

                {submissions.slice(0, 15).map(sub => {
                  const col = scoreColor(sub.portfolio_score, sub.archetype_code)
                  return (
                    <div key={sub.id} style={{ ...s.tableRow,
                                               display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr 0.8fr 1.4fr 0.8fr',
                                               alignItems: 'center' }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sub.employee_name}
                        </p>
                        {sub.job_title && (
                          <p style={{ fontSize: 11, color: 'var(--tx2)', marginTop: 1,
                                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {sub.job_title}
                          </p>
                        )}
                      </div>
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ac)' }}>{sub.archetype_code}</span>
                        {sub.archetype_label && (
                          <p style={{ fontSize: 10, color: 'var(--tx2)', marginTop: 1 }}>{sub.archetype_label}</p>
                        )}
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--tx2)', overflow: 'hidden',
                                     textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {sub.country_label ?? '—'}
                      </span>
                      <span style={{ fontSize: 15, fontWeight: 800, color: col }}>
                        {sub.portfolio_score != null ? `${sub.portfolio_score}%` : '—'}
                      </span>
                      <StatusPill status={sub.status} />
                      <span style={{ fontSize: 11, color: 'var(--tx2)' }}>
                        {new Date(sub.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  )
                })}

                {submissions.length > 15 && (
                  <p style={{ fontSize: 12, color: 'var(--tx2)', textAlign: 'center',
                              padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                    Showing 15 of {submissions.length} submissions
                  </p>
                )}
              </div>
            </div>

            {/* Footer */}
            <p style={{ fontSize: 11, color: 'var(--tx2)', fontStyle: 'italic', paddingBottom: 32 }}>
              P&amp;C Coverage View · Delfos V03.1.0 · AI Act Art. 12 record keeping active
            </p>
          </>
        )}

      </div>
    </Shell>
  )
}

const s = {
  backLink:     { background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer',
                  fontSize: 13, padding: 0, marginBottom: 10, display: 'block' },
  heading:      { fontSize: 26, fontWeight: 700, color: 'var(--tx)', marginBottom: 6 },
  sub:          { fontSize: 13, color: 'var(--tx2)' },
  sectionTitle: { fontSize: 12, fontWeight: 700, color: 'var(--tx)', marginBottom: 10,
                  letterSpacing: '0.04em', textTransform: 'uppercase' },
  areaCard:     { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
                  padding: '14px 16px' },
  refreshBtn:  { background: 'none', border: '1px solid var(--border)', color: 'var(--tx2)',
                 borderRadius: 7, fontSize: 12, padding: '6px 14px', cursor: 'pointer' },
  emptyState:  { textAlign: 'center', padding: '60px 0', background: 'var(--card)',
                 border: '1px solid var(--border)', borderRadius: 12 },
  statCard:    { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
                 padding: '16px 18px' },
  miniStat:    { background: 'var(--card-2)', borderRadius: 8, padding: '12px 14px' },
  card:        { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
                 padding: '18px 20px' },
  cardTitle:   { fontSize: 13, fontWeight: 700, color: 'var(--tx)', marginBottom: 2 },
  cardSub:     { fontSize: 11, color: 'var(--tx2)' },
  tableHead:   { padding: '8px 12px', background: 'var(--card-2)',
                 borderRadius: '6px 6px 0 0', fontSize: 10, fontWeight: 700,
                 letterSpacing: '0.08em', color: 'var(--tx2)', gap: 12 },
  tableRow:    { padding: '10px 12px', borderBottom: '1px solid var(--border)', gap: 12 },
}
