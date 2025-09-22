
import React, { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { Session } from '@supabase/supabase-js'
import Dashboard from './components/Dashboard'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  if (!session) {
    return <AuthView />
  }
  return <Dashboard />
}

function AuthView() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError(null)
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div style={{ maxWidth: 360, margin: '64px auto', fontFamily: 'system-ui' }}>
      <h1 style={{ marginBottom: 16 }}>Connexion vendeuse</h1>
      <form onSubmit={signIn} style={{ display: 'grid', gap: 8 }}>
        <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <input type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} />
        <button disabled={loading} type="submit">Se connecter</button>
        <button disabled={loading} onClick={signUp}>Créer un compte</button>
      </form>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
    </div>
  )
}
