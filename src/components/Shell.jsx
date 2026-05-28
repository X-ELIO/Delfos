import { useState } from 'react'

const STEPS = ['Role', 'Objectives', 'Report']

function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    try { return document.documentElement.getAttribute('data-theme') || 'dark' } catch { return 'dark' }
  })
  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    try { localStorage.setItem('eli-theme', next) } catch {}
  }
  return (
    <button onClick={toggle} style={s.themeBtn} title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}>
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
          <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  )
}

export default function Shell({ children, step = 0, bonusChip = null, onSettings = null, onManagerView = null, onCoverageView = null }) {
  return (
    <div style={s.root}>
      <div style={s.body}>
        {/* Top bar */}
        <header style={s.topbar}>
          <div style={s.brand}>
            <div style={s.brandMark}>D</div>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
              <span style={s.brandName}>DELFOS</span>
              <span style={s.brandSub}>V03.1.0</span>
            </div>
          </div>

          <div style={s.topRight}>
            {/* Mode tabs */}
            <div style={s.tabs}>
              <button style={{ ...s.tab, ...s.tabActive }}>Employee</button>
              {onManagerView && (
                <button style={s.tab} onClick={onManagerView}>Manager</button>
              )}
              {onCoverageView && (
                <button style={s.tab} onClick={onCoverageView}>Coverage</button>
              )}
            </div>

            {/* Step progress */}
            <div style={s.stepper}>
              {STEPS.map((label, i) => (
                <div key={i} style={s.stepWrap}>
                  {i > 0 && <div style={s.stepLine} />}
                  <div style={{
                    ...s.stepDot,
                    background: i <= step ? 'var(--ac)' : 'var(--card-2)',
                    color:      i <= step ? '#fff'      : 'var(--tx2)',
                  }}>{i + 1}</div>
                  <span style={{
                    ...s.stepLabel,
                    color:      i <= step ? 'var(--tx)'  : 'var(--tx2)',
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
                color:       bonusChip.color === 'amber' ? 'var(--warn)' : 'var(--ok)',
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

            {/* Theme toggle */}
            <ThemeToggle />

            {/* Settings gear */}
            {onSettings && (
              <button onClick={onSettings} style={s.gearBtn} title="Settings">⚙</button>
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
  root:      { display: 'flex', height: '100vh', overflow: 'hidden' },
  body:      { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  topbar:    { height: 50, flexShrink: 0, display: 'flex', alignItems: 'center',
               justifyContent: 'space-between', padding: '0 20px',
               borderBottom: '1px solid var(--border)', background: 'var(--card)' },

  brand:     { display: 'flex', alignItems: 'center', gap: 10 },
  brandMark: { width: 26, height: 26, borderRadius: 7, display: 'grid', placeItems: 'center',
               background: 'linear-gradient(135deg, var(--ac), var(--ac2))',
               color: '#fff', fontFamily: 'var(--font-display)', fontStyle: 'italic',
               fontWeight: 700, fontSize: 13, flexShrink: 0 },
  brandName: { fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--tx)',
               fontFamily: 'var(--font-sans)' },
  brandSub:  { fontSize: 9, fontWeight: 400, letterSpacing: '0.06em', color: 'var(--tx2)',
               fontFamily: 'var(--font-mono)' },

  topRight:  { display: 'flex', alignItems: 'center', gap: 12 },
  tabs:      { display: 'flex', gap: 2, background: 'var(--card-2)', borderRadius: 8, padding: 3 },
  tab:       { background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer',
               fontSize: 12, fontWeight: 500, padding: '4px 12px', borderRadius: 6,
               transition: 'background 0.15s, color 0.15s' },
  tabActive: { background: 'var(--ac)', color: '#fff' },

  stepper:   { display: 'flex', alignItems: 'center', gap: 0 },
  stepWrap:  { display: 'flex', alignItems: 'center', gap: 5 },
  stepLine:  { width: 18, height: 1, background: 'var(--border-mid)', margin: '0 2px' },
  stepDot:   { width: 20, height: 20, borderRadius: '50%', fontSize: 10, fontWeight: 700,
               display: 'flex', alignItems: 'center', justifyContent: 'center',
               fontFamily: 'var(--font-mono)' },
  stepLabel: { fontSize: 12 },

  bonusChip: { display: 'flex', alignItems: 'center', gap: 6, border: '1px solid',
               borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 600 },
  bonusDot:  { width: 6, height: 6, borderRadius: '50%', background: 'currentColor' },

  themeBtn:  { background: 'none', border: '1px solid var(--border-mid)', color: 'var(--tx2)',
               cursor: 'pointer', padding: '5px 7px', borderRadius: 7,
               display: 'flex', alignItems: 'center', transition: 'border-color 0.15s, color 0.15s' },
  gearBtn:   { background: 'none', border: '1px solid var(--border-mid)', color: 'var(--tx2)',
               fontSize: 14, cursor: 'pointer', padding: '4px 7px', borderRadius: 7,
               lineHeight: 1, transition: 'color 0.15s' },

  main:      { flex: 1, overflow: 'auto', padding: '36px 24px' },
  footer:    { height: 30, flexShrink: 0, display: 'flex', alignItems: 'center',
               justifyContent: 'center', borderTop: '1px solid var(--border)',
               background: 'var(--card)', fontSize: 11, color: 'var(--tx2)',
               letterSpacing: '0.01em', fontFamily: 'var(--font-mono)' },
}
