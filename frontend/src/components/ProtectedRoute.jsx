import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// roles: optional array of allowed sbmsRole values for this route
export default function ProtectedRoute({ children, roles }) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (roles && !roles.includes(user.sbmsRole)) return <Navigate to="/dashboard" replace />;

  return children;
}
