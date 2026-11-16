import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ConfigProvider } from "antd";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import PatientPage from "./pages/PatientPage";
import AppLayout from "./components/AppLayout/AppLayout";
import AdminPage from "./pages/AdminPage/AdminPage";
import LoginPage from "./pages/Auth/LoginPage/LoginPage";
import SignUpPage from "./pages/Auth/SignUpPage/SignUpPage";


export default function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#0f766e",   // calm teal, clinic feel
          borderRadius: 10,
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        },
      }}
    >
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignUpPage />} />

            <Route element={<AppLayout />}>
              <Route
                path="/patient"
                element={
                  <ProtectedRoute allowedRole="patient">
                    <PatientPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute allowedRole="admin">
                    <AdminPage />
                  </ProtectedRoute>
                }
              />
            </Route>

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>

      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
    </ConfigProvider>
  );
}