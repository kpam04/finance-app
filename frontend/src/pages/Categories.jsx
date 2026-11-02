import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Categories() {
  const [cats, setCats] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', type: 'expense', color: '#6366f1' });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await api.getCategories();
      setCats(res.data);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.createCategory({ ...form, name: form.name.trim() });
      setForm({ ...form, name: '' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const group = (type) => cats.filter((c) => c.type === type);

  return (
    <div>
      <h2>หมวดหมู่</h2>
      {error && <div className="alert">{error}</div>}

      <form className="card form-row" onSubmit={submit}>
        <input
          placeholder="ชื่อหมวดหมู่ใหม่"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          <option value="expense">รายจ่าย</option>
          <option value="income">รายรับ</option>
        </select>
        <input
          type="color"
          value={form.color}
          onChange={(e) => setForm({ ...form, color: e.target.value })}
          title="สี"
        />
        <button className="btn" disabled={busy}>
          เพิ่มหมวดหมู่
        </button>
      </form>

      <div className="grid-2">
        {[
          ['expense', 'รายจ่าย'],
          ['income', 'รายรับ'],
        ].map(([type, label]) => (
          <div className="card" key={type}>
            <h3>{label}</h3>
            <ul className="cat-list">
              {group(type).map((c) => (
                <li key={c.category_id}>
                  <span className="dot" style={{ background: c.color }} />
                  {c.name}
                  {c.is_default ? <span className="tag">มาตรฐาน</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
