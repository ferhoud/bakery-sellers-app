import React, { useEffect, useMemo, useState } from "react"
import { supabase } from "../supabaseClient"

// Libellés des créneaux
const SLOT_LABEL: Record<string, string> = {
  open: "Matin (06:30–13:30)",
  mid: "Renfort (07:00–13:00)",
  close: "Après-midi (13:30–20:30)"
}
type SlotKey = "open" | "mid" | "close"
const SLOTS: SlotKey[] = ["open", "mid", "close"]

type Seller = { id: string; full_name: string; created_at: string }
type ShiftRow = { id?: string; day: string; slot: SlotKey; seller_id: string }
type AbsenceRow = {
  id: string
  seller_id: string
  day: string
  slot: SlotKey
  status: "pending" | "candidate" | "approved" | "rejected" | "cancelled"
  replacement_seller_id?: string | null
  created_at?: string
  owner?: { id: string; name: string | null } | null
  replacement?: { id: string; name: string | null } | null
}

// ✅ format YYYY-MM-DD en LOCAL (pas d'UTC)
function ymdLocal(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

// Couleur stable par vendeuse
const PALETTE = [
  "#EF9A9A", "#F48FB1", "#CE93D8", "#B39DDB",
  "#90CAF9", "#80DEEA", "#A5D6A7", "#E6EE9C",
  "#FFCC80", "#FFAB91", "#BCAAA4", "#B0BEC5"
]
function colorFor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h << 5) - h + id.charCodeAt(i)
  const idx = Math.abs(h) % PALETTE.length
  return PALETTE[idx]
}

