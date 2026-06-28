'use strict';

/**
 * Intake Parser Service — extracts scheduling fields from an inbound email body
 * using Claude Haiku, then fuzzy-matches against tenant projects.
 *
 * Requires ANTHROPIC_API_KEY. Returns null fields silently when key is absent.
 * Never throws — caller handles errors.
 */

const https = require('https');
const { supabase } = require('../db/supabase');
const {
  getRecentSchedulingCorrections,
  buildSchedulingFewShot,
  checkCircuitBreaker,
} = require('./correctionService');

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

const VALID_TEST_TYPES = [
  'DENSITY_MEASUREMENT',
  'PROCTOR',
  'REBAR',
  'COMPRESSIVE_STRENGTH',
  'CYLINDER_PICKUP',
];

function callAnthropicJson(systemPrompt, userMessage) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(data);
            const text = parsed.content?.[0]?.text || '{}';
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            resolve(jsonMatch ? JSON.parse(jsonMatch[0]) : {});
          } catch (e) {
            reject(new Error('Invalid JSON from Anthropic: ' + data.slice(0, 200)));
          }
        } else {
          reject(new Error(`Anthropic API ${res.statusCode}: ${data.slice(0, 300)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('Anthropic timeout')));
    req.write(body);
    req.end();
  });
}

const SYSTEM_PROMPT = `You are a dispatcher assistant for a geotechnical (CMT) testing firm.
Extract structured scheduling information from an incoming job request email.
Return ONLY valid JSON with these fields:
{
  "projectNameRaw": string or null,
  "scheduledDate": "YYYY-MM-DD" or null,
  "testTypes": array of strings (only from: DENSITY_MEASUREMENT, PROCTOR, REBAR, COMPRESSIVE_STRENGTH, CYLINDER_PICKUP),
  "siteLocation": string or null,
  "requesterEmail": string or null,
  "requesterName": string or null,
  "fieldConfidence": {
    "projectNameRaw": 0-100,
    "scheduledDate": 0-100,
    "testTypes": 0-100,
    "siteLocation": 0-100
  }
}
fieldConfidence scores: 95+ = explicitly stated, 80-94 = clearly implied, 60-79 = inferred, below 60 = guessed.
If a field is not mentioned, set it to null (or [] for testTypes) and confidence 0.
For testTypes: map "density" → DENSITY_MEASUREMENT, "compressive strength" / "cylinders" → COMPRESSIVE_STRENGTH, "rebar" → REBAR, "proctor" → PROCTOR, "cylinder pickup" → CYLINDER_PICKUP.
For scheduledDate: convert any date mention to YYYY-MM-DD. Use current year if not specified.
Output only the JSON object.`;

/**
 * Extract job scheduling fields from an email body.
 * @param {string} emailBody
 * @param {number|null} tenantId  — when provided, injects tenant's past corrections as few-shot examples
 */
async function extractJobFromEmail(emailBody, tenantId = null) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      projectNameRaw: null,
      scheduledDate: null,
      testTypes: [],
      siteLocation: null,
      requesterEmail: null,
      requesterName: null,
    };
  }

  // Phase 8: inject past corrections as few-shot examples
  let dynamicPrompt = SYSTEM_PROMPT;
  if (tenantId) {
    const corrections = await getRecentSchedulingCorrections(tenantId, 5).catch(() => []);
    dynamicPrompt += buildSchedulingFewShot(corrections);
  }

  const raw = await callAnthropicJson(dynamicPrompt, emailBody.slice(0, 3000));

  const fieldConfidence = raw.fieldConfidence && typeof raw.fieldConfidence === 'object'
    ? {
        projectNameRaw: Number(raw.fieldConfidence.projectNameRaw) || 0,
        scheduledDate:  Number(raw.fieldConfidence.scheduledDate)  || 0,
        testTypes:      Number(raw.fieldConfidence.testTypes)      || 0,
        siteLocation:   Number(raw.fieldConfidence.siteLocation)   || 0,
      }
    : null;

  return {
    projectNameRaw: raw.projectNameRaw ?? null,
    scheduledDate: raw.scheduledDate ?? null,
    testTypes: Array.isArray(raw.testTypes)
      ? raw.testTypes.filter(t => VALID_TEST_TYPES.includes(t))
      : [],
    siteLocation: raw.siteLocation ?? null,
    requesterEmail: raw.requesterEmail ?? null,
    requesterName: raw.requesterName ?? null,
    fieldConfidence,
  };
}

/**
 * Fuzzy-match a raw project name against tenant's projects.
 * Uses Dice-coefficient similarity computed in JS (avoids needing pg_trgm RPC).
 * @param {string|null} projectNameRaw
 * @param {number} tenantId
 * @returns {Promise<{projectId:number, projectName:string, score:number}|null>}
 */
async function fuzzyMatchProject(projectNameRaw, tenantId) {
  if (!projectNameRaw) return null;

  const { data: projects, error } = await supabase
    .from('projects')
    .select('id, name, project_number')
    .eq('tenant_id', tenantId);

  if (error || !projects || projects.length === 0) return null;

  const needle = projectNameRaw.toLowerCase().trim();

  function diceCoefficient(a, b) {
    if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
    const bigrams = new Map();
    for (let i = 0; i < a.length - 1; i++) {
      const bg = a.slice(i, i + 2);
      bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
    }
    let hits = 0;
    for (let i = 0; i < b.length - 1; i++) {
      const bg = b.slice(i, i + 2);
      const count = bigrams.get(bg) || 0;
      if (count > 0) {
        bigrams.set(bg, count - 1);
        hits++;
      }
    }
    return (2 * hits) / (a.length + b.length - 2);
  }

  let best = null;
  let bestScore = 0;

  for (const project of projects) {
    const candidates = [
      project.name?.toLowerCase() || '',
      project.project_number?.toLowerCase() || '',
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const score = diceCoefficient(needle, candidate);
      if (score > bestScore) {
        bestScore = score;
        best = { projectId: project.id, projectName: project.name, score };
      }
    }
  }

  // Only return match if above 40% similarity
  return bestScore >= 0.4 ? best : null;
}

// ---------------------------------------------------------------------------
// Phase 7: Auto-accept helpers
// ---------------------------------------------------------------------------

/**
 * Read a per-tenant app_settings value from Supabase.
 * Returns defaultValue if the key doesn't exist or Supabase is unavailable.
 */
async function getSetting(tenantId, key, defaultValue) {
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('tenant_id', tenantId)
      .eq('key', key)
      .maybeSingle();
    return data?.value ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Decide whether a freshly-inserted draft should be auto-accepted (Tier 2).
 * Returns true only when:
 *  - tenant has intake_auto_accept = 'true' in app_settings
 *  - all key field confidences ≥ intake_auto_accept_threshold (default 92)
 *  - project_match_score ≥ 0.85 (hardcoded — below this we always want a human)
 *  - parsed_scheduled_date and parsed_test_types are present
 * @param {object} draft  — row from draft_workorders (camelCase or snake_case)
 * @param {number} tenantId
 */
async function shouldAutoAccept(draft, tenantId) {
  const enabled = await getSetting(tenantId, 'intake_auto_accept', 'false');
  if (enabled !== 'true') return false;

  // Phase 8 circuit breaker: too many recent corrections → fall back to Tier 1
  const tripped = await checkCircuitBreaker(tenantId).catch(() => false);
  if (tripped) return false;

  const threshold = parseInt(await getSetting(tenantId, 'intake_auto_accept_threshold', '92'), 10);

  const matchScore = draft.project_match_score ?? draft.projectMatchScore ?? 0;
  const projectId  = draft.parsed_project_id  ?? draft.parsedProjectId  ?? null;
  const schedDate  = draft.parsed_scheduled_date ?? draft.parsedScheduledDate ?? null;
  const testTypes  = draft.parsed_test_types  ?? draft.parsedTestTypes  ?? [];

  if (!projectId)          return false;
  if (matchScore < 0.85)   return false;
  if (!schedDate)          return false;
  if (!testTypes.length)   return false;

  const conf = draft.extraction_json?.fieldConfidence ?? draft.extractionJson?.fieldConfidence;
  if (!conf) return false;

  const keyFields = ['projectNameRaw', 'scheduledDate', 'testTypes'];
  for (const field of keyFields) {
    if ((conf[field] ?? 0) < threshold) return false;
  }

  return true;
}

module.exports = { extractJobFromEmail, fuzzyMatchProject, getSetting, shouldAutoAccept };
