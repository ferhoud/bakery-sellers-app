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

/** Écran de connexion identifiant + code */
function AuthView() {
  const [username, setUsername] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const toEmail = (u: string) => `${u.trim().toLowerCase()}@vendeuses.local`

  const signInOrUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const u = username.trim().toLowerCase()
    if (!u) {
      setError("Renseigne l’identifiant.")
      return
    }
    if (code.length < 6) {
      setError("Le code doit contenir au moins 6 caractères.")
      return
    }

    setLoading(true)
    const email = toEmail(u)

    // 1) Essayer de se connecter
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: code })
    if (signInError) {
      // 2) Si échec, créer l’utilisateur (Confirm Email = OFF côté Supabase)
      const { error: signUpError } = await supabase.auth.signUp({ email, password: code })
      if (signUpError) {
        setError(signUpError.message)
        setLoading(false)
        return
      }
      // 3) Créer/compléter la fiche dans sellers (si besoin)
      try {
        await supabase.from("sellers").insert({ name: username, username: u, email }).select().single()
      } catch {}
      // 4) Reconnexion
      const { error: signInError2 } = await supabase.auth.signInWithPassword({ email, password: code })
      if (signInError2) {
        setError(signInError2.message)
        setLoading(false)
        return
      }
    }

    setLoading(false)
  }

  return (
    <div style={{ maxWidth: 380, margin: "64px auto", fontFamily: "system-ui" }}>
      <h1 style={{ marginBottom: 8 }}>Connexion vendeuse</h1>
      <p style={{ marginTop: 0, opacity: 0.8, fontSize: 14 }}>
        Entre ton <strong>identifiant</strong> (ex: <code>leila</code>) et ton <strong>code</strong>.
      </p>

      {/* La ligne qui se coupait chez toi */}
      <form onSubmit={signInOrUp} style={{ display: "grid", gap: 8 }}>
        <input
          placeholder="Identifiant (ex: leila)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="password"
          placeholder="Code (min. 6 caractères)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button disabled={loading} type="submit">
          {loading ? "Connexion..." : "Se connecter"}
        </button>
      </form>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <p style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
        L’identifiant est converti en e-mail technique <code>{`{identifiant}@vendeuses.local`}</code>.
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
    return () => {
      sub.subscription.unsubscribe()
    }
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

  const logout = async () => {
    await supabase.auth.signOut()
  }

  if (!ready) return null

  if (!session) {
    return <AuthView />
  }

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
      {tab === "absences" && (
        <Absences currentSeller={currentSeller} isAdmin={!!isAdmin} sellers={sellers} />
      )}
      {tab === "admin" && (
        <div style={{ marginTop: 16 }}>
          <h2>Admin</h2>
          <p style={{ opacity: 0.8 }}>
            Zone réservée à l’admin. Ici on pourra ajouter : export des heures, gestion des remplacements, notifications, etc.
          </p>
        </div>
      )}
    </div>
  )
}
