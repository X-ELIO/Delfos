const STEPS = ['Role', 'Objectives', 'Report']

export default function Shell({ children, step = 0, bonusChip = null, showManagerTab = false }) {
  return (
    <div style={s.root}>
      {/* ── Body ── */}
      <div style={s.body}>
        {/* Top bar */}
        <header style={s.topbar}>
          <div style={s.brand}>
            <span style={s.brandName}>DELFOS</span>
            <span style={s.brandSub}>V03.1.0</span>
          </div>

          <div style={s.topRight}>
            {/* Mode tabs */}
            <div style={s.tabs}>
              <button style={{ ...s.tab, ...s.tabActive }}>Employee</button>
              {showManagerTab && <button style={s.tab}>Manager</button>}
              {showManagerTab && <button style={s.tab}>Coverage</button>}
            </div>

            {/* Step progress */}
            <div style={s.stepper}>
              {STEPS.map((label, i) => (
                <div key={i} style={s.stepWrap}>
                  {i > 0 && <div style={s.stepLine} />}
                  <div style={{
                    ...s.stepDot,
                    background: i <= step ? 'var(--ac)' : 'var(--card-2)',
                    color: i <= step ? '#fff' : 'var(--tx2)',
                  }}>{i + 1}</div>
                  <span style={{
                    ...s.stepLabel,
                    color: i <= step ? 'var(--tx)' : 'var(--tx2)',
                    fontWeight: i === step ? 600 : 400,
                  }}>{label}</span>
                </div>
              ))}
            </div>

            {/* Bonus chip — shown after scoring */}
            {bonusChip && (
              <div style={{
                ...s.bonusChip,
                borderColor: bonusChip.color === 'amber' ? 'var(--warn)' : 'var(--ok)',
                color: bonusChip.color === 'amber' ? 'var(--warn)' : 'var(--ok)',
              }}>
                <span style={s.bonusDot} /> BONUS POTENTIAL {bonusChip.value}%{' '}
                <span style={{
                  background: bonusChip.color === 'amber' ? 'var(--warn)' : 'var(--ok)',
                  color: '#000', borderRadius: 3, padding: '1px 5px', fontSize: 10, fontWeight: 700,
                }}>
                  {bonusChip.color === 'amber' ? 'AMBER' : 'GREEN'}
                </span>
              </div>
            )}
          </div>
        </header>

        {/* Main content */}
        <main style={s.main}>{children}</main>

        {/* Status bar */}
        <footer style={s.footer}>
          Delfos V03 · Objectives require{' '}
          <strong style={{ color: 'var(--tx)', fontWeight: 600 }}>manager approval</strong>
          {' '}· Refinement gate enforced
        </footer>
      </div>
    </div>
  )
}

const s = {
  root:    { display: 'flex', height: '100vh', overflow: 'hidden' },

  body:    { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  topbar:  { height: 48, flexShrink: 0, display: 'flex', alignItems: 'center',
             justifyContent: 'space-between', padding: '0 20px',
             borderBottom: '1px solid var(--border)' },
  brand:   { display: 'flex', flexDirection: 'column', lineHeight: 1 },
  brandName: { fontSize: 13, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--tx)' },
  brandSub:  { fontSize: 9, fontWeight: 500, letterSpacing: '0.08em', color: 'var(--tx2)' },

  topRight: { display: 'flex', alignItems: 'center', gap: 16 },
  tabs:     { display: 'flex', gap: 2, background: 'var(--card)', borderRadius: 8, padding: 3 },
  tab:      { background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer',
              fontSize: 12, fontWeight: 500, padding: '4px 12px', borderRadius: 6 },
  tabActive: { background: 'var(--ac)', color: '#fff' },

  stepper:   { display: 'flex', alignItems: 'center', gap: 0 },
  stepWrap:  { display: 'flex', alignItems: 'center', gap: 5 },
  stepLine:  { width: 20, height: 1, background: 'var(--border)', margin: '0 2px' },
  stepDot:   { width: 20, height: 20, borderRadius: '50%', fontSize: 10, fontWeight: 700,
               display: 'flex', alignItems: 'center', justifyContent: 'center' },
  stepLabel: { fontSize: 12 },

  bonusChip: { display: 'flex', alignItems: 'center', gap: 6, border: '1px solid',
               borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 600 },
  bonusDot:  { width: 6, height: 6, borderRadius: '50%', background: 'currentColor' },

  main:   { flex: 1, overflow: 'auto', padding: '40px 24px' },
  footer: { height: 32, flexShrink: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', borderTop: '1px solid var(--border)',
            fontSize: 11, color: 'var(--tx2)', letterSpacing: '0.01em' },
}
