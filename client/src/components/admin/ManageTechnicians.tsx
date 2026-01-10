import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI, User } from '../../api/auth';
import './Admin.css';

const ManageTechnicians: React.FC = () => {
  const navigate = useNavigate();
  const [technicians, setTechnicians] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ email: '', password: '', name: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    loadTechnicians();
  }, []);

  const loadTechnicians = async () => {
    try {
      const data = await authAPI.listTechnicians();
      setTechnicians(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load technicians');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await authAPI.createTechnician(formData.email, formData.password, formData.name);
      setFormData({ email: '', password: '', name: '' });
      setShowForm(false);
      loadTechnicians();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create technician');
    }
  };

  if (loading) {
    return <div className="admin-loading">Loading...</div>;
  }

  return (
    <div className="admin-page">
      <div className="admin-container">
        <div className="admin-header">
          <h1>Manage Technicians</h1>
          <button onClick={() => navigate('/dashboard')} className="back-button">
            Back to Dashboard
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="technicians-list">
          {!showForm && (
            <button onClick={() => setShowForm(true)} className="primary-button">
              + Add New Technician
            </button>
          )}

          {showForm && (
            <form onSubmit={handleSubmit} className="admin-form">
              <h2>Create Technician Account</h2>
              <div className="form-group">
                <label htmlFor="name">Name *</label>
                <input
                  type="text"
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="email">Email *</label>
                <input
                  type="email"
                  id="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="password">Password *</label>
                <input
                  type="password"
                  id="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  minLength={6}
                />
              </div>
              <div className="form-actions">
                <button type="button" onClick={() => setShowForm(false)} className="cancel-button">
                  Cancel
                </button>
                <button type="submit" className="submit-button">Create Technician</button>
              </div>
            </form>
          )}

          <div className="technicians-table">
            <h2>Existing Technicians</h2>
            {technicians.length === 0 ? (
              <p className="empty-state">No technicians yet. Create your first technician!</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {technicians.map((tech) => (
                    <tr key={tech.id}>
                      <td>{tech.name}</td>
                      <td>{tech.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManageTechnicians;

