'use strict';

/**
 * Matches client `structureTypeDisplayLabel` in api/projects.ts — used for PDFs and server-rendered labels.
 */
function structureTypeDisplayLabel(structureType, otherDetails) {
  if (!structureType) return '';
  const base = String(structureType)
    .replace(/^_+/, '')
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .trim();
  const detail = String(otherDetails ?? '').trim();
  if (String(structureType).trim().toLowerCase() === 'other' && detail) {
    return `${base}: ${detail}`;
  }
  return base;
}

/** Parse JSON column / JSONB object from DB into a specs map. */
function parseSpecsJson(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** Case-insensitive key lookup for concrete/soil specs objects. */
function getSpecRow(specsObj, key) {
  if (!specsObj || typeof specsObj !== 'object' || key == null || String(key).trim() === '') {
    return null;
  }
  const k = String(key);
  if (specsObj[k]) return specsObj[k];
  const lower = k.trim().toLowerCase();
  const found = Object.keys(specsObj).find((x) => String(x).trim().toLowerCase() === lower);
  return found ? specsObj[found] : null;
}

module.exports = {
  structureTypeDisplayLabel,
  parseSpecsJson,
  getSpecRow
};
