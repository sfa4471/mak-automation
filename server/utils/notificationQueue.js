const { supabase, isAvailable } = require('../db/supabase');

const TASK_TYPE_LABELS = {
  COMPRESSIVE_STRENGTH: 'Compressive Strength',
  DENSITY_MEASUREMENT: 'Density Measurement',
  PROCTOR: 'Proctor',
  REBAR: 'Rebar',
  CYLINDER_PICKUP: 'Cylinder Pickup',
};

/**
 * Queue a task assignment for consolidated email delivery.
 * If workorderId is provided the batch sender will group all tasks for that
 * workorder into a single dispatch email. Without workorderId the legacy
 * project-grouped email is used (backward compat for old tasks).
 */
async function queueAssignmentNotification({
  tenantId,
  technicianId,
  technicianEmail,
  taskId,
  taskType,
  projectId,
  projectNumber,
  projectName,
  scheduledStartDate,
  scheduledStartTime,
  locationName,
  engagementNotes,
  assignedByName,
  // workorder fields (optional — omit for legacy tasks)
  workorderId,
  workorderNumber,
  scheduledTime,
  siteLocation,
  // Phase 6: auto-assign hold window (ISO timestamp; null = send immediately)
  holdUntil,
}) {
  if (!isAvailable() || !technicianEmail) return;
  try {
    const { error } = await supabase.from('pending_notifications').insert({
      tenant_id:           tenantId,
      technician_id:       technicianId,
      technician_email:    technicianEmail,
      task_id:             taskId,
      task_type:           taskType,
      task_label:          TASK_TYPE_LABELS[taskType] || taskType,
      project_id:          projectId,
      project_number:      projectNumber   || null,
      project_name:        projectName     || null,
      scheduled_start_date: scheduledStartDate || null,
      scheduled_start_time: scheduledStartTime || null,
      location_name:       locationName    || null,
      engagement_notes:    engagementNotes || null,
      assigned_by_name:    assignedByName  || null,
      // workorder dispatch fields
      workorder_id:        workorderId     || null,
      workorder_number:    workorderNumber || null,
      scheduled_time:      scheduledTime   || null,
      site_location:       siteLocation    || null,
      hold_until:          holdUntil       || null,
    });
    if (error) throw error;
  } catch (err) {
    console.error('[notificationQueue] Failed to queue assignment notification:', err.message);
  }
}

module.exports = { queueAssignmentNotification };
