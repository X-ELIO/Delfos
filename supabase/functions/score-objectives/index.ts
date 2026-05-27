const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { profile, objectives, cascade } = await req.json()

    const corporateItems = (cascade ?? []).filter((c: any) => c.scope === 'corporate').slice(0, 8)
    const cascadeSummary = corporateItems.map((c: any) => `- ${c.text}`).join('\n')

    const objectivesList = objectives.map((o: any, i: number) =>
      `OBJ ${i + 1} [${o.type}]:\nTitle: ${o.title}\nDescription: ${o.description ?? ''}${o.key_results?.length ? '\nKRs: ' + o.key_results.join(' | ') : ''}`
    ).join('\n\n')

    const systemPrompt = `You are Delfos, an AI performance management engine for X-ELIO, a global energy transition company.

Score each objective for Bonus Potential (0–100). Then write a portfolio-level summary.

Scoring dimensions:
- Role fit (25%): realistic and meaningful for this specific job title, department, seniority, and market?
- Business impact (20%): moves a metric that genuinely matters for X-ELIO?
- Cascade alignment (20%): connects naturally to corporate or country strategic priorities?
- Ambition (15%): target is genuinely stretching, not just business-as-usual?
- Measurability (15%): clear baseline, target, and measurement method?
- SMART quality (5%): specific and time-bound?

Rules:
- Portfolio weights must sum to EXACTLY 100
- feedback: one sharp sentence on the main concern or stretch quality of this objective (shown as italic callout)
- coaching_tips: 1-2 concrete actions to increase this objective's score (max 15 words each, specific not generic)
- linked_cascades: short text of cascade items this connects to (empty array if none)
- summary: 3-4 sentences evaluating the full portfolio — name specific objectives by title fragment, identify the top strength and the key gap to address

Return ONLY a valid JSON object, no markdown, no explanation:
{
  "summary": "3-4 sentence portfolio narrative",
  "objectives": [
    {
      "obj_index": 0,
      "score": 78,
      "weight": 20,
      "feedback": "one sharp concern or stretch sentence",
      "coaching_tips": ["specific action 1", "specific action 2"],
      "linked_cascades": ["cascade item text"],
      "sub_scores": { "role_fit": 80, "impact": 75, "relevance": 70, "ambition": 80, "measurability": 85, "smart": 90 }
    }
  ]
}`

    const userPrompt = `Employee: ${profile.full_name} | ${profile.archetype_code} — ${profile.archetype_label}
Job: ${profile.job_title || 'N/A'} | ${profile.department || 'N/A'} | ${profile.country_label ?? 'Corporate'}

Corporate cascade:
${cascadeSummary || 'Not available'}

Objectives to score:
${objectivesList}

Score each objective and write the portfolio summary. All weights must sum to 100.`

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2500,
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
    const parsed  = JSON.parse(raw.slice(jsonStart, jsonEnd + 1))
    const scores  = parsed.objectives ?? []
    const summary = parsed.summary ?? ''

    const result = {
      summary,
      objectives: objectives.map((obj: any, i: number) => {
        const s = scores.find((x: any) => x.obj_index === i) ?? scores[i] ?? {}
        return {
          ...obj,
          score:           s.score ?? 70,
          weight:          s.weight ?? Math.round(100 / objectives.length),
          feedback:        s.feedback ?? '',
          coaching_tips:   s.coaching_tips ?? [],
          linked_cascades: s.linked_cascades ?? [],
          sub_scores:      s.sub_scores ?? { role_fit: 70, impact: 70, relevance: 70, ambition: 70, measurability: 70, smart: 70 },
        }
      }),
    }

    return new Response(JSON.stringify(result), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('score-objectives error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
