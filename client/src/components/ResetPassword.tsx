import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { authAPI } from '../api/auth';
import './Login.css';

const ResetPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) setError('Missing reset link. Please use the link from your email or request a new one.');
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);

    try {
      await authAPI.resetPassword(token, newPassword);
      setDone(true);
      setMessage('Password updated. You can now log in with your new password.');
      setTimeout(() => navigate('/login'), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reset password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="login-container">
        <div className="login-box">
          <div className="logo-container">
            <img src="/crestfield-logo.png" alt="CrestField Logo" className="login-logo" />
          </div>
          <div style={{ color: '#2e7d32', textAlign: 'center', marginBottom: 20 }}>{message}</div>
          <p style={{ textAlign: 'center' }}>
            <Link to="/login" style={{ color: '#667eea', textDecoration: 'none' }}>Go to login</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="logo-container">
          <img src="/crestfield-logo.png" alt="CrestField Logo" className="login-logo" />
        </div>
        <h2 style={{ marginBottom: 20, fontSize: 18, textAlign: 'center' }}>Set new password</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="newPassword">New password</label>
            <input
              type="password"
              id="newPassword"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              disabled={loading || !token}
            />
            <small style={{ display: 'block', marginTop: 4, color: '#666' }}>At least 6 characters</small>
          </div>
          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm new password</label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              disabled={loading || !token}
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          <button type="submit" disabled={loading || !token} className="login-button">
            {loading ? 'Updating...' : 'Update password'}
          </button>
        </form>
        <p style={{ marginTop: 20, textAlign: 'center' }}>
          <Link to="/login" style={{ color: '#667eea', textDecoration: 'none' }}>Back to login</Link>
        </p>
      </div>
    </div>
  );
};

export default ResetPassword;
