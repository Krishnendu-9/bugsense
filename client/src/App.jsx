import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/common/ProtectedRoute.jsx';
import Login from './pages/auth/Login.jsx';
import Register from './pages/auth/Register.jsx';
import Dashboard from './pages/dashboard/Dashboard.jsx';
import BugList from './pages/bugs/BugList.jsx';
import BugDetail from './pages/bugs/BugDetail.jsx';
import ReportBug from './pages/bugs/ReportBug.jsx';
import AIAnalyzer from './pages/ai/AIAnalyzer.jsx';
import Profile from './pages/profile/Profile.jsx';
import KanbanBoard from './pages/bugs/KanbanBoard.jsx';
import SDKPlayground from './pages/playground/SDKPlayground.jsx';
import SystemMetrics from './pages/metrics/SystemMetrics.jsx';
import AuditTrail from './pages/audit/AuditTrail.jsx';

export default function App() {
  return (
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
        <Route path="/metrics" element={<SystemMetrics />} />
        <Route path="/audit" element={<AuditTrail />} />
        <Route path="/sdk-demo" element={<SDKPlayground />} />
        <Route path="/profile" element={<Profile />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
