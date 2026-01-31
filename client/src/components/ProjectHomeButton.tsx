import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProjectHomeButtonProps {
  projectId: number | undefined;
  onSave: () => Promise<void>;
  saving?: boolean;
}

const ProjectHomeButton: React.FC<ProjectHomeButtonProps> = ({
  projectId,
  onSave,
  saving = false
}) => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [isNavigating, setIsNavigating] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleProjectHomeClick = async () => {
    setSaveError(null);
    setIsNavigating(true);

    try {
      // Auto-save before navigating
      await onSave();
      
      // After successful save, navigate to dashboard (task list)
      navigate(isAdmin() ? '/dashboard' : '/technician/dashboard');
    } catch (err: any) {
      console.error('Error saving before navigation:', err);
      setSaveError(err.response?.data?.error || 'Save failed. Please try again.');
      setIsNavigating(false);
      // Stay on page - don't navigate if save fails
    }
  };

  const isLoading = saving || isNavigating;

  if (!projectId) {
    // Don't show button if we don't have a project ID
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={handleProjectHomeClick}
        className="btn-secondary"
        style={{ marginRight: '10px' }}
        disabled={isLoading}
      >
        {isLoading ? 'Saving...' : 'Project Home'}
      </button>

      {/* Error Message */}
      {saveError && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            backgroundColor: '#f8d7da',
            color: '#721c24',
            padding: '12px 20px',
            borderRadius: '4px',
            border: '1px solid #f5c6cb',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            zIndex: 1001,
            maxWidth: '400px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '15px' }}>
            <span>{saveError}</span>
            <button
              type="button"
              onClick={() => setSaveError(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#721c24',
                cursor: 'pointer',
                fontSize: '18px',
                padding: '0',
                lineHeight: '1'
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default ProjectHomeButton;
