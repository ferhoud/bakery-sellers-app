import React, { useEffect, useState } from "react"
import { supabase } from "./supabaseClient"
import Schedule from "./components/Schedule"
import Tabs from "./components/Tabs"
import Absences from "./components/Absences"

type SessionLike = any

type Seller = {
  id: string
  name: string
  email: string
  username?: string
  role?: string
}

type TabKey = "planning" | "absences" | "admin"

/** Connexion: accepte soit un identifiant (=> identifiant@vendeuses.local), soit un e-mail */
function AuthView() {
  const [login, setLogin] = useState("") // identifiant OU e-mail
  const [password, setPassword] = useState("") // code ou mot de passe
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const toEmailFromLogin = (v: string) => {
    const t = v.trim()
    // Si l'utilisateur saisit un e-mail, on le prend tel quel
    if (t.includes("@")) return t.toLowerCase()
    // Sinon, on convertit l'identifiant en e-mail technique
    return `${t.toLowerCase()}@vendeuses.local`
  }

  const isEmail = (v: string) => v.trim().includes("@")

  const signInOrUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const raw = login.trim()
    if (!raw) { setError("Renseigne l’identifiant ou l’e-mail."); return }
    if (password.length < 6) { setError("Le mot de passe / code doit contenir au moins 6 caractères."); return }

    setLoading(true)
    const email = toEmailFromLogin(raw)

    // 1) Tenter la connexion
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    // 2) Si échec et QUE l'utilisateur a saisi un identifiant (pas d'@), on l'inscrit automatiquement
    if (signInError && !isEmail(raw)) {
      const { error: signUpError } = await supabase.auth.signUp({ email, password })
      if (signUpError) {
        setError(signUpError.message)
        setLoading(false)
        return
      }
      // Créer/compléter la fiche vendeuse
      try {
        await supabase
          .from("sellers")
          .insert({ name: raw, username: raw.toLowerCase(), email })
          .select()
          .single()
      } catch {}
      // Reconnexion après inscription
      const { error: signInError2 } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError2) {
        setError(signInError2.message)
        setLoading(false)
        return
      }
    } else if (signInError && isEmail(raw)) {
      // En mode e-mail, on n'inscrit pas automatiquement (sécurité)
      setError("E-mail ou mot de passe incorrect.")
      setLoading(false)
      return
    }

    setLoading(false)
  }

  return (
    <div style={{ maxWidth: 380, margin: "64px auto", fontFamily: "system-ui" }}>
      <h1 style={{ marginBottom: 8 }}>Connexion vendeuse — v16</h1>
      <p style={{ marginTop: 0, opacity: 0.8, fontSize: 14 }}>
        Tu peux entrer <strong>soit</strong> un <strong>identifiant</strong> (ex: <code>leila</code>) <strong>soit</strong> un <strong>e-mail</strong>.<br />
        Mot de passe = ton <strong>code</strong> (au moins 6 caractères) ou ton <strong>mot de passe</strong>.
      </p>

      <form onSubmit={signInOrUp} style={{ display: "grid", gap: 8 }}>
        <input
          placeholder="Identifiant (ex: leila) ou e-mail"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
        />
        <input
          type="password"
          placeholder="Code / mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button disabled={loading} type="submit">
          {loading ? "Connexion..." : "Se connecter"}
        </button>
      </form>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <p style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
        Si tu saisis un identifiant sans <code>@</code>, il sera converti en <code>{`{identifiant}@vendeuses.local`}</code>.{" "}
        En mode e-mail, aucune inscription automatique n’est faite.
      </p>
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
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => { sub.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!session) { setCurrentSeller(null); return }
    ;(async () => {
      const email = session.user?.email
      if (!email) return
      const { data: me } = await supabase
        .from("sellers")
        .select("id,name,email,username,role")
        .eq("email", email)
        .single()
      setCurrentSeller(me || null)

      const { data: s } = await supabase
        .from("sellers")
        .select("id,name,email,username,role")
        .order("name", { ascending: true })
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
          <strong>Connecté :</strong> {currentSeller?.name || session.user.email}
          {isAdmin ? " (admin)" : ""}
        </div>
        <button onClick={logout}>Se déconnecter</button>
      </div>

      <Tabs value={tab} onChange={setTab} isAdmin={!!isAdmin} />
      {tab === "planning" && <Schedule isAdmin={!!isAdmin} />}
      {tab === "absences" && <Absences currentSeller={currentSeller} isAdmin={!!isAdmin} sellers={sellers} />}
      {tab === "admin" && (
        <div style={{ marginTop: 16 }}>
          <h2>Admin</h2>
          <p style={{ opacity: 0.8 }}>
            Zone réservée à l’admin (exports d’heures, remplacements, notifications…)
          </p>
        </div>
      )}
    </div>
  )
}
