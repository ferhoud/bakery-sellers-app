import React, { useEffect, useMemo, useState } from "react"
import { supabase } from "../supabaseClient"

const SLOT_LABEL: Record<string, string> = {
  open: "Matin (06:30–13:30)",
  mid: "Renfort (07:00–13:00)",
  close: "Après-midi (13:30–20:30)"
}

type Seller = { id: string; name: string; email: string; username?: string; role?: string }
type AbsenceRow = {
  id: string
  seller_id: string
  day: string
  slot: "open" | "mid" | "close"
  reason?: string | null
  status: "pending" | "candidate" | "approved" | "rejected" | "cancelled"
  replacement_seller_id?: string | null
  created_at: string
  owner?: { id: string; name: string | null } | null
  replacement?: { id: string; name: string | null } | null
}

function ymdLocal(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export default function Absences({
  currentSeller,
  isAdmin,
  sellers
}: {
  currentSeller: Seller | null
  isAdmin: boolean
  sellers: Seller[]
}) {
  const me = currentSeller
  const today = ymdLocal(new Date())

  const [loading, setLoading] = useState(false)
  const [list, setList] = useState<AbsenceRow[]>([])
  const [responses, setResponses] = useState<Record<string, "yes" | "no">>({})
  const [sent, setSent] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Filtres : aujourd’hui / à venir / toutes
  type FilterKey = "today" | "upcoming" | "all"
  const [filter, setFilter] = useState<FilterKey>("upcoming")

  // Formulaire
  const [day, setDay] = useState<string>("")
  const [slot, setSlot] = useState<string>("open")
  const [reason, setReason] = useState<string>("")

  const sellersById = useMemo(() => {
    const m: Record<string, Seller> = {}
    sellers?.forEach((s) => (m[s.id] = s))
    return m
  }, [sellers])

  async function loadAll() {
    setLoading(true)
    // On charge -7 jours → +60 jours, et on affiche selon filtre côté client
    const from = ymdLocal(new Date(Date.now() - 7 * 86400000))
    const to = ymdLocal(new Date(Date.now() + 60 * 86400000))

    const { data: abs, error } = await supabase
      .from("absences")
      .select(`
        id, seller_id, day, slot, reason, status, replacement_seller_id, created_at,
        owner:seller_id ( id, name ),
        replacement:replacement_seller_id ( id, name )
      `)
      .gte("day", from)
      .lte("day", to)
      .order("day", { ascending: true })
      .order("created_at", { ascending: true })

    if (error) console.error("LOAD absences error:", error)
    setList((abs as any) || [])

    if (me?.id && abs?.length) {
      const ids = (abs as AbsenceRow[]).map((a) => a.id)
      const { data: resp, error: e2 } = await supabase
        .from("absence_responses")
        .select("absence_id, will_replace")
        .in("absence_id", ids)
        .eq("seller_id", me.id)
      if (e2) console.error("LOAD responses error:", e2)
      const map: Record<string, "yes" | "no"> = {}
      resp?.forEach((r: any) => (map[r.absence_id] = r.will_replace ? "yes" : "no"))
      setResponses(map)
    } else {
      setResponses({})
    }

    setLoading(false)
  }

  useEffect(() => {
    loadAll()
    // Realtime
    const chA = supabase
      .channel("absences-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "absences" }, loadAll)
      .subscribe()
    const chR = supabase
      .channel("absence-resp-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "absence_responses" }, loadAll)
      .subscribe()
    return () => {
      supabase.removeChannel(chA)
      supabase.removeChannel(chR)
    }
  }, [me?.id])

  async function askAbsence() {
    setErrorMsg(null); setSent(false)
    if (!me?.id) { setErrorMsg("Votre profil n’est pas prêt. Déconnectez-vous puis reconnectez-vous."); return }
    if (!day || !slot) { setErrorMsg("Choisissez le jour et le créneau."); return }

    setLoading(true)
    const insert = { seller_id: me.id, day, slot, reason, status: "pending" as const }
    const { data: a, error } = await supabase.from("absences").insert(insert).select().single()
    if (error) { setErrorMsg(error.message); setLoading(false); return }

    // Notifier tout le monde
    try {
      const rows = sellers.map((r) => ({
        recipient_id: r.id,
        kind: "absence_request",
        title: "Demande d’absence",
        body: `${me.name || "Une vendeuse"} demande une absence le ${a.day} – ${SLOT_LABEL[a.slot]}`,
        data: { absence_id: a.id }
      }))
      if (rows.length) await supabase.from("notifications").insert(rows)
    } catch {}

    setSent(true)
    setDay(""); setSlot("open"); setReason("")
    setLoading(false)
    setTimeout(() => setSent(false), 4000)
  }

  async function respond(absence: AbsenceRow, willReplace: boolean) {
    setErrorMsg(null)
    if (!me?.id) { setErrorMsg("Profil vendeur introuvable."); return }
    if (isAdmin) return // l’admin ne répond pas à “voulez-vous remplacer ?”

    const { error } = await supabase
      .from("absence_responses")
      .upsert({ absence_id: absence.id, seller_id: me.id, will_replace: willReplace })
    if (error) { setErrorMsg(error.message); return }

    if (willReplace) {
      const admin = sellers.find((s) => s.role === "admin")
      if (admin) {
        await supabase.from("notifications").insert({
          recipient_id: admin.id,
          kind: "replacement_candidate",
          title: "Candidature remplacement",
          body: `${me.name || "Une vendeuse"} peut remplacer le ${absence.day} – ${SLOT_LABEL[absence.slot]}`,
          data: { absence_id: absence.id, candidate_id: me.id }
        }).catch(() => {})
      }
      await supabase.from("absences").update({ status: "candidate" }).eq("id", absence.id)
    }
  }

  // Filtrage client
  const filtered = useMemo(() => {
    if (filter === "all") return list
    if (filter === "today") return list.filter(a => a.day === today)
    return list.filter(a => a.day >= today) // upcoming
  }, [list, filter, today])

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Bandeaux */}
      {sent && (
        <div style={{ padding: 10, border: "1px solid #c8e6c9", background: "#e8f5e9", color: "#256029", borderRadius: 8 }}>
          Demande envoyée ✅ — tout le monde a été notifié.
        </div>
      )}
      {errorMsg && (
        <div style={{ padding: 10, border: "1px solid #ffcdd2", background: "#ffebee", color: "#b71c1c", borderRadius: 8 }}>
          {errorMsg}
        </div>
      )}

      {/* Formulaire */}
      <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>Demander une absence</h3>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", alignItems: "center" }}>
          <label>Jour
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </label>
          <label>Créneau
            <select value={slot} onChange={(e) => setSlot(e.target.value)}>
              <option value="open">{SLOT_LABEL.open}</option>
              <option value="mid">{SLOT_LABEL.mid}</option>
              <option value="close">{SLOT_LABEL.close}</option>
            </select>
          </label>
        </div>
        <textarea
          placeholder="Raison (facultatif)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={{ marginTop: 8, width: "100%", minHeight: 60 }}
        />
        <div>
          <button disabled={loading || !day} onClick={askAbsence} style={{ marginTop: 8 }}>
            {loading ? "Envoi..." : "Envoyer la demande"}
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setFilter("today")}    disabled={filter==="today"}>Aujourd’hui</button>
        <button onClick={() => setFilter("upcoming")} disabled={filter==="upcoming"}>À venir</button>
        <button onClick={() => setFilter("all")}      disabled={filter==="all"}>Toutes</button>
      </div>

      {/* Liste */}
      <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>Absences</h3>
        {loading && <p>Chargement…</p>}
        {!loading && filtered.length === 0 && <p>Aucune absence.</p>}

        {!loading && filtered.map((a) => {
          const ownerName = a.owner?.name ?? sellersById[a.seller_id]?.name ?? "?"
          const replName  = a.replacement?.name ?? (a.replacement_seller_id ? (sellersById[a.replacement_seller_id!]?.name ?? "?") : null)
          const mine = a.seller_id === me?.id
          const already = responses[a.id]
          const canAnswer = !mine && !isAdmin && a.status !== "approved" && a.day >= today

          return (
            <div key={a.id} style={{ padding: 8, border: "1px solid #eee", borderRadius: 8, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <div>
                  <strong>{ownerName}</strong> — {a.day} — <em>{SLOT_LABEL[a.slot]}</em>
                  {" · "}
                  <span style={{ padding: "2px 6px", borderRadius: 6, border: "1px solid #ddd" }}>
                    {a.status === "pending" && "En attente"}
                    {a.status === "candidate" && "Candidate trouvée"}
                    {a.status === "approved" && "Validée"}
                    {a.status === "rejected" && "Refusée"}
                    {a.status === "cancelled" && "Annulée"}
                  </span>
                </div>
                {replName && (
                  <div style={{ opacity: 0.8 }}>
                    Remplacée par <strong>{replName}</strong>
                  </div>
                )}
              </div>

              {a.reason && <div style={{ marginTop: 6, opacity: 0.8 }}>Motif : {a.reason}</div>}

              {canAnswer && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ marginBottom: 6 }}>Voulez-vous remplacer ?</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      disabled={already === "yes"}
                      onClick={() => respond(a, true)}
                      style={{ borderColor: "#2e7d32", color: "#2e7d32" }}
                    >
                      Oui
                    </button>
                    <button
                      disabled={already === "no"}
                      onClick={() => respond(a, false)}
                      style={{ borderColor: "#c62828", color: "#c62828" }}
                    >
                      Non
                    </button>
                  </div>
                  {already && <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                    Votre réponse : <strong>{already === "yes" ? "Oui" : "Non"}</strong>
                  </div>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
