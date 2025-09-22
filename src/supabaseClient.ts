import { createClient } from '@supabase/supabase-js'

// Récupération des variables Vite (injectées au build)
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Petit helper pour masquer la clé dans les logs
const mask = (s?: string) => (s ? s.slice(0, 6) + '…' + s.slice(-4) : 'undefined')

if (!url || !anonKey) {
  // Message clair côté navigateur si la config n'est pas injectée
  const msg = [
    '⚠️ Config Supabase manquante :',
    `VITE_SUPABASE_URL = ${url ?? 'undefined'}`,
    `VITE_SUPABASE_ANON_KEY = ${anonKey ? '(présente)' : 'undefined'}`,
    '➡️ Sur Vercel, ajoute ces variables dans Project → Settings → Environment Variables, puis Redeploy.'
  ].join('\n')
  // Affiche un message visible pour l’admin
  alert(msg)
  // Et écris en console pour debug
  console.error(msg)
  // On jette quand même pour éviter des appels avec une config invalide
  throw new Error('Supabase config is missing')
}

// Client Supabase
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
})

// (Facultatif) Log minimal pour vérifier rapidement en prod
console.log('[Supabase]', {
  url,
  anonKey: mask(anonKey)
})
