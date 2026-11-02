import { useCallback, useEffect, useState } from 'react';
import {
  getRecurring,
  createRecurring,
  updateRecurring,
  deleteRecurring,
  getCategoriesForRecurring,
} from '../recurringApi.js';
import CategorySelect from '../components/CategorySelect.jsx';

const FREQ_LABEL = {
  daily: 'รายวัน',
  weekly: 'รายสัปดาห์',
  monthly: 'รายเดือน',
  yearly: 'รายปี',
};

const todayStr = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// แสดงวันที่เป็นรูปแบบไทย พ.ศ.
const fmtDate = (v) => {
  if (!v) return '-';
  const s = String(v).slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return '-';
  return new Date(y, m - 1, d).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const fmtMoney = (n) =>
  Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ruleId = (r) => r.recurring_id ?? r._id ?? r.id;
const catId = (c) => c.category_id ?? c._id ?? c.id;
const isActive = (r) => r.is_active === true || r.is_active === 1;

// แจ้งให้กระดิ่งแจ้งเตือนโหลดใหม่ทันที (สร้าง/แก้กฎแล้วอาจมีรายการเกิดขึ้นและใช้งบถึงเกณฑ์)
const refreshBell = () => {
  try {
    window.dispatchEvent(new Event('notifications:refresh'));
  } catch {
    /* การรีเฟรชกระดิ่งล้มเหลวต้องไม่กระทบการบันทึก */
  }
};

const emptyForm = () => ({
  type: 'expense',
  amount: '',
  category_id: '',
  note: '',
  frequency: 'monthly',
  start_date: todayStr(),
  end_date: '',
});

export default function Recurring() {
  const [rules, setRules] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null); // { kind: 'ok' | 'error', text }
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(''); // ข้อความผิดพลาดที่แสดงในป๊อปอัป
  const [editExtra, setEditExtra] = useState(null); // หมวดเดิมของกฎที่กำลังแก้ (ถ้าถูกซ่อนไปแล้วก็ยังแสดง)

  const showMsg = (kind, text) => setMsg({ kind, text });

  const load = async () => {
    try {
      const [r, c] = await Promise.all([getRecurring(), getCategoriesForRecurring()]);
      setRules(r.data || []);
      setCategories(c.data || []);
    } catch (e) {
      showMsg('error', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const categoryName = (r) => {
    if (r.category_name) return r.category_name;
    const found = categories.find((c) => String(catId(c)) === String(r.category_id));
    return found ? found.name : '-';
  };

  // เพิ่ม/อัปเดตหมวดที่เพิ่งสร้างหรือเพิ่งแสดงอีกครั้ง เข้าในรายการหมวดทันที
  const addCategory = (cat) =>
    setCategories((prev) =>
      prev.some((c) => String(catId(c)) === String(cat.category_id))
        ? prev.map((c) => (String(catId(c)) === String(cat.category_id) ? cat : c))
        : [...prev, cat]
    );

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const changeType = (type) => setForm((f) => ({ ...f, type, category_id: '' }));

  const openCreate = () => {
    setEditingId(null);
    setEditExtra(null);
    setForm(emptyForm());
    setFormError('');
    setShowForm(true);
    setMsg(null);
  };

  const openEdit = (r) => {
    setEditingId(ruleId(r));
    setForm({
      type: r.type,
      amount: String(r.amount ?? ''),
      category_id: String(r.category_id ?? ''),
      note: r.note || '',
      frequency: r.frequency,
      start_date: String(r.start_date || '').slice(0, 10),
      end_date: r.end_date ? String(r.end_date).slice(0, 10) : '',
    });
    setEditExtra({ category_id: String(r.category_id ?? ''), name: r.category_name, type: r.type });
    setFormError('');
    setShowForm(true);
    setMsg(null);
  };

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setFormError('');
  }, []);

  // กด Esc เพื่อปิดป๊อปอัป
  useEffect(() => {
    if (!showForm) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closeForm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showForm, closeForm]);

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    const amount = Number(form.amount);
    if (!amount || amount <= 0) return setFormError('กรุณากรอกจำนวนเงินที่มากกว่า 0');
    if (!form.category_id) return setFormError('กรุณาเลือกหมวดหมู่');
    if (!form.start_date) return setFormError('กรุณาเลือกวันที่เริ่มต้น');
    if (form.end_date && form.end_date < form.start_date)
      return setFormError('วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น');

    const body = {
      type: form.type,
      amount,
      category_id: form.category_id,
      note: form.note.trim(),
      frequency: form.frequency,
      end_date: form.end_date || null,
    };

    setSaving(true);
    try {
      if (editingId) {
        await updateRecurring(editingId, body);
        showMsg('ok', 'บันทึกการแก้ไขแล้ว');
      } else {
        const res = await createRecurring({ ...body, start_date: form.start_date });
        const n = res.created_now ?? res.data?.created_now ?? 0;
        showMsg('ok', n > 0 ? `สร้างกฎแล้ว และสร้างรายการทันที ${n} รายการ` : 'สร้างกฎแล้ว');
      }
      closeForm();
      await load();
      refreshBell();
    } catch (err) {
      setFormError(err.message); // แสดงในป๊อปอัป (ข้อความหน้าหลักอยู่หลังพื้นหลังมืด ผู้ใช้จะมองไม่เห็น)
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (r) => {
    try {
      await updateRecurring(ruleId(r), { is_active: isActive(r) ? 0 : 1 });
      await load();
    } catch (err) {
      showMsg('error', err.message);
    }
  };

  const remove = async (r) => {
    const name = r.note || categoryName(r);
    const ok = window.confirm(
      `ลบกฎ "${name}" ใช่หรือไม่?\n(รายการที่สร้างไปแล้วจะยังอยู่ แต่ไม่ผูกกับกฎนี้อีก)`
    );
    if (!ok) return;
    try {
      await deleteRecurring(ruleId(r));
      showMsg('ok', 'ลบกฎแล้ว');
      await load();
    } catch (err) {
      showMsg('error', err.message);
    }
  };

  return (
    <div className="rc-page">
      <style>{css}</style>

      <div className="rc-head">
        <h1>รายการที่เกิดซ้ำ</h1>
        <div className="rc-actions">
          <button className="rc-btn rc-primary" onClick={openCreate}>
            + เพิ่มรายการที่เกิดซ้ำ
          </button>
        </div>
      </div>

      {msg && (
        <div className={`rc-msg ${msg.kind === 'ok' ? 'rc-ok' : 'rc-err'}`} role="status">
          <span>{msg.text}</span>
          <button className="rc-x" onClick={() => setMsg(null)} aria-label="ปิดข้อความ">
            ×
          </button>
        </div>
      )}

      {/* Popup Form สำหรับเพิ่มหรือแก้ไขรายการที่เกิดซ้ำ (สไตล์อยู่ใน index.css: rc-modal-*) */}
      {showForm && (
        <div className="rc-modal-overlay" onClick={closeForm}>
          <div
            className="rc-modal-container"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rc-modal-title"
          >
        <form className="rc-card rc-form" onSubmit={submit}>
          <div className="rc-modal-header">
            <h2 id="rc-modal-title">{editingId ? 'แก้ไขรายการที่เกิดซ้ำ' : 'เพิ่มรายการที่เกิดซ้ำ'}</h2>
            <button type="button" className="rc-modal-close" onClick={closeForm} aria-label="ปิดหน้าต่าง">
              ×
            </button>
          </div>

          <div className="rc-field">
            <label>ประเภท</label>
            <div className="rc-seg">
              <button
                type="button"
                className={form.type === 'income' ? 'on' : ''}
                onClick={() => changeType('income')}
                disabled={!!editingId}
              >
                รายรับ
              </button>
              <button
                type="button"
                className={form.type === 'expense' ? 'on' : ''}
                onClick={() => changeType('expense')}
                disabled={!!editingId}
              >
                รายจ่าย
              </button>
            </div>
            {editingId && (
              <small data-type-locked>
                เปลี่ยนประเภทไม่ได้ ถ้าเลือกผิดให้ลบกฎแล้วเพิ่มใหม่
              </small>
            )}
          </div>

          <div className="rc-grid">
            <div className="rc-field">
              <label>จำนวนเงิน (บาท)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setField('amount', e.target.value)}
                placeholder="เช่น 599"
              />
            </div>

            <div className="rc-field">
              <label>หมวดหมู่</label>
              <CategorySelect
                categories={categories}
                type={form.type}
                value={form.category_id}
                onChange={(v) => setField('category_id', v)}
                onCreated={addCategory}
                extra={editExtra}
              />
            </div>

            <div className="rc-field">
              <label>ความถี่</label>
              <select value={form.frequency} onChange={(e) => setField('frequency', e.target.value)}>
                {Object.entries(FREQ_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div className="rc-field">
              <label>บันทึกช่วยจำ</label>
              <input
                type="text"
                value={form.note}
                onChange={(e) => setField('note', e.target.value)}
                placeholder="เช่น ค่าเน็ต"
                maxLength={200}
              />
            </div>

            <div className="rc-field">
              <label>วันที่เริ่มต้น</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setField('start_date', e.target.value)}
                disabled={!!editingId}
              />
              {editingId && <small>เปลี่ยนวันเริ่มต้นของกฎเดิมไม่ได้</small>}
            </div>

            <div className="rc-field">
              <label>วันสิ้นสุด (ไม่บังคับ)</label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setField('end_date', e.target.value)}
              />
              <small>เว้นว่างไว้ = ทำซ้ำไปเรื่อยๆ</small>
            </div>
          </div>

          {!editingId && form.start_date < todayStr() && (
            <p className="rc-hint">
              วันเริ่มต้นเป็นวันที่ผ่านมาแล้ว ระบบจะสร้างรายการย้อนหลังให้ทันที (สูงสุด 366 รายการต่อครั้ง)
            </p>
          )}

          {formError && (
            <div className="rc-msg rc-err" role="alert" data-form-error>
              <span>{formError}</span>
            </div>
          )}

          <div className="rc-form-actions">
            <button type="button" className="rc-btn" onClick={closeForm}>
              ยกเลิก
            </button>
            <button type="submit" className="rc-btn rc-primary" disabled={saving}>
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </form>
          </div>
        </div>
      )}

      <div className="rc-card">
        {loading ? (
          <p className="rc-empty">กำลังโหลด...</p>
        ) : rules.length === 0 ? (
          <p className="rc-empty">ยังไม่มีรายการที่เกิดซ้ำ กด "+ เพิ่มรายการที่เกิดซ้ำ" เพื่อเริ่มต้น</p>
        ) : (
          <div className="rc-scroll">
            <table className="rc-table">
              <thead>
                <tr>
                  <th>รายการ</th>
                  <th>หมวดหมู่</th>
                  <th className="num">จำนวนเงิน</th>
                  <th>ความถี่</th>
                  <th>รอบถัดไป</th>
                  <th>สิ้นสุด</th>
                  <th>สถานะ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={ruleId(r)} className={isActive(r) ? '' : 'off'}>
                    <td>{r.note || '-'}</td>
                    <td>{categoryName(r)}</td>
                    <td className={`num ${r.type === 'income' ? 'inc' : 'exp'}`}>
                      {r.type === 'income' ? '+' : '-'}
                      {fmtMoney(r.amount)}
                    </td>
                    <td>{FREQ_LABEL[r.frequency] || r.frequency}</td>
                    <td>{isActive(r) ? fmtDate(r.next_run_date) : '-'}</td>
                    <td>{fmtDate(r.end_date)}</td>
                    <td>
                      <label className="rc-switch" title={isActive(r) ? 'ปิดการทำงาน' : 'เปิดการทำงาน'}>
                        <input type="checkbox" checked={isActive(r)} onChange={() => toggleActive(r)} />
                        <span />
                      </label>
                    </td>
                    <td className="rc-row-actions">
                      <button className="rc-link" onClick={() => openEdit(r)}>
                        แก้ไข
                      </button>
                      <button className="rc-link danger" onClick={() => remove(r)}>
                        ลบ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


const css = `
/* ===== หน้ารายการที่เกิดซ้ำ ===== */
.rc-page {
  max-width: 1000px;
  margin: 0 auto;
  padding: 16px;
  color: #3F3A34;
}

/* ===== ส่วนหัว ===== */
.rc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;
}

.rc-head h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: #3F3A34;
}

.rc-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* ===== ปุ่ม ===== */
.rc-btn {
  padding: 9px 16px;
  border-radius: 9px;
  border: 1px solid #D8DFD3;
  background: #F8F8F4;
  color: #4B5547;
  cursor: pointer;
  font: inherit;
  transition: 0.2s;
}

.rc-btn:hover:not(:disabled) {
  background: #E9EEE5;
}

.rc-btn:disabled {
  opacity: .6;
  cursor: not-allowed;
}

.rc-primary {
  background: #74896F;
  border-color: #74896F;
  color: #fff;
}

.rc-primary:hover:not(:disabled) {
  background: #60765C;
}

/* ===== กล่องการ์ด ===== */
.rc-card {
  background: #FFFDFA;
  border: 1px solid #E9E1D6;
  border-radius: 14px;
  padding: 18px;
  margin-bottom: 18px;
  box-shadow: 0 2px 8px rgba(100, 82, 60, 0.05);
}

.rc-card h2 {
  margin: 0 0 18px;
  font-size: 1.15rem;
  color: #3F3A34;
}

/* ===== กล่องข้อความแจ้งเตือน ===== */
.rc-msg {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 10px;
  margin-bottom: 16px;
  font-size: .92rem;
}

.rc-ok {
  background: #EDF5EC;
  border: 1px solid #C9DDC5;
  color: #456B48;
}

.rc-err {
  background: #FBEFEC;
  border: 1px solid #EBCBC4;
  color: #A34F45;
}

.rc-x {
  background: none;
  border: none;
  color: inherit;
  font-size: 1.2rem;
  cursor: pointer;
}

/* ===== ฟอร์ม ===== */
.rc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}

.rc-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}

.rc-field label {
  font-size: .9rem;
  font-weight: 600;
  color: #5D6256;
}

.rc-field input,
.rc-field select {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border-radius: 9px;
  border: 1px solid #DDDCD3;
  background: #F8F8F4;
  color: #3F3A34;
  font: inherit;
  outline: none;
  transition: 0.2s;
}

.rc-field input:focus,
.rc-field select:focus {
  border-color: #91A68A;
  background: #FFFFFF;
  box-shadow: 0 0 0 3px rgba(145, 166, 138, 0.15);
}

.rc-field input:disabled {
  background: #EEEEEA;
  color: #8A8177;
  cursor: not-allowed;
}

.rc-field select option {
  color: #3F3A34;
  background: #FFFFFF;
}

.rc-field small {
  font-size: .78rem;
  color: #8A8177;
}

/* ===== ปุ่มเลือกประเภท ===== */
.rc-seg {
  display: inline-flex;
  border: 1px solid #D8DFD3;
  border-radius: 9px;
  overflow: hidden;
  width: fit-content;
  background: #F1F2ED;
}

.rc-seg button {
  padding: 9px 20px;
  border: none;
  background: transparent;
  color: #666D60;
  cursor: pointer;
  font: inherit;
  transition: 0.2s;
}

.rc-seg button.on {
  background: #74896F;
  color: #FFFFFF;
}

/* ตอนแก้ไข: ล็อกประเภท (กดไม่ได้) ปุ่มที่ไม่ได้เลือกจางลง */
.rc-seg button:disabled {
  cursor: not-allowed;
}

.rc-seg button:disabled:not(.on) {
  opacity: .45;
}

/* ===== ข้อความช่วยเหลือ ===== */
.rc-hint {
  font-size: .85rem;
  color: #8A7550;
  background: #F8F3E8;
  border: 1px solid #EDE1C9;
  border-radius: 8px;
  padding: 10px 12px;
  margin: 8px 0;
}

/* ===== ปุ่มด้านล่างฟอร์ม ===== */
.rc-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid #EEE9E1;
}

/* ===== ตารางรายการ ===== */
.rc-empty {
  text-align: center;
  color: #8A8177;
  padding: 30px 0;
  margin: 0;
}

.rc-scroll {
  overflow-x: auto;
  border-radius: 9px;
}

.rc-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  min-width: 720px;
  background: #FFFDFA;
}

.rc-table th,
.rc-table td {
  text-align: left;
  padding: 13px 12px;
  border-bottom: 1px solid #EEE9E1;
  white-space: nowrap;
}

.rc-table th {
  font-size: .85rem;
  font-weight: 700;
  color: #586451;
  background: #F0F3EC;
}

.rc-table td {
  font-size: .9rem;
  color: #4A463F;
}

.rc-table tbody tr {
  transition: background 0.2s;
}

.rc-table tbody tr:hover {
  background: #F7F8F3;
}

.rc-table tbody tr:last-child td {
  border-bottom: none;
}

.rc-table .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.rc-table .inc {
  color: #628B6B;
  font-weight: 600;
}

.rc-table .exp {
  color: #C98278;
  font-weight: 600;
}

.rc-table tr.off td {
  opacity: .5;
}

.rc-table tr.off td:nth-last-child(-n+2) {
  opacity: 1;
}

/* ===== ปุ่มจัดการรายการ ===== */
.rc-row-actions {
  display: flex;
  gap: 12px;
}

.rc-link {
  background: none;
  border: none;
  color: #74896F;
  cursor: pointer;
  font: inherit;
  padding: 0;
  font-size: .88rem;
}

.rc-link:hover {
  text-decoration: underline;
}

.rc-link.danger {
  color: #C98278;
}

/* ===== Toggle เปิด/ปิดรายการ ===== */
.rc-switch {
  position: relative;
  display: inline-block;
  width: 38px;
  height: 22px;
}

.rc-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.rc-switch span {
  position: absolute;
  inset: 0;
  background: #C9C9C0;
  border-radius: 22px;
  cursor: pointer;
  transition: background .2s;
}

.rc-switch span::before {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  left: 3px;
  top: 3px;
  background: #FFFFFF;
  border-radius: 50%;
  transition: transform .2s;
}

.rc-switch input:checked + span {
  background: #74896F;
}

.rc-switch input:checked + span::before {
  transform: translateX(16px);
}

/* ===== รองรับหน้าจอมือถือ ===== */
@media (max-width: 600px) {
  .rc-page {
    padding: 10px;
  }

  /* ชื่อหน้ากับปุ่ม "+ เพิ่มรายการที่เกิดซ้ำ" อยู่บรรทัดเดียวกัน (ชื่อซ้าย ปุ่มขวา) */
  .rc-head {
    flex-wrap: nowrap;
    align-items: center;
    gap: 8px;
  }

  .rc-head h1 {
    min-width: 0;
    font-size: 1.3rem;
  }

  .rc-actions {
    flex-shrink: 0;
    flex-wrap: nowrap;
    width: auto;
  }

  .rc-actions .rc-btn {
    width: auto;
    padding: 8px 11px;
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .rc-grid {
    grid-template-columns: 1fr;
  }

  .rc-card {
    padding: 14px;
  }

  .rc-form-actions {
    flex-wrap: wrap;
  }
}
`;
