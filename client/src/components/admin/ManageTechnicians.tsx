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
  const [editingTech, setEditingTech] = useState<User | null>(null);
  const [editFormData, setEditFormData] = useState({ email: '', password: '', name: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
    setSuccess('');

    try {
      await authAPI.createTechnician(formData.email, formData.password, formData.name);
      setFormData({ email: '', password: '', name: '' });
      setShowForm(false);
      setSuccess('Technician created successfully');
      loadTechnicians();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create technician');
    }
  };

  const handleEdit = (tech: User) => {
    setEditingTech(tech);
    setEditFormData({
      email: tech.email || '',
      password: '',
      name: tech.name || ''
    });
    setError('');
    setSuccess('');
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTech) return;

    setError('');
    setSuccess('');

    try {
      const updateData: { email?: string; name?: string; password?: string } = {
        email: editFormData.email,
        name: editFormData.name
      };

      // Only include password if it's provided
      if (editFormData.password) {
        updateData.password = editFormData.password;
      }

      await authAPI.updateTechnician(editingTech.id, updateData);
      setEditingTech(null);
      setEditFormData({ email: '', password: '', name: '' });
      setSuccess('Technician updated successfully');
      loadTechnicians();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update technician');
    }
  };

  const handleDelete = async (tech: User) => {
    if (!window.confirm(`Are you sure you want to delete ${tech.name || tech.email}? This action cannot be undone.`)) {
      return;
    }

    setError('');
    setSuccess('');

    try {
      await authAPI.deleteTechnician(tech.id);
      setSuccess('Technician deleted successfully');
      loadTechnicians();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete technician');
    }
  };

  const cancelEdit = () => {
    setEditingTech(null);
    setEditFormData({ email: '', password: '', name: '' });
    setError('');
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
        {success && <div className="success-message">{success}</div>}

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

          {editingTech && (
            <div className="edit-modal-overlay" onClick={cancelEdit}>
              <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
                <h2>Edit Technician</h2>
                <form onSubmit={handleEditSubmit} className="admin-form">
                  <div className="form-group">
                    <label htmlFor="edit-name">Name *</label>
                    <input
                      type="text"
                      id="edit-name"
                      value={editFormData.name}
                      onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="edit-email">Email *</label>
                    <input
                      type="email"
                      id="edit-email"
                      value={editFormData.email}
                      onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="edit-password">New Password (leave blank to keep current)</label>
                    <input
                      type="password"
                      id="edit-password"
                      value={editFormData.password}
                      onChange={(e) => setEditFormData({ ...editFormData, password: e.target.value })}
                      minLength={6}
                    />
                    <small>Only enter if you want to change the password</small>
                  </div>
                  <div className="form-actions">
                    <button type="button" onClick={cancelEdit} className="cancel-button">
                      Cancel
                    </button>
                    <button type="submit" className="submit-button">Save Changes</button>
                  </div>
                </form>
              </div>
            </div>
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
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {technicians.map((tech) => (
                    <tr key={tech.id}>
                      <td>{tech.name}</td>
                      <td>{tech.email}</td>
                      <td>
                        <div className="action-buttons">
                          <button
                            onClick={() => handleEdit(tech)}
                            className="edit-button"
                            title="Edit technician"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(tech)}
                            className="delete-button"
                            title="Delete technician"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
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

