import React, { useEffect, useMemo, useState } from "react"
import { supabase } from "../supabaseClient"
import { format, parseISO, isAfter } from "date-fns"

type Seller = { id: string; name: string; email: string; username?: string; role?: string }
type Absence = {
  id: string
  seller_id: string
  day: string // 'YYYY-MM-DD'
  reason: string | null
  status: "pending" | "approved" | "rejected"
  created_at?: string
}

type Props = {
  currentSeller: Seller | null
  isAdmin: boolean
  sellers: Seller[]
}

export default function Absences({ currentSeller, isAdmin, sellers }: Props) {
  const [list, setList] = useState<Absence[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<{ day: string; reason: string; seller_id?: string }>({
    day: "",
    reason: ""
  })

  const myId = currentSeller?.id

  const load = async () => {
    setLoading(true)
    const query = supabase.from("absences").select("*").order("day", { ascending: true })
    const { data } = isAdmin ? await query : await query.eq("seller_id", myId || "__none__")
    setList((data as Absence[]) || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [isAdmin, myId])

  const upcoming = useMemo(() => {
    const todayISO = format(new Date(), "yyyy-MM-dd")
    return list.filter(a => a.day >= todayISO)
  }, [list])

  const past = useMemo(() => {
    const todayISO = format(new Date(), "yyyy-MM-dd")
    return list.filter(a => a.day < todayISO)
  }, [list])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.day) return alert("Choisis une date")
    const payload: Partial<Absence> = {
      day: form.day,
      reason: form.reason || null,
      status: "pending",
      seller_id: isAdmin ? (form.seller_id || myId!) : myId!
    }
    const { error } = await supabase.from("absences").insert(payload)
    if (error) {
      alert("Impossible d'enregistrer l'absence (vérifie tes droits).")
      return
    }
    setForm({ day: "", reason: "", seller_id: undefined })
    await load()
  }

  const updateStatus = async (id: string, status: Absence["status"]) => {
    const { error } = await supabase.from("absences").update({ status }).eq("id", id)
    if (error) { alert("Action réservée à l’admin (ou règle RLS)."); return }
    await load()
  }

  return (
    <div>
      <h2>Absences</h2>

      <form onSubmit={submit} style={{ display: "grid", gap: 8, maxWidth: 420, marginBottom: 16 }}>
        <label>
          Date
          <input type="date" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} />
        </label>
        <label>
          Motif (optionnel)
          <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="ex: médecin" />
        </label>
        {isAdmin && (
          <label>
            Vendeuse
            <select value={form.seller_id || ""} onChange={(e) => setForm({ ...form, seller_id: e.target.value })}>
              <option value="">— moi ({currentSeller?.name})</option>
              {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
        <button type="submit">Demander une absence</button>
      </form>

      <div style={{ display: "grid", gap: 16 }}>
        <section>
          <h3>À venir</h3>
          {loading ? <p>Chargement…</p> : upcoming.length === 0 ? <p>Aucune absence à venir.</p> : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={{ textAlign: "left" }}>Date</th><th style={{ textAlign: "left" }}>Vendeuse</th><th style={{ textAlign: "left" }}>Motif</th><th>Statut</th><th>{isAdmin ? "Actions" : ""}</th></tr></thead>
              <tbody>
                {upcoming.map(a => {
                  const seller = sellers.find(s => s.id === a.seller_id)
                  return (
                    <tr key={a.id}>
                      <td>{format(parseISO(a.day), "dd/MM/yyyy")}</td>
                      <td>{seller?.name || "—"}</td>
                      <td>{a.reason || "—"}</td>
                      <td style={{ textTransform: "capitalize" }}>{a.status}</td>
                      <td>
                        {isAdmin && (
                          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                            <button onClick={() => updateStatus(a.id, "approved")}>Approuver</button>
                            <button onClick={() => updateStatus(a.id, "rejected")}>Refuser</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h3>Historique</h3>
          {loading ? <p>Chargement…</p> : past.length === 0 ? <p>Aucune absence passée.</p> : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={{ textAlign: "left" }}>Date</th><th style={{ textAlign: "left" }}>Vendeuse</th><th style={{ textAlign: "left" }}>Motif</th><th>Statut</th></tr></thead>
              <tbody>
                {past.map(a => {
                  const seller = sellers.find(s => s.id === a.seller_id)
                  return (
                    <tr key={a.id}>
                      <td>{format(parseISO(a.day), "dd/MM/yyyy")}</td>
                      <td>{seller?.name || "—"}</td>
                      <td>{a.reason || "—"}</td>
                      <td style={{ textTransform: "capitalize" }}>{a.status}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  )
}
