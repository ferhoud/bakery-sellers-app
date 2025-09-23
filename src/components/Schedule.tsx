import React, { useEffect, useMemo, useState } from "react"
import { supabase } from "../supabaseClient"

type Seller = { id: string; name: string; email: string; role?: string }
type Shift = { id?: string; day: string; slot: "open" | "mid" | "close"; seller_id: string }
type Absence = {
  id: string; seller_id: string; day: string; slot: "open" | "mid" | "close";
  status: string; replacement_seller_id?: string | null;
  owner?: { id: string; name: string | null } | null
  replacement?: { id: string; name: string | null } | null
}

const SLOT_LABEL: Record<string, string> = {
  open: "Matin (06:30–13:30)",
  mid: "Renfort (07:00–13:00)",
  close: "Après-midi (13:30–20:30)"
}

export default function Schedule({ isAdmin }: { isAdmin: boolean }) {
  const [sellers, setSellers] = useState<Seller[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [todayAbs, setTodayAbs] = useState<Absence[]>([])
  const sellersById = useMemo(() => Object.fromEntries(sellers.map(s => [s.id, s])), [sellers])

  const todayStr = new Date().toISOString().slice(0, 10)

  async function loadAll() {
    // vendeuses
    const { data: s } = await supabase.from("sellers").select("id,name,email,role").order("name", { ascending: true })
    setSellers(s || [])

    // shifts de la semaine en cours
    const base = new Date()
    const start = new Date(base); start.setDate(base.getDate() - base.getDay() + 1) // Lundi
    const end = new Date(start); end.setDate(start.getDate() + 7)
    const startStr = start.toISOString().slice(0, 10)
    const endStr = end.toISOString().slice(0, 10)

    const { data: sh } = await supabase
      .from("shifts")
      .select("id, day, slot, seller_id")
      .gte("day", startStr).lt("day", endStr)
      .order("day", { ascending: true })
    setShifts((sh as any) || [])

    // absences du jour (avec noms joints)
    const { data: abs } = await supabase
      .from("absences")
      .select(`
        id, seller_id, day, slot, status, replacement_seller_id,
        owner:seller_id ( id, name ),
        replacement:replacement_seller_id ( id, name )
      `)
      .eq("day", todayStr)
      .order("created_at", { ascending: true })
    setTodayAbs((abs as any) || [])
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

  // rendu simple : tableau 7 jours × 3 créneaux
  const days: string[] = (() => {
    const arr: string[] = []
    const base = new Date()
    const start = new Date(base); start.setDate(base.getDate() - base.getDay() + 1) // lundi
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i)
      arr.push(d.toISOString().slice(0, 10))
    }
    return arr
  })()
  const slots: Array<"open" | "mid" | "close"> = ["open", "mid", "close"]

  const getShiftSellerName = (day: string, slot: "open" | "mid" | "close") => {
    const row = shifts.find(s => s.day === day && s.slot === slot)
    if (!row) return ""
    return sellersById[row.seller_id]?.name || "?"
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* 🚨 Absences du jour (toujours en PREMIER) */}
      <div style={{ border: "2px solid #ffc107", background: "#fff8e1", borderRadius: 10, padding: 12 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>Absences du jour</h3>
        {todayAbs.length === 0 && <div>Aucune absence aujourd’hui.</div>}
        {todayAbs.map(a => {
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

      {/* Planning semaine */}
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Jour</th>
              {slots.map(s => <th key={s}>{SLOT_LABEL[s]}</th>)}
            </tr>
          </thead>
          <tbody>
            {days.map(d => (
              <tr key={d} style={{ background: d === todayStr ? "#e3f2fd" : "transparent" }}>
                <td><strong>{d}</strong></td>
                {slots.map(s => (
                  <td key={s}>
                    {getShiftSellerName(d, s) || <span style={{ opacity: .6 }}>—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
