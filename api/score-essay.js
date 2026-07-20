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

  const prompt = `You are helping a hiring team score a short essay written by a HUMAN applicant for a Product Specialist Apprentice role — an entry-level position. These are real people writing in their own words, usually quickly and under a time limit, and many are not native English speakers.

Judge the SUBSTANCE and SINCERITY of the answer, not the writing. Do NOT penalize grammar, spelling, phrasing, length, or a casual tone, and do not expect a polished or expert response — this is an apprentice applicant, not a professional writer. Reward a genuine, on-topic attempt.

Question: ${question}
Evaluator note (what a weaker vs stronger answer looks like): ${hint}
Candidate response: ${response}

Score using exactly one of three points — 1, 3, or 5 (never 2 or 4):
5 = Strong — on topic with a specific example or a genuinely thoughtful point, plus some real reasoning or self-awareness.
3 = Solid, expected answer — a sincere, on-topic response that makes at least one real point, even if it stays general or leaves some gaps. This is the normal score for a genuine human effort.
1 = Only when there is essentially no real attempt — blank, off-topic, a single throwaway line, self-contradictory, or generic filler with nothing of the applicant's own.

Be generous: most sincere, on-topic answers deserve at least a 3, and a 1 is reserved for answers that show no genuine effort. When an answer sits between two levels, round UP.

Return ONLY valid JSON with no other text: {"score":N,"feedback":"1-2 honest but fair sentences for the hiring team explaining the score"}`

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
