import { supabase } from './supabase'

export async function suggestObjectivesStream({ profile, cascade, priorities, typePreference }, onObjective) {
  const { data: { session } } = await supabase.auth.getSession()
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/suggest-objectives`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      profile, cascade, priorities, typePreference,
      today: new Date().toISOString().split('T')[0],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`suggest-objectives: ${res.status} ${body}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const obj = JSON.parse(trimmed)
        if (obj.error) throw new Error(obj.error)
        onObjective(obj)
      } catch (e) {
        if (e instanceof SyntaxError) continue
        throw e
      }
    }
  }

  if (buffer.trim()) {
    try {
      const obj = JSON.parse(buffer.trim())
      if (obj.error) throw new Error(obj.error)
      onObjective(obj)
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e
    }
  }
}

async function invoke(fn, body) {
  const { data, error } = await supabase.functions.invoke(fn, { body })
  if (error) {
    // Extract the actual server error body
    let detail = error.message
    try {
      const ctx = error.context
      if (ctx?.json) {
        const j = await ctx.json()
        detail = j?.error ?? JSON.stringify(j)
      } else if (ctx?.text) {
        detail = await ctx.text()
      }
    } catch (_) {}
    throw new Error(`[${fn}] ${detail}`)
  }
  return data
}

const today = () => new Date().toISOString().split('T')[0]

export async function suggestObjectives({ profile, cascade, priorities, typePreference }) {
  return invoke('suggest-objectives', { profile, cascade, priorities, typePreference, today: today() })
}

export async function scoreObjectives({ profile, objectives, cascade }) {
  return invoke('score-objectives', { profile, objectives, cascade, today: today() })
}

export async function improveObjective({ profile, objective, cascade, otherTitles = [] }) {
  return invoke('improve-objective', { profile, objective, cascade, feedback: objective.feedback, otherTitles, today: today() })
}
