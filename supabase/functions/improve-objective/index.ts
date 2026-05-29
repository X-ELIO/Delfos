const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { profile, objective, cascade, feedback, otherTitles, today } = await req.json()
    const currentDate = today ?? new Date().toISOString().split('T')[0]

    const corporateItems = (cascade ?? []).filter((c: any) => c.scope === 'corporate').slice(0, 6)
    const countryItems   = (cascade ?? []).filter((c: any) => c.scope === 'country')
    const cascadeSummary = [
      corporateItems.length > 0
        ? 'CORPORATE:\n' + corporateItems.map((c: any) => `- ${c.text}`).join('\n')
        : '',
      countryItems.length > 0
        ? `${(profile.country_label ?? 'COUNTRY').toUpperCase()}:\n` + countryItems.map((c: any) => `- ${c.text}`).join('\n')
        : '',
    ].filter(Boolean).join('\n\n')

    const objectiveType = objective.type ?? 'performance'

    const typeGuidance = objectiveType === 'learning'
      ? `TYPE: learning — personal skill development, certifications, knowledge acquisition.
RULES FOR LEARNING OBJECTIVES:
- Title must describe a skill or certification gained, NOT a business outcome (e.g. "Complete PMP certification", "Develop advanced Python data-analysis skills").
- Description explains WHY this skill matters for the role and HOW it will be applied once acquired.
- KRs are learning milestones: course completed, certification passed, knowledge applied — NOT business KPIs.
- Metric field should reference completion of learning, NOT a business metric.
- Do NOT write something that looks like a performance objective with a course attached.`
      : objectiveType === 'team'
      ? `TYPE: team — collective outcomes this people manager drives (team capability, cross-functional delivery, upskilling, process improvement).
RULES FOR TEAM OBJECTIVES:
- The outcome must be a team-level result, not an individual one.
- Must NOT duplicate mandatory People KPIs (engagement score, turnover rate, attrition, internal mobility, gender balance, objectives completion rate).
- Focus on what the manager does to improve team performance, not on HR metrics.`
      : `TYPE: performance — individual delivery, business metrics, project outcomes.
RULES FOR PERFORMANCE OBJECTIVES:
- Title names a business result with a measurable target.
- KRs are milestones toward that business result.
- Include a clear baseline, target, and measurement method.`

    const systemPrompt = `You are Delfos, an AI performance management engine for X-ELIO.
Today is ${currentDate}. All deadlines MUST be in the future — do not use past or imminent quarters.
Your job is to write or rewrite a single objective to improve its quality and Bonus Potential score.

## MANDATORY: Objective type constraint
${typeGuidance}

You MUST produce an objective that strictly follows the rules above for this type. Do NOT switch to a different type.

CRITICAL UNIQUENESS RULE:
- The title MUST be clearly and meaningfully different from the original — not a minimal rephrasing.
- The objective MUST NOT duplicate or closely resemble any other objective already in the portfolio.

Include exactly 3 Key Results.

Return ONLY a valid JSON object, no markdown:
{
  "title": "...",
  "description": "...",
  "key_results": ["KR1: ...", "KR2: ...", "KR3: ..."]
}`

    const userPrompt = `Employee: ${profile.full_name} | ${profile.archetype_code} — ${profile.archetype_label} | ${profile.country_label ?? 'Corporate'}

Strategic cascade:
${cascadeSummary || 'Not available'}

Current objective (score: ${objective.score ?? 'unscored'}):
Title: ${objective.title}
Description: ${objective.description ?? ''}
${objective.key_results?.length ? 'KRs: ' + objective.key_results.join(' | ') : ''}

${feedback ? `Coaching feedback to address: ${feedback}` : ''}
${objective.sub_scores ? `Weakest dimensions: measurability=${objective.sub_scores.measurability}, ambition=${objective.sub_scores.ambition}, impact=${objective.sub_scores.impact}` : ''}
${(otherTitles ?? []).length > 0 ? `\nOther objectives already in this portfolio — do NOT repeat or overlap with any of these:\n${(otherTitles as string[]).map((t: string) => `- ${t}`).join('\n')}` : ''}

Rewrite this objective to score higher. The new title must be meaningfully different from the original: "${objective.title}"`

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
