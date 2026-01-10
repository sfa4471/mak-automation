import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { workPackagesAPI, WorkPackage } from '../../api/workpackages';
import { authAPI, User } from '../../api/auth';
import './Admin.css';

const AssignWorkPackage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [workPackage, setWorkPackage] = useState<WorkPackage | null>(null);
  const [technicians, setTechnicians] = useState<User[]>([]);
  const [selectedTechnician, setSelectedTechnician] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const [wp, techs] = await Promise.all([
        workPackagesAPI.get(parseInt(id!)),
        authAPI.listTechnicians()
      ]);
      setWorkPackage(wp);
      setTechnicians(techs);
      if (wp.assignedTo) {
        setSelectedTechnician(wp.assignedTo.toString());
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedTechnician) {
      setError('Please select a technician');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await workPackagesAPI.assign(parseInt(id!), parseInt(selectedTechnician));
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to assign work package');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="admin-loading">Loading...</div>;
  }

  if (!workPackage) {
    return <div className="admin-error">Work package not found</div>;
  }

  return (
    <div className="admin-page">
      <div className="admin-container">
        <h1>Assign Work Package</h1>
        <div className="work-package-info">
          <p><strong>Project:</strong> {workPackage.projectName}</p>
          <p><strong>Work Package:</strong> {workPackage.name}</p>
          <p><strong>Current Status:</strong> {workPackage.status}</p>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handleAssign(); }} className="admin-form">
          <div className="form-group">
            <label htmlFor="technician">Assign to Technician *</label>
            <select
              id="technician"
              value={selectedTechnician}
              onChange={(e) => setSelectedTechnician(e.target.value)}
              required
            >
              <option value="">Select a technician...</option>
              {technicians.map((tech) => (
                <option key={tech.id} value={tech.id}>
                  {tech.name} ({tech.email})
                </option>
              ))}
            </select>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="form-actions">
            <button type="button" onClick={() => navigate('/dashboard')} className="cancel-button">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="submit-button">
              {saving ? 'Assigning...' : 'Assign Work Package'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AssignWorkPackage;

