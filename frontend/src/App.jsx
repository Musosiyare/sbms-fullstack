import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "./context/AuthContext";
import { ConfirmProvider } from "./components/ui/ConfirmProvider";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import ChangePassword from "./pages/ChangePassword";
import Profile from "./pages/Profile";
import Dashboard from "./pages/Dashboard";
import ReportMistake from "./pages/ReportMistake";
import Records from "./pages/Records";
import ClassReport from "./pages/ClassReport";
import YearlyReport from "./pages/YearlyReport";
import MisconductTypes from "./pages/MisconductTypes";
import StaffRoles from "./pages/StaffRoles";
import Discussions from "./pages/Discussions";

export default function App() {
  return (
    <AuthProvider>
      <ConfirmProvider>
        <Toaster
          position="top-right"
          richColors
          closeButton
          toastOptions={{
            classNames: {
              toast: "font-sans",
            },
          }}
        />
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/change-password" element={<ChangePassword />} />

              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <Profile />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/report"
                element={
                  <ProtectedRoute roles={["manager", "disciplinary_officer", "reporter"]}>
                    <ReportMistake />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/records"
                element={
                  <ProtectedRoute roles={["manager", "dean_of_discipline", "disciplinary_officer"]}>
                    <Records />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/class-report"
                element={
                  <ProtectedRoute roles={["manager", "dean_of_discipline", "disciplinary_officer"]}>
                    <ClassReport />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/yearly-report"
                element={
                  <ProtectedRoute roles={["manager", "dean_of_discipline", "disciplinary_officer"]}>
                    <YearlyReport />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/misconduct-types"
                element={
                  <ProtectedRoute roles={["dean_of_discipline"]}>
                    <MisconductTypes />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/discussions"
                element={
                  <ProtectedRoute>
                    <Discussions />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff-roles"
                element={
                  <ProtectedRoute roles={["manager", "dean_of_discipline", "disciplinary_officer"]}>
                    <StaffRoles />
                  </ProtectedRoute>
                }
              />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </ConfirmProvider>
    </AuthProvider>
  );
}
