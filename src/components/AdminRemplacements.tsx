import React, { useEffect, useMemo, useState } from "react"
import { supabase } from "../supabaseClient"

const SLOT_LABEL: Record<string, string> = {
  open: "Matin (06:30–13:30)",
  mid: "Renfort (07:00–13:00)",
  close: "Après-midi (13:30–20:30)"
}

// Durées fixes (heures) par créneau
const SLOT_HOURS: Record<string, number> = { open: 7, mid: 6, close: 7 }

type Seller = { id: string; name: string; email: string; role?: string }

export default function AdminRemplacements({
  currentSeller,
  sellers,
  isAdmin
}: {
  currentSeller: Seller | null
  sellers: Seller[]
  isAdmin: boolean
}) {
  const me = currentSeller
  const [pending, setPending] = useState<any[]>([])
  const [candidatesByAbs, setCandidatesByAbs] = useState<Record<string, any[]>>({})
  const [month, setMonth] = useState<string>(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  })
  const [totals, setTotals] = useState<Record<string, number>>({}) // seller_id -> heures

  const sellersById = useMemo(() => {
    const m: Record<string, Seller> = {}
    sellers?.forEach((s) => (m[s.id] = s))
    return m
  }, [sellers])

  async function loadCandidates() {
    // Absences à valider : en attente OU candidate
    const { data: abs } = await supabase
      .from("absences")
      .select("*")
      .in("status", ["pending", "candidate"])
      .order("day", { ascending: true })
    setPending(abs || [])

    if (!abs?.length) { setCandidatesByAbs({}); return }

    const ids = abs.map(a => a.id)
    const { data: resp } = await supabase
      .from("absence_responses")
      .select("*")
      .in("absence_id", ids)
      .eq("will_replace", true)
      .order("created_at", { ascending: true })

    const map: Record<string, any[]> = {}
    resp?.forEach(r => {
      map[r.absence_id] = map[r.absence_id] || []
      map[r.absence_id].push(r)
    })
    setCandidatesByAbs(map)
  }

  async function validate(absence: any, candidateSellerId: string) {
    if (!isAdmin || !me?.id) { alert("Réservé à l’admin."); return }

    // 1) Met l’absence en validée
    await supabase.from("absences").update({
      status: "approved",
      replacement_seller_id: candidateSellerId,
      validated_by: me.id,
      validated_at: new Date().toISOString()
    }).eq("id", absence.id)

    // 2) Applique au planning : affecte le créneau au remplaçant
    // -> ATTENTION: adapte si ta table 'shifts' a un autre schéma
    // Ici on suppose: day (date), slot (open/mid/close), seller_id
    const { data: existing } = await supabase
      .from("shifts")
      .select("id")
      .eq("day", absence.day)
      .eq("slot", absence.slot)
      .limit(1)
      .maybeSingle()

    if (existing?.id) {
      await supabase.from("shifts").update({ seller_id: candidateSellerId }).eq("id", existing.id)
    } else {
      await supabase.from("shifts").insert({
        day: absence.day,
        slot: absence.slot,
        seller_id: candidateSellerId
      })
    }

    // 3) Notifier tout le monde
    try {
      const all = sellers || []
      await supabase.from("notifications").insert(
        all.map((r) => ({
          recipient_id: r.id,
          kind: "replacement_validated",
          title: "Remplacement validé",
          body: `${sellersById[candidateSellerId]?.name || "Une vendeuse"} remplace ${sellersById[absence.seller_id]?.name || "?"} le ${absence.day} – ${SLOT_LABEL[absence.slot]}`,
          data: { absence_id: absence.id, replacement_seller_id: candidateSellerId }
        }))
      )
    } catch {}

    await loadCandidates()
    alert("Remplacement validé et planning mis à jour ✅")
  }

  async function loadTotals() {
    // Calcule les heures du mois en cours (ou sélectionné) à partir de shifts
    // Suppose: shifts(day date, slot text, seller_id uuid)
    const [y, m] = month.split("-").map(Number)
    const monthStart = new Date(y, m - 1, 1)
    const monthEnd = new Date(y, m, 1) // exclu

    const { data: sh } = await supabase
      .from("shifts")
      .select("seller_id, day, slot")
      .gte("day", monthStart.toISOString().slice(0, 10))
      .lt("day", monthEnd.toISOString().slice(0, 10))

    const map: Record<string, number> = {}
    ;(sh || []).forEach((row) => {
      const h = SLOT_HOURS[row.slot] ?? 0
      map[row.seller_id] = (map[row.seller_id] || 0) + h
    })
    setTotals(map)
  }

  useEffect(() => {
    loadCandidates()
    loadTotals()
    const ch = supabase
      .channel("admin-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "absences" }, () => { loadCandidates(); loadTotals() })
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, loadTotals)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [month])

  const myHours = me?.id ? (totals[me.id] || 0) : 0

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Bloc validation remplacements */}
      <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>Remplacements à valider</h3>
        {!isAdmin && <p style={{ color: "#c62828" }}>Réservé à l’admin.</p>}

        {pending.length === 0 && <p>Aucune demande en attente.</p>}

        {pending.map((a) => {
          const cands = candidatesByAbs[a.id] || []
          return (
            <div key={a.id} style={{ padding: 8, border: "1px solid #eee", borderRadius: 8, marginBottom: 8 }}>
              <div><strong>{SLOT_LABEL[a.slot]}</strong> — {a.day}</div>
              <div style={{ opacity: 0.8, marginBottom: 6 }}>
                Absence de <strong>{sellersById[a.seller_id]?.name || "?"}</strong> — statut : <em>{a.status}</em>
              </div>
              {cands.length === 0 && <div>Aucune candidature pour le moment.</div>}
              {cands.length > 0 && (
                <div style={{ display: "grid", gap: 6 }}>
                  {cands.map((c) => (
                    <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div>{sellersById[c.seller_id]?.name || "?"}</div>
                      <button
                        disabled={!isAdmin}
                        onClick={() => validate(a, c.seller_id)}
                        style={{ borderColor: "#2e7d32", color: "#2e7d32" }}
                      >
                        Valider ce remplacement
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Totaux d'heures */}
      <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>Heures du mois</h3>

        <div style={{ marginBottom: 8 }}>
          <label>Mois :{" "}
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
          <button onClick={loadTotals} style={{ marginLeft: 8 }}>Recalculer</button>
        </div>

        {/* Vue vendeuse : son total */}
        <div style={{ marginBottom: 8, padding: 8, background: "#f7f7f7", borderRadius: 8 }}>
          Mes heures ({month}) : <strong>{myHours.toFixed(1)} h</strong>
        </div>

        {/* Vue admin : table complète */}
        {isAdmin && (
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Vendeuse</th>
                <th>Total (h)</th>
              </tr>
            </thead>
            <tbody>
              {sellers.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{(totals[s.id] || 0).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
