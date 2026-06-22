import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import PublicLayout from './components/PublicLayout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import RoleRoute from './components/RoleRoute.jsx';
import { useAuth } from './context/AuthContext.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Pricing from './pages/Pricing.jsx';
import Contact from './pages/Contact.jsx';
import PrivacyPolicy from './pages/PrivacyPolicy.jsx';
import TermsConditions from './pages/TermsConditions.jsx';
import RefundPolicy from './pages/RefundPolicy.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Customers from './pages/Customers.jsx';
import Conversations from './pages/Conversations.jsx';
import Bookings from './pages/Bookings.jsx';
import Scheduling from './pages/Scheduling.jsx';
import StaffSchedule from './pages/StaffSchedule.jsx';
import ManageAppointment from './pages/ManageAppointment.jsx';
import PublicBook from './pages/PublicBook.jsx';
import Payments from './pages/Payments.jsx';
import Billing from './pages/Billing.jsx';
import Settings from './pages/Settings.jsx';
import Communications from './pages/Communications.jsx';
import ChiefAdmin from './pages/ChiefAdmin.jsx';
import UserManagement from './pages/UserManagement.jsx';
import Attendance from './pages/Attendance.jsx';
import Commission from './pages/Commission.jsx';
import Payroll from './pages/Payroll.jsx';

export default function App() {
  const { isAuthenticated, bootstrapping, token } = useAuth();

  if (bootstrapping && token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300">
        Loading…
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms-and-conditions" element={<TermsConditions />} />
        <Route path="/refund-policy" element={<RefundPolicy />} />
        <Route path="/appointments/manage" element={<ManageAppointment />} />
        <Route path="/book" element={<PublicBook />} />
      </Route>

      <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route
          path="/chiefadmin"
          element={
            <RoleRoute requiredRole="CHIEF_ADMIN">
              <ChiefAdmin />
            </RoleRoute>
          }
        />
        <Route path="/user-management" element={<UserManagement />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/conversations" element={<Conversations />} />
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/scheduling" element={<Scheduling />} />
        <Route path="/staff-schedule" element={<StaffSchedule />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/commission" element={<Commission />} />
        <Route path="/payroll" element={<Payroll />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/communications" element={<Navigate to="/communications/wallet" replace />} />
        <Route path="/communications/wallet" element={<Communications forcedTab="WALLET" />} />
        <Route path="/communications/send" element={<Communications forcedTab="SEND" />} />
        <Route path="/communications/templates" element={<Communications forcedTab="TEMPLATES" templateMode="list" />} />
        <Route path="/communications/templates/create" element={<Communications forcedTab="TEMPLATES" templateMode="create" />} />
        <Route
          path="/communications/templates/:templateId/edit"
          element={<Communications forcedTab="TEMPLATES" templateMode="edit" />}
        />
        <Route path="/communications/fields" element={<Communications forcedTab="FIELDS" />} />
        <Route path="/communications/contacts" element={<Communications forcedTab="CONTACTS" />} />
        <Route path="/communications/contact-book" element={<Communications forcedTab="CONTACT_BOOK" />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to={isAuthenticated ? '/dashboard' : '/'} replace />} />
    </Routes>
  );
}
