/**
 * JusticeNow — AI Legal Guidance service (Anthropic API).
 *
 * WHAT IT DOES: takes a plain-language description of a situation and returns
 * EDUCATIONAL guidance — what kind of case it is, how it's handled, which Sri
 * Lankan laws/rights apply, how to approach it, and approximate fees. This is
 * SEPARATE from filing a case: nothing is stored and no report is created.
 *
 * PRIVACY / SAFETY:
 *  - The scenario is sent to Anthropic to generate guidance, so the user is told
 *    not to include their name/contact. We NEVER log the scenario or the
 *    response, and never persist either.
 *  - The API key lives ONLY on the server (ANTHROPIC_API_KEY). It must never
 *    reach the client.
 *  - The model is instructed to give GENERAL information (not legal advice), to
 *    ignore any identifying details, and to avoid inventing specific statute
 *    numbers or lawyer names. Real lawyer/org suggestions are added by the
 *    controller from our own directory — never by the model.
 */

const { CASE_TYPES } = require('../constants');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
// Model is configurable; defaults to a cheap, fast Claude Haiku.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';

const SYSTEM_PROMPT = `You are a legal-information assistant for JusticeNow, an anonymous human-rights
case service in Sri Lanka. A person describes a situation; you explain it in
plain, calm language for someone who is NOT a lawyer.

RULES:
- Give GENERAL LEGAL INFORMATION, never definitive legal advice. Always make
  clear a qualified lawyer should be consulted.
- Focus on SRI LANKAN law and rights (e.g. the Constitution's fundamental
  rights, the Penal Code, relevant Acts). Only name a specific law if you are
  confident; otherwise describe the right/protection in plain terms. Never invent
  statute numbers.
- Do NOT invent lawyer names, firms, or phone numbers. Real referrals are added
  separately.
- Ignore and never repeat any personal identifying details the person includes
  (names, NIC, phone, address). Do not ask who they are.
- If there is immediate danger, say so and tell them to contact emergency/local
  authorities where safe.
- For "approximate_fees": give a GENERAL, rough idea only (e.g. a typical LKR
  range or "varies"). ALWAYS say it varies widely, and note that legal-aid
  organisations often help for free or low cost. Never state it as a quote.
- Respond ONLY with a valid JSON object, no markdown, matching exactly:
{
  "category": one of ${JSON.stringify(CASE_TYPES)},
  "summary": "1-2 sentence plain summary of what kind of situation this is",
  "how_handled": ["short point on how this type of case is usually handled / what the process looks like", ...],
  "applicable_laws": ["short plain-language point about a relevant SL law/right", ...],
  "steps": ["a concrete, ordered step the person can take", ...],
  "approximate_fees": "a short, caveated note on typical costs (and that legal aid may be free)",
  "safety_note": "a short safety note if relevant, else an empty string"
}
Keep arrays to at most 5 concise items each. Use the reader's language if the
scenario is written in Tamil or Sinhala.`;

/**
 * Is the AI guidance feature configured (API key present)?
 * @returns {boolean}
 */
function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Generate structured legal guidance for a scenario.
 *
 * @param {string} scenario  the user's plain-language description
 * @returns {Promise<{category:string,summary:string,applicable_laws:string[],steps:string[],safety_note:string}>}
 * @throws {{ status:number, message:string }} on config/upstream/parse failure.
 */
async function getGuidance(scenario) {
  if (!isConfigured()) {
    throw { status: 503, message: 'AI guidance is not configured on the server.' };
  }

  let response;
  try {
    response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 900,
        temperature: 0.2,
        system: SYSTEM_PROMPT, // Anthropic takes the system prompt at top level
        messages: [{ role: 'user', content: scenario }],
      }),
    });
  } catch {
    // Network failure reaching Anthropic. Never log the scenario.
    throw { status: 502, message: 'Could not reach the guidance service. Please try again.' };
  }

  if (!response.ok) {
    // Do not leak upstream error bodies (could echo the prompt). Generic message.
    throw { status: 502, message: 'The guidance service is unavailable right now. Please try again.' };
  }

  const data = await response.json();
  // Anthropic returns { content: [{ type:'text', text:'...' }], ... }
  const content = Array.isArray(data?.content)
    ? data.content.map((b) => (b && b.type === 'text' ? b.text : '')).join('')
    : '';

  const parsed = safeParse(content);
  if (!parsed) {
    throw { status: 502, message: 'Could not generate guidance. Please try rephrasing.' };
  }

  // Normalise + clamp the shape defensively (the model is instructed but not trusted).
  const category = CASE_TYPES.includes(parsed.category) ? parsed.category : 'other';
  const toList = (v) =>
    Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, 5) : [];
  return {
    category,
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
    how_handled: toList(parsed.how_handled),
    applicable_laws: toList(parsed.applicable_laws),
    steps: toList(parsed.steps),
    approximate_fees:
      typeof parsed.approximate_fees === 'string' ? parsed.approximate_fees.trim() : '',
    safety_note: typeof parsed.safety_note === 'string' ? parsed.safety_note.trim() : '',
  };
}

/** Parse JSON that may be wrapped in stray text / code fences. Returns null on failure. */
function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    // Fall back to extracting the first {...} block.
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

module.exports = { getGuidance, isConfigured, MODEL };
