import { supabase } from './supabase'

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

export async function suggestObjectives({ profile, cascade, priorities }) {
  return invoke('suggest-objectives', { profile, cascade, priorities, today: today() })
}

export async function scoreObjectives({ profile, objectives, cascade }) {
  return invoke('score-objectives', { profile, objectives, cascade, today: today() })
}

export async function improveObjective({ profile, objective, cascade, otherTitles = [] }) {
  return invoke('improve-objective', { profile, objective, cascade, feedback: objective.feedback, otherTitles, today: today() })
}
