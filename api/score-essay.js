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

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ score: null, feedback: 'API key not configured on server.' })
  }

  // Free-tier Gemini flash model. Override with GEMINI_MODEL (e.g. gemini-3.5-flash).
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

  const prompt = `You are evaluating a job application essay for a Product Specialist Apprentice role. The role values critical thinking, attention to detail, clear communication, and process improvement.

Question: ${question}
Evaluator note: ${hint}
Candidate response: ${response}

Score using exactly one of three points — 1, 3, or 5 (do not use 2 or 4):
1 = Below expectation — vague or generic, no concrete example, misses the point, or the reasoning doesn't hold up.
3 = Meets expectation — a real, specific example with sound reasoning, but stays surface-level or leaves gaps.
5 = Exceeds expectation — specific, insightful, and genuinely thoughtful, with clear reasoning and self-awareness.

If a response falls between two levels, round to the nearest of 1, 3, or 5.

Return ONLY valid JSON with no other text: {"score":N,"feedback":"1-2 specific sentences for the hiring team explaining the score"}`

  try {
    const apiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json'
          }
        })
      }
    )

    const data = await apiRes.json()

    if (data.error) {
      return res.status(500).json({ score: null, feedback: `AI scoring unavailable: ${data.error.message || 'request rejected'}` })
    }

    // Gemini returns text across one or more parts; join and parse.
    const text = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim()
    if (!text) {
      const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason || 'no content'
      return res.status(500).json({ score: null, feedback: `AI scoring returned no result (${reason}). Please try again.` })
    }

    const result = JSON.parse(text)
    return res.json(result)
  } catch (error) {
    console.error('Score essay error:', error)
    return res.status(500).json({ score: null, feedback: 'Scoring failed. Please try again.' })
  }
}
