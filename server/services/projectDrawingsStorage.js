/**
 * Project drawing PDFs in Supabase Storage (private bucket; server uses service role).
 * Falls back to local disk when not using Supabase — see projects routes.
 */
const crypto = require('crypto');
const { supabase, isAvailable } = require('../db/supabase');

const BUCKET = process.env.SUPABASE_PROJECT_DRAWINGS_BUCKET || 'project-drawings';

function drawingsUseSupabaseStorage() {
  return isAvailable();
}

/**
 * @param {{ tenantId: number, projectId: number, buffer: Buffer, displayName?: string }} opts
 * @returns {Promise<{ filename: string, displayName: string, storagePath: string }>}
 */
async function uploadDrawingFromBuffer({ tenantId, projectId, buffer, displayName }) {
  if (!isAvailable() || !supabase) {
    throw new Error('Supabase is not configured');
  }
  const tid = Number(tenantId);
  const pid = Number(projectId);
  const id = crypto.randomBytes(12).toString('hex');
  const filename = `d-${id}.pdf`;
  const storagePath = `${tid}/${pid}/${filename}`;

  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: 'application/pdf',
    cacheControl: '3600',
    upsert: false
  });
  if (error) {
    const e = new Error(error.message || 'Storage upload failed');
    e.code = error.statusCode || error.code;
    throw e;
  }

  return {
    filename,
    displayName: (displayName && String(displayName).trim()) || filename,
    storagePath
  };
}

/**
 * @param {string} storagePath - Object path inside the bucket
 * @returns {Promise<Buffer>}
 */
async function downloadDrawingBuffer(storagePath) {
  if (!isAvailable() || !supabase) {
    throw new Error('Supabase is not configured');
  }
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) {
    const e = new Error(error.message || 'Drawing not found in storage');
    e.statusCode = 404;
    throw e;
  }
  const ab = await data.arrayBuffer();
  return Buffer.from(ab);
}

/**
 * @param {string} storagePath
 */
async function removeDrawing(storagePath) {
  if (!isAvailable() || !supabase || !storagePath) return;
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) {
    console.error('[drawings] Supabase storage remove failed:', storagePath, error.message);
  }
}

module.exports = {
  BUCKET,
  drawingsUseSupabaseStorage,
  uploadDrawingFromBuffer,
  downloadDrawingBuffer,
  removeDrawing
};
