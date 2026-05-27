import { createContext, useContext, useState } from 'react'

const ProfileContext = createContext(null)

export function ProfileProvider({ children }) {
  const [profile, setProfile] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('delfos_profile')) } catch { return null }
  })

  function saveProfile(data) {
    sessionStorage.setItem('delfos_profile', JSON.stringify(data))
    setProfile(data)
  }

  function clearProfile() {
    sessionStorage.removeItem('delfos_profile')
    setProfile(null)
  }

  return (
    <ProfileContext.Provider value={{ profile, saveProfile, clearProfile }}>
      {children}
    </ProfileContext.Provider>
  )
}

export const useProfile = () => useContext(ProfileContext)
