'use strict';

/**
 * Report Narrative Service — drafts a PE-review narrative for a task that has
 * just reached READY_FOR_REVIEW. The draft is saved directly into the existing
 * Remarks field on the respective report table (density_reports.remarks,
 * wp1_data.remarks, rebar_reports.result_remarks, proctor_data.remarks),
 * but ONLY when that field is currently empty. This way it appears naturally in
 * the existing Remarks section of the PDF without any separate "PE Notes" block.
 *
 * Requires ANTHROPIC_API_KEY in env. Returns null (silently) if key is absent.
 * Never throws — caller fire-and-forgets.
 */

const https = require('https');
const { supabase } = require('../db/supabase');

const MODEL = 'claude-sonnet-4-6';

function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function parseNum(val) {
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function callAnthropic(systemPrompt, userMessage) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODEL,
      max_tokens: 600,
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
            resolve(parsed.content?.[0]?.text || '');
          } catch (e) {
            reject(new Error('Invalid JSON from Anthropic: ' + data.slice(0, 200)));
          }
        } else {
          reject(new Error(`Anthropic API ${res.statusCode}: ${data.slice(0, 300)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('Anthropic API timeout')));
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Save AI draft to a report table's remarks field only if currently empty. */
async function saveToRemarks(table, taskId, remarkField, draft) {
  if (!draft) return;
  const { data } = await supabase.from(table).select(remarkField).eq('task_id', taskId).single();
  if (data && data[remarkField]) return; // tech already wrote remarks — don't overwrite
  await supabase.from(table).update({ [remarkField]: draft }).eq('task_id', taskId);
}

// ---------------------------------------------------------------------------
// Per-type drafters
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a licensed geotechnical engineer writing concise field report narrative notes for PE review.
Write 2-4 sentences in professional engineering style.
State what was tested, whether results meet the specification, and any notable observations.
Do not repeat header information already on the report (project name, date, technician).
Do not include recommendations unless a result clearly fails — flag failures factually, not alarmingly.
Output only the narrative text, no headings or bullet points.`;

async function draftDensity(taskId) {
  const { data: report } = await supabase
    .from('density_reports')
    .select('dens_spec_percent, dens_specs, test_rows, remarks, structure')
    .eq('task_id', taskId)
    .single();

  if (!report) return null;

  const allRows = Array.isArray(report.test_rows) ? report.test_rows : [];
  // db adapter converts keys to snake_case on save — only include rows with actual data
  const rows = allRows.filter(r => {
    if (r.type === 'section') return false;
    return parseNum(r.percent_proctor_density ?? r.percentProctorDensity) != null;
  });
  if (rows.length === 0) return null;

  const specMin = Array.isArray(report.dens_specs) && report.dens_specs.length > 0
    ? Math.min(...report.dens_specs.map(Number).filter(n => !isNaN(n)))
    : parseNum(report.dens_spec_percent);

  const specList = specMin != null ? `${specMin}%` : 'not specified';

  const results = rows.map(r => {
    const pct = r.percent_proctor_density ?? r.percentProctorDensity;
    const testNo = r.test_no ?? r.testNo ?? '?';
    const loc = (r.test_location ?? r.testLocation) || 'unknown location';
    return `Test #${testNo} at ${loc}: ${pct}%`;
  }).join('; ');

  const fails = rows.filter(r => {
    const pct = parseNum(r.percent_proctor_density ?? r.percentProctorDensity);
    return pct != null && specMin != null && pct < specMin;
  });

  const userMessage = `Structure: ${report.structure || 'unspecified'}
Specification: minimum ${specList} of maximum dry density
Number of tests: ${rows.length}
Test results: ${results}
${fails.length > 0
  ? `FAILING tests: ${fails.map(r => `Test #${r.test_no ?? r.testNo ?? '?'} (${r.percent_proctor_density ?? r.percentProctorDensity}%)`).join(', ')}`
  : 'All tests pass specification.'}
${report.remarks ? `Field remarks: ${report.remarks}` : ''}

Write a PE review narrative for this density testing field report.`;

  const draft = await callAnthropic(SYSTEM_PROMPT, userMessage);
  await saveToRemarks('density_reports', taskId, 'remarks', draft);
  return draft;
}

async function draftCompressiveStrength(taskId) {
  const { data: wp1 } = await supabase
    .from('wp1_data')
    .select('spec_strength, spec_strength_days, cylinders, structure, remarks, placement_date')
    .eq('task_id', taskId)
    .single();

  if (!wp1) return null;

  const complianceDays = wp1.spec_strength_days ?? 28;
  const specStrength = wp1.spec_strength;
  const cylinders = Array.isArray(wp1.cylinders) ? wp1.cylinders : [];

  // db adapter converts keys to snake_case on save — read with snake ?? camel fallback
  const complianceCyls = cylinders.filter(c => {
    const age = parseNum(c.age_days ?? c.ageDays);
    return age != null && age === complianceDays;
  });

  const pendingCyls = cylinders.filter(c => {
    const age = parseNum(c.age_days ?? c.ageDays);
    return age == null || age !== complianceDays;
  });

  let cylSummary;
  if (complianceCyls.length === 0) {
    cylSummary = `No ${complianceDays}-day break results recorded yet (${cylinders.length} cylinder(s) on file at other ages).`;
  } else {
    const strengths = complianceCyls.map(c => {
      const s = c.compressive_strength ?? c.compressiveStrength;
      return s != null ? `${s} psi` : '(no result)';
    }).join(', ');
    const fails = complianceCyls.filter(c => {
      const s = parseNum(c.compressive_strength ?? c.compressiveStrength);
      return s != null && specStrength != null && s < parseNum(specStrength);
    });
    cylSummary = `${complianceDays}-day break results: ${strengths}. ${fails.length > 0 ? `${fails.length} cylinder(s) failed to meet ${specStrength} psi specification.` : 'All compliance-age cylinders meet specification.'}`;
  }

  const userMessage = `Structure: ${wp1.structure || 'unspecified'}
Specified compressive strength: ${specStrength || 'not specified'} psi at ${complianceDays} days
Cylinder break summary: ${cylSummary}
${pendingCyls.length > 0 ? `Pending breaks: ${pendingCyls.length} cylinder(s) at other ages not yet evaluated.` : ''}
${wp1.remarks ? `Field remarks: ${wp1.remarks}` : ''}

Write a PE review narrative for this compressive strength field report. Only comment on ${complianceDays}-day compliance breaks.`;

  const draft = await callAnthropic(SYSTEM_PROMPT, userMessage);
  await saveToRemarks('wp1_data', taskId, 'remarks', draft);
  return draft;
}

async function draftProctor(taskId) {
  const { data: pd } = await supabase
    .from('proctor_data')
    .select('opt_moisture_pct, max_dry_density_pcf, description, soil_classification, test_method, remarks')
    .eq('task_id', taskId)
    .order('id', { ascending: false })
    .limit(1)
    .single();

  if (!pd) return null;

  const userMessage = `Proctor compaction test results:
Soil description: ${pd.description || pd.soil_classification || 'not specified'}
Test method: ${pd.test_method || 'ASTM D 698'}
Maximum dry density: ${pd.max_dry_density_pcf ?? 'not recorded'} pcf
Optimum moisture content: ${pd.opt_moisture_pct ?? 'not recorded'}%
${pd.remarks ? `Field remarks: ${pd.remarks}` : ''}

Write a PE review narrative for this Proctor compaction test report.`;

  const draft = await callAnthropic(SYSTEM_PROMPT, userMessage);
  await saveToRemarks('proctor_data', taskId, 'remarks', draft);
  return draft;
}

async function draftRebar(taskId) {
  const { data: rr } = await supabase
    .from('rebar_reports')
    .select('*')
    .eq('task_id', taskId)
    .single();

  if (!rr) return null;

  const userMessage = `Rebar inspection report:
Inspection result: ${rr.result || rr.inspection_result || 'not recorded'}
Location/element: ${rr.structure || rr.element || rr.location_name || 'not specified'}
${rr.bar_size ? `Bar size: ${rr.bar_size}` : ''}
${rr.spacing ? `Spacing: ${rr.spacing}` : ''}
${rr.cover ? `Cover: ${rr.cover}` : ''}
${rr.result_remarks || rr.remarks ? `Field remarks: ${rr.result_remarks || rr.remarks}` : ''}

Write a PE review narrative for this rebar inspection report.`;

  const draft = await callAnthropic(SYSTEM_PROMPT, userMessage);
  await saveToRemarks('rebar_reports', taskId, 'result_remarks', draft);
  return draft;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

async function draftNarrative(taskId, taskType, tenantId) {
  if (!isConfigured()) return null;

  try {
    switch (taskType) {
      case 'DENSITY_MEASUREMENT': return await draftDensity(taskId);
      case 'COMPRESSIVE_STRENGTH':
      case 'CYLINDER_PICKUP':     return await draftCompressiveStrength(taskId);
      case 'PROCTOR':             return await draftProctor(taskId);
      case 'REBAR':               return await draftRebar(taskId);
      default:                    return null;
    }
  } catch (err) {
    console.error(`[reportNarrative] Error drafting for task ${taskId}:`, err.message);
    return null;
  }
}

module.exports = { draftNarrative, isConfigured };
