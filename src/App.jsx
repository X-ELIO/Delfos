import { useState } from 'react'
import { ProfileProvider, useProfile } from './context/ProfileContext'
import ProfileSetup from './screens/ProfileSetup'
import ObjectiveDraft from './screens/ObjectiveDraft'
import Settings from './screens/Settings'
import ManagerView from './screens/ManagerView'
import CoverageView from './screens/CoverageView'
import Shell from './components/Shell'

function Submitted({ objectives }) {
  const { clearProfile } = useProfile()
  const active = (objectives ?? []).filter(o => o.status !== 'ignored')
  return (
    <Shell step={2}>
      <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center', paddingTop: 60 }}>
        <div style={{ fontSize: 48, color: 'var(--ok)', marginBottom: 20 }}>✓</div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--tx)', marginBottom: 10 }}>
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

function Router() {
  const { profile, clearProfile } = useProfile()
  const [screen,  setScreen]  = useState('objectives')
  const [payload, setPayload] = useState(null)

  const goSettings   = () => setScreen('settings')
  const goManager    = () => setScreen('manager')
  const goCoverage   = () => setScreen('coverage')
  const goObjectives = () => setScreen('objectives')

  if (screen === 'settings') return <Settings onBack={goObjectives} />
  if (screen === 'manager')  return <ManagerView onBack={goObjectives} onCoverageView={goCoverage} />
  if (screen === 'coverage') return <CoverageView onBack={goObjectives} onManagerView={goManager} />

  if (!profile) return <ProfileSetup onManagerView={goManager} onCoverageView={goCoverage} />

  if (screen === 'objectives')
    return (
      <ObjectiveDraft
        onNavigate={(to, data = {}) => {
          if (to === 'profile') { clearProfile(); return }
          setPayload(data)
          setScreen(to)
        }}
        onSettings={goSettings}
        onManagerView={goManager}
        onCoverageView={goCoverage}
      />
    )

  if (screen === 'submitted')
    return <Submitted objectives={payload?.objectives} />

  return null
}

export default function App() {
  return (
    <ProfileProvider>
      <Router />
    </ProfileProvider>
  )
}
