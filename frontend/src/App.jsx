import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import InstallPWA from './components/InstallPWA';

// Lazy loading para performance
const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Checkout = lazy(() => import('./pages/Checkout'));
const PunchClock = lazy(() => import('./pages/employee/PunchClock'));
const MyHistory = lazy(() => import('./pages/employee/MyHistory'));
const MyPunchMirror = lazy(() => import('./pages/employee/MyPunchMirror'));
const MyAdjustments = lazy(() => import('./pages/employee/MyAdjustments'));
const MyAuditLog = lazy(() => import('./pages/employee/MyAuditLog'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const Employees = lazy(() => import('./pages/admin/Employees'));
const Reports = lazy(() => import('./pages/admin/Reports'));
const TimeAdjustments = lazy(() => import('./pages/admin/TimeAdjustments'));
const AdjustmentRequests = lazy(() => import('./pages/admin/AdjustmentRequests'));
const Geofences = lazy(() => import('./pages/admin/Geofences'));
const Settings = lazy(() => import('./pages/admin/Settings'));
const PunchMapPage = lazy(() => import('./pages/admin/PunchMapPage'));
const AdminSubscription = lazy(() => import('./pages/admin/Subscription'));
const SADashboard = lazy(() => import('./pages/superadmin/SADashboard'));
const SACompanies = lazy(() => import('./pages/superadmin/SACompanies'));
const SARevenue = lazy(() => import('./pages/superadmin/SARevenue'));
const SAUsage = lazy(() => import('./pages/superadmin/SAUsage'));

const LoadingSpinner = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full" />
  </div>
);

function PrivateRoute({ children, type, allowExpired }) {
  const { signed, user, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (!signed) return <Navigate to="/login" />;
  if (type === 'super_admin' && user?.role !== 'SUPER_ADMIN') return <Navigate to="/admin/dashboard" />;
  if (type && type !== 'super_admin' && user?.type !== type) return <Navigate to={user?.role === 'SUPER_ADMIN' ? '/super-admin/dashboard' : user?.type === 'admin' ? '/admin/dashboard' : '/employee/punch'} />;

  // Admin com assinatura inativa só pode acessar /admin/subscription
  if (type === 'admin' && !allowExpired && user?.role !== 'SUPER_ADMIN') {
    const status = user?.subscriptionStatus;
    const trialExpired = status === 'TRIAL' && user?.trialEndsAt && new Date(user.trialEndsAt) < new Date();
    if (['CANCELLED', 'EXPIRED', 'PAST_DUE'].includes(status) || trialExpired) {
      return <Navigate to="/admin/subscription" />;
    }
  }

  return children;
}

function AppRoutes() {
  const { signed, user } = useAuth();

  // Admin com assinatura inativa vai direto para /admin/subscription
  const subscriptionInactive = user?.type === 'admin' && user?.role !== 'SUPER_ADMIN' && (
    ['CANCELLED', 'EXPIRED', 'PAST_DUE'].includes(user?.subscriptionStatus) ||
    (user?.subscriptionStatus === 'TRIAL' && user?.trialEndsAt && new Date(user.trialEndsAt) < new Date())
  );
  const defaultRedirect = user?.role === 'SUPER_ADMIN'
    ? '/super-admin/dashboard'
    : user?.type === 'admin'
      ? (subscriptionInactive ? '/admin/subscription' : '/admin/dashboard')
      : '/employee/punch';

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/" element={signed ? <Navigate to={defaultRedirect} /> : <Landing />} />
        <Route path="/login" element={signed ? <Navigate to={defaultRedirect} /> : <Login />} />
        <Route path="/register" element={<Navigate to="/checkout" />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/checkout/:plan" element={<Checkout />} />
        <Route path="/employee/punch" element={<PrivateRoute type="employee"><PunchClock /></PrivateRoute>} />
        <Route path="/employee/history" element={<PrivateRoute type="employee"><MyHistory /></PrivateRoute>} />
        <Route path="/employee/punch-mirror" element={<PrivateRoute type="employee"><MyPunchMirror /></PrivateRoute>} />
        <Route path="/employee/adjustments" element={<PrivateRoute type="employee"><MyAdjustments /></PrivateRoute>} />
        <Route path="/employee/audit-log" element={<PrivateRoute type="employee"><MyAuditLog /></PrivateRoute>} />
        <Route path="/admin/dashboard" element={<PrivateRoute type="admin"><Dashboard /></PrivateRoute>} />
        <Route path="/admin/employees" element={<PrivateRoute type="admin"><Employees /></PrivateRoute>} />
        <Route path="/admin/reports" element={<PrivateRoute type="admin"><Reports /></PrivateRoute>} />
        <Route path="/admin/adjustments" element={<PrivateRoute type="admin"><TimeAdjustments /></PrivateRoute>} />
        <Route path="/admin/adjustment-requests" element={<PrivateRoute type="admin"><AdjustmentRequests /></PrivateRoute>} />
        <Route path="/admin/geofences" element={<PrivateRoute type="admin"><Geofences /></PrivateRoute>} />
        <Route path="/admin/settings" element={<PrivateRoute type="admin"><Settings /></PrivateRoute>} />
        <Route path="/admin/punch-map" element={<PrivateRoute type="admin"><PunchMapPage /></PrivateRoute>} />
        <Route path="/admin/subscription" element={<PrivateRoute type="admin" allowExpired><AdminSubscription /></PrivateRoute>} />
        <Route path="/super-admin/dashboard" element={<PrivateRoute type="super_admin"><SADashboard /></PrivateRoute>} />
        <Route path="/super-admin/companies" element={<PrivateRoute type="super_admin"><SACompanies /></PrivateRoute>} />
        <Route path="/super-admin/revenue" element={<PrivateRoute type="super_admin"><SARevenue /></PrivateRoute>} />
        <Route path="/super-admin/usage" element={<PrivateRoute type="super_admin"><SAUsage /></PrivateRoute>} />
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
        <InstallPWA />
      </AuthProvider>
    </BrowserRouter>
  );
}
