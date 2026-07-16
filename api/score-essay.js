export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { question, hint, response } = req.body

  if (!question || !response) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ score: null, feedback: 'API key not configured on server.' })
  }

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: `You are evaluating a job application essay for a Product Specialist Apprentice role. The role values critical thinking, attention to detail, clear communication, and process improvement.

Question: ${question}
Evaluator note: ${hint}
Candidate response: ${response}

Score using exactly one of three points — 1, 3, or 5 (do not use 2 or 4):
1 = Below expectation — vague or generic, no concrete example, misses the point, or the reasoning doesn't hold up.
3 = Meets expectation — a real, specific example with sound reasoning, but stays surface-level or leaves gaps.
5 = Exceeds expectation — specific, insightful, and genuinely thoughtful, with clear reasoning and self-awareness.

If a response falls between two levels, round to the nearest of 1, 3, or 5.

Return ONLY valid JSON with no other text: {"score":N,"feedback":"1-2 specific sentences for the hiring team explaining the score"}`
        }]
      })
    })

    const data = await apiRes.json()

    if (data.error) {
      return res.status(500).json({ score: null, feedback: 'AI scoring unavailable. Please try again.' })
    }

    const result = JSON.parse(data.content[0].text.trim())
    return res.json(result)
  } catch (error) {
    console.error('Score essay error:', error)
    return res.status(500).json({ score: null, feedback: 'Scoring failed. Please try again.' })
  }
}
