import { Navigate } from "react-router-dom";
import { Spin } from "antd";
import { homePath, useAuth } from "../context/AuthContext";
import type { ReactNode } from "react";

interface ProtectedRouteProps {
  allowedRole: string;
  children: ReactNode;
}

export default function ProtectedRoute({ allowedRole, children }: ProtectedRouteProps) {
  const { user, role, loading } = useAuth();

  // Still checking the saved session
  if (loading) {
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        <Spin size="large" />
      </div>
    );
  }

  // Not logged in
  if (!user) return <Navigate to="/login" replace />;

  // Logged in, but wrong role
  // Example: patient opens /admin → sent to /patient
  if (role !== allowedRole) return <Navigate to={homePath(role)} replace />;

  return children;
}