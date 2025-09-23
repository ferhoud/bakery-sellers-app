import React, { useEffect, useMemo, useState } from "react"
import { supabase } from "../supabaseClient"

const SLOT_LABEL: Record<string, string> = {
  open: "Matin (06:30–13:30)",
  mid: "Renfort (07:00–13:00)",
  close: "Après-midi (13:30–20:30)"
}

type Seller = { id: string; name: string; email: string; username?: string; role?: string }

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
  const [loading, setLoading] = useState(false)
  const [list, setList] = useState<any[]>([])
  const [responses, setResponses] = useState<Record<string, "yes" | "no">>({})

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
    // Absences à partir d’aujourd’hui - 14j (pour voir récent)
    const { data: abs } = await supabase
      .from("absences")
      .select("*")
      .gte("day", new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10))
      .order("day", { ascending: true })
      .order("created_at", { ascending: true })

    setList(abs || [])

    if (me?.id) {
      const ids = (abs || []).map((a) => a.id)
      if (ids.length) {
        const { data: resp } = await supabase
          .from("absence_responses")
          .select("absence_id, will_replace")
          .in("absence_id", ids)
          .eq("seller_id", me.id)
        const map: Record<string, "yes" | "no"> = {}
        resp?.forEach((r) => (map[r.absence_id] = r.will_replace ? "yes" : "no"))
        setResponses(map)
      } else {
        setResponses({})
      }
    }
    setLoading(false)
  }

  useEffect(() => {
    loadAll()
    // Realtime : écoute absences et réponses
    const ch1 = supabase
      .channel("absences-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "absences" }, loadAll)
      .subscribe()
    const ch2 = supabase
      .channel("absence-resp-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "absence_responses" }, loadAll)
      .subscribe()
    return () => {
      supabase.removeChannel(ch1)
      supabase.removeChannel(ch2)
    }
  }, [me?.id])

  async function askAbsence() {
    if (!me?.id || !day || !slot) return
    setLoading(true)

    const { data: a, error } = await supabase
      .from("absences")
      .insert({ seller_id: me.id, day, slot, reason, status: "pending" })
      .select()
      .single()
    if (error) { alert(error.message); setLoading(false); return }

    // Crée des notifications pour tout le monde (sauf le demandeur)
    try {
      const recipients = sellers.filter((s) => s.id !== me.id)
      if (recipients.length) {
        await supabase.from("notifications").insert(
          recipients.map((r) => ({
            recipient_id: r.id,
            kind: "absence_request",
            title: "Demande d’absence",
            body: `${me.name || "Une vendeuse"} demande une absence le ${a.day} – ${SLOT_LABEL[a.slot]}`,
            data: { absence_id: a.id }
          }))
        )
      }
    } catch {}

    setDay("")
    setSlot("open")
    setReason("")
    setLoading(false)
  }

  async function respond(absence: any, willReplace: boolean) {
    if (!me?.id) return
    await supabase
      .from("absence_responses")
      .upsert({ absence_id: absence.id, seller_id: me.id, will_replace: willReplace })
    // Notifier l’admin si quelqu’un dit OUI
    if (willReplace) {
      const admin = sellers.find((s) => s.role === "admin")
      if (admin) {
        try {
          await supabase.from("notifications").insert({
            recipient_id: admin.id,
            kind: "replacement_candidate",
            title: "Candidature remplacement",
            body: `${me.name || "Une vendeuse"} peut remplacer le ${absence.day} – ${SLOT_LABEL[absence.slot]}`,
            data: { absence_id: absence.id, candidate_id: me.id }
          })
        } catch {}
      }
      // Marquer l’absence en "candidate"
      await supabase.from("absences").update({ status: "candidate" }).eq("id", absence.id)
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Créer une absence */}
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
            Envoyer la demande
          </button>
        </div>
      </div>

      {/* Liste des absences */}
      <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>Absences & remplacements</h3>
        {loading && <p>Chargement…</p>}
        {!loading && list.length === 0 && <p>Aucune absence récente.</p>}

        {!loading && list.map((a) => {
          const owner = sellersById[a.seller_id]
          const mine = a.seller_id === me?.id
          const already = responses[a.id] // "yes" | "no"
          const canAnswer = !mine && a.status !== "approved"

          return (
            <div key={a.id} style={{ padding: 8, border: "1px solid #eee", borderRadius: 8, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <div>
                  <strong>{owner?.name || "?"}</strong> — {a.day} — <em>{SLOT_LABEL[a.slot]}</em>
                  {" · "}
                  <span style={{ padding: "2px 6px", borderRadius: 6, border: "1px solid #ddd" }}>
                    {a.status === "pending" && "En attente"}
                    {a.status === "candidate" && "Candidate trouvée"}
                    {a.status === "approved" && "Validée"}
                    {a.status === "rejected" && "Refusée"}
                  </span>
                </div>
                {a.replacement_seller_id && (
                  <div style={{ opacity: 0.8 }}>
                    Remplacée par <strong>{sellersById[a.replacement_seller_id]?.name || "?"}</strong>
                  </div>
                )}
              </div>

              {a.reason && <div style={{ marginTop: 6, opacity: 0.8 }}>Motif : {a.reason}</div>}

              {/* Question “voulez-vous remplacer ?” */}
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
