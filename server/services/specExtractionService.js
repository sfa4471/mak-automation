'use strict';

/**
 * Spec Extraction Service — sends attached PDFs to Claude as native document blocks
 * and extracts CMT project specs (soil compaction + concrete) in the exact JSONB
 * shape used by projects.soil_specs / projects.concrete_specs.
 *
 * Requires ANTHROPIC_API_KEY. Returns null silently when key is absent or no PDFs.
 * Never throws — caller handles errors.
 */

const https = require('https');
const { getRecentSpecCorrections, buildSpecFewShot } = require('./correctionService');

const SONNET_MODEL = 'claude-sonnet-4-6';

function callAnthropicWithDocuments(systemPrompt, textPrompt, pdfBase64Array) {
  return new Promise((resolve, reject) => {
    // Build content array: documents first, then the text question
    const content = [
      ...pdfBase64Array.map(b64 => ({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: b64,
        },
      })),
      { type: 'text', text: textPrompt },
    ];

    const body = JSON.stringify({
      model: SONNET_MODEL,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content }],
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
    req.setTimeout(60000, () => req.destroy(new Error('Anthropic timeout')));
    req.write(body);
    req.end();
  });
}

const SYSTEM_PROMPT = `You are an expert CMT (Construction Materials Testing) field coordinator and licensed geotechnical engineer.
Your task is to extract compaction and concrete testing specifications from geotechnical reports, civil drawings, or IRPC-stamped documents.

Return ONLY valid JSON in this exact format:
{
  "soilSpecs": {
    "<structure type>": {
      "densityPcts": ["<percent>"],
      "moistureRanges": [{"min": "<value>", "max": "<value>"}]
    }
  },
  "concreteSpecs": {
    "<structure type>": {
      "specStrengthPsi": "<psi value>",
      "slump": "<inches>",
      "airContent": "<percent or range>",
      "ambientTempF": "<temp range>",
      "concreteTempF": "<temp range>"
    }
  },
  "confidence": {
    "soilSpecs": "high|medium|low",
    "concreteSpecs": "high|medium|low"
  },
  "conflicts": [],
  "docTypes": []
}

Rules:
- Structure type keys must match standard CMT categories (e.g., "Embankment Fill", "Structural Fill", "Subgrade", "Slab on Grade", "Column Footings", "Retaining Wall", etc.)
- densityPcts: array of compaction percentage requirements (e.g., ["95"] or ["90", "95"])
- moistureRanges: array of {min, max} objects where min/max are offsets from optimum (e.g., {"min": "-2", "max": "+2"}) or absolute values
- For concrete f'c values, extract the design strength in PSI (e.g., "4000")
- slump: in inches (e.g., "4")
- airContent: percent or range (e.g., "5-7")
- temperature ranges in °F (e.g., "50-90")
- confidence: overall confidence level for each spec category based on how clearly specs are stated
- conflicts: array of objects if same structure type has different values in different docs: [{"structureType": "...", "field": "...", "values": ["...","..."]}]
- docTypes: classify each document as one of: geotech_report, civil_drawings, irpc_report, specifications, other
- If no specs found for a category, return empty object {}
- Set omitted optional fields (slump, airContent, temps) to null or omit them
Output only the JSON object.`;

const USER_PROMPT = `Please extract all compaction (soil) and concrete testing specifications from the attached document(s).
For soil specs, look for: compaction/density requirements (% of maximum dry density or modified Proctor), moisture content requirements.
For concrete specs, look for: design strength (f'c), slump requirements, air content, temperature requirements.
Be thorough — check all sections including notes, tables, and specification sheets.`;

/**
 * Extract soil and concrete specs from PDF buffers.
 * @param {Buffer[]} pdfBuffers
 * @param {number|null} tenantId  — when provided, injects tenant's past spec corrections
 */
async function extractSpecsFromDocuments(pdfBuffers, tenantId = null) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!pdfBuffers || pdfBuffers.length === 0) return null;

  // Phase 8: inject past spec corrections as few-shot examples
  let dynamicPrompt = SYSTEM_PROMPT;
  if (tenantId) {
    const corrections = await getRecentSpecCorrections(tenantId, 5).catch(() => []);
    dynamicPrompt += buildSpecFewShot(corrections);
  }

  // Convert buffers to base64; limit to first 3 PDFs to stay within token limits
  const pdfBase64Array = pdfBuffers.slice(0, 3).map(buf => buf.toString('base64'));

  const raw = await callAnthropicWithDocuments(dynamicPrompt, USER_PROMPT, pdfBase64Array);

  return {
    soilSpecs: raw.soilSpecs || {},
    concreteSpecs: raw.concreteSpecs || {},
    confidence: raw.confidence || { soilSpecs: 'low', concreteSpecs: 'low' },
    conflicts: Array.isArray(raw.conflicts) ? raw.conflicts : [],
    docTypes: Array.isArray(raw.docTypes) ? raw.docTypes : [],
  };
}

module.exports = { extractSpecsFromDocuments };
