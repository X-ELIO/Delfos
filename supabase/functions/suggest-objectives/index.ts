const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PEOPLE_KPIS = [
  'Employee Engagement Score',
  'Voluntary Turnover Rate',
  'Regrettable Attrition',
  'Individual Objectives Completion rate',
  'Internal Mobility Rate',
  'Gender Balance measures',
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { profile, cascade, priorities, today, typePreference } = await req.json()
    const currentDate = today ?? new Date().toISOString().split('T')[0]
    const currentYear = currentDate.slice(0, 4)
    const currentMonth = parseInt(currentDate.slice(5, 7))
    const currentQuarter = currentMonth <= 3 ? 'Q1' : currentMonth <= 6 ? 'Q2' : currentMonth <= 9 ? 'Q3' : 'Q4'
    const futureQuarters = ['Q1','Q2','Q3','Q4'].filter(q => q > currentQuarter).map(q => `${q} ${currentYear}`).concat([`Q1 ${parseInt(currentYear)+1}`])

    const isManager = profile.archetype_code === 'A' || profile.archetype_code === 'B'
    const pref = (typePreference ?? 'performance') as string
    const compositionNote = pref === 'learning'
      ? (isManager ? '2 performance + 2 learning + 1 team' : '2 performance + 3 learning')
      : pref === 'team'
      ? (isManager ? '2 performance + 1 learning + 2 team' : '3 performance + 2 learning (team N/A for ICs, using extra learning)')
      : (isManager ? '3 performance + 1 learning + 1 team (default)' : '4 performance + 1 learning (default)')

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

Your task is to generate EXACTLY 5 individual performance objectives for a specific employee. You MUST return exactly 5 objects — no more, no less.

## CURRENT DATE
Today is ${currentDate} (${currentQuarter} ${currentYear}). All deadlines MUST be in the future. Available quarters: ${futureQuarters.join(', ')}. Do NOT use past quarters or the current quarter if it ends within 2 weeks.

## Priority order for designing objectives

1. ROLE & DEPARTMENT FIT (most important)
   Objectives must reflect what this person actually does day-to-day. A Finance Analyst should have finance-specific objectives, not generic operations ones. Ground every objective in the employee's job title, department, and seniority level (archetype).

2. COUNTRY / MARKET RELEVANCE
   Objectives must be actionable in the employee's specific market. Consider local business context, team scale, and market maturity. Avoid copy-pasting corporate language if it doesn't apply locally.

3. CASCADE ALIGNMENT (context, not a template)
   Use the company and country strategic priorities as inspiration. At least 3 of the 5 objectives should connect to a cascade item — but the connection must feel natural for the role, not forced.

## Objective types
- performance: individual delivery, business metrics, project outcomes
- learning: skill acquisition, certifications, knowledge development
- team: people management outcomes — ONLY for Archetype A or B (people managers)

## Archetype guidance
- A (Strategic Leadership / C-Suite / VPs / Directors): strategic initiatives, organisational transformation, business outcomes at scale, P&L ownership
- B (Operational Leadership / Heads of Function / Senior Managers): team performance, project delivery, cross-functional collaboration, developing others
- C (Senior IC / SMEs): deep expertise, mentors, drives functional excellence, process improvement
- D (Individual Contributor / Analysts / Coordinators): delivers reliably, grows capabilities, domain skills

## Rules for Archetype A and B (people managers) — MANDATORY
1. At least 1 of the 5 objectives MUST be type "team". Team objectives reflect collective outcomes the manager drives — e.g. team capability building, cross-functional project delivery, team process improvement, knowledge transfer, upskilling the team.
2. "team" objectives must NOT duplicate the mandatory People Management KPIs listed below — those are tracked separately outside this portfolio.
3. Suggested composition: 3 performance + 1 learning + 1 team (adjust if the role strongly demands otherwise, but team must appear).

## Rules for Archetype C and D (individual contributors)
- Do NOT include any "team" type objectives. Use only "performance" and "learning".
- Suggested composition: at least 3 performance and at least 1 learning.

## Composition preference
The user has requested a focus on: "${typePreference ?? 'performance'}" objectives.
Target composition based on this preference: ${compositionNote}
Respect this preference while still applying all archetype rules above (e.g. A/B must always have at least 1 team, C/D must never have team).

## CRITICAL — People KPI exclusion (applies to ALL archetypes)
The following are MANDATORY KPIs tracked separately by HR. NEVER generate an objective that duplicates, rephrases, or is primarily about these metrics:
${PEOPLE_KPIS.map(k => `- ${k}`).join('\n')}

## General rules
- Each objective must be SMART: specific, measurable, time-bound
- Include a clear baseline, target, and measurement method in the description
- Include exactly 3 Key Results per objective (KR1, KR2, KR3)
- Write in English, professional tone, concise
- CRITICAL: Keep all values on one line — never use literal newlines inside JSON string values

Return ONLY a valid JSON array of exactly 5 objects. No markdown, no explanation, no extra text:
[
  {"type":"performance","title":"...","description":"...","key_results":["KR1: ...","KR2: ...","KR3: ..."],"by_when":"Q4 2026","metric":"primary KPI and target value","value_statement":"one sentence: how this adds value to X-ELIO"},
  ...
]`

    const userPrompt = `## Employee profile
- Name: ${profile.full_name}
- Job Title: ${profile.job_title || 'Not specified'}
- Department: ${profile.department || 'Not specified'}
- Country / Market: ${profile.country_label ?? 'Corporate'}
- Archetype: ${profile.archetype_code} — ${profile.archetype_label}
${isManager ? `- This is a PEOPLE MANAGER (Archetype ${profile.archetype_code}): portfolio MUST include at least 1 "team" type objective.` : `- This is an INDIVIDUAL CONTRIBUTOR (Archetype ${profile.archetype_code}): use only "performance" and "learning" types.`}
${priorities ? `- Self-reported priorities for 2026: ${priorities}` : ''}

## Strategic context
${cascadeText || 'No cascade data available.'}

Design 5 objectives highly relevant to this person's role and market.`

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
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as any[]

    const objectives = parsed
      .filter((obj: any) => obj.title)
      .map((obj: any, i: number) => ({
        id:              Date.now() + i,
        type:            obj.type ?? 'performance',
        title:           obj.title ?? '',
        description:     obj.description ?? '',
        key_results:     obj.key_results ?? [],
        by_when:         obj.by_when ?? '',
        metric:          obj.metric ?? '',
        value_statement: obj.value_statement ?? '',
        source:          'delfos',
        status:          'active',
        score:           null,
      }))

    return new Response(JSON.stringify({ objectives }), {
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
