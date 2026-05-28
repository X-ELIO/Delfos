import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useProfile } from '../context/ProfileContext'
import Shell from '../components/Shell'

const ARCHETYPE_META = {
  A: {
    icon: '◆', label: 'Strategic Leadership',
    roles: 'C-Suite, VPs, Directors',
    desc: 'Sets vision, drives transformation, owns P&L',
  },
  B: {
    icon: '⊞', label: 'Operational Leadership',
    roles: 'Heads of Function, Senior Managers',
    desc: 'Translates strategy into execution, manages teams',
  },
  C: {
    icon: '◎', label: 'Senior IC',
    roles: 'Senior Specialists, SMEs',
    desc: 'Deep expertise, mentors, drives functional excellence',
  },
  D: {
    icon: '⬡', label: 'Individual Contributor',
    roles: 'Analysts, Coordinators',
    desc: 'Delivers reliably, grows capabilities',
  },
}

const PEOPLE_KPIS = [
  { key: 'Employee Engagement Score',       target: '≥80 (team-level)' },
  { key: 'Voluntary Turnover Rate',         target: '<10% annualised' },
  { key: 'Regrettable Attrition',           target: '0 losses in direct reports' },
  { key: 'Individual objectives Completion',target: '100% of reports with active individual objectives' },
  { key: 'Internal Mobility',               target: '≥15% roles filled internally' },
  { key: 'Gender Balance — Measures & Improvement',
    target: 'Take appropriate measures — diverse slates, sourcing network expansion, female talent pipeline reinforcement. Target: improve overall gender balance by 2–4 pp by Q4 vs Jan baseline, measured at function/cohort level not per decision, not per hire.' },
]

