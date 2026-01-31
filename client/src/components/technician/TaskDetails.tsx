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
    try {
      const token = localStorage.getItem('token');
      // Get base URL (without /api)
      const apiBaseUrl = process.env.REACT_APP_API_URL || 'http://192.168.4.24:5000/api';
      const baseUrl = apiBaseUrl.replace('/api', '');
      const url = `${baseUrl}/api/pdf/task/${id}`;
      
      // Fetch PDF with authentication
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to generate PDF');
      }
      
      // Create blob and download
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `task-work-order-${task?.projectNumber || id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      alert('Failed to download PDF: ' + (err.message || 'Unknown error'));
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

  const formatDateShort = (dateString?: string): string => {
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

