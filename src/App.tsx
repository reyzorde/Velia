import { useState, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth-context';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import StudentDetail from './pages/StudentDetail';
import Courses from './pages/Courses';
import Groups from './pages/Groups';
import Attendance from './pages/Attendance';
import Payments from './pages/Payments';
import BusinessIntelligence from './pages/BusinessIntelligence';
import AiChat from './pages/AiChat';
import FeatureLock from './components/FeatureLock';
import Plan from './pages/Plan';
import Settings from './pages/Settings';
import Messages from './pages/Messages';
import MockTests from './pages/MockTests';
import Team from './pages/Team';
import AppLayout from './components/layout/AppLayout';
import LoadingScreen from './components/brand/LoadingScreen';

const hasPendingOtpVerification = () =>
  Boolean(
    localStorage.getItem('velia_otp_pending') ||
      localStorage.getItem('velia_otp_verification')
  );

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (hasPendingOtpVerification()) return <Navigate to="/signup" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user && hasPendingOtpVerification()) return <>{children}</>;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function RootEntry() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user && hasPendingOtpVerification()) return <Navigate to="/signup" replace />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <Landing />;
}

export default function App() {
  const { loading: authLoading } = useAuth();
  const [showLoader, setShowLoader] = useState(true);

  const handleLoaderDone = useCallback(() => {
    setShowLoader(false);
  }, []);

  const stillLoading = showLoader || authLoading;

  return (
    <>
      {stillLoading && (
        <LoadingScreen
          onComplete={handleLoaderDone}
          minDuration={1800}
          waitForReady
          ready={!authLoading}
        />
      )}

      {!stillLoading && (
        <Routes>
          <Route path="/" element={<RootEntry />} />
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />

          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/students" element={<Students />} />
            <Route path="/students/:id" element={<StudentDetail />} />
            <Route path="/courses" element={<Courses />} />
            <Route path="/groups" element={<Groups />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/mock-tests" element={<MockTests />} />
            <Route path="/team" element={<Team />} />
            <Route path="/ai-chat" element={<FeatureLock feature="ai_chat"><AiChat /></FeatureLock>} />
            <Route path="/business-intelligence" element={<FeatureLock feature="business"><BusinessIntelligence /></FeatureLock>} />
            <Route path="/plan" element={<Plan />} />
            <Route path="/settings" element={<Settings />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </>
  );
}
