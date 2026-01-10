import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import TechnicianDashboard from './components/TechnicianDashboard';
import TaskDetails from './components/technician/TaskDetails';
import CreateProject from './components/admin/CreateProject';
import ManageTechnicians from './components/admin/ManageTechnicians';
import AssignWorkPackage from './components/admin/AssignWorkPackage';
import TasksDashboard from './components/admin/TasksDashboard';
import CreateTask from './components/admin/CreateTask';
import ProjectDetails from './components/admin/ProjectDetails';
import WP1Form from './components/WP1Form';
import DensityReportForm from './components/DensityReportForm';
import RebarForm from './components/RebarForm';
import ProctorForm from './components/ProctorForm';
import ProctorSummary from './components/ProctorSummary';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/technician/dashboard"
            element={
              <ProtectedRoute>
                <TechnicianDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/technician/task/:id/details"
            element={
              <ProtectedRoute>
                <TaskDetails />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/create-project"
            element={
              <ProtectedRoute requireAdmin>
                <CreateProject />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/technicians"
            element={
              <ProtectedRoute requireAdmin>
                <ManageTechnicians />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/assign/:id"
            element={
              <ProtectedRoute requireAdmin>
                <AssignWorkPackage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/workpackage/:id/wp1"
            element={
              <ProtectedRoute>
                <WP1Form />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/tasks"
            element={
              <ProtectedRoute requireAdmin>
                <TasksDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/create-task/:projectId"
            element={
              <ProtectedRoute requireAdmin>
                <CreateTask />
              </ProtectedRoute>
            }
          />
          <Route
            path="/task/:taskId/edit"
            element={
              <ProtectedRoute requireAdmin>
                <CreateTask />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/projects/:id/details"
            element={
              <ProtectedRoute requireAdmin>
                <ProjectDetails />
              </ProtectedRoute>
            }
          />
          <Route
            path="/task/:id/wp1"
            element={
              <ProtectedRoute>
                <WP1Form />
              </ProtectedRoute>
            }
          />
          <Route
            path="/task/:id/density"
            element={
              <ProtectedRoute>
                <DensityReportForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/task/:id/rebar"
            element={
              <ProtectedRoute>
                <RebarForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/task/:id/proctor"
            element={
              <ProtectedRoute>
                <ProctorForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/task/:id/proctor/summary"
            element={
              <ProtectedRoute>
                <ProctorSummary />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
