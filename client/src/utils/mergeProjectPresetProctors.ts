/** Same fill-if-empty rules as server/routes/density.js — keep in sync when changing merge behavior. */

/** Accept camelCase or snake_case (e.g. Supabase embed / raw JSONB). */
export function normalizePresetProctorRow(pr: PresetRowInput | Record<string, unknown>): PresetRowInput {
  const o = pr as Record<string, unknown>;
  const pn = o.proctorNo ?? o.proctor_no;
  const opt = o.optMoisture ?? o.opt_moisture;
  const maxd = o.maxDensity ?? o.max_density;
  return {
    proctorNo:
      pn != null && String(pn).trim() !== '' && !Number.isNaN(Number(pn))
        ? Math.min(99, Math.max(1, Number(pn)))
        : null,
    description: o.description != null ? String(o.description) : '',
    optMoisture: opt != null ? String(opt) : '',
    maxDensity: maxd != null ? String(maxd) : ''
  };
}

export interface PresetRowInput {
  proctorNo?: number | null;
  description?: string | null;
  optMoisture?: string | null;
  maxDensity?: string | null;
}

export interface ProctorRowInput {
  proctorNo: number;
  description?: string;
  optMoisture?: string;
  maxDensity?: string;
}

export function mergeProjectPresetIntoProctors<T extends ProctorRowInput>(
  proctors: T[],
  presetDeclared: boolean,
  presetRows: PresetRowInput[] | null | undefined
): T[] {
  if (!presetDeclared || !Array.isArray(proctors) || proctors.length === 0) return proctors;
  const rows = (presetRows || []).map((r) => normalizePresetProctorRow(r as Record<string, unknown>)).filter((r) => {
    if (!r || typeof r !== 'object') return false;
    const desc = String(r.description ?? '').trim();
    const opt = String(r.optMoisture ?? '').trim();
    const maxd = String(r.maxDensity ?? '').trim();
    const pNo = r.proctorNo != null && String(r.proctorNo).trim() !== '' ? parseInt(String(r.proctorNo), 10) : NaN;
    return (!isNaN(pNo) && pNo > 0) || desc !== '' || opt !== '' || maxd !== '';
  });
  if (rows.length === 0) return proctors;
  const out = proctors.map((r) => ({ ...r }));
  for (const pr of rows) {
    const pNoRaw = pr.proctorNo;
    const pNo = pNoRaw != null && String(pNoRaw).trim() !== '' ? parseInt(String(pNoRaw), 10) : NaN;
    let idx = -1;
    if (!isNaN(pNo) && pNo > 0) {
      idx = out.findIndex((r) => Number(r.proctorNo) === pNo);
    }
    if (idx < 0) {
      idx = out.findIndex((r) => {
        const d = String(r.description || '').trim();
        const o = String(r.optMoisture || '').trim();
        const m = String(r.maxDensity || '').trim();
        return d === '' && o === '' && m === '';
      });
    }
    if (idx < 0) continue;
    const cur = out[idx];
    const desc = String(pr.description ?? '').trim();
    const opt = pr.optMoisture != null ? String(pr.optMoisture).trim() : '';
    const maxd = pr.maxDensity != null ? String(pr.maxDensity).trim() : '';
    const nextNo = !isNaN(pNo) && pNo > 0 ? pNo : Number(cur.proctorNo) || idx + 1;
    out[idx] = {
      ...cur,
      proctorNo: nextNo,
      description: String(cur.description || '').trim() === '' ? desc : cur.description,
      optMoisture: String(cur.optMoisture || '').trim() === '' ? opt : cur.optMoisture,
      maxDensity: String(cur.maxDensity || '').trim() === '' ? maxd : cur.maxDensity
    } as T;
  }
  return out;
}

export function projectPresetSignature(declared: boolean, rows: PresetRowInput[] | null | undefined): string {
  const normalized = (rows || []).map((r) => normalizePresetProctorRow(r as Record<string, unknown>));
  return JSON.stringify({ declared: !!declared, rows: normalized });
}
