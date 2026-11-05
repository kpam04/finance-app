
import { Navigate, Route, Routes } from 'react-router-dom';

// Layout และระบบตรวจสอบสิทธิ์
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

// หน้าสำหรับผู้ใช้งาน
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Transactions from './pages/Transactions.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Budgets from './pages/Budgets.jsx';
import Plan from './pages/Plan.jsx';
import Recurring from './pages/Recurring.jsx';
import Profile from './pages/Profile.jsx';

export default function App() {
  return (
    <Routes>

      {/* หน้าสำหรับผู้ที่ยังไม่ได้เข้าสู่ระบบ */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* หน้าสำหรับผู้ใช้งานที่เข้าสู่ระบบแล้ว */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/transactions" element={<Transactions />} />
        {/* หน้าหมวดหมู่เดิมถูกยกเลิก: จัดการหมวดที่โปรไฟล์ > หมวดหมู่ของฉัน (ลิงก์เก่าพาไปที่นั่น) */}
        <Route path="/categories" element={<Navigate to="/profile" replace />} />
        <Route path="/budgets" element={<Budgets />} />
        <Route path="/plan" element={<Plan />} />
        <Route path="/recurring" element={<Recurring />} />
        <Route path="/profile" element={<Profile />} />

      </Route>

      {/* หากไม่พบเส้นทางให้กลับไป Dashboard */}
      <Route
        path="*"
        element={<Navigate to="/dashboard" replace />}
      />

    </Routes>
  );
}
