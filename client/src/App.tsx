import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { TenantProvider } from './context/TenantContext';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import LoadingSpinner from './components/LoadingSpinner';
import Login from './components/Login';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';
import Dashboard from './components/Dashboard';
import TechnicianDashboard from './components/TechnicianDashboard';
import ChangePassword from './components/ChangePassword';
import './App.css';

// Lazy load heavy components for code splitting
const TaskDetails = lazy(() => import('./components/technician/TaskDetails'));
const CreateProject = lazy(() => import('./components/admin/CreateProject'));
const ManageTechnicians = lazy(() => import('./components/admin/ManageTechnicians'));
const AssignWorkPackage = lazy(() => import('./components/admin/AssignWorkPackage'));
const TasksDashboard = lazy(() => import('./components/admin/TasksDashboard'));
const CreateTask = lazy(() => import('./components/admin/CreateTask'));
const ProjectDetails = lazy(() => import('./components/admin/ProjectDetails'));
const WP1Form = lazy(() => import('./components/WP1Form'));
const DensityReportForm = lazy(() => import('./components/DensityReportForm'));
const RebarForm = lazy(() => import('./components/RebarForm'));
const ProctorForm = lazy(() => import('./components/ProctorForm'));
const ProctorSummary = lazy(() => import('./components/ProctorSummary'));
const Settings = lazy(() => import('./components/admin/Settings'));

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <TenantProvider>
        <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
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
            path="/technician/change-password"
            element={
              <ProtectedRoute requireTechnician>
                <ChangePassword />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/change-password"
            element={
              <ProtectedRoute requireAdmin>
                <ChangePassword />
              </ProtectedRoute>
            }
          />
          <Route
            path="/technician/task/:id/details"
            element={
              <ProtectedRoute>
                <Suspense fallback={<LoadingSpinner fullScreen message="Loading task details..." />}>
                  <TaskDetails />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/create-project"
            element={
              <ProtectedRoute requireAdmin>
                <Suspense fallback={<LoadingSpinner fullScreen message="Loading..." />}>
                  <CreateProject />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/technicians"
            element={
              <ProtectedRoute requireAdmin>
                <Suspense fallback={<LoadingSpinner fullScreen message="Loading..." />}>
                  <ManageTechnicians />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/assign/:id"
            element={
              <ProtectedRoute requireAdmin>
                <Suspense fallback={<LoadingSpinner fullScreen message="Loading..." />}>
                  <AssignWorkPackage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/workpackage/:id/wp1"
            element={
              <ProtectedRoute>
                <Suspense fallback={<LoadingSpinner fullScreen message="Loading form..." />}>
                  <WP1Form />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/tasks"
            element={
              <ProtectedRoute requireAdmin>
                <Suspense fallback={<LoadingSpinner fullScreen message="Loading tasks..." />}>
                  <TasksDashboard />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/create-task/:projectId"
            element={
              <ProtectedRoute requireAdmin>
                <Suspense fallback={<LoadingSpinner fullScreen message="Loading..." />}>
                  <CreateTask />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/task/:taskId/edit"
            element={
              <ProtectedRoute requireAdmin>
                <Suspense fallback={<LoadingSpinner fullScreen message="Loading..." />}>
                  <CreateTask />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/projects/:id/details"
            element={
              <ProtectedRoute>
                <Suspense fallback={<LoadingSpinner fullScreen message="Loading project details..." />}>
                  <ProjectDetails />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <ProtectedRoute requireAdmin>
                <Suspense fallback={<LoadingSpinner fullScreen message="Loading settings..." />}>
                  <Settings />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/task/:id/wp1"
            element={
              <ProtectedRoute>
                <Suspense fallback={<LoadingSpinner fullScreen message="Loading form..." />}>
                  <WP1Form />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/task/:id/density"
            element={
              <ProtectedRoute>
                <Suspense fallback={<LoadingSpinner fullScreen message="Loading form..." />}>
                  <DensityReportForm />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/task/:id/rebar"
            element={
              <ProtectedRoute>
                <Suspense fallback={<LoadingSpinner fullScreen message="Loading form..." />}>
                  <RebarForm />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/task/:id/proctor"
            element={
              <ProtectedRoute>
                <Suspense fallback={<LoadingSpinner fullScreen message="Loading form..." />}>
                  <ProctorForm />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/task/:id/proctor/summary"
            element={
              <ProtectedRoute>
                <Suspense fallback={<LoadingSpinner fullScreen message="Loading summary..." />}>
                  <ProctorSummary />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </Router>
        </TenantProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
