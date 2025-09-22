
import React from 'react'
import { supabase } from '../supabaseClient'
import Schedule from './Schedule'
import Chat from './Chat'
import Timesheet from './Timesheet'

export default function Dashboard() {
  const signOut = async () => { await supabase.auth.signOut() }
  return (
    <div style={{ fontFamily: 'system-ui', padding: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Boulangerie · Vendeuses</h2>
        <button onClick={signOut}>Se déconnecter</button>
      </header>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr' }}>
        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
          <h3>Planning hebdomadaire</h3>
          <Schedule />
        </div>
        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
          <h3>Chat de l'équipe</h3>
          <Chat />
        </div>
        <div style={{ gridColumn: '1 / -1', border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
          <h3>Heures du mois</h3>
          <Timesheet />
        </div>
      </div>
    </div>
  )
}
