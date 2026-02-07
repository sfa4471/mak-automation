import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../api/auth';
import './ChangePassword.css';

const ChangePassword: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    // Validation
    if (!formData.currentPassword || !formData.newPassword || !formData.confirmPassword) {
      setError('All fields are required');
      return;
    }

    if (formData.newPassword.length < 6) {
      setError('New password must be at least 6 characters long');
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setError('New password and confirmation do not match');
      return;
    }

    if (formData.currentPassword === formData.newPassword) {
      setError('New password must be different from current password');
      return;
    }

    setLoading(true);

    try {
      await authAPI.changePassword(formData.currentPassword, formData.newPassword);
      setSuccess(true);
      setFormData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      // Clear success message after 5 seconds
      setTimeout(() => setSuccess(false), 5000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="change-password-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Change Password</h2>
        <button 
          onClick={() => navigate('/technician/dashboard')} 
          className="back-button"
          style={{ padding: '8px 16px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
        >
          Back to Dashboard
        </button>
      </div>
      <form onSubmit={handleSubmit} className="change-password-form">
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">Password changed successfully!</div>}

        <div className="form-group">
          <label htmlFor="currentPassword">Current Password *</label>
          <input
            type="password"
            id="currentPassword"
            value={formData.currentPassword}
            onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
            required
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="newPassword">New Password *</label>
          <input
            type="password"
            id="newPassword"
            value={formData.newPassword}
            onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
            required
            minLength={6}
            disabled={loading}
          />
          <small>Must be at least 6 characters long</small>
        </div>

        <div className="form-group">
          <label htmlFor="confirmPassword">Confirm New Password *</label>
          <input
            type="password"
            id="confirmPassword"
            value={formData.confirmPassword}
            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
            required
            minLength={6}
            disabled={loading}
          />
        </div>

        <div className="form-actions">
          <button type="submit" className="submit-button" disabled={loading}>
            {loading ? 'Changing Password...' : 'Change Password'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChangePassword;
