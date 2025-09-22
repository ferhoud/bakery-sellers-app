
import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parse } from 'date-fns'

type Seller = { id: string; name: string }
type Shift = { seller_id: string; day: string; start_time: string; end_time: string }

function diffHours(start: string, end: string): number {
  // expects 'HH:mm'
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return Math.max(0, (eh * 60 + em) - (sh * 60 + sm)) / 60
}

export default function Timesheet() {
  const [sellers, setSellers] = useState<Seller[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [month, setMonth] = useState<Date>(new Date())

  const range = useMemo(() => {
    const from = startOfMonth(month)
    const to = endOfMonth(month)
    return { from, to }
  }, [month])

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from('sellers').select('id,name').order('name')
      setSellers(s || [])
    })()
  }, [])

  useEffect(() => {
    (async () => {
      const fromStr = format(range.from, 'yyyy-MM-dd')
      const toStr = format(range.to, 'yyyy-MM-dd')
      const { data } = await supabase.from('shifts').select('*').gte('day', fromStr).lte('day', toStr)
      setShifts(data || [])
    })()
  }, [range.from.getTime(), range.to.getTime()])

  const totals = useMemo(() => {
    const t: Record<string, number> = {}
    for (const s of shifts) {
      if (!s.start_time || !s.end_time) continue
      const h = diffHours(s.start_time, s.end_time)
      t[s.seller_id] = (t[s.seller_id] || 0) + h
    }
    return t
  }, [shifts])

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>◀︎</button>
        <strong>{format(month, 'MMMM yyyy')}</strong>
        <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>▶︎</button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
        <thead>
          <tr>
            <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>Vendeuse</th>
            <th style={{ borderBottom: '1px solid #ccc' }}>Heures</th>
          </tr>
        </thead>
        <tbody>
          {sellers.map(s => (
            <tr key={s.id}>
              <td style={{ borderBottom: '1px solid #eee' }}>{s.name}</td>
              <td style={{ borderBottom: '1px solid #eee', textAlign: 'center' }}>{(totals[s.id] || 0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
