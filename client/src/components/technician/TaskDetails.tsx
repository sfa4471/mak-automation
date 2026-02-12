import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { tasksAPI, Task, taskTypeLabel } from '../../api/tasks';
import { useAuth } from '../../context/AuthContext';
import './TaskDetails.css';

const TaskDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadTask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadTask = async () => {
    try {
      const taskData = await tasksAPI.get(parseInt(id!));
      
      // Verify this task is assigned to the current technician
      if (taskData.assignedTechnicianId !== user?.id) {
        setError('You do not have access to this task');
        return;
      }
      
      setTask(taskData);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load task details');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!task) {
      alert('Task information not available');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const { getApiBaseUrlForFetch } = require('../../api/api');
      const baseUrl = getApiBaseUrlForFetch();
      const apiPrefix = baseUrl ? `${baseUrl}/api` : '/api';

      let url: string;
      let filename: string;

      switch (task.taskType) {
        case 'COMPRESSIVE_STRENGTH':
          url = `${apiPrefix}/pdf/wp1/${id}?type=task`;
          filename = `compressive-strength-${task.projectNumber || id}.pdf`;
          break;
        case 'PROCTOR':
          url = `${apiPrefix}/proctor/${id}/pdf`;
          filename = `proctor-${task.projectNumber || id}.pdf`;
          break;
        case 'DENSITY_MEASUREMENT':
          url = `${apiPrefix}/pdf/density/${id}`;
          filename = `density-${task.projectNumber || id}.pdf`;
          break;
        case 'REBAR':
          url = `${apiPrefix}/pdf/rebar/${id}`;
          filename = `rebar-${task.projectNumber || id}.pdf`;
          break;
        default:
          alert(`PDF generation is not available for task type: ${task.taskType}`);
          return;
      }
      
      // Fetch PDF with authentication
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        let errorMessage = 'Failed to generate PDF';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          try {
            errorMessage = await response.text();
          } catch {
            // Keep default error message
          }
        }
        throw new Error(errorMessage);
      }
      
      // Handle different response types (JSON with base64 or direct blob)
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        // JSON response with base64 PDF
        const data = await response.json();
        if (data.pdfBase64) {
          const binaryString = atob(data.pdfBase64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: 'application/pdf' });
          const blobUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(blobUrl);
        } else {
          throw new Error('PDF data not found in response');
        }
      } else {
        // Direct PDF blob response
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      }
    } catch (err: any) {
      alert('Failed to download PDF: ' + (err.message || 'Unknown error'));
      console.error('PDF download error:', err);
    }
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const _formatDateShort = (dateString?: string): string => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const getStatusLabel = (status: string): string => {
    const statusMap: { [key: string]: string } = {
      'ASSIGNED': 'Assigned',
      'IN_PROGRESS_TECH': 'In Progress',
      'READY_FOR_REVIEW': 'Ready for Review',
      'APPROVED': 'Approved',
      'REJECTED_NEEDS_FIX': 'Rejected - Needs Fix'
    };
    return statusMap[status] || status;
  };

  if (loading) {
    return <div className="task-details-loading">Loading task details...</div>;
  }

  if (error || !task) {
    return (
      <div className="task-details-container">
        <div className="task-details-error">
          <p>{error || 'Task not found'}</p>
          <button onClick={() => navigate('/technician/dashboard')} className="back-button">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="task-details-container">
      <div className="task-details-header">
        <h1>Task Details</h1>
        <div className="header-actions">
          <button onClick={handleDownloadPDF} className="pdf-button">
            Download PDF
          </button>
          <button onClick={() => navigate('/technician/dashboard')} className="back-button">
            Back to Dashboard
          </button>
        </div>
      </div>

      <div className="task-details-content">
        <div className="task-details-section">
          <h2>Project Information</h2>
          <div className="detail-row">
            <span className="detail-label">Project Number:</span>
            <span className="detail-value">{task.projectNumber || 'N/A'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Project Name:</span>
            <span className="detail-value">{task.projectName || 'N/A'}</span>
          </div>
        </div>

        <div className="task-details-section">
          <h2>Task Information</h2>
          <div className="detail-row">
            <span className="detail-label">Task Type:</span>
            <span className="detail-value">{taskTypeLabel(task)}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Assigned Technician:</span>
            <span className="detail-value">{task.assignedTechnicianName || 'Unassigned'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Status:</span>
            <span className="detail-value">{getStatusLabel(task.status)}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Due Date:</span>
            <span className="detail-value">{formatDate(task.dueDate)}</span>
          </div>
        </div>

        <div className="task-details-section">
          <h2>Schedule</h2>
          {task.scheduledStartDate ? (
            <>
              <div className="detail-row">
                <span className="detail-label">Scheduled Start Date:</span>
                <span className="detail-value">{formatDate(task.scheduledStartDate)}</span>
              </div>
              {task.scheduledEndDate ? (
                <div className="detail-row">
                  <span className="detail-label">Scheduled End Date:</span>
                  <span className="detail-value">{formatDate(task.scheduledEndDate)}</span>
                </div>
              ) : (
                <div className="detail-row">
                  <span className="detail-label">Schedule Type:</span>
                  <span className="detail-value">Single Day</span>
                </div>
              )}
            </>
          ) : (
            <div className="detail-row">
              <span className="detail-label">Schedule:</span>
              <span className="detail-value">Not scheduled (see due date)</span>
            </div>
          )}
        </div>

        <div className="task-details-section">
          <h2>Location</h2>
          <div className="detail-row">
            <span className="detail-label">Location Name:</span>
            <span className="detail-value">{task.locationName || 'N/A'}</span>
          </div>
          {task.locationNotes && (
            <div className="detail-row-full">
              <span className="detail-label">Location Notes:</span>
              <div className="detail-value-text">{task.locationNotes}</div>
            </div>
          )}
        </div>

        {task.engagementNotes && (
          <div className="task-details-section">
            <h2>Special Instructions</h2>
            <div className="detail-row-full">
              <div className="detail-value-text">{task.engagementNotes}</div>
            </div>
          </div>
        )}

        {task.status === 'REJECTED_NEEDS_FIX' && task.rejectionRemarks && (
          <div className="task-details-section task-details-rejection">
            <h2>Rejection Remarks</h2>
            <div className="detail-row-full">
              <div className="detail-value-text rejection-text">{task.rejectionRemarks}</div>
            </div>
            {task.resubmissionDueDate && (
              <div className="detail-row">
                <span className="detail-label">Resubmission Due Date:</span>
                <span className="detail-value">{formatDate(task.resubmissionDueDate)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskDetails;

