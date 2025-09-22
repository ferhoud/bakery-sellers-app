
import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'

type Message = {
  id: string
  content: string
  created_at: string
  sender_id: string
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    const { data } = await supabase.from('messages').select('*').order('created_at', { ascending: true }).limit(200)
    setMessages(data || [])
  }

  useEffect(() => {
    load()
    const channel = supabase.channel('messages-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        setMessages(prev => [...prev, payload.new as Message])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages.length])

  const send = async () => {
    const user = (await supabase.auth.getUser()).data.user
    if (!user || !text.trim()) return
    await supabase.from('messages').insert({ content: text.trim(), sender_id: user.id })
    setText('')
  }

  return (
    <div style={{ display: 'grid', gridTemplateRows: '1fr auto', height: 300 }}>
      <div ref={listRef} style={{ overflow: 'auto', border: '1px solid #eee', padding: 8, borderRadius: 6 }}>
        {messages.map(m => (
          <div key={m.id} style={{ marginBottom: 6 }}>
            <span style={{ opacity: 0.7, fontSize: 12 }}>{new Date(m.created_at).toLocaleString()}</span><br/>
            <span>{m.content}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input value={text} onChange={e=>setText(e.target.value)} placeholder="Écrire un message..." style={{ flex: 1 }} />
        <button onClick={send}>Envoyer</button>
      </div>
    </div>
  )
}
