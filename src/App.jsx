import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { ProfileProvider, useProfile } from './context/ProfileContext'
import ProfileSetup from './screens/ProfileSetup'
import ObjectiveDraft from './screens/ObjectiveDraft'
import Settings from './screens/Settings'
import ManagerView from './screens/ManagerView'
import CoverageView from './screens/CoverageView'
import Shell from './components/Shell'

// ── Login screen ───────────────────────────────────────────────────────────
function LoginScreen() {
  const [loading, setLoading] = useState(false)

  async function signIn() {
    setLoading(true)
    await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'email profile openid',
        redirectTo: `${window.location.origin}${window.location.pathname}`,
      },
    })
    // page redirects — no need to reset loading
  }

  return (
    <div style={ls.root}>
      <div style={ls.card}>
        <div style={ls.brandMark}>D</div>
        <h1 style={ls.heading}>Welcome to Delfos</h1>
        <p style={ls.sub}>
          Sign in with your X-ELIO Microsoft account to set your objectives.
        </p>
        <button onClick={signIn} disabled={loading} style={{ ...ls.btn, opacity: loading ? 0.7 : 1 }}>
          <svg width="16" height="16" viewBox="0 0 21 21" style={{ flexShrink: 0 }}>
            <rect x="1" y="1" width="9" height="9" fill="#f25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
            <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
          </svg>
          {loading ? 'Redirecting…' : 'Sign in with Microsoft'}
        </button>
        <p style={ls.footer}>Delfos V03.1.0 · X-ELIO Internal</p>
      </div>
    </div>
  )
}

const ls = {
  root:      { display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center',
               background: 'var(--bg)' },
  card:      { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16,
               padding: '44px 48px', maxWidth: 380, width: '100%', textAlign: 'center',
               display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 },
  brandMark: { width: 52, height: 52, borderRadius: 14,
               background: 'linear-gradient(135deg, var(--ac), var(--ac2))',
               display: 'grid', placeItems: 'center',
               color: '#fff', fontFamily: 'var(--font-display)', fontStyle: 'italic',
               fontWeight: 700, fontSize: 26, marginBottom: 20 },
  heading:   { fontSize: 22, fontWeight: 400, color: 'var(--tx)', marginBottom: 8, lineHeight: 1.2 },
  sub:       { fontSize: 13, color: 'var(--tx2)', marginBottom: 28, lineHeight: 1.6, maxWidth: 280 },
  btn:       { width: '100%', background: 'var(--ac)', color: '#fff', border: 'none',
               borderRadius: 8, fontSize: 14, fontWeight: 600, padding: '12px 0',
               cursor: 'pointer', display: 'flex', alignItems: 'center',
               justifyContent: 'center', gap: 10 },
  footer:    { fontSize: 11, color: 'var(--tx2)', marginTop: 24,
               fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' },
}

// ── Submitted screen ───────────────────────────────────────────────────────
function Submitted({ objectives }) {
  const { clearProfile } = useProfile()
  const active = (objectives ?? []).filter(o => o.status !== 'ignored')
  return (
    <Shell step={2}>
      <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center', paddingTop: 60 }}>
        <div style={{ fontSize: 48, color: 'var(--ok)', marginBottom: 20 }}>✓</div>
        <h1 style={{ fontSize: 26, fontWeight: 400, color: 'var(--tx)', marginBottom: 10 }}>
          Submitted for approval
        </h1>
        <p style={{ fontSize: 14, color: 'var(--tx2)', marginBottom: 32 }}>
          {active.length} objective{active.length !== 1 ? 's' : ''} sent to your manager for review.
        </p>
        <button onClick={clearProfile}
          style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--tx2)',
                   borderRadius: 8, padding: '9px 20px', cursor: 'pointer', fontSize: 13 }}>
          Start over
        </button>
      </div>
    </Shell>
  )
}

// ── Authenticated router ───────────────────────────────────────────────────
function Router({ onLogout, session }) {
  const { profile, saveProfile, clearProfile } = useProfile()
  const [screen,         setScreen]         = useState('objectives')
  const [payload,        setPayload]        = useState(null)
  const [editingProfile, setEditingProfile] = useState(false)

  const goSettings   = () => setScreen('settings')
  const goManager    = () => setScreen('manager')
  const goCoverage   = () => setScreen('coverage')
  const goObjectives = () => setScreen('objectives')

  async function handleLogout() {
    clearProfile()
    await supabase.auth.signOut()
  }

  const tabsEmployee = { onEmployeeView: null,         onManagerView: goManager, onCoverageView: goCoverage, activeTab: 'employee' }
  const tabsManager  = { onEmployeeView: goObjectives, onManagerView: null,      onCoverageView: goCoverage, activeTab: 'manager'  }
  const tabsCoverage = { onEmployeeView: goObjectives, onManagerView: goManager, onCoverageView: null,       activeTab: 'coverage' }

  if (screen === 'settings') return <Settings onBack={goObjectives} />
  if (screen === 'manager')  return <ManagerView {...tabsManager}  onLogout={handleLogout} />
  if (screen === 'coverage') return <CoverageView {...tabsCoverage} onLogout={handleLogout} />

  if (!profile || editingProfile) return (
    <ProfileSetup
      session={session}
      existingProfile={profile}
      {...tabsEmployee}
      onLogout={handleLogout}
      onSaved={() => setEditingProfile(false)}
    />
  )

  if (screen === 'objectives')
    return (
      <ObjectiveDraft
        onNavigate={(to, data = {}) => {
          if (to === 'profile') { setEditingProfile(true); return }
          setPayload(data)
          setScreen(to)
        }}
        onSettings={goSettings}
        {...tabsEmployee}
        onLogout={handleLogout}
      />
    )

  if (screen === 'submitted')
    return <Submitted objectives={payload?.objectives} />

  return null
}

// ── Root app with auth gate ────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(undefined) // undefined = checking

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setSession(session ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return null // prevents flash before session resolves

  if (!session) return <LoginScreen />

  return (
    <ProfileProvider>
      <Router session={session} />
    </ProfileProvider>
  )
}
