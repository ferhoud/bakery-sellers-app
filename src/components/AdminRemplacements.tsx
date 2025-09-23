import React, { useEffect, useMemo, useState } from "react"
import { supabase } from "../supabaseClient"

const SLOT_LABEL: Record<string, string> = {
  open: "Matin (06:30–13:30)",
  mid: "Renfort (07:00–13:00)",
  close: "Après-midi (13:30–20:30)"
}

type Seller = { id: string; name: string; email: string; role?: string }
type Absence = {
  id: string
  seller_id: string
  day: string
  slot: "open" | "mid" | "close"
  status: "pending" | "candidate" | "approved" | "rejected" | "cancelled"
  reason?: string | null
  replacement_seller_id?: string | null
  created_at: string
  owner?: { id: string; name: string | null } | null
  replacement?: { id: string; name: string | null } | null
}
type Resp = { absence_id: string; seller_id: string; will_replace: boolean; seller?: { id: string; name: string | null } | null }

function ymdLocal(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export default function AdminRemplacements({
  currentSeller,
  sellers,
  isAdmin
}: {
  currentSeller: Seller | null
  sellers: Seller[]
  isAdmin: boolean
}) {
  const today = ymdLocal(new Date())
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<Absence[]>([])
  const [cands, setCands] = useState<Record<string, Resp[]>>({})
  const [choice, setChoice] = useState<Record<string, string>>({}) // absence_id -> seller_id choisi
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const sellersById = useMemo(() => Object.fromEntries(sellers.map(s => [s.id, s])), [sellers])

  async function loadAll() {
    setLoading(true)
    setErr(null)
    // Absences à traiter (aujourd’hui et à venir)
    const { data: abs, error } = await supabase
      .from("absences")
      .select(`
        id, seller_id, day, slot, status, reason, replacement_seller_id, created_at,
        owner:seller_id ( id, name ),
        replacement:replacement_seller_id ( id, name )
      `)
      .gte("day", today)
      .in("status", ["pending","candidate"])
      .order("day", { ascending: true })
      .order("created_at", { ascending: true })

    if (error) { setErr(error.message); setLoading(false); return }
    const list = (abs as any as Absence[]) || []
    setRows(list)

    // Candidats (oui)
    if (list.length) {
      const ids = list.map(a => a.id)
      const { data: rr } = await supabase
        .from("absence_responses")
        .select("absence_id, seller_id, will_replace, seller:seller_id ( id, name )")
        .in("absence_id", ids)
        .eq("will_replace", true)
      const grouped: Record<string, Resp[]> = {}
      ;(rr || []).forEach((r: any) => {
        (grouped[r.absence_id] ||= []).push(r)
      })
      setCands(grouped)
    } else {
      setCands({})
    }

    setLoading(false)
  }

  useEffect(() => {
    loadAll()
    const ch = supabase
      .channel("admin-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "absences" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "absence_responses" }, loadAll)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function approve(a: Absence) {
    setMsg(null); setErr(null)
    const sel = choice[a.id] || cands[a.id]?.[0]?.seller_id // par défaut 1er candidat
    if (!sel) { setErr("Choisis une remplaçante."); return }

    // 1) pousser dans le planning (shifts)
    // on remplace la ligne (day, slot) par la remplaçante
    try {
      // Supprimer l’existant pour (day, slot), puis insérer. (évite les problèmes de contrainte unique)
      await supabase.from("shifts").delete().eq("day", a.day).eq("slot", a.slot)
      const { error: eIns } = await supabase.from("shifts").insert({ day: a.day, slot: a.slot, seller_id: sel })
      if (eIns) {
        // Message plus clair si la vendeuse a déjà un autre créneau ce jour-là
        if (String(eIns.message || "").includes("one_shift_per_day_per_seller") || String(eIns.message || "").includes("seller_id, day")) {
          setErr("Cette vendeuse a déjà un autre créneau ce jour-là."); return
        }
        setErr(eIns.message); return
      }
    } catch (e: any) {
      setErr(e?.message || "Erreur planning"); return
    }

    // 2) marquer l’absence validée
    const { error: eUpd } = await supabase
      .from("absences")
      .update({ status: "approved", replacement_seller_id: sel, validated_by: currentSeller?.id || null, validated_at: new Date().toISOString() })
      .eq("id", a.id)
    if (eUpd) { setErr(eUpd.message); return }

    // 3) notifier tout le monde
    try {
      const title = "Remplacement validé"
      const body  = `${sellersById[sel]?.name || "Une vendeuse"} remplace ${sellersById[a.seller_id]?.name || "?"} le ${a.day} – ${SLOT_LABEL[a.slot]}`
      const rows = sellers.map((r) => ({
        recipient_id: r.id,
        kind: "replacement_approved",
        title, body,
        data: { absence_id: a.id, day: a.day, slot: a.slot, replacement_id: sel }
      }))
      if (rows.length) await supabase.from("notifications").insert(rows)
    } catch {}

    setMsg("Remplacement validé ✅")
    setTimeout(() => setMsg(null), 2500)
  }

  async function reject(a: Absence) {
    setErr(null); setMsg(null)
    const { error } = await supabase.from("absences").update({ status: "rejected", replacement_seller_id: null }).eq("id", a.id)
    if (error) { setErr(error.message); return }
    setMsg("Absence rejetée.")
    setTimeout(() => setMsg(null), 2000)
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h3 style={{ margin: 0 }}>Validation des remplacements</h3>
      {msg && <div style={{ padding: 8, background: "#e8f5e9", border: "1px solid #c8e6c9", color: "#256029", borderRadius: 8 }}>{msg}</div>}
      {err && <div style={{ padding: 8, background: "#ffebee", border: "1px solid #ffcdd2", color: "#b71c1c", borderRadius: 8 }}>{err}</div>}
      {loading && <p>Chargement…</p>}

      {!loading && rows.length === 0 && <p>Aucune absence à valider.</p>}

      {!loading && rows.map(a => {
        const ownerName = a.owner?.name || sellersById[a.seller_id]?.name || "?"
        const candidates = cands[a.id] || []
        const chosen = choice[a.id] || candidates[0]?.seller_id || ""

        return (
          <div key={a.id} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <div>
                <strong>{ownerName}</strong> — {a.day} — <em>{SLOT_LABEL[a.slot]}</em>
                {" · "}
                <span style={{ padding: "2px 6px", borderRadius: 6, border: "1px solid #ddd" }}>
                  {a.status === "pending" && "En attente"}
                  {a.status === "candidate" && "Candidate trouvée"}
                </span>
              </div>
              {a.replacement_seller_id && (
                <div>Proposée : <strong>{sellersById[a.replacement_seller_id]?.name || "?"}</strong></div>
              )}
            </div>

            <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label>
                Candidats :
                <select value={chosen} onChange={(e) => setChoice(prev => ({ ...prev, [a.id]: e.target.value }))} style={{ marginLeft: 6 }}>
                  {candidates.length === 0 && <option value="">— aucun —</option>}
                  {candidates.map(c => (
                    <option key={c.seller_id} value={c.seller_id}>
                      {c.seller?.name || "?"}
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={() => approve(a)} disabled={!isAdmin || (!chosen && candidates.length===0)}>Valider</button>
              <button onClick={() => reject(a)}  disabled={!isAdmin}>Rejeter</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
