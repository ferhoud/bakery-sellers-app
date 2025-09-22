import React, { useEffect, useState } from "react"
import { supabase } from "./supabaseClient"
import Schedule from "./components/Schedule"

type SessionLike = any

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
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: code,
    })

    // 2) Si échec, créer l’utilisateur (Confirm Email = OFF côté Supabase)
    if (signInError) {
      const { error: signUpError } = await supabase.auth.signUp({ email, password: code })
      if (signUpError) {
        setError(signUpError.message)
        setLoading(false)
        return
      }

      // 3) Créer/compléter la fiche dans sellers (si besoin)
      try {
        await supabase
          .from("sellers")
          .insert({ name: username, username: u, email })
          .select()
          .single()
      } catch {
        // ok si déjà existant
      }

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
      <form onSubmit={signInOrUp} style={{ dis
