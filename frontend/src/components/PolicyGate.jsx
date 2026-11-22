import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import PrivacyModal, { POLICY_VERSION } from './PrivacyModal.jsx';

// ผู้ใช้ที่ยอมรับนโยบายเวอร์ชันเก่า: แสดงประกาศเวอร์ชันใหม่ ปิดไม่ได้ ต้องกดยอมรับ (หรือออกจากระบบ)
export default function PolicyGate({ onLogout }) {
  const { refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const accept = async () => {
    setBusy(true);
    setError('');
    try {
      await api.acceptPolicy(POLICY_VERSION);
      await refreshProfile();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  return <PrivacyModal required busy={busy} error={error} onAccept={accept} onClose={onLogout} />;
}
