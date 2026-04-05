import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { rebarAPI, RebarReport } from '../api/rebar';
import { tasksAPI, Task, TaskHistoryEntry, taskTypeLabel } from '../api/tasks';
import { useAuth } from '../context/AuthContext';
import { authAPI, User } from '../api/auth';
import { getApiPathPrefix } from '../api/api';
import { useAppDialog } from '../context/AppDialogContext';
import ProjectHomeButton from './ProjectHomeButton';
import RejectTaskModal from './RejectTaskModal';
import './RebarForm.css';

const RebarForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isStaffReviewer } = useAuth();
  const { showAlert, showConfirm } = useAppDialog();
  const [task, setTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState<RebarReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const [technicians, setTechnicians] = useState<User[]>([]);
  const [history, setHistory] = useState<TaskHistoryEntry[]>([]);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [lastSavedPath, setLastSavedPath] = useState<string | null>(null);
  const saveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const lastSavedDataRef = useRef<string>('');
  const latestFormDataRef = useRef<RebarReport | null>(null);

  useEffect(() => {
    if (formData) latestFormDataRef.current = formData;
  }, [formData]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);
      const taskId = parseInt(id!);
      const [taskData, reportData] = await Promise.all([
        tasksAPI.get(taskId),
        rebarAPI.getByTask(taskId)
      ]);
      setTask(taskData);
      setFormData(reportData);
      
      // Update last saved snapshot after loading
      if (reportData) {
        lastSavedDataRef.current = JSON.stringify(reportData);
      }

      // Auto-save initial data if no record exists yet
      if (reportData && taskData && typeof reportData.id === 'undefined') {
        try {
          const saved = await rebarAPI.saveByTask(taskId, reportData);
          const savedId = saved && typeof (saved as { id?: number }).id === 'number' ? (saved as { id: number }).id : undefined;
          if (savedId !== undefined) {
            setFormData(prev => prev ? { ...prev, id: savedId } : { ...reportData, id: savedId } as RebarReport);
          }
        } catch (err) {
          console.error('Error auto-saving initial data:', err);
        }
      }

      // Load technicians list
      try {
        const techs = await authAPI.listTechnicians();
        setTechnicians(techs);
      } catch (err) {
        console.error('Error loading technicians:', err);
      }

      // Load task history
      try {
        const historyData = await tasksAPI.getHistory(taskId);
        setHistory(historyData);
      } catch (err) {
        console.error('Error loading task history:', err);
      }
    } catch (err: any) {
      console.error('Error loading data:', err);
      setError(err.response?.data?.error || 'Failed to load report data.');
    } finally {
      setLoading(false);
    }
  };

  // Check if there are unsaved changes
  const _checkUnsavedChanges = useCallback(() => {
    if (!formData || !task) return false;
    if (saveStatus === 'saving') return true;
    const currentData = JSON.stringify(formData);
    return currentData !== lastSavedDataRef.current;
  }, [formData, task, saveStatus]);

  // Simple save function for Home button (saves current state without changing status)
  const handleSimpleSave = useCallback(async () => {
    if (!formData || !task) return;
    await rebarAPI.saveByTask(task.id, formData);
    // Update last saved snapshot
    lastSavedDataRef.current = JSON.stringify(formData);
  }, [formData, task]);

  const debouncedSave = useCallback((data: RebarReport) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(async () => {
      await saveData(data, false);
    }, 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveData = async (data: RebarReport | null, updateStatus?: boolean, status?: string) => {
    if (!data || !task) return;
    
    try {
      setSaving(true);
      setSaveStatus('saving');
      const res = await rebarAPI.saveByTask(
        task.id,
        data,
        updateStatus ? status : undefined,
        isStaffReviewer() && data.techName ? technicians.find(t => (t.name || t.email) === data.techName)?.id : undefined
      );
      setSaveStatus('saved');
      setLastSaved(new Date());
      setTimeout(() => setSaveStatus('idle'), 2000);
      if (res && typeof (res as { id?: number }).id === 'number') {
        setFormData(prev => prev ? { ...prev, id: (res as { id: number }).id } : null);
      }
    } catch (err: any) {
      console.error('Error saving:', err);
      setError(err.response?.data?.error || 'Failed to save report.');
    } finally {
      setSaving(false);
    }
  };

  const handleFieldChange = (field: keyof RebarReport, value: any) => {
    if (!formData) return;
    const updatedData = { ...formData, [field]: value };
    setFormData(updatedData);
    debouncedSave(updatedData);
  };

  const handleTechnicianChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const technicianId = parseInt(e.target.value);
    const selectedTech = technicians.find(t => t.id === technicianId);
    if (!formData) return;
    const updatedData = {
      ...formData,
      technicianId: technicianId || undefined,
      techName: selectedTech ? (selectedTech.name || selectedTech.email) : ''
    };
    setFormData(updatedData);
    debouncedSave(updatedData);
  };

  const handleManualSave = async () => {
    if (!formData || !task) return;
    setSaving(true);
    setSaveStatus('saving');
    try {
      const data = latestFormDataRef.current ?? formData;
      const res = await rebarAPI.saveByTask(task.id, data);
      lastSavedDataRef.current = JSON.stringify(data);
      setSaveStatus('saved');
      setLastSaved(new Date());
      setTimeout(() => setSaveStatus('idle'), 2000);
      if (res && typeof (res as { id?: number }).id === 'number') {
        setFormData(prev => prev ? { ...prev, id: (res as { id: number }).id } : null);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save');
      setSaveStatus('idle');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUpdate = async () => {
    if (!formData || !task) return;
    setSaving(true);
    setSaveStatus('saving');
    try {
      // Prevent a queued auto-save from writing stale data after this explicit save.
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      const data = latestFormDataRef.current ?? formData;
      const res = await rebarAPI.saveByTask(task.id, data, 'IN_PROGRESS_TECH');
      await tasksAPI.updateStatus(task.id, 'IN_PROGRESS_TECH');
      lastSavedDataRef.current = JSON.stringify(data);
      setSaveStatus('saved');
      setLastSaved(new Date());
      setTimeout(() => setSaveStatus('idle'), 2000);
      if (res && typeof (res as { id?: number }).id === 'number') {
        setFormData(prev => prev ? { ...prev, id: (res as { id: number }).id } : null);
      }
      await showAlert('Your update has been saved. Task status is now In Progress.', 'Saved');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save update');
      setSaveStatus('idle');
    } finally {
      setSaving(false);
    }
  };

  const handleSendToAdmin = async () => {
    if (!formData || !task) return;
    const ok = await showConfirm(
      'Send this report to the administrator for review? You will not be able to edit it until an administrator responds.',
      'Submit for review'
    );
    if (!ok) return;
    setSaving(true);
    setSaveStatus('saving');
    try {
      // Prevent a queued auto-save from writing stale data after submission.
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      const data = latestFormDataRef.current ?? formData;
      const res = await rebarAPI.saveByTask(task.id, data);
      await tasksAPI.updateStatus(task.id, 'READY_FOR_REVIEW');
      if (res && typeof (res as { id?: number }).id === 'number' && data) {
        setFormData(prev => prev ? { ...prev, id: (res as { id: number }).id } : null);
      }
      lastSavedDataRef.current = JSON.stringify(data);
      setSaveStatus('saved');
      setLastSaved(new Date());
      setTimeout(() => setSaveStatus('idle'), 2000);
      navigate('/technician/dashboard');
    } catch (err: any) {
      console.error('Error sending report to admin:', err);
      setError(err.response?.data?.error || 'Failed to send report for review.');
      setSaveStatus('idle');
      await showAlert(err.response?.data?.error || 'The report could not be submitted for review. Please try again.', 'Submission failed');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    const approveOk = await showConfirm('Approve this report?', 'Approve report');
    if (!approveOk) return;
    try {
      await tasksAPI.approve(task!.id);
      await loadData();
    } catch (err: any) {
      await showAlert(err.response?.data?.error || 'The report could not be approved.', 'Approval failed');
    }
  };

  const handleDownloadPdf = async () => {
    if (!task) return;
    if (!formData) {
      setError('No form data. Please wait for the form to load.');
      await showAlert('The form is still loading. Please wait a moment, then try again.', 'Not ready');
      return;
    }
    setLastSavedPath(null); // Clear previous saved path
    setError('');
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        await showAlert('Your session has expired or you are not signed in. Please log in again.', 'Authentication required');
        return;
      }
      // Always save first so the PDF server has a row to read (server looks up rebar_reports by taskId)
      let saved: RebarReport;
      try {
        saved = await rebarAPI.saveByTask(task.id, formData);
        setFormData((prev) => (prev ? { ...prev, ...saved, id: saved?.id ?? prev?.id } : saved));
      } catch (saveErr: any) {
        const saveMsg = saveErr.response?.data?.error || saveErr.message || 'Save failed';
        setError(saveMsg);
        await showAlert(
          `The report must be saved before a PDF can be generated.\n\nPlease save the form, then try again.\n\nDetails: ${saveMsg}`,
          'Save required'
        );
        return;
      }

      // Use same base URL as API (including tenant override) so save and PDF hit the same backend
      const apiPrefix = getApiPathPrefix();
      const pdfBase = `${apiPrefix}/pdf/rebar`;
      const headers: HeadersInit = { 'Authorization': `Bearer ${token}` };

      let response = await fetch(`${pdfBase}/${task.id}`, { method: 'GET', headers });

      // If GET 404 (no row in DB), retry with POST and report data so PDF can still be generated
      if (response.status === 404) {
        response = await fetch(pdfBase, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: task.id, reportData: saved })
        });
      }

      if (!response.ok) {
        let errorMessage = 'Failed to generate PDF';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const contentType = response.headers.get('content-type') || '';

      // Check if response is JSON (new format with save info)
      if (contentType.includes('application/json')) {
        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Failed to generate PDF');
        }

        if (result.saved && result.savedPath) {
          setLastSavedPath(result.savedPath);
          setError('');
          await showAlert('The PDF was created successfully.', 'PDF ready');
        } else if (result.saveError) {
          setError(`PDF generated but save failed: ${result.saveError}`);
          await showAlert(
            `The PDF was generated, but saving the file to the server folder failed.\n\nDetails: ${result.saveError}\n\nThe PDF will still download to your device.`,
            'PDF generated'
          );
        }

        if (result.pdfBase64) {
          const pdfBytes = Uint8Array.from(atob(result.pdfBase64), c => c.charCodeAt(0));
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          const filename = result.fileName || `Rebar-Inspection-${formData?.inspectionDate || 'report'}.pdf`;
          const { saveFileToChosenFolder } = await import('../utils/browserFolder');
          await saveFileToChosenFolder(filename, blob, task?.projectNumber, user?.tenantId);

          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        }
        return;
      }

      // Legacy support: Handle PDF response (if backend still returns PDF directly)
      const blob = await response.blob();
      const filename = `Rebar-Inspection-${formData?.inspectionDate || 'report'}.pdf`;
      const { saveFileToChosenFolder } = await import('../utils/browserFolder');
      await saveFileToChosenFolder(filename, blob, task?.projectNumber, user?.tenantId);

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      console.error('PDF generation error:', err);
      const errorMessage = err.message || 'Unknown error';
      setError(errorMessage);
      await showAlert(`The PDF could not be downloaded.\n\nDetails: ${errorMessage}`, 'PDF error');
    }
  };

  if (loading) {
    return <div className="rebar-form-container">Loading...</div>;
  }

  if (!formData || !task) {
    return <div className="rebar-form-container">Report not found.</div>;
  }

  const isEditable =
    task.status !== 'APPROVED' &&
    (isStaffReviewer() || (task.assignedTechnicianId === user?.id && task.status !== 'READY_FOR_REVIEW'));

  return (
    <div className="rebar-form-container">
      <div className="rebar-form-header">
        <h1>Reinforcing Steel Placement Observation</h1>
        <div className="form-actions">
          <ProjectHomeButton
            projectId={task.projectId}
            onSave={handleSimpleSave}
            saving={saving}
          />
          <button
            type="button"
            onClick={() => navigate(user?.role === 'TECHNICIAN' ? '/technician/dashboard' : '/dashboard')}
            className="btn-secondary"
          >
            Back
          </button>
          {isEditable && (
            <>
              {isStaffReviewer() ? (
                <button type="button" onClick={handleManualSave} className="btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              ) : (
                <>
                  <button type="button" onClick={handleSaveUpdate} className="btn-primary" disabled={saving}>
                    {saving ? 'Saving...' : 'Save Update'}
                  </button>
                  <button type="button" onClick={handleSendToAdmin} className="btn-primary" disabled={saving || task.status === 'READY_FOR_REVIEW'}>
                    Send to Admin
                  </button>
                </>
              )}
            </>
          )}
          {task.status === 'READY_FOR_REVIEW' && isStaffReviewer() && (
            <>
              <button type="button" onClick={handleApprove} className="btn-success">
                Approve
              </button>
              <button type="button" onClick={() => setRejectModalOpen(true)} className="btn-danger">
                Reject
              </button>
            </>
          )}
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="btn-primary"
            disabled={!formData?.id}
            title={formData?.id ? 'Generate PDF' : 'Save the form first to generate a PDF'}
          >
            Create PDF
          </button>
          {!formData?.id && (
            <span className="form-help" style={{ marginLeft: '8px', color: '#856404' }}>
              Save the form first to generate a PDF.
            </span>
          )}
          {lastSavedPath && (
            <div className="pdf-saved-confirmation" style={{ marginTop: '10px', padding: '10px', background: '#d4edda', border: '1px solid #c3e6cb', borderRadius: '4px', color: '#155724' }}>
              PDF saved.
            </div>
          )}
        </div>
      </div>

      {saveStatus === 'saved' && (
        <div className="save-status saved">Saved {lastSaved ? lastSaved.toLocaleTimeString() : ''}</div>
      )}

      {error && <div className="error-message">{error}</div>}

      <div className="rebar-form">
        {/* Top block: 2-column grid */}
        <div className="form-top-grid">
          <div className="form-column">
            <div className="form-field-inline">
              <label htmlFor="clientName">CLIENT:</label>
              <input
                type="text"
                id="clientName"
                value={formData.clientName || ''}
                onChange={(e) => handleFieldChange('clientName', e.target.value)}
                readOnly={!isEditable}
                className={!isEditable ? 'readonly' : ''}
              />
            </div>
            <div className="form-field-inline">
              <label htmlFor="projectName">PROJECT:</label>
              <input
                type="text"
                id="projectName"
                value={formData.projectName || ''}
                readOnly
                className="readonly"
              />
            </div>
          </div>
          <div className="form-column">
            <div className="form-field-inline">
              <label htmlFor="reportDate">REPORT DATE:</label>
              <input
                type="date"
                id="reportDate"
                value={formData.reportDate || ''}
                onChange={(e) => handleFieldChange('reportDate', e.target.value)}
                readOnly={!isEditable}
                className={!isEditable ? 'readonly' : ''}
              />
            </div>
            <div className="form-field-inline">
              <label htmlFor="projectNumber">PROJECT NO:</label>
              <input
                type="text"
                id="projectNumber"
                value={formData.projectNumber || ''}
                readOnly
                className="readonly"
              />
            </div>
          </div>
        </div>

        {/* DATE INSPECTION PERFORMED: single line, centered */}
        <div className="form-field-inline-centered">
          <label htmlFor="inspectionDate">DATE INSPECTION PERFORMED:</label>
          <input
            type="date"
            id="inspectionDate"
            value={formData.inspectionDate || ''}
            onChange={(e) => handleFieldChange('inspectionDate', e.target.value)}
            readOnly={!isEditable}
            className={!isEditable ? 'readonly' : ''}
          />
        </div>

        {/* General Contractor */}
        <div className="form-field-inline">
          <label htmlFor="generalContractor">GENERAL CONTRACTOR:</label>
          <input
            type="text"
            id="generalContractor"
            value={formData.generalContractor || ''}
            onChange={(e) => handleFieldChange('generalContractor', e.target.value)}
            readOnly={!isEditable}
            className={!isEditable ? 'readonly' : ''}
          />
        </div>

        {/* Method of Test (editable) */}
        <div className="form-field-inline">
          <label htmlFor="methodOfTest">METHOD OF TEST:</label>
          <input
            type="text"
            id="methodOfTest"
            value={formData.methodOfTest || ''}
            onChange={(e) => handleFieldChange('methodOfTest', e.target.value)}
            readOnly={!isEditable}
            className={!isEditable ? 'readonly' : ''}
            placeholder="e.g., Applicable ACI Recommendations and ASTM Standards"
          />
        </div>

        {/* Results / Remarks — single text box for client-entered text */}
        <div className="form-section results-remarks-section">
          <label className="section-label" htmlFor="resultRemarks">Results / Remarks:</label>
          <textarea
            id="resultRemarks"
            value={formData.resultRemarks || ''}
            onChange={(e) => handleFieldChange('resultRemarks', e.target.value)}
            readOnly={!isEditable}
            className={!isEditable ? 'readonly' : ''}
            rows={4}
            placeholder="Enter results and remarks here..."
          />
        </div>

        {/* Drawings */}
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="drawings">Drawings:</label>
            <input
              type="text"
              id="drawings"
              value={formData.drawings || ''}
              onChange={(e) => handleFieldChange('drawings', e.target.value)}
              readOnly={!isEditable}
              className={!isEditable ? 'readonly' : ''}
            />
          </div>
        </div>

        {/* Technician Name */}
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="technicianId">Technician Name:</label>
            <select
              id="technicianId"
              value={formData.technicianId || ''}
              onChange={handleTechnicianChange}
              disabled={!isEditable}
              className={!isEditable ? 'readonly' : ''}
            >
              <option value="">Select Technician</option>
              {technicians.map((tech) => (
                <option key={tech.id} value={tech.id}>
                  {tech.name || tech.email}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* History / Audit Trail (NOT printable) */}
      {history.length > 0 && (
        <div className="history-section no-print">
          <h2>History / Audit Trail</h2>
          <div className="history-list">
            {history.map((entry) => {
              const date = new Date(entry.timestamp);
              const actionLabels: { [key: string]: string } = {
                'SUBMITTED': 'submitted report for review',
                'APPROVED': 'approved report',
                'REJECTED': 'rejected report',
                'REASSIGNED': 'reassigned task',
                'STATUS_CHANGED': 'changed status'
              };
              let actionLabel = actionLabels[entry.actionType] || entry.actionType.toLowerCase();
              // Format the message according to requirements
              let message = '';
              if (entry.actionType === 'SUBMITTED') {
                message = `${entry.actorName} submitted report for review`;
              } else if (entry.actionType === 'APPROVED') {
                message = `${entry.actorName} approved report`;
              } else if (entry.actionType === 'REJECTED') {
                message = `${entry.actorName} rejected report${entry.note ? `: ${entry.note}` : ''}`;
              } else if (entry.actionType === 'REASSIGNED') {
                message = entry.note || `Task reassigned by ${entry.actorName}`;
              } else {
                message = `${entry.actorName} (${entry.actorRole}) ${actionLabel}`;
              }
              
              return (
                <div key={entry.id} className="history-entry">
                  <div className="history-timestamp">
                    {date.toLocaleString()}
                  </div>
                  <div className="history-content">
                    {message}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <RejectTaskModal
        isOpen={rejectModalOpen}
        contextLine={task ? `${task.projectNumber ?? '—'} · ${taskTypeLabel(task)}` : undefined}
        onClose={() => setRejectModalOpen(false)}
        onSubmit={async (payload) => {
          if (!task) return;
          await tasksAPI.reject(task.id, payload);
          await loadData();
        }}
      />
    </div>
  );
};

export default RebarForm;

