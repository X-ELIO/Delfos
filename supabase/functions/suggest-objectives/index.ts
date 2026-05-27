const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { profile, cascade, priorities } = await req.json()

    const corporateItems = (cascade ?? []).filter((c: any) => c.scope === 'corporate')
    const countryItems   = (cascade ?? []).filter((c: any) => c.scope === 'country')

    const cascadeText = [
      corporateItems.length > 0
        ? `CORPORATE CASCADE:\n` + corporateItems.map((c: any) => `- ${c.text}${c.weight_percent ? ` (${c.weight_percent}%)` : ''}`).join('\n')
        : '',
      countryItems.length > 0
        ? `${(profile.country_label ?? '').toUpperCase()} CASCADE:\n` + countryItems.map((c: any) => `- ${c.text}`).join('\n')
        : '',
    ].filter(Boolean).join('\n\n')

    const systemPrompt = `You are Delfos, an AI performance management engine for X-ELIO, a global energy transition company.

Your task is to generate EXACTLY 5 individual performance objectives for a specific employee for 2026. You MUST return exactly 5 objects — no more, no less.

## Priority order for designing objectives

1. ROLE & DEPARTMENT FIT (most important)
   Objectives must reflect what this person actually does day-to-day. A Finance Analyst should have finance-specific objectives, not generic operations ones. Ground every objective in the employee's job title, department, and seniority level (archetype).

2. COUNTRY / MARKET RELEVANCE
   Objectives must be actionable in the employee's specific market. Consider local business context, team scale, and market maturity. Avoid copy-pasting corporate language if it doesn't apply locally.

3. CASCADE ALIGNMENT (context, not a template)
   Use the company and country strategic priorities as inspiration and alignment context. At least 3 of the 5 objectives should connect to a cascade item — but the connection must feel natural for the role, not forced.

## Archetype guidance
- A (Individual Contributor / Specialist): technical delivery, process improvement, own skill development, domain expertise
- B (Team Lead / People Manager): team performance, project delivery, cross-functional collaboration, developing others
- C (Senior Manager / Director): strategic initiatives, organisational transformation, business outcomes at scale
- D (Executive / VP): market leadership, P&L ownership, strategic partnerships, organisational capability building

## Rules
- Each objective must be SMART: specific, measurable, time-bound
- Include a clear baseline, target, and measurement method in the description
- Include exactly 3 Key Results per objective (KR1, KR2, KR3)
- Mix types: at least 3 performance objectives and at least 1 learning objective
- Do NOT include People Management KPIs (those are tracked separately)
- Write in English, professional tone, concise

Return ONLY a valid JSON array with exactly 5 objects — no markdown, no explanation, no trailing text:
[
  {
    "type": "performance",
    "title": "...",
    "description": "...",
    "key_results": ["KR1: ...", "KR2: ...", "KR3: ..."],
    "by_when": "Q4 2026",
    "metric": "primary KPI and target value (e.g. NPS from 45 to 60)",
    "value_statement": "one sentence: how this objective adds value to X-ELIO's business"
  },
  {
    "type": "performance",
    "title": "...",
    "description": "...",
    "key_results": ["KR1: ...", "KR2: ...", "KR3: ..."],
    "by_when": "Q3 2026",
    "metric": "...",
    "value_statement": "..."
  },
  {
    "type": "performance",
    "title": "...",
    "description": "...",
    "key_results": ["KR1: ...", "KR2: ...", "KR3: ..."],
    "by_when": "Q4 2026",
    "metric": "...",
    "value_statement": "..."
  },
  {
    "type": "learning",
    "title": "...",
    "description": "...",
    "key_results": ["KR1: ...", "KR2: ...", "KR3: ..."],
    "by_when": "Q2 2026",
    "metric": "...",
    "value_statement": "..."
  },
  {
    "type": "learning",
    "title": "...",
    "description": "...",
    "key_results": ["KR1: ...", "KR2: ...", "KR3: ..."],
    "by_when": "Q3 2026",
    "metric": "...",
    "value_statement": "..."
  }
]`

    const userPrompt = `## Employee profile
- Name: ${profile.full_name}
- Job Title: ${profile.job_title || 'Not specified'}
- Department: ${profile.department || 'Not specified'}
- Country / Market: ${profile.country_label ?? 'Corporate'}
- Archetype: ${profile.archetype_code} — ${profile.archetype_label}
${priorities ? `- Self-reported priorities for 2026: ${priorities}` : ''}

## Strategic context (use for alignment, not as a template)
${cascadeText || 'No cascade data available.'}

Design 5 objectives that are highly relevant to this person's role and market, and where natural, connected to the strategic priorities above.`

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
    const jsonStart = raw.indexOf('[')
    const jsonEnd   = raw.lastIndexOf(']')
    if (jsonStart === -1 || jsonEnd === -1) throw new Error(`No JSON array in response: ${raw.slice(0, 200)}`)
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1))

    const result = parsed.map((s: any, i: number) => ({
      id:              Date.now() + i,
      type:            s.type ?? 'performance',
      title:           s.title ?? '',
      description:     s.description ?? '',
      key_results:     s.key_results ?? [],
      by_when:         s.by_when ?? '',
      metric:          s.metric ?? '',
      value_statement: s.value_statement ?? '',
      source:          'delfos',
      status:          'active',
      score:           null,
    }))

    return new Response(JSON.stringify(result), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('suggest-objectives error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