export default function ProfileSetup({ onManagerView, onCoverageView }) {
  const { saveProfile } = useProfile()

  const [ref, setRef]   = useState({ countries: [], managers: [] })
  const [loading, setLoading] = useState(true)

  const DRAFT_KEY = 'delfos_profile_draft'

  const [form, setForm] = useState(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY)
      if (saved) return JSON.parse(saved)
    } catch (_) {}
    return { full_name: '', job_title: '', department: '', manager_id: '', country_code: '', country_other: '', archetype_code: '', current_priorities: '' }
  })

  useEffect(() => {
    async function load() {
      const [{ data: countries }, { data: managers }] = await Promise.all([
        supabase.from('countries').select('code, label').order('label'),
        supabase.from('users').select('id, full_name, email').eq('is_manager', true).order('full_name'),
      ])
      setRef({ countries: countries ?? [], managers: managers ?? [] })
      setLoading(false)
    }
    load()
  }, [])

  function set(field, value) {
    setForm(f => {
      const next = { ...f, [field]: value }
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(next)) } catch (_) {}
      return next
    })
  }

  function handleSubmit(e) {
    e.preventDefault()
    const manager = ref.managers.find(m => m.id === form.manager_id)
    const country = ref.countries.find(c => c.code === form.country_code)
    const arch    = ARCHETYPE_META[form.archetype_code]
    const countryCode  = form.country_code === 'other' ? 'other' : (country?.code ?? null)
    const countryLabel = form.country_code === 'other' ? (form.country_other.trim() || 'Other') : (country?.label ?? null)
    try { localStorage.removeItem(DRAFT_KEY) } catch (_) {}
    saveProfile({
      full_name:         form.full_name.trim(),
      job_title:         form.job_title.trim(),
      department:        form.department.trim(),
      country_code:      countryCode,
      country_label:     countryLabel,
      archetype_code:    form.archetype_code,
      archetype_label:   arch?.label ?? null,
      has_people_kpis:   ['A', 'B'].includes(form.archetype_code),
      manager_id:        manager?.id ?? null,
      manager_full_name: manager?.full_name ?? null,
      manager_email:     manager?.email ?? null,
      current_priorities: form.current_priorities.trim(),
    })
  }

  const manager    = ref.managers.find(m => m.id === form.manager_id)
  const country    = ref.countries.find(c => c.code === form.country_code)
  const hasPeople  = ['A', 'B'].includes(form.archetype_code)
  const countryOk  = form.country_code && (form.country_code !== 'other' || form.country_other.trim())
  const canSubmit  = form.full_name && form.manager_id && countryOk && form.archetype_code

  if (loading) return (
    <Shell step={0} onManagerView={onManagerView} onCoverageView={onCoverageView}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <p style={{ color: 'var(--tx2)' }}>Cargando…</p>
      </div>
    </Shell>
  )

  return (
    <Shell step={0} onManagerView={onManagerView} onCoverageView={onCoverageView}>
      <div style={s.page}>
        <p style={s.stepBadge}>STEP 01</p>
        <h1 style={s.heading}>Define Your Role</h1>
        <p style={s.sub}>The Engine calibrates scoring relative to your position and our strategic objectives.</p>

        <form onSubmit={handleSubmit} style={s.form}>

          {/* Row 1 */}
          <Field label="Your Name">
            <Input value={form.full_name} onChange={v => set('full_name', v)}
              placeholder="Your full name" required />
          </Field>

          <Field label="Job Title">
            <Input value={form.job_title} onChange={v => set('job_title', v)}
              placeholder="e.g. Senior People Analytics Specialist" />
          </Field>

          <Field label="Department">
            <Input value={form.department} onChange={v => set('department', v)}
              placeholder="e.g. People & Culture" />
          </Field>

          {/* Manager */}
          <Field label="Your Manager / Team Lead">
            <select style={s.input} value={form.manager_id} onChange={e => set('manager_id', e.target.value)}>
              <option value="">— Select your manager or team lead —</option>
              {ref.managers.map(m => (
                <option key={m.id} value={m.id}>{m.full_name}</option>
              ))}
            </select>
            {manager && (
              <p style={s.hint}>Your objectives will be visible to <em>{manager.full_name}</em> after you submit.</p>
            )}
          </Field>

          {/* Country */}
          <Field label="Country / Market">
            <select style={s.input} value={form.country_code} onChange={e => set('country_code', e.target.value)}>
              <option value="">— Select country or market —</option>
              {ref.countries.map(c => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
              <option value="other">Other (specify)</option>
            </select>
            {form.country_code === 'other' && (
              <input style={{ ...s.input, marginTop: 8 }}
                type="text" value={form.country_other}
                onChange={e => set('country_other', e.target.value)}
                placeholder="Enter your country or market" />
            )}
            {country?.code === 'corporate' && (
              <p style={s.hint}>Corporate HQ roles draw their context directly from company-level objectives.</p>
            )}
          </Field>

          {/* Archetype cards */}
          <Field label="Role Archetype">
            <div style={s.archetypeGrid}>
              {Object.entries(ARCHETYPE_META).map(([code, meta]) => {
                const active = form.archetype_code === code
                return (
                  <button key={code} type="button"
                    onClick={() => set('archetype_code', code)}
                    style={{
                      ...s.archetypeCard,
                      border: `1px solid ${active ? 'var(--ac)' : 'var(--border)'}`,
                      background: active ? 'var(--ac-soft)' : 'var(--card)',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 16, color: 'var(--ac)' }}>{meta.icon}</span>
                      <strong style={{ fontSize: 13, color: 'var(--tx)' }}>{meta.label}</strong>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 4 }}>{meta.roles}</p>
                    <p style={{ fontSize: 12, color: 'var(--tx2)' }}>{meta.desc}</p>
                    {['A', 'B'].includes(code) && (
                      <p style={{ fontSize: 11, color: 'var(--warn)', marginTop: 6 }}>
                        Requires engagement &amp; retention KPIs
                      </p>
                    )}
                  </button>
                )
              })}
            </div>
          </Field>

          {/* People KPIs panel */}
          {hasPeople && (
            <div style={s.kpiPanel}>
              <p style={s.kpiTitle}>People Management KPIs — Required</p>
              {PEOPLE_KPIS.map(kpi => (
                <p key={kpi.key} style={s.kpiRow}>
                  <strong style={{ color: 'var(--tx)', fontWeight: 500 }}>{kpi.key}</strong>
                  {' '}— {kpi.target}
                </p>
              ))}
            </div>
          )}

          {/* Current Priorities */}
          <Field label={<>Current Priorities <span style={{ color: 'var(--tx2)', fontWeight: 400 }}>(optional)</span></>}>
            <textarea style={{ ...s.input, resize: 'vertical', minHeight: 72 }}
              value={form.current_priorities}
              onChange={e => set('current_priorities', e.target.value)}
              placeholder="e.g. Launching new HRIS, reducing time-to-hire by 20%" />
          </Field>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="submit" disabled={!canSubmit} style={{
              ...s.btn, opacity: canSubmit ? 1 : 0.4,
            }}>
              Continue →
            </button>
          </div>

        </form>
      </div>
    </Shell>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <label style={{ fontSize: 12, color: 'var(--tx2)', fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder, required }) {
  return (
    <input
      style={s.input} type="text" value={value} required={required}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
    />
  )
}

const s = {
  page:  { maxWidth: 600, margin: '0 auto' },
  stepBadge: { fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--tx2)',
               textTransform: 'uppercase', marginBottom: 10 },
  heading:   { fontSize: 28, fontWeight: 400, color: 'var(--tx)', marginBottom: 8, lineHeight: 1.1 },
  sub:       { fontSize: 13, color: 'var(--tx2)', marginBottom: 28, lineHeight: 1.6 },
  form:      { display: 'flex', flexDirection: 'column', gap: 20 },
  input:     { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
               color: 'var(--tx)', fontSize: 14, padding: '10px 14px', width: '100%',
               outline: 'none', lineHeight: 1.4 },
  hint:      { fontSize: 12, color: 'var(--tx2)', marginTop: 6 },
  archetypeGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  archetypeCard: { textAlign: 'left', borderRadius: 10, padding: '14px 16px', cursor: 'pointer',
                   transition: 'border-color 0.15s', lineHeight: 1.4 },
  kpiPanel:  { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
               padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 7 },
  kpiTitle:  { fontSize: 13, fontWeight: 600, color: 'var(--warn)', marginBottom: 4 },
  kpiRow:    { fontSize: 12, color: 'var(--tx2)', lineHeight: 1.5 },
  btn:       { background: 'var(--ac)', color: '#fff', border: 'none', borderRadius: 8,
               fontSize: 14, fontWeight: 600, padding: '10px 24px', cursor: 'pointer' },
}
