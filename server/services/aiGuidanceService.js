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

// Human-readable names for the supported output languages. Keys match the app's
// i18n language codes so the client can request a specific language for read-aloud.
const LANGUAGE_NAMES = { en: 'English', ta: 'Tamil', si: 'Sinhala' };

// When the client asks for a specific output language (so the guidance can be
// re-generated + read aloud in en/ta/si), append an explicit instruction. The
// JSON keys and the "category" enum value MUST stay English; only the human-facing
// string VALUES are translated.
function languageInstruction(language) {
  const name = LANGUAGE_NAMES[language];
  if (!name) return '';
  return `\n\nIMPORTANT: Write ALL human-facing string values (summary, how_handled, applicable_laws, steps, approximate_fees, safety_note) entirely in ${name}, regardless of the language the scenario is written in. Keep the JSON keys and the "category" value in English exactly as specified.`;
}

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
 * @param {string} [language]  desired output language: 'en' | 'ta' | 'si'. When
 *        given, all string values are generated in that language (for re-generate
 *        + read-aloud in the chosen language). Omitted → the model uses the
 *        scenario's own language, as before.
 * @returns {Promise<{category:string,summary:string,applicable_laws:string[],steps:string[],safety_note:string}>}
 * @throws {{ status:number, message:string }} on config/upstream/parse failure.
 */
