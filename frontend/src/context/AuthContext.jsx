import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, clearToken, getToken, setToken } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(!!getToken());

  // backend ตอบ { data: { user, stats } } จึงต้องแยกเก็บ (ของเดิมเก็บทั้งก้อนไว้ใน user ทำให้ชื่อไม่แสดงในเมนู)
  const loadProfile = useCallback(async () => {
    try {
      const res = await api.profile();
      setUser(res.data.user);
      setStats(res.data.stats);
    } catch (err) {
      // ล้าง token เฉพาะเมื่อ token ใช้ไม่ได้จริง (401) ไม่ล้างเมื่อแค่ต่อเซิร์ฟเวอร์ไม่ได้ชั่วคราว
      if (err && err.status === 401) clearToken();
      setUser(null);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (getToken()) loadProfile();
  }, [loadProfile]);

  // ถ้า api.js เจอ 401 ให้ออกจากระบบทันที
  useEffect(() => {
    const onLogout = () => {
      setUser(null);
      setStats(null);
    };
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, []);

  const login = async (email, password) => {
    const res = await api.login({ email, password });
    setToken(res.data.token);
    setLoading(true);
    await loadProfile();
  };

  // payload: { first_name, last_name, email, password, confirm_password, accept_policy }
  const register = async (payload) => {
    await api.register(payload);
    // สมัครเสร็จแล้ว login ต่อให้เลย
    await login(payload.email, payload.password);
  };

  const logout = () => {
    clearToken();
    setUser(null);
    setStats(null);
  };

  return (
    <AuthContext.Provider value={{ user, stats, loading, login, register, logout, refreshProfile: loadProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
