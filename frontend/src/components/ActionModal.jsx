import { useEffect, useRef, useState } from 'react';

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};
const box = {
  background: '#fff', borderRadius: 14, padding: 22, width: 480, maxWidth: '100%',
  maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
};
const label = { display: 'block', fontSize: 13, marginBottom: 4, color: '#4b5563' };
const input = { width: '100%', boxSizing: 'border-box' };

// หน้าต่างยืนยันการกระทำของผู้ดูแล (กรอกเหตุผล/รหัสผ่าน/อีเมลยืนยัน)
// fields: [{ key, label, type, required, maxLength, placeholder }]  onSubmit(values) ต้องโยน Error ถ้าไม่สำเร็จ (จะแสดงในหน้าต่าง)
export default function ActionModal({ title, intro, fields = [], confirmLabel = 'ยืนยัน', danger = false, onSubmit, onClose }) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f.key, ''])));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      alive.current = false;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const missing = fields.find((f) => f.required && !String(values[f.key] || '').trim());
    if (missing) return setError(`กรุณากรอก${missing.label}`);
    setBusy(true);
    try {
      await onSubmit(values);
    } catch (err) {
      if (alive.current) setError(err.message || 'ดำเนินการไม่สำเร็จ');
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0, color: danger ? '#b91c1c' : undefined }}>{title}</h3>
        {intro && <p style={{ marginTop: 0, fontSize: 14 }}>{intro}</p>}
        <form onSubmit={submit}>
          {fields.map((f) => (
            <div key={f.key} style={{ marginBottom: 12 }}>
              <label style={label} htmlFor={`am-${f.key}`}>{f.label}</label>
              <input
                id={`am-${f.key}`}
                style={input}
                type={f.type || 'text'}
                value={values[f.key]}
                maxLength={f.maxLength}
                placeholder={f.placeholder}
                autoComplete={f.type === 'password' ? 'current-password' : 'off'}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              />
              {f.hint && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>{f.hint}</div>}
            </div>
          ))}
          {error && <div className="alert" data-error="modal" style={{ marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-light" onClick={onClose} disabled={busy}>ยกเลิก</button>
            <button className={`btn ${danger ? 'btn-danger' : ''}`} style={{ flex: 1 }} disabled={busy}>
              {busy ? 'กำลังดำเนินการ...' : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