async function getGuidance(scenario, language) {
  if (!isConfigured()) {
    throw { status: 503, message: 'AI guidance is not configured on the server.' };
  }
  const system = SYSTEM_PROMPT + languageInstruction(language);

  // Tamil and Sinhala use FAR more tokens per word than English, so the same JSON
  // needs a much higher ceiling — at 900 the response was truncated mid-string and
  // failed to parse (guidance came back empty for ta/si). Give non-English plenty.
  const maxTokens = language && language !== 'en' ? 3000 : 1200;

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
        max_tokens: maxTokens,
        temperature: 0.2,
        system, // system prompt (+ optional language instruction) at top level
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

// ---------------------------------------------------------------------------
// Real lawyer lookup (Anthropic web search).
//
// The guidance model above is FORBIDDEN from naming lawyers (it would
// hallucinate). To surface ACTUAL, contactable lawyers we make a SEPARATE call
// that uses Anthropic's server-side web_search tool: Claude searches the live
// web and returns only lawyers/firms it can cite a source URL for. Nothing is
// invented, and nothing is stored.
//
// PRIVACY: the user's scenario/narrative is NEVER sent here — only the derived
// case category and (optional) district, which are not identifying. We never
// log the query or the results.
// ---------------------------------------------------------------------------

// The web-search tool version. 20250305 is broadly compatible across Claude
// models (including the cheap Haiku default); newer models could use the
// dynamic-filtering 20260209 version but we keep this stable for the default.
const WEB_SEARCH_TOOL = { type: 'web_search_20250305', name: 'web_search', max_uses: 5 };

const LAWYER_SYSTEM_PROMPT = `You help people in Sri Lanka find REAL, currently-practising lawyers, law
firms, or legal-aid providers for a given kind of case and district. You have a
web_search tool — USE IT to find real people/organisations.

STRICT RULES:
- ONLY include a lawyer/firm/organisation that actually appears in your web
  search results and for which you have a real, verifiable source URL. If you
  cannot find a real source, do NOT include it.
- NEVER invent, guess, or approximate a name, phone number, email, website, or
  fee. Omit any field you did not find rather than making one up. It is better
  to return fewer results (or none) than to return anything fabricated.
- EMAIL: only include a real, complete address (e.g. "info@example.lk"). Many
  sites hide the address behind anti-scraping placeholders — NEVER output
  "[email protected]", "email protected", "[protected]", a "cdn-cgi/l/email-
  protection" link, or any masked/obfuscated form. If you only see a placeholder,
  try to find the real address elsewhere; if you still cannot, leave "email" empty.
- PHONE: if a source lists several numbers, put ONE clean number in "phone".
- WEBSITE: give the full URL including https:// (e.g. "https://example.lk").
- Prefer providers in or nearest the given district; you MAY also include
  island-wide legal-aid bodies (e.g. the Legal Aid Commission of Sri Lanka, the
  Bar Association of Sri Lanka, university legal-aid clinics) when relevant.
- For "approx_fee": only state what a source indicates. If sources give no fee,
  use a short general note (e.g. "Varies — ask the lawyer; legal aid may be
  free"). NEVER state a specific number you did not find.
- For "experience": only what a source supports (e.g. "Attorney-at-Law",
  "practising since 2011", "labour-law specialist"); omit if unknown.

Respond with ONLY a valid JSON object, no markdown, matching exactly:
{
  "lawyers": [
    {
      "name": "person or firm name",
      "organisation": "firm/org they belong to, or empty string",
      "specialisation": "short area of focus relevant to the case",
      "district": "district or city they serve, or 'Island-wide'",
      "phone": "phone or empty string",
      "email": "email or empty string",
      "website": "website URL or empty string",
      "experience": "short experience note or empty string",
      "approx_fee": "short, caveated fee note",
      "source_url": "the web page you found this on (REQUIRED)"
    }
  ]
}
At most 6 lawyers. If you find none you can verify, return {"lawyers": []}.`;

// Turn a case-type code ('official_misconduct') into a human phrase for the
// search query ('official misconduct').
function readableCategory(category) {
  return String(category || '').replace(/_/g, ' ').trim() || 'human rights';
}

/**
 * Find REAL lawyers for a case category + district using web search.
 *
 * Best-effort: returns [] on any failure (web search not enabled, upstream
 * error, no verifiable results) so the caller can still return guidance.
 *
 * @param {string} category  a CASE_TYPES value (the guidance category)
 * @param {string} [district]  a Sri Lankan district to focus on
 * @param {string} [language]  'en' | 'ta' | 'si' for the human-facing strings
 * @returns {Promise<object[]>} normalised, source-verified lawyer objects
 */
async function getLawyers(category, district, language) {
  if (!isConfigured()) return [];

  const area = readableCategory(category);
  const where = district ? `${district} district, Sri Lanka` : 'Sri Lanka';
  // Neutral query — NO scenario/narrative, only the case area + location.
  const query =
    `Find lawyers, law firms, or legal-aid organisations in ${where} who handle ` +
    `${area} / human rights cases. Include their contact details (phone, email, ` +
    `website), area of focus, experience, and any indication of fees. Only include ` +
    `ones you can cite a real source for.`;
  const system = LAWYER_SYSTEM_PROMPT + languageInstruction(language);

  // Tamil/Sinhala use far more tokens per word than English, so the same JSON
  // (up to 6 lawyers with all fields) needs a much higher ceiling or it gets
  // truncated mid-string and fails to parse — mirrors getGuidance's handling.
  const maxTokens = language && language !== 'en' ? 4000 : 2500;

  // Web search runs a server-side tool loop; a big task can hit the 10-iteration
  // cap and return stop_reason 'pause_turn'. Resend to continue, a few times.
  let messages = [{ role: 'user', content: query }];
  let data;
  try {
    for (let i = 0; i < 4; i += 1) {
      const response = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: maxTokens,
          system,
          tools: [WEB_SEARCH_TOOL],
          messages,
        }),
      });
      if (!response.ok) return []; // e.g. web search not enabled on the key
      data = await response.json();
      if (data && data.stop_reason === 'pause_turn' && Array.isArray(data.content)) {
        // Continue the paused server-tool turn: resend with the assistant's
        // partial content appended (no extra user message — see Anthropic docs).
        messages = [...messages, { role: 'assistant', content: data.content }];
        continue;
      }
      break;
    }
  } catch {
    return []; // network/parse failure — guidance still returns without lawyers
  }

  const content = Array.isArray(data?.content)
    ? data.content.map((b) => (b && b.type === 'text' ? b.text : '')).join('')
    : '';
  const parsed = safeParse(content);
  const list = parsed && Array.isArray(parsed.lawyers) ? parsed.lawyers : [];

  // Normalise + HARD-FILTER: a lawyer without a real source_url is dropped, so
  // nothing un-grounded (i.e. possibly invented) ever reaches the reporter.
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  return list
    .map((l) => ({
      name: str(l.name),
      organisation: str(l.organisation),
      specialisation: str(l.specialisation),
      district: str(l.district),
      // Contact fields are scraped from the web, so they can be dirty: a
      // comma-separated list of numbers, an anti-scraping "[email protected]"
      // placeholder, or a scheme-less domain. Clean them so the tap actions
      // build valid tel:/mailto:/https: URLs (and drop unusable ones).
      phone: cleanPhone(l.phone),
      email: cleanEmail(l.email),
      website: cleanWebsite(l.website),
      experience: str(l.experience),
      approx_fee: str(l.approx_fee),
      source_url: str(l.source_url),
    }))
    .filter((l) => l.name && /^https?:\/\//i.test(l.source_url))
    .slice(0, 6);
}

