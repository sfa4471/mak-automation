import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  /** Admin or PM (e.g. Tasks board, change password for staff reviewers). */
  requireAdminOrPm?: boolean;
  requireTechnician?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAdmin = false,
  requireAdminOrPm = false,
  requireTechnician = false
}) => {
  const { user, loading, isAdmin, isStaffReviewer, isTechnician } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && !isAdmin()) {
    return <Navigate to="/dashboard" replace />;
  }

  if (requireAdminOrPm && !isStaffReviewer()) {
    return <Navigate to="/dashboard" replace />;
  }

  if (requireTechnician && !isTechnician()) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;

