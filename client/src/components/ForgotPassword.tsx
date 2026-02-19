import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../api/auth';
import './Login.css';

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [tenantId, setTenantId] = useState<number | undefined>();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      await authAPI.forgotPassword(email, tenantId);
      setMessage('If an account exists for this email, you will receive a password reset link shortly. Check your inbox and spam folder.');
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Something went wrong. Please try again.';
      setError(msg);
      if (err.response?.status === 503) {
        setMessage('');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="logo-container">
          <img src="/crestfield-logo.png" alt="CrestField Logo" className="login-logo" />
        </div>
        <h2 style={{ marginBottom: 20, fontSize: 18, textAlign: 'center' }}>Forgot password</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={loading}
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          {message && <div className="success-message" style={{ color: '#2e7d32', marginBottom: 15, fontSize: 14 }}>{message}</div>}
          <button type="submit" disabled={loading} className="login-button">
            {loading ? 'Sending...' : 'Send reset link'}
          </button>
        </form>
        <p style={{ marginTop: 20, textAlign: 'center' }}>
          <Link to="/login" style={{ color: '#667eea', textDecoration: 'none' }}>Back to login</Link>
        </p>
      </div>
    </div>
  );
};

export default ForgotPassword;
