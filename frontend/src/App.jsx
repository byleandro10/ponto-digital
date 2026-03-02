import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';

// Lazy loading para performance
const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const PunchClock = lazy(() => import('./pages/employee/PunchClock'));
const MyHistory = lazy(() => import('./pages/employee/MyHistory'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const Employees = lazy(() => import('./pages/admin/Employees'));
const Reports = lazy(() => import('./pages/admin/Reports'));
const TimeAdjustments = lazy(() => import('./pages/admin/TimeAdjustments'));
const Geofences = lazy(() => import('./pages/admin/Geofences'));
const Settings = lazy(() => import('./pages/admin/Settings'));

const LoadingSpinner = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full" />
  </div>
);

function PrivateRoute({ children, type }) {
  const { signed, user, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (!signed) return <Navigate to="/login" />;
  if (type && user?.type !== type) return <Navigate to={user?.type === 'admin' ? '/admin/dashboard' : '/employee/punch'} />;
  return children;
}

function AppRoutes() {
  const { signed, user } = useAuth();
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/" element={signed ? <Navigate to={user?.type === 'admin' ? '/admin/dashboard' : '/employee/punch'} /> : <Landing />} />
        <Route path="/login" element={signed ? <Navigate to={user?.type === 'admin' ? '/admin/dashboard' : '/employee/punch'} /> : <Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/employee/punch" element={<PrivateRoute type="employee"><PunchClock /></PrivateRoute>} />
        <Route path="/employee/history" element={<PrivateRoute type="employee"><MyHistory /></PrivateRoute>} />
        <Route path="/admin/dashboard" element={<PrivateRoute type="admin"><Dashboard /></PrivateRoute>} />
        <Route path="/admin/employees" element={<PrivateRoute type="admin"><Employees /></PrivateRoute>} />
        <Route path="/admin/reports" element={<PrivateRoute type="admin"><Reports /></PrivateRoute>} />
        <Route path="/admin/adjustments" element={<PrivateRoute type="admin"><TimeAdjustments /></PrivateRoute>} />
        <Route path="/admin/geofences" element={<PrivateRoute type="admin"><Geofences /></PrivateRoute>} />
        <Route path="/admin/settings" element={<PrivateRoute type="admin"><Settings /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      </AuthProvider>
    </BrowserRouter>
  );
}
