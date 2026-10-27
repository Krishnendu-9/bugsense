import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/common/ProtectedRoute.jsx';
import RoleRoute from './components/common/RoleRoute.jsx';
import Login from './pages/auth/Login.jsx';
import Register from './pages/auth/Register.jsx';

// Each signed-in page is its own chunk, so the first load does not pay for the
// chart library, the rich-text editor or the annotation canvas until a page
// that uses them is opened. ProtectedRoute shows a skeleton while one loads.
const Dashboard = lazy(() => import('./pages/dashboard/Dashboard.jsx'));
const BugList = lazy(() => import('./pages/bugs/BugList.jsx'));
const BugDetail = lazy(() => import('./pages/bugs/BugDetail.jsx'));
const ReportBug = lazy(() => import('./pages/bugs/ReportBug.jsx'));
const KanbanBoard = lazy(() => import('./pages/bugs/KanbanBoard.jsx'));
const AIAnalyzer = lazy(() => import('./pages/ai/AIAnalyzer.jsx'));
const Profile = lazy(() => import('./pages/profile/Profile.jsx'));
const SDKPlayground = lazy(() => import('./pages/playground/SDKPlayground.jsx'));
const SystemMetrics = lazy(() => import('./pages/metrics/SystemMetrics.jsx'));
const AuditTrail = lazy(() => import('./pages/audit/AuditTrail.jsx'));
const Team = lazy(() => import('./pages/admin/Team.jsx'));

const STAFF = ['developer', 'admin'];

export default function App() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas" aria-busy="true" />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/bugs" element={<BugList />} />
          <Route path="/board" element={<KanbanBoard />} />
          <Route path="/bugs/:id" element={<BugDetail />} />
          <Route path="/report" element={<ReportBug />} />
          <Route path="/ai" element={<AIAnalyzer />} />
          <Route path="/metrics" element={<RoleRoute roles={STAFF}><SystemMetrics /></RoleRoute>} />
          <Route path="/audit" element={<RoleRoute roles={STAFF}><AuditTrail /></RoleRoute>} />
          {/* Staff only: every button in the sandbox files a real SDK bug. */}
          <Route path="/sdk-demo" element={<RoleRoute roles={STAFF}><SDKPlayground /></RoleRoute>} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/team" element={<RoleRoute roles={['admin']}><Team /></RoleRoute>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