export default function Schedule({ isAdmin }: { isAdmin: boolean }) {
  const [sellers, setSellers] = useState<Seller[]>([])
  const [shifts, setShifts] = useState<ShiftRow[]>([])
  const [todayAbsences, setTodayAbsences] = useState<AbsenceRow[]>([])
  const [busy, setBusy] = useState(false)
  const sellersById = useMemo(() => Object.fromEntries(sellers.map(s => [s.id, s])), [sellers])

  // Semaine (lundi → dimanche) en LOCAL
  const base = new Date()
  const weekStart = new Date(base)
  weekStart.setDate(base.getDate() - ((base.getDay() + 6) % 7)) // lundi
  const weekDays: string[] = Array.from({ length: 7 }, (_, i) => ymdLocal(new Date(weekStart.getTime() + i * 86400000)))
  const todayStr = ymdLocal(new Date())

  // Accès rapide
  const keyOf = (day: string, slot: SlotKey) => `${day}|${slot}`
  const mapShifts = useMemo(() => {
    const m = new Map<string, ShiftRow>()
    shifts.forEach(s => m.set(keyOf(s.day, s.slot), s))
    return m
  }, [shifts])

  function getSellerId(day: string, slot: SlotKey) {
    const row = mapShifts.get(keyOf(day, slot))
    return row?.seller_id || ""
  }

  function alreadyAssignedThisDay(sellerId: string, day: string, exceptSlot?: SlotKey) {
    if (!sellerId) return false
    return SLOTS.some(sl => {
      if (sl === exceptSlot) return false
      const r = mapShifts.get(keyOf(day, sl))
      return r?.seller_id === sellerId
    })
  }

  async function loadAll() {
    // vendeuses
    const { data: s } = await supabase.from("sellers").select("id,name,email,role").order("name", { ascending: true })
    setSellers(s || [])

    // shifts (semaine) — bornes locales
    const startStr = weekDays[0]
    const endStrDate = new Date(weekStart.getTime() + 7 * 86400000) // lundi suivant
    const endStr = ymdLocal(endStrDate)

    const { data: sh } = await supabase
      .from("shifts")
      .select("id, day, slot, seller_id")
      .gte("day", startStr)
      .lt("day", endStr)
      .order("day", { ascending: true })
    setShifts((sh as any) || [])

    // absences du jour (jointure noms)
    const { data: abs } = await supabase
      .from("absences")
      .select(`
        id, seller_id, day, slot, status, replacement_seller_id, created_at,
        owner:seller_id ( id, name ),
        replacement:replacement_seller_id ( id, name )
      `)
      .eq("day", todayStr)
      .order("created_at", { ascending: true })
    setTodayAbsences((abs as any) || [])
  }

  useEffect(() => {
    loadAll()
    const ch = supabase
      .channel("schedule-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "absences" }, loadAll)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function setAssignment(day: string, slot: SlotKey, sellerId: string) {
    if (!isAdmin) return
    setBusy(true)
    try {
      if (sellerId && alreadyAssignedThisDay(sellerId, day, slot)) {
        alert("Cette vendeuse est déjà affectée à un autre créneau le même jour.")
        setBusy(false)
        return
      }
      const existing = mapShifts.get(keyOf(day, slot))
      if (!sellerId) {
        if (existing?.id) await supabase.from("shifts").delete().eq("id", existing.id)
      } else if (existing?.id) {
        await supabase.from("shifts").update({ seller_id: sellerId }).eq("id", existing.id)
      } else {
        await supabase.from("shifts").insert({ day, slot, seller_id: sellerId })
      }
      await loadAll()
    } finally {
      setBusy(false)
    }
  }

  // Ruban du jour
  const todayOpen  = getSellerId(todayStr, "open")
  const todayMid   = getSellerId(todayStr, "mid")
  const todayClose = getSellerId(todayStr, "close")

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Absences du jour (en premier) */}
      <div style={{ border: "2px solid #ffc107", background: "#fff8e1", borderRadius: 10, padding: 12 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>Absences du jour</h3>
        {todayAbsences.length === 0 && <div>Aucune absence aujourd’hui.</div>}
        {todayAbsences.map(a => {
          const ownerName = a.owner?.name ?? sellersById[a.seller_id]?.name ?? "?"
          const replName  = a.replacement?.name ?? (a.replacement_seller_id ? (sellersById[a.replacement_seller_id!]?.name ?? "?") : null)
          return (
            <div key={a.id} style={{ padding: 8, border: "1px solid #ffe082", background: "#fffde7", borderRadius: 8, marginBottom: 8 }}>
              <strong>{ownerName}</strong> — <em>{SLOT_LABEL[a.slot]}</em>
              {" · "}
              <span style={{ padding: "2px 6px", borderRadius: 6, border: "1px solid #ffd54f" }}>
                {a.status === "pending" && "En attente de remplaçant"}
                {a.status === "candidate" && "Candidature en attente de validation"}
                {a.status === "approved" && "Remplacement validé"}
                {a.status === "rejected" && "Refusée"}
                {a.status === "cancelled" && "Annulée"}
              </span>
              {replName && <> — Remplacée par <strong>{replName}</strong></>}
            </div>
          )
        })}
      </div>

      {/* Ruban “planning du jour” */}
      <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Planning du jour — {todayStr}</h3>
        <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
          {(["open","mid","close"] as SlotKey[]).map(slot => {
            const sid = slot === "open" ? todayOpen : slot === "mid" ? todayMid : todayClose
            return (
              <div key={slot}
                style={{
                  flex: slot === "mid" ? 6 : 7,
                  minHeight: 44,
                  borderRadius: 8,
                  border: "1px solid #ccc",
                  background: sid ? colorFor(sid) : "#f6f6f6",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: sid ? "#000" : "#888",
                  fontWeight: 600
                }}
                title={SLOT_LABEL[slot]}
              >
                {sid ? (sellersById[sid]?.name || "?") : "—"}
              </div>
            )
          })}
        </div>
      </div>

      {/* Planning de la semaine (menus interactifs pour ADMIN) */}
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Jour</th>
              {SLOTS.map(s => <th key={s}>{SLOT_LABEL[s]}</th>)}
            </tr>
          </thead>
          <tbody>
            {weekDays.map(d => (
              <tr key={d} style={{ background: d === todayStr ? "#e3f2fd" : "transparent" }}>
                <td><strong>{d}</strong></td>
                {SLOTS.map(s => {
                  const selId = getSellerId(d, s)
                  const selName = selId ? (sellersById[selId]?.name || "?") : ""
                  const col = selId ? colorFor(selId) : "#f9f9f9"
                  return (
                    <td key={s}>
                      {isAdmin ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{
                            width: 10, height: 22, borderRadius: 4,
                            background: selId ? col : "#eee", border: "1px solid #ddd"
                          }} />
                          <select
                            disabled={busy}
                            value={selId}
                            onChange={(e) => setAssignment(d, s, e.target.value)}
                          >
                            <option value="">— (vide) —</option>
                            {sellers.map(u => (
                              <option key={u.id} value={u.id}>
                                {u.name || u.email}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        selName ? (
                          <span style={{
                            padding: "2px 6px",
                            borderRadius: 6,
                            background: col,
                            border: "1px solid #bbb",
                            display: "inline-block"
                          }}>
                            {selName}
                          </span>
                        ) : <span style={{ opacity: .6 }}>—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
