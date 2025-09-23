import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient' // ← garde ce chemin relatif (Vite)

type Seller = { id: string; full_name: string; created_at: string }
type Slot = 'MORNING' | 'AFTERNOON' | 'EVENING'
type Shift = { id: string; date: string; slot: Slot; seller_id: string | null; created_at: string }

const SLOT_LABEL: Record<Slot, string> = {
  MORNING: 'Matin',
  AFTERNOON: 'Après-midi',
  EVENING: 'Soir',
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10)
}
function mondayWeek(from = new Date()) {
  const f = new Date(from)
  const day = f.getDay() || 7
  if (day !== 1) f.setDate(f.getDate() - (day - 1))
  return Array.from({ length: 7 }).map((_, i) => {
    const dt = new Date(f)
    dt.setDate(f.getDate() + i)
    return {
      date: iso(dt),
      label: dt.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
    }
  })
}

export default function Schedule() {
  const days = useMemo(() => mondayWeek(), [])
  const [sellers, setSellers] = useState<Seller[]>([])
  const [shifts, setShifts] = useState<Record<string, Shift>>({})
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<string>('')

  // ---- API ----
  async function fetchSellers() {
    const { data, error } = await supabase
      .from('sellers')
      .select('id,full_name,created_at') // ← pas de is_active ici
      .order('full_name', { ascending: true })

    if (error) throw error
    console.log('[DBG] sellers fetched:', data?.length, data)
    return (data || []) as Seller[]
  }

  async function fetchWeekShifts() {
    const from = days[0].date
    const to = days[days.length - 1].date
    const { data, error } = await supabase
      .from('shifts')
      .select('id,date,slot,seller_id,created_at')
      .gte('date', from)
      .lte('date', to)

    if (error) throw error
    const map: Record<string, Shift> = {}
    ;(data || []).forEach((s: any) => (map[`${s.date}:${s.slot}`] = s))
    console.log('[DBG] shifts fetched:', (data || []).length, data)
    return map
  }

  async function refreshAll() {
    setLoading(true)
    setErrorMsg(null)
    try {
      const [s, m] = await Promise.all([fetchSellers(), fetchWeekShifts()])
      setSellers(s)
      setShifts(m)
      setLastRefresh(new Date().toLocaleString('fr-FR'))
    } catch (e: any) {
      console.error('[ERR] refreshAll:', e)
      setErrorMsg(e.message || 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshAll()
  }, [])

  async function assignSeller(date: string, slot: Slot, seller_id: string | null) {
    setErrorMsg(null)
    const key = `${date}:${slot}`
    const prev = shifts[key]

    // Optimistic UI
    const temp: Shift =
      prev ?? { id: crypto.randomUUID(), date, slot, seller_id, created_at: new Date().toISOString() }
    setShifts({ ...shifts, [key]: { ...temp, seller_id } })

    const payload = prev ? { id: prev.id, date, slot, seller_id } : { date, slot, seller_id }
    console.log('[DBG] upsert payload:', payload)

    const { data, error } = await supabase.from('shifts').upsert(payload).select().limit(1).maybeSingle()
    if (error) {
      console.error('[ERR] upsert:', error)
      setErrorMsg(`Upsert échoué: ${error.message}`)
      // rollback visuel
      setShifts((s) => ({ ...s, [key]: prev ?? undefined }))
      return
    }
    console.log('[DBG] upsert ok:', data)
    await refreshAll()
  }

  function currentSellerId(date: string, slot: Slot) {
    return shifts[`${date}:${slot}`]?.seller_id ?? ''
  }

  async function purgeCaches() {
    try {
      localStorage.clear()
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((r) => r.unregister()))
      }
      alert('Caches vidés. Recharge la page (Ctrl+F5).')
    } catch (e) {
      console.warn('Purge caches error:', e)
    }
  }

  // ---- UI ----
  return (
    <div style={{ padding: '24px', display: 'grid', gap: '12px' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 600 }}>Planning — Debug</h1>

      <div
        style={{
          fontSize: '14px',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: 12,
        }}
      >
        <div>
          Dernier refresh : <b>{lastRefresh || '—'}</b>
        </div>
        <div>
          Vendeuses lues depuis <code>public.sellers</code> : <b>{sellers.length}</b>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={refreshAll}>🔄 Recharger</button>
          <button onClick={purgeCaches}>🧹 Vider caches</button>
        </div>
      </div>

      {errorMsg && (
        <div style={{ background: '#fee2e2', border: '1px solid #fecaca', padding: 12, borderRadius: 8 }}>
          Erreur : {errorMsg}
        </div>
      )}

      {loading ? (
        <div>Chargement…</div>
      ) : (
        <div style={{ overflow: 'auto' }}>
          <table style={{ minWidth: 900, width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #e5e7eb', padding: '8px 12px', textAlign: 'left' }}>Créneau</th>
                {days.map((d) => (
                  <th key={d.date} style={{ border: '1px solid #e5e7eb', padding: '8px 12px', textAlign: 'left' }}>
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(['MORNING', 'AFTERNOON', 'EVENING'] as Slot[]).map((slot) => (
                <tr key={slot}>
                  <td style={{ border: '1px solid #e5e7eb', padding: '8px 12px', fontWeight: 500 }}>
                    {SLOT_LABEL[slot]}
                  </td>
                  {days.map((d) => {
                    const value = currentSellerId(d.date, slot)
                    return (
                      <td key={d.date} style={{ border: '1px solid #e5e7eb', padding: '6px 8px' }}>
                        <select
                          style={{ width: '100%' }}
                          value={value}
                          onChange={(e) => {
                            const v = e.target.value
                            assignSeller(d.date, slot, v === '' ? null : v)
                          }}
                        >
                          <option value="">— Non affecté —</option>
                          {sellers.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.full_name}
                            </option>
                          ))}
                        </select>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
