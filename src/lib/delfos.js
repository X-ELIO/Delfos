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

export async function suggestObjectives({ profile, cascade, priorities }) {
  return invoke('suggest-objectives', { profile, cascade, priorities })
}

export async function scoreObjectives({ profile, objectives, cascade }) {
  return invoke('score-objectives', { profile, objectives, cascade })
}

export async function improveObjective({ profile, objective, cascade, otherTitles = [] }) {
  return invoke('improve-objective', { profile, objective, cascade, feedback: objective.feedback, otherTitles })
}
