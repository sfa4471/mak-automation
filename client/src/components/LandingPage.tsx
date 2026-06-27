import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './LandingPage.css';

const LandingPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed. Check your email and password.');
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) return null;

  return (
    <div className="lp-root">
      <div className="lp-left">
        <div className="lp-left-inner">
          <div className="lp-wordmark">Crestfield</div>

          <div className="lp-hero">
            <h1 className="lp-headline">
              Field ops for CMT and geotechnical firms.
            </h1>
            <p className="lp-sub">
              Crestfield keeps your lab running, from dispatching techs
              to closing out invoices. No paperwork.
            </p>
          </div>

          <ul className="lp-features">
            <li className="lp-feature">
              <svg className="lp-icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 2C6.239 2 4 4.239 4 7c0 3.75 5 9 5 9s5-5.25 5-9c0-2.761-2.239-5-5-5z"/>
                <circle cx="9" cy="7" r="1.75"/>
              </svg>
              <div>
                <strong>Dispatch</strong>
                <p>
                  Schedule technicians and assign them to job sites.
                  Everyone knows where to be and what to test.
                </p>
              </div>
            </li>
            <li className="lp-feature">
              <svg className="lp-icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 2h-2a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1h-2"/>
                <rect x="6" y="1" width="6" height="3" rx="1"/>
                <path d="M6 9h6M6 12h4"/>
              </svg>
              <div>
                <strong>Field data capture</strong>
                <p>
                  Record density, rebar, proctor, and compressive strength
                  results on site. No paper forms, no re-keying.
                </p>
              </div>
            </li>
            <li className="lp-feature">
              <svg className="lp-icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 2h9l3 3v11H3V2z"/>
                <path d="M12 2v3h3"/>
                <path d="M5.5 8h7M5.5 10.5h7M5.5 13h4.5"/>
              </svg>
              <div>
                <strong>Reporting</strong>
                <p>
                  Turn field results into clean, client-ready reports
                  automatically.
                </p>
              </div>
            </li>
            <li className="lp-feature">
              <svg className="lp-icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 2h7l3 3v11H4V2z"/>
                <path d="M11 2v3h3"/>
                <path d="M6.5 9.5h5M6.5 12h3.5"/>
              </svg>
              <div>
                <strong>QuickBooks invoicing</strong>
                <p>
                  Bill completed jobs and sync invoices to QuickBooks
                  automatically.
                </p>
              </div>
            </li>
          </ul>

          <div className="lp-left-footer">
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
          </div>
        </div>
      </div>

      <div className="lp-right">
        <div className="lp-form-wrap">
          <h2 className="lp-form-title">Log in to Crestfield</h2>

          <form onSubmit={handleSubmit} noValidate>
            <div className="lp-field">
              <label htmlFor="lp-email">Email</label>
              <input
                id="lp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                aria-required="true"
              />
            </div>

            <div className="lp-field">
              <label htmlFor="lp-password">Password</label>
              <input
                id="lp-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                aria-required="true"
              />
            </div>

            {error && (
              <div className="lp-error" role="alert" aria-live="polite">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="lp-submit"
              aria-busy={submitting}
            >
              {submitting ? 'Logging in…' : 'Log in'}
            </button>
          </form>

          <p className="lp-forgot">
            <Link to="/forgot-password">Forgot your password?</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
