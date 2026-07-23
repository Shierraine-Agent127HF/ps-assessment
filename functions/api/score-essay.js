// Cloudflare Pages Function — AI essay scoring via Google Gemini.
// Mirrors the Vercel handler in api/score-essay.js, but in Cloudflare Pages
// Functions format: the file path functions/api/score-essay.js maps to the
// route /api/score-essay, env vars come from `context.env` (not process.env),
// and it returns a Response object (Workers runtime). Keeping both files means
// the same repo deploys on Cloudflare (this file) or Vercel (api/) unchanged.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } })

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function onRequestPost(context) {
  const { request, env } = context

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  const { question, hint, response } = body || {}
  if (!question || !response) return json({ error: 'Missing required fields' }, 400)

  if (!env.GEMINI_API_KEY) return json({ score: null, feedback: 'API key not configured on server.' }, 500)

  // Free-tier Gemini flash model. Override with GEMINI_MODEL (e.g. gemini-3.5-flash).
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash'

  const prompt = `You are helping a hiring team score a short essay written by a HUMAN applicant for a Product Specialist Apprentice role — an entry-level position. These are real people writing in their own words, usually quickly and under a time limit, and many are not native English speakers.

Judge the QUALITY OF THINKING, not the writing. Do NOT penalize grammar, spelling, phrasing, length, or a casual tone — this is an apprentice applicant, not a professional writer, and many are not native English speakers. But sincerity alone is not enough: the score should still reflect how well the applicant actually engaged with the question.

Question: ${question}
Evaluator note (what a weaker vs stronger answer looks like): ${hint}
Candidate response: ${response}

Score using exactly one of three points — 1, 3, or 5 (never 2 or 4):
5 = Strong — clearly engages the question with a CONCRETE example or specific detail AND some real reasoning, insight, or self-awareness. Genuinely good, not just present.
3 = Meets expectation — a real, on-topic answer that makes at least one concrete point, but stays general or surface-level, leaves gaps, or doesn't fully develop its reasoning. This is the typical solid answer.
1 = Below expectation — vague or generic with no concrete example, misses the point, is off-topic, contradicts itself, or is filler that could have been written without reading the question. Sincere effort alone still scores 1 if there's no real substance.

Don't inflate: a 5 must be earned with specifics AND thought, not given for a single on-topic sentence. Reserve 3 for answers with genuine substance, not just a sincere attempt. When an answer sits squarely between two levels, round to the nearest — and down if the reasoning is thin.

Return ONLY valid JSON with no other text: {"score":N,"feedback":"1-2 honest but fair sentences for the hiring team explaining the score"}`

  try {
    const apiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': env.GEMINI_API_KEY
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
      return json({ score: null, feedback: `AI scoring unavailable: ${data.error.message || 'request rejected'}` }, 500)
    }

    // Gemini returns text across one or more parts; join and parse.
    const text = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim()
    if (!text) {
      const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason || 'no content'
      return json({ score: null, feedback: `AI scoring returned no result (${reason}). Please try again.` }, 500)
    }

    return json(JSON.parse(text))
  } catch (error) {
    return json({ score: null, feedback: 'Scoring failed. Please try again.' }, 500)
  }
}
