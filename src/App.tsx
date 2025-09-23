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

  const toEmailFromLogin = (v: string) =>
    v.includes("@") ? v.trim().toLowerCase() : `${v.trim().toLowerCase()}@vendeuses.local`
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
    <div style={{ maxWidth: 420, margin: "64px auto", fontFamily: "system-ui" }}>
      <h1 style={{ marginBottom: 8 }}>Connexion vendeuse</h1>
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

  // Toasts notifications (in-app)
  const [toasts, setToasts] = useState<{ id: string; title?: string; body?: string }[]>([])
  const pushToast = (t: { id: string; title?: string; body?: string }) => {
    setToasts((prev) => [...prev, t])
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 6000)
  }

  // Déconnexion FORTE (efface session + caches + SW)
  const hardLogout = async () => {
    try {
      await supabase.auth.signOut({ scope: "global" } as any).catch(() => supabase.auth.signOut())
    } catch {}
    try {
      try { localStorage.clear() } catch {}
      try { sessionStorage.clear() } catch {}
      if ("caches" in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((r) => r.unregister()))
      }
    } finally {
      location.href = location.origin
    }
  }

  // ?logout=1 -> déconnexion forte
  useEffect(() => {
    const p = new URLSearchParams(location.search)
    if (p.get("logout") === "1") { hardLogout() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Session
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

  // Profil + auto-création seller si absent + liste vendeuses
  useEffect(() => {
    if (!session) { setCurrentSeller(null); return }
    ;(async () => {
      const email = session.user?.email
      if (!email) return

      // 1) Tenter de charger la fiche seller
      let { data: me } = await supabase
        .from("sellers")
        .select("id,name,email,username,role")
        .eq("email", email)
        .maybeSingle()

      // 2) Si absente -> la créer automatiquement
      if (!me) {
        const displayName = (email.split("@")[0] || "Vendeuse").replace(/[._-]/g, " ")
        try {
          const { data: created } = await supabase
            .from("sellers")
            .insert({ name: displayName, username: email.split("@")[0].toLowerCase(), email })
            .select("id,name,email,username,role")
            .single()
          me = created || null
        } catch {
          // Si la création échoue (contrainte), on réessaie un select strict
          const { data: me2 } = await supabase
            .from("sellers")
            .select("id,name,email,username,role")
            .eq("email", email)
            .single()
          me = me2 || null
        }
      }

      setCurrentSeller(me || null)

      // 3) Charger la liste complète (pour notifications & écrans)
      const { data: s } = await supabase
        .from("sellers")
        .select("id,name,email,username,role")
        .order("name", { ascending: true })
      setSellers(s || [])
    })()
  }, [session])

  // 🔔 Realtime notifications -> toasts
  useEffect(() => {
    if (!currentSeller?.id) return
    const ch = supabase
      .channel("notif-" + currentSeller.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (payload) => {
        const n: any = payload.new
        if (n?.recipient_id === currentSeller.id) {
          pushToast({ id: n.id, title: n.title || "Notification", body: n.body })
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [currentSeller?.id])

  const isAdmin = currentSeller?.role === "admin"

  if (!ready) return null
  if (!session) return <AuthView />

  return (
    <div style={{ padding: 16, fontFamily: "system-ui" }}>
      {/* Barre du haut */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
        <div>
          <strong>Connecté :</strong> {currentSeller?.name || session.user.email}{isAdmin ? " (admin)" : ""}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={async () => { await supabase.auth.signOut(); location.reload() }}>
            Se déconnecter
          </button>
          <button onClick={hardLogout} title="Efface aussi le cache/PWA si besoin">
            Changer de compte
          </button>
        </div>
      </div>

      {/* Onglets */}
      <Tabs value={tab} onChange={setTab} isAdmin={!!isAdmin} />

      {/* Vues */}
      {tab === "planning" && <Schedule isAdmin={!!isAdmin} />}
      {tab === "absences" && <Absences currentSeller={currentSeller} isAdmin={!!isAdmin} sellers={sellers} />}
      {tab === "admin" && <AdminRemplacements currentSeller={currentSeller} sellers={sellers} isAdmin={!!isAdmin} />}

      {/* 🔔 Toasts */}
      <div style={{ position: "fixed", right: 12, bottom: 12, display: "grid", gap: 8, zIndex: 9999, maxWidth: 340 }}>
        {toasts.map((t) => (
          <div key={t.id} style={{ background: "#333", color: "#fff", padding: "10px 12px", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.25)" }}>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>{t.title || "Notification"}</div>
            {t.body && <div style={{ opacity: 0.9, fontSize: 14 }}>{t.body}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
