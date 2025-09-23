import React, { useEffect, useState } from "react"
import { supabase } from "./supabaseClient"
import Schedule from "./components/Schedule"
import Tabs from "./components/Tabs"
import Absences from "./components/Absences"
import AdminRemplacements from "./components/AdminRemplacements"

type SessionLike = any

type Seller = {
  id: string
  name: string
  email: string
  username?: string
  role?: string
}

type TabKey = "planning" | "absences" | "admin"

/** Connexion: identifiant OU e-mail */
function AuthView() {
  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const toEmailFromLogin = (v: string) => v.includes("@") ? v.trim().toLowerCase() : `${v.trim().toLowerCase()}@vendeuses.local`
  const isEmail = (v: string) => v.trim().includes("@")

  const signInOrUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const raw = login.trim()
    if (!raw) { setError("Renseigne l’identifiant ou l’e-mail."); return }
    if (password.length < 6) { setError("Le mot de passe / code doit contenir au moins 6 caractères."); return }

    setLoading(true)
    const email = toEmailFromLogin(raw)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      // Si identifiant (pas d'@) -> inscription auto, sinon on refuse (email)
      if (!isEmail(raw)) {
        const { error: signUpError } = await supabase.auth.signUp({ email, password })
        if (signUpError) { setError(signUpError.message); setLoading(false); return }
        try {
          await supabase.from("sellers").insert({ name: raw, username: raw.toLowerCase(), email }).select().single()
        } catch {}
        const { error: signInError2 } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError2) { setError(signInError2.message); setLoading(false); return }
      } else {
        setError("E-mail ou mot de passe incorrect.")
        setLoading(false)
        return
      }
    }
    setLoading(false)
  }

  return (
    <div style={{ maxWidth: 380, margin: "64px auto", fontFamily: "system-ui" }}>
      <h1 style={{ marginBottom: 8 }}>Connexion vendeuse — v16</h1>
      <p style={{ marginTop: 0, opacity: 0.8, fontSize: 14 }}>
        Entre un <strong>identifiant</strong> (ex: <code>leila</code>) ou un <strong>e-mail</strong>.
      </p>

      <form onSubmit={signInOrUp} style={{ display: "grid", gap: 8 }}>
        <input placeholder="Identifiant ou e-mail" value={login} onChange={(e) => setLogin(e.target.value)} />
        <input type="password" placeholder="Code / mot de passe (≥ 6)" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button disabled={loading} type="submit">{loading ? "Connexion..." : "Se connecter"}</button>
      </form>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<SessionLike>(null)
  const [ready, setReady] = useState(false)
  const [currentSeller, setCurrentSeller] = useState<Seller | null>(null)
  const [sellers, setSellers] = useState<Seller[]>([])
  const [tab, setTab] = useState<TabKey>("planning")

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (!mounted) return
      setSession(data.session)
      setReady(true)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => { setSession(newSession) })
    return () => { sub.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!session) { setCurrentSeller(null); return }
    ;(async () => {
      const email = session.user?.email
      if (!email) return
      const { data: me } = await supabase.from("sellers").select("id,name,email,username,role").eq("email", email).single()
      setCurrentSeller(me || null)
      const { data: s } = await supabase.from("sellers").select("id,name,email,username,role").order("name", { ascending: true })
      setSellers(s || [])
    })()
  }, [session])

  const isAdmin = currentSeller?.role === "admin"
  const logout = async () => { await supabase.auth.signOut() }

  if (!ready) return null
  if (!session) return <AuthView />

  return (
    <div style={{ padding: 16, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <strong>Connecté :</strong> {currentSeller?.name || session.user.email}{isAdmin ? " (admin)" : ""}
        </div>
        <button onClick={logout}>Se déconnecter</button>
      </div>

      <Tabs value={tab} onChange={setTab} isAdmin={!!isAdmin} />

      {tab === "planning" && <Schedule isAdmin={!!isAdmin} />}
      {tab === "absences" && <Absences currentSeller={currentSeller} isAdmin={!!isAdmin} sellers={sellers} />}
      {tab === "admin" && <AdminRemplacements currentSeller={currentSeller} sellers={sellers} isAdmin={!!isAdmin} />}
    </div>
  )
}
