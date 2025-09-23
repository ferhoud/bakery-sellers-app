import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { addDays, startOfWeek, format } from 'date-fns'

type Shift = {
  id: string
  day: string // YYYY-MM-DD
  seller_id: string
  start_time: string // '08:00'
  end_time: string   // '14:00'
}

type Seller = {
  id: string
  name: string
  email: string
}

const weekdays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

const SLOTS = [
  { key: 'OPEN1', label: 'Vendeuse 1 (matin)',         time: { start: '06:30', end: '13:30' } },
  { key: 'OPEN2', label: 'Vendeuse 2 (renfort matin)', time: { start: '07:00', end: '13:00' } },
  { key: 'PM',    label: 'Vendeuse 3 (après-midi)',    time: { start: '13:30', end: '20:30' } },
] as const
type SlotKey = typeof SLOTS[number]['key']

function stringToHsl(input: string, s = 65, l = 78) {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = input.charCodeAt(i) + ((hash << 5) - hash)
  }
  const h = Math.abs(hash) % 360
  return `hsl(${h}, ${s}%, ${l}%)`
}
function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
function slotDurationMinutes(slot: { start: string; end: string }) {
  return Math.max(0, timeToMinutes(slot.end) - timeToMinutes(slot.start))
}

export default function Schedule({ isAdmin }: { isAdmin: boolean }) {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const days = useMemo(() => [...Array(7)].map((_, i) => addDays(weekStart, i)), [weekStart])
  const [sellers, setSellers] = useState<Seller[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(false)

  const todayStr = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from('sellers').select('*').order('name')
      setSellers(s || [])
    })()
  }, [])

  const loadWeek = async () => {
    setLoading(true)
    const from = format(days[0], 'yyyy-MM-dd')
    const to = format(days[6], 'yyyy-MM-dd')
    const { data } = await supabase
      .from('shifts')
      .select('*')
      .gte('day', from)
      .lte('day', to)
    setShifts(data || [])
    setLoading(false)
  }

  useEffect(() => { loadWeek() }, [weekStart])

  const assignedSellerId = (dayStr: string, slot: SlotKey): string | '' => {
    const t = SLOTS.find(s => s.key === slot)!.time
    const found = shifts.find(sh => sh.day === dayStr && sh.start_time === t.start && sh.end_time === t.end)
    return found?.seller_id || ''
  }
  const assignedSeller = (dayStr: string, slot: SlotKey): Seller | undefined => {
    const id = assignedSellerId(dayStr, slot)
    return sellers.find(s => s.id === id)
  }

  const isAssigned = (sellerId: string, dayStr: string) =>
    shifts.some(sh => sh.day === dayStr && sh.seller_id === sellerId)

  const saveAssignment = async (seller_id: string, day: string, slot: SlotKey) => {
    if (!isAdmin) {
      alert("Action réservée à l’administrateur.")
      return
    }
    const t = SLOTS.find(s => s.key === slot)!.time
    const { data: existing } = await supabase.from('shifts')
      .select('id')
      .eq('day', day)
      .eq('start_time', t.start)
      .eq('end_time', t.end)
      .limit(1)

    if (existing && existing.length) {
      await supabase.from('shifts').delete().eq('id', existing[0].id)
    }

    if (seller_id) {
      const { error } = await supabase
        .from('shifts')
        .insert({ seller_id, day, start_time: t.start, end_time: t.end })

      if (error) {
        alert(error.message.includes("policy") ? "Action réservée à l’admin." : "Conflit: vendeuse déjà planifiée ce jour.")
        await loadWeek()
        return
      }
    }
    await loadWeek()
  }

  const duplicateToNextWeek = async () => {
    if (!isAdmin) { alert("Action réservée à l’admin."); return }
    for (const d of days) {
      const srcDayStr = format(d, 'yyyy-MM-dd')
      const nextDayStr = format(addDays(d, 7), 'yyyy-MM-dd')
      for (const slot of SLOTS) {
        const t = slot.time
        const current = shifts.find(sh =>
          sh.day === srcDayStr && sh.start_time === t.start && sh.end_time === t.end
        )
        if (current?.seller_id) {
          await saveAssignment(current.seller_id, nextDayStr, slot.key as SlotKey)
        }
      }
    }
    setWeekStart(addDays(weekStart, 7))
  }

  const todaySegments = SLOTS.map(slot => {
    const sel = assignedSeller(todayStr, slot.key)
    const dur = slotDurationMinutes(slot.time)
    const bg = sel ? stringToHsl(sel.id) : '#f2f2f2'
    const label = sel?.name || '—'
    return { key: slot.key, start: slot.time.start, end: slot.time.end, name: label, minutes: dur, bg }
  })
  const totalMinutes = todaySegments.reduce((acc, seg) => acc + seg.minutes, 0) || 1

  return (
    <div style={{ fontFamily: 'system-ui' }}>
      <div style={{ border: '1px solid #e5e5e5', borderRadius: 10, padding: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <strong>Aujourd&apos;hui — {format(new Date(), 'dd/MM/yyyy')}</strong>
          <span style={{ opacity: 0.7, fontSize: 12 }}>06:30 → 20:30</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {todaySegments.map((seg) => (
            <div
              key={seg.key}
              style={{
                flexGrow: seg.minutes,
                flexBasis: `${(seg.minutes / totalMinutes) * 100}%`,
                background: seg.bg,
                borderRadius: 10,
                padding: 10,
                minWidth: 80,
                textAlign: 'center'
              }}
            >
              <div style={{ fontWeight: 700 }}>{seg.name}</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>{seg.start} — {seg.end}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <button onClick={() => setWeekStart(addDays(weekStart, -7))}>◀︎</button>
        <strong>Semaine du {format(days[0], 'dd/MM/yyyy')}</strong>
        <button onClick={() => setWeekStart(addDays(weekStart, 7))}>▶︎</button>
        <button onClick={loadWeek} disabled={loading}>{loading ? '...' : 'Rafraîchir'}</button>
        {isAdmin && <button onClick={duplicateToNextWeek}>Dupliquer vers semaine suivante</button>}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>Plage horaire</th>
              {days.map((d, i) => (
                <th key={i} style={{ borderBottom: '1px solid #ccc' }}>
                  {weekdays[i]}<br/>{format(d, 'dd/MM')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SLOTS.map(slot => (
              <tr key={slot.key}>
                <td style={{ borderBottom: '1px solid #eee', fontWeight: 600 }}>
                  {slot.label} <div style={{ fontWeight: 400, opacity: 0.8 }}>{slot.time.start} → {slot.time.end}</div>
                </td>
                {days.map((d, i) => {
                  const dayStr = format(d, 'yyyy-MM-dd')
                  const selId = assignedSellerId(dayStr, slot.key)
                  const cellBg = selId ? stringToHsl(selId, 65, 88) : 'transparent'
                  return (
                    <td
                      key={i}
                      style={{
                        borderBottom: '1px solid #eee',
                        padding: 6,
                        minWidth: 180,
                        background: cellBg,
                        borderRadius: 10
                      }}
                    >
                      <select
                        value={selId}
                        onChange={(e) => saveAssignment(e.target.value, dayStr, slot.key)}
                        style={{ width: '100%' }}
                        disabled={!isAdmin}
                      >
                        <option value="">— (aucune)</option>
                        {sellers.map(s => {
                          const already = isAssigned(s.id, dayStr)
                          const isCurrent = selId === s.id
                          return (
                            <option
                              key={s.id}
                              value={s.id}
                              disabled={(!isAdmin && !isCurrent) || (already && !isCurrent)}
                            >
                              {s.name}{already && !isCurrent ? ' (déjà prise)' : ''}
                            </option>
                          )
                        })}
                      </select>
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
