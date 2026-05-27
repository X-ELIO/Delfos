import { useState } from 'react'
import Shell from '../components/Shell'

export default function ManagerView({ onBack }) {
  const [email, setEmail] = useState('')

  return (
    <Shell step={0}>
      <div style={{ maxWidth: 480, margin: '0 auto', paddingTop: 60, textAlign: 'center' }}>

        <button style={s.backLink} onClick={onBack}>← Back</button>

        <div style={{ fontSize: 32, marginBottom: 16 }}>👔</div>
        <h1 style={s.heading}>Manager View</h1>
        <p style={s.sub}>
          Review your team's submitted objectives and approve or request revisions.
        </p>

        <div style={s.card}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx2)', marginBottom: 8, letterSpacing: '0.08em' }}>
            SIGN IN WITH YOUR WORK EMAIL
          </p>
          <input
            style={s.input}
            type="email"
            placeholder="your.name@x-elio.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <button style={{ ...s.btn, opacity: email.includes('@') ? 1 : 0.4 }}
            disabled={!email.includes('@')}
            onClick={() => alert('Manager authentication via Entra ID is coming soon.')}>
            Sign in →
          </button>
        </div>

        <div style={s.noticeBanner}>
          <p style={{ fontSize: 12, color: 'var(--tx2)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--warn)' }}>Coming soon</strong> — Manager authentication via
            Microsoft Entra ID is pending. Once live, managers will be able to approve, reject, or
            request revisions on team objective submissions directly from this screen.
          </p>
        </div>

      </div>
    </Shell>
  )
}

const s = {
  backLink:     { background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer',
                  fontSize: 13, padding: 0, marginBottom: 24, display: 'block', textAlign: 'left' },
  heading:      { fontSize: 26, fontWeight: 700, color: 'var(--tx)', marginBottom: 10 },
  sub:          { fontSize: 14, color: 'var(--tx2)', lineHeight: 1.6, marginBottom: 28 },
  card:         { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
                  padding: '24px', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 },
  input:        { background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 8,
                  color: 'var(--tx)', fontSize: 14, padding: '10px 14px', outline: 'none',
                  width: '100%', lineHeight: 1.4 },
  btn:          { background: 'var(--ac)', color: '#fff', border: 'none', borderRadius: 8,
                  fontSize: 14, fontWeight: 600, padding: '10px 24px', cursor: 'pointer', width: '100%' },
  noticeBanner: { background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.2)',
                  borderRadius: 10, padding: '14px 16px' },
}
