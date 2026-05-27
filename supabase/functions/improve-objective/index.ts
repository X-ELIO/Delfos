const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { profile, objective, cascade, feedback } = await req.json()

    const corporateItems = (cascade ?? []).filter((c: any) => c.scope === 'corporate').slice(0, 6)
    const cascadeSummary = corporateItems.map((c: any) => `- ${c.text}`).join('\n')

    const systemPrompt = `You are Delfos, an AI performance management engine for X-ELIO.
Your job is to rewrite a single objective to improve its quality and Bonus Potential score.
Keep the same general intent but make it more specific, measurable, ambitious, and cascade-aligned.
Include a clear baseline, target, and measurement method.
Include exactly 3 Key Results.

Return ONLY a valid JSON object, no markdown:
{
  "title": "improved title",
  "description": "improved description with baseline, target, measurement",
  "key_results": ["KR1: ...", "KR2: ...", "KR3: ..."]
}`

    const userPrompt = `Employee: ${profile.full_name} | ${profile.archetype_code} — ${profile.archetype_label} | ${profile.country_label ?? 'Corporate'}

Corporate cascade:
${cascadeSummary || 'Not available'}

Current objective (score: ${objective.score ?? 'unscored'}):
Title: ${objective.title}
Description: ${objective.description ?? ''}
${objective.key_results?.length ? 'KRs: ' + objective.key_results.join(' | ') : ''}

${feedback ? `Coaching feedback to address: ${feedback}` : ''}
${objective.sub_scores ? `Weakest dimensions: measurability=${objective.sub_scores.measurability}, ambition=${objective.sub_scores.ambition}, impact=${objective.sub_scores.impact}` : ''}

Rewrite this objective to score higher. Keep the same general topic.`

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!apiRes.ok) {
      const errBody = await apiRes.text()
      throw new Error(`Anthropic API error ${apiRes.status}: ${errBody}`)
    }

    const apiData = await apiRes.json()
    const raw = apiData.content[0].text.trim()
    const jsonStart = raw.indexOf('{')
    const jsonEnd   = raw.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) throw new Error(`No JSON in response: ${raw.slice(0, 200)}`)
    const improved = JSON.parse(raw.slice(jsonStart, jsonEnd + 1))

    return new Response(JSON.stringify(improved), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('improve-objective error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