// A dial-safe phone: sources often list several numbers ("+94 11 1, +94 11 2");
// keep the first, stripped to digits/+ so `tel:` works. '' if none usable.
function cleanPhone(v) {
  const raw = typeof v === 'string' ? v.trim() : '';
  if (!raw) return '';
  const first = raw.split(/[,;/]|\bor\b/i)[0];
  const digits = first.replace(/[^\d+]/g, '');
  return /\d{6,}/.test(digits) ? digits : '';
}

// A valid email, or '' — rejects obfuscated placeholders like "[email protected]"
// that scraped pages substitute for real addresses.
function cleanEmail(v) {
  const email = typeof v === 'string' ? v.trim() : '';
  if (!email || /[[\]\s]/.test(email)) return '';
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : '';
}

// A website with an explicit scheme, or '' — a scheme-less "www.x.org" would be
// treated as a relative/file URL by the app and fail to open.
function cleanWebsite(v) {
  let url = typeof v === 'string' ? v.trim() : '';
  if (!url || /[[\]\s]/.test(url)) return '';
  if (!/^https?:\/\//i.test(url)) url = `https://${url.replace(/^\/+/, '')}`;
  // Must look like a real host (has a dot after the scheme).
  return /^https?:\/\/[^/]+\.[^/]/i.test(url) ? url : '';
}

// ---------------------------------------------------------------------------
// Real legal basis lookup (Anthropic web search).
//
// Like getLawyers, this is GROUNDED: the plain getGuidance model is forbidden
// from citing statute numbers because it hallucinates them. To surface ACTUAL
// Sri Lankan legal provisions — the Act, the section, the penalty/fine — we make
// a SEPARATE web_search call and HARD-DROP any provision without a real source
// URL. Nothing un-cited (i.e. possibly invented) ever reaches the user.
//
// PRIVACY: the user's scenario/narrative is NEVER sent — only the derived case
// category. We never log the query or the results.
// ---------------------------------------------------------------------------

const LEGAL_BASIS_SYSTEM_PROMPT = `You help people in Sri Lanka understand the ACTUAL law behind a kind of
human-rights case. You have a web_search tool — USE IT to find the real,
current Sri Lankan legal provisions that apply.

STRICT RULES:
- ONLY include a provision (an Act + section) that actually appears in your web
  search results and for which you have a real, verifiable source URL. If you
  cannot find a real source, do NOT include it.
- NEVER invent, guess, or approximate an Act name, a section number, or a
  penalty/fine. Omit any field you did not find rather than making one up. It is
  far better to return fewer provisions (or none) than anything fabricated. A
  wrong section number or penalty could seriously mislead a vulnerable person.
- Prefer primary Sri Lankan sources (lawnet.lk, the Human Rights Commission of
  Sri Lanka, official gazettes, the Parliament/Justice Ministry) over blogs.
- "penalty": only what the source states (e.g. "Up to 2 years imprisonment,
  or a fine, or both"). If the source gives no penalty, use an empty string.
- "outlook": OPTIONAL, general, and NON-predictive — factors that typically
  strengthen or weaken this KIND of case (e.g. "medical/photographic evidence
  and prompt reporting help"). NEVER predict that a specific person will win or
  lose. Omit if you have nothing grounded to say.

Respond with ONLY a valid JSON object, no markdown, matching exactly:
{
  "provisions": [
    {
      "law": "Act/law name (e.g. 'Penal Code' or 'ICCPR Act No. 56 of 2007')",
      "section": "section/article reference (e.g. 'Section 365' or 'Article 11')",
      "summary": "1-2 sentences, plain language, on what this provision protects/prohibits",
      "penalty": "penalty/fine the source states, or empty string",
      "source_url": "the web page you found this on (REQUIRED)"
    }
  ],
  "outlook": {
    "helps": ["short factor that typically strengthens this kind of case", ...],
    "hurts": ["short factor that typically weakens it", ...]
  }
}
At most 5 provisions. "helps"/"hurts" at most 4 items each (may be empty). If you
find nothing you can verify, return {"provisions": [], "outlook": {"helps": [], "hurts": []}}.`;

/**
 * Find REAL, source-cited Sri Lankan legal provisions for a case category using
 * web search. Best-effort: returns an empty shape on any failure so the caller
 * can still return guidance.
 *
 * @param {string} category  a CASE_TYPES value (the guidance category)
 * @param {string} [language]  'en' | 'ta' | 'si' for the human-facing strings
 * @returns {Promise<{provisions:object[], outlook:{helps:string[],hurts:string[]}}>}
 */
async function getLegalBasis(category, language) {
  const empty = { provisions: [], outlook: { helps: [], hurts: [] } };
  if (!isConfigured()) return empty;

  const area = readableCategory(category);
  // Neutral query — NO scenario/narrative, only the case area.
  const query =
    `Find the current Sri Lankan laws that apply to ${area} / human rights cases. ` +
    `For each, give the Act name, the exact section/article number, a plain summary, ` +
    `and the penalty or fine it prescribes. Only include provisions you can cite a ` +
    `real source URL for (prefer lawnet.lk, the Human Rights Commission of Sri Lanka, ` +
    `or official gazettes).`;
  const system = LEGAL_BASIS_SYSTEM_PROMPT + languageInstruction(language);
  const maxTokens = language && language !== 'en' ? 4000 : 2500;

  let messages = [{ role: 'user', content: query }];
  let data;
  try {
    for (let i = 0; i < 4; i += 1) {
      const response = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: maxTokens,
          system,
          tools: [WEB_SEARCH_TOOL],
          messages,
        }),
      });
      if (!response.ok) return empty; // e.g. web search not enabled on the key
      data = await response.json();
      if (data && data.stop_reason === 'pause_turn' && Array.isArray(data.content)) {
        messages = [...messages, { role: 'assistant', content: data.content }];
        continue;
      }
      break;
    }
  } catch {
    return empty; // network/parse failure — guidance still returns without legal basis
  }

  const content = Array.isArray(data?.content)
    ? data.content.map((b) => (b && b.type === 'text' ? b.text : '')).join('')
    : '';
  const parsed = safeParse(content);
  if (!parsed) return empty;

  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const toList = (v, n) =>
    Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()).slice(0, n) : [];

  // HARD-FILTER: a provision without a real source_url is dropped, so nothing
  // un-grounded (a possibly-invented section/penalty) ever reaches the user.
  const provisions = (Array.isArray(parsed.provisions) ? parsed.provisions : [])
    .map((p) => ({
      law: str(p.law),
      section: str(p.section),
      summary: str(p.summary),
      penalty: str(p.penalty),
      source_url: str(p.source_url),
    }))
    .filter((p) => p.law && p.summary && /^https?:\/\//i.test(p.source_url))
    .slice(0, 5);

  const outlook = {
    helps: toList(parsed.outlook?.helps, 4),
    hurts: toList(parsed.outlook?.hurts, 4),
  };
  return { provisions, outlook };
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

module.exports = { getGuidance, getLawyers, getLegalBasis, isConfigured, MODEL };
