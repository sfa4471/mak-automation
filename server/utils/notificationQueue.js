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
 * The batch sender job fires one email per technician after admin stops assigning (3-min debounce).
 * Errors are swallowed so they never break the HTTP response.
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
  dueDate,
  scheduledStartDate,
  locationName,
  assignedByName,
}) {
  if (!isAvailable() || !technicianEmail) return;
  try {
    const { error } = await supabase.from('pending_notifications').insert({
      tenant_id: tenantId,
      technician_id: technicianId,
      technician_email: technicianEmail,
      task_id: taskId,
      task_type: taskType,
      task_label: TASK_TYPE_LABELS[taskType] || taskType,
      project_id: projectId,
      project_number: projectNumber || null,
      project_name: projectName || null,
      due_date: dueDate || null,
      scheduled_start_date: scheduledStartDate || null,
      location_name: locationName || null,
      assigned_by_name: assignedByName || null,
    });
    if (error) throw error;
  } catch (err) {
    console.error('[notificationQueue] Failed to queue assignment notification:', err.message);
  }
}

module.exports = { queueAssignmentNotification };
