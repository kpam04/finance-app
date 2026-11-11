import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import CategorySelect from '../components/CategorySelect.jsx';

const MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];
const STATUS = {
  ok: { label: 'ปกติ', color: '#16a34a' },
  warning: { label: 'ใกล้เต็ม', color: '#f59e0b' },
  over: { label: 'เกินงบ', color: '#dc2626' },
};

// ไฟสถานะตามจังหวะการใช้ (สีอ่อน ไม่ใช้สีแดง) — สำรองไว้ใช้ STATUS เดิมถ้า backend รุ่นเก่าไม่ส่ง pace_status
const PACE = {
  easy: { label: 'สบาย ✓', bg: '#E3EEDD', fg: '#4F6B47', bar: '#9AAB91' },
  careful: { label: 'ระวังนิดนึง', bg: '#FBF0D5', fg: '#946A12', bar: '#E5C36B' },
  pause: { label: 'พักก่อน', bg: '#FBE4D6', fg: '#A2522A', bar: '#E8A07A' },
  over: { label: 'เกินงบ', bg: '#FBE4D6', fg: '#A2522A', bar: '#E8A07A' },
  within: { label: 'อยู่ในงบ ✓', bg: '#E3EEDD', fg: '#4F6B47', bar: '#9AAB91' },
  paid: { label: 'จ่ายแล้ว ✓', bg: '#E3EEDD', fg: '#4F6B47', bar: '#9AAB91' },
  unpaid: { label: 'ยังไม่จ่าย', bg: '#EEE7DC', fg: '#6B6258', bar: '#CFC5B6' },
};
const shortDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
// กลุ่มเงินที่กันไว้: "Netflix 25 พ.ย." / "ทดสอบรายวัน ×4 · 12–15 พ.ย."
const groupText = (g) => {
  const name = g.note || 'รายการประจำ';
  if (g.count <= 1) return `${name} ${shortDate(g.first)}`;
  const sameMonth = g.first.slice(0, 7) === g.last.slice(0, 7);
  const range = sameMonth ? `${Number(g.first.slice(8))}–${shortDate(g.last)}` : `${shortDate(g.first)}–${shortDate(g.last)}`;
  return `${name} ×${g.count} · ${range}`;
};

const money = (n) =>
  Number(n).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};
const box = {
  background: '#fff', borderRadius: 14, padding: 22, width: 460, maxWidth: '100%',
  maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
};
const label = { display: 'block', fontSize: 13, marginBottom: 4, color: '#4b5563' };
const field = { width: '100%', boxSizing: 'border-box' };

// สไตล์ส่วนหัวหน้า (ชื่อ + ไอคอนข้อมูล / เดือน-ปี / ปุ่มตั้งงบ) และกล่องหมายเหตุ
//  คอมพิวเตอร์: ชื่อ ซ้าย | เดือน ปี ปุ่ม ขวา ในแถวเดียว
//  มือถือ (ไม่เกิน 640px): แถว 1 = ชื่อ ซ้าย + ปุ่มตั้งงบ ขวา / แถว 2 = เดือนและปีในแถวเดียวกัน
const css = `
  .bd-toggle { display: inline-flex; align-items: center; gap: 4px; border: none; background: none; padding: 2px 0; font: inherit; font-size: 12px; color: #74896F; cursor: pointer; white-space: nowrap; }
  .bd-toggle:hover { color: #4F6B47; }
  .bd-chev { transition: transform 0.25s ease; }
  .bd-chev.open { transform: rotate(180deg); }
  .bd-details { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows 0.25s ease, opacity 0.2s ease; }
  .bd-details.open { grid-template-rows: 1fr; opacity: 1; }
  .bd-details-inner { overflow: hidden; min-height: 0; }
  @media (prefers-reduced-motion: reduce) { .bd-chev, .bd-details { transition: none; } }
.bd-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}
.bd-title {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-right: auto;
  min-width: 0;
}
.bd-title h2 { margin: 0; }
.bd-selects { display: flex; align-items: center; gap: 8px; }
.bd-selects select { width: auto; min-width: 120px; flex-shrink: 0; }
.bd-selects select.bd-year { min-width: 90px; }
.bd-add { white-space: nowrap; }

.bd-info-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; padding: 0;
  border: 1.5px solid #9ca3af; border-radius: 50%;
  background: #fff; color: #6b7280;
  font: italic 700 12px/1 Georgia, 'Times New Roman', serif;
  cursor: pointer;
}
.bd-info-btn:hover, .bd-info-btn:focus-visible, .bd-title.open .bd-info-btn {
  background: #f3f4f6; color: #374151; border-color: #6b7280; outline: none;
}
.bd-info-pop {
  display: none;
  position: absolute; left: 0; top: calc(100% + 8px); z-index: 30;
  width: min(420px, calc(100vw - 24px));
  padding: 16px 20px;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  font-size: 13px; line-height: 1.7; color: #4b5563;
}
.bd-info-pop ul { margin: 0; padding-left: 18px; }
.bd-info-pop li + li { margin-top: 8px; }
/* สะพานโปร่งใสกันกล่องหายตอนเลื่อนเมาส์จากไอคอนลงมาที่กล่อง */
.bd-info-pop::before { content: ''; position: absolute; left: 0; right: 0; top: -10px; height: 10px; }
.bd-title.open .bd-info-pop { display: block; }
@media (hover: hover) {
  .bd-info-btn:hover + .bd-info-pop, .bd-info-btn:focus-visible + .bd-info-pop, .bd-info-pop:hover { display: block; }
}

@media (max-width: 640px) {
  .bd-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: "title add" "selects selects";
    align-items: center;
    gap: 10px 12px;
  }
  .bd-title { grid-area: title; margin-right: 0; }
  .bd-add { grid-area: add; }
  .bd-selects { grid-area: selects; }
  .bd-selects select, .bd-selects select.bd-year { flex: 1 1 0; min-width: 0; width: auto; }
}
`;

const emptyForm = () => ({ category_id: '', amount_limit: '', alert_threshold: '80', repeat: true });

// แจ้งให้กระดิ่งแจ้งเตือนโหลดใหม่ทันที (ไม่ต้องรอรอบ 60 วินาที)
const refreshBell = () => {
  try {
    window.dispatchEvent(new Event('notifications:refresh'));
  } catch {
    /* การรีเฟรชกระดิ่งล้มเหลวต้องไม่กระทบการบันทึก */
  }
};

// เดือน/ปีที่ส่งมาทาง URL (เช่น /budgets?month=10&year=2026 เมื่อกดจากการแจ้งเตือน) ใช้เฉพาะค่าที่อยู่ในช่วงที่เลือกได้ในหน้านี้
function periodFromQuery(params, thisYear) {
  const m = Number(params.get('month'));
  const y = Number(params.get('year'));
  const validMonth = Number.isInteger(m) && m >= 1 && m <= 12;
  const validYear = Number.isInteger(y) && y >= thisYear - 3 && y <= thisYear + 1;
  return validMonth && validYear ? { month: m, year: y } : null;
}

// ไอคอนข้อมูล "i" ต่อท้ายชื่อหน้า: เปิดกล่องหมายเหตุ (คอมพิวเตอร์: เมาส์ชี้/โฟกัส, ทุกอุปกรณ์: คลิกหรือแตะเพื่อเปิด-ปิด, Esc หรือแตะที่อื่นเพื่อปิด)
function PageTitle() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`bd-title${open ? ' open' : ''}`} ref={ref}>
      <h2>งบประมาณ</h2>
      <button
        type="button"
        className="bd-info-btn"
        data-info-btn
        aria-label="หมายเหตุเกี่ยวกับงบประมาณ"
        aria-expanded={open}
        aria-controls="bd-info-pop"
        onClick={() => setOpen((v) => !v)}
      >
        i
      </button>
      <div id="bd-info-pop" className="bd-info-pop" role="tooltip" data-info-pop>
        <ul>
          <li>งบที่ตั้งไว้จะยกมาใช้ต่อเนื่องทุกเดือนอัตโนมัติ</li>
          <li>ปิดเดือนนี้ได้ หรือกด “ลบ” ถ้าไม่ต้องการใช้งบนี้อีก</li>
          <li>ระบบแจ้งเตือนที่กระดิ่ง 🔔 เมื่อยอดใช้ถึงเกณฑ์ ถึงวงเงิน หรือคาดว่าจะเกินงบก่อนสิ้นเดือน</li>
        </ul>
      </div>
    </div>
  );
}

export default function Budgets() {
  const now = new Date();
  const [searchParams] = useSearchParams();
  const fromUrl = periodFromQuery(searchParams, now.getFullYear());
  const [month, setMonth] = useState(fromUrl ? fromUrl.month : now.getMonth() + 1);
  const [year, setYear] = useState(fromUrl ? fromUrl.year : now.getFullYear());
  const [budgets, setBudgets] = useState([]);
  const [cats, setCats] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null); // แถวงบที่กำลังแก้ (null = เพิ่มใหม่)
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // งบที่กำลังจะลบ (เปิดป๊อปอัปยืนยัน)
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [openIds, setOpenIds] = useState(() => new Set()); // การ์ดงบที่เปิดดูรายละเอียดอยู่
  const toggleOpen = (id) => setOpenIds((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  // กดการแจ้งเตือนตอนอยู่หน้านี้อยู่แล้ว: URL เปลี่ยนแต่หน้าไม่โหลดใหม่ ให้ปรับเดือน/ปีตาม URL
  const urlMonth = fromUrl ? fromUrl.month : null;
  const urlYear = fromUrl ? fromUrl.year : null;
  useEffect(() => {
    if (urlMonth && urlYear) {
      setMonth(urlMonth);
      setYear(urlYear);
    }
  }, [urlMonth, urlYear]);

  const thisYear = now.getFullYear();
  const years = [];
  for (let y = thisYear - 3; y <= thisYear + 1; y++) years.push(y);

  const loadBudgets = useCallback(async () => {
    try {
      const res = await api.getBudgets({ month, year });
      setBudgets(res.data);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [month, year]);

  useEffect(() => {
    api
      .getCategories()
      .then((r) => setCats(r.data.filter((c) => c.type === 'expense')))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    loadBudgets();
  }, [loadBudgets]);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm());
    setFormError('');
  }, []);

  const closeDelete = useCallback(() => {
    setDeleteTarget(null);
    setDeleteError('');
  }, []);

  useEffect(() => {
    if (!showForm && !deleteTarget) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (deleteTarget) closeDelete();
      else closeForm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showForm, deleteTarget, closeForm, closeDelete]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (b) => {
    setEditing(b);
    setForm({
      category_id: b.category_id,
      amount_limit: String(b.amount_limit),
      alert_threshold: String(b.alert_threshold),
      repeat: b.repeat !== false,
    });
    setFormError('');
    setShowForm(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    setBusy(true);
    try {
      // ตั้งซ้ำหมวด/เดือนเดิม backend จะอัปเดตวงเงินให้
      await api.createBudget({
        category_id: form.category_id,
        amount_limit: Number(form.amount_limit),
        alert_threshold: Number(form.alert_threshold),
        repeat: form.repeat,
        period_month: month,
        period_year: year,
      });
      closeForm();
      await loadBudgets();
      refreshBell();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // เดือนที่ผ่านมาแล้ว (ก่อนเดือนปัจจุบัน): ใช้คำว่า "ลบ" แทน "หยุดใช้งบนี้"
  const isPastMonth = year * 12 + month < thisYear * 12 + (now.getMonth() + 1);

  // เปิด/ปิดงบเดือนนี้ (ปิดแล้วไม่คำนวณ ไม่แจ้งเตือน เดือนหน้ากลับมาเปิดเอง)
  const toggleEnabled = async (b) => {
    try {
      await api.put(`/budgets/${b.budget_id}`, { enabled: b.enabled === false });
      await loadBudgets();
      refreshBell();
    } catch (err) {
      setError(err.message);
    }
  };

  // ปุ่ม "ลบ": เปิดป๊อปอัปถามยืนยันก่อน (ลบจริงเมื่อกด "ยืนยัน")
  const askDelete = (b) => {
    setDeleteError('');
    setDeleteTarget(b);
  };

  // ยืนยันลบ: ซ่อนงบจากรายการ ไม่ยกไปเดือนถัดไป และลบการแจ้งเตือนของงบนี้ (เดือนก่อนหน้าไม่เปลี่ยน ตั้งใหม่ได้ภายหลัง)
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api.deleteBudget(deleteTarget.budget_id);
      setDeleteTarget(null);
      await loadBudgets();
      refreshBell(); // ลบงบแล้วการแจ้งเตือนของงบนั้นถูกลบด้วย ให้กระดิ่งอัปเดตทันที
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleting(false);
    }
  };
  
  return (
    <div>
      <style>{css}</style>

      {/* ส่วนหัว: ชื่อหน้า (+ ไอคอนข้อมูล) / เดือน-ปี / ปุ่มตั้งงบประมาณ (มือถือ: ชื่อ+ปุ่มแถวบน เดือน-ปีแถวล่าง) */}
      <div className="bd-head">
        <PageTitle />

        <div className="bd-selects">
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
          <select className="bd-year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>{y + 543}</option>
            ))}
          </select>
        </div>

        <button className="btn bd-add" onClick={openAdd}>
          + ตั้งงบประมาณ
        </button>
      </div>

      {error && <div className="alert">{error}</div>}

      {budgets.length === 0 ? (
        <div className="card">
          <p style={{ margin: 0, color: '#9ca3af', textAlign: 'center' }}>
            ยังไม่ได้ตั้งงบประมาณของเดือน{MONTHS[month - 1]} {year + 543} กด “+ ตั้งงบประมาณ” เพื่อเริ่มต้น
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14, margin: '14px 0', alignItems: 'start' }}>
          {budgets.map((b) => {
            // backend รุ่นเก่าไม่ส่ง enabled/repeat: ถือว่าเปิดใช้และต่อเนื่อง
            const enabled = b.enabled !== false;
            const repeat = b.repeat !== false;
            const old = enabled ? STATUS[b.status] || STATUS.ok : { label: 'ปิดไว้เดือนนี้', color: '#9ca3af' };
            const pace = enabled && b.pace_status ? PACE[b.pace_status] : null;
            const st = pace ? { label: pace.label, color: pace.bar } : old;
            const chip = pace ? { background: pace.bg, color: pace.fg } : { background: old.color, color: '#fff' };
            const over = b.spent - b.amount_limit;
            const f = b.forecast;
            const isOpen = openIds.has(b.budget_id);
            const forecastLine = f ? (
              <div data-forecast style={{ fontSize: 12, marginTop: 4, color: f.will_exceed ? '#b45309' : '#6b7280' }}>
                คาดการณ์สิ้นเดือน ฿{money(f.projected)}{' '}
                {f.will_exceed
                  ? `(เกินงบ ฿${money(f.over)}${f.reach_day ? ` · คาดว่าถึงวงเงินประมาณวันที่ ${f.reach_day}` : ''})`
                  : '(ไม่เกินงบ)'}
              </div>
            ) : null;
            return (
              <div
                key={b.budget_id}
                data-budget-card
                style={{
                  background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16,
                  opacity: enabled ? 1 : 0.6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <strong>
                    <span className="dot" style={{ background: b.color }} />
                    {b.category_name}
                  </strong>
                  <span
                    data-pace={b.pace_status || b.status}
                    style={{
                      fontSize: 12, padding: '2px 10px', borderRadius: 999, fontWeight: 600, ...chip,
                    }}
                  >
                    {st.label}
                  </span>
                </div>

                <div style={{ position: 'relative', height: 10, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(b.percent_used, 100)}%`, height: '100%', background: st.color }} />
                  <div
                    title={`แจ้งเตือนที่ ${b.alert_threshold}%`}
                    style={{ position: 'absolute', top: 0, bottom: 0, left: `${Math.min(b.alert_threshold, 100)}%`, width: 2, background: '#374151', opacity: 0.5 }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 14 }}>
                  <span>฿{money(b.spent)} / ฿{money(b.amount_limit)}</span>
                  <strong style={{ color: pace ? pace.fg : st.color }}>{b.percent_used}%</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                  <span>
                    {enabled
                      ? (over > 0 ? `เกินงบ ฿${money(over)}` : `เหลือ ฿${money(-over)}`)
                      : 'ปิดงบนี้ไว้ในเดือนนี้ (ไม่คำนวณและไม่แจ้งเตือน เดือนหน้ากลับมาเปิดเอง)'}
                  </span>
                  <button
                    type="button"
                    data-detail-toggle
                    aria-expanded={isOpen}
                    onClick={() => toggleOpen(b.budget_id)}
                    className="bd-toggle"
                  >
                    {isOpen ? 'ซ่อนรายละเอียด' : 'รายละเอียด'}
                    <svg className={`bd-chev${isOpen ? ' open' : ''}`} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                      <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>

                {/* คาดการณ์ว่าจะเกินงบ = คำเตือน แสดงตลอด (ไม่ซ่อนในรายละเอียด) */}
                {f && f.will_exceed && forecastLine}

                {/* รายละเอียด: เลื่อนขยาย/หุบด้วย grid-template-rows (0fr ↔ 1fr) */}
                <div className={`bd-details${isOpen ? ' open' : ''}`} data-budget-details data-open={isOpen ? 'true' : 'false'} aria-hidden={!isOpen} inert={isOpen ? undefined : ''}>
                  <div className="bd-details-inner">
                  <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed #E9E1D6' }}>
                    {/* จังหวะการใช้ (ทยอยจ่าย) / จ่ายเป็นก้อน (ระบบดูจากประวัติ) */}
                    {enabled && b.pace_status && (b.lumpy || b.elapsed_pct < 100) && (
                      <div data-pace-note style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                        {b.lumpy
                          ? 'จ่ายเป็นก้อน (ระบบดูจากประวัติ)'
                          : `ผ่านไป ${Math.round(b.elapsed_pct)}% ของเดือน · ใช้ไป ${b.percent_used}% ของงบ`}
                      </div>
                    )}

                    {/* เงินที่กันไว้: รายการเกิดซ้ำในหมวดนี้ที่ยังไม่ถึงวันจ่ายในเดือนนี้ (รวมรอบของรายการเดียวกัน) */}
                    {enabled && b.reserved && b.reserved.total > 0 && (
                      <div data-reserved style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                        กันไว้ ฿{money(b.reserved.total)} ({(b.reserved.groups || []).map(groupText).join(', ')})
                      </div>
                    )}

                    {/* คาดการณ์สิ้นเดือนกรณีไม่เกินงบ (แสดงเมื่อผ่านไปอย่างน้อย 7 วันและมีรายจ่ายอย่างน้อย 3 รายการ) */}
                    {f && !f.will_exceed && forecastLine}

                    <div data-repeat-note style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                      {enabled ? `แจ้งเตือนที่ ${b.alert_threshold}% · ` : ''}{repeat ? 'ต่อเนื่องทุกเดือน' : 'เฉพาะเดือนนี้ (ไม่ยกไปเดือนถัดไป)'}
                    </div>
                  </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <button className="btn btn-sm btn-light" onClick={() => openEdit(b)}>แก้ไข</button>
                  {!isPastMonth && (
                    <button className="btn btn-sm btn-light" data-toggle-enabled onClick={() => toggleEnabled(b)}>
                      {enabled ? 'ปิดเดือนนี้' : 'เปิดใช้เดือนนี้'}
                    </button>
                  )}
                  <button className="btn btn-sm btn-danger" data-delete onClick={() => askDelete(b)}>
                    ลบ
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ป๊อปอัปยืนยันการลบงบประมาณ */}
      {deleteTarget && (
        <div style={overlay} onClick={deleting ? undefined : closeDelete}>
          <div
            style={{ ...box, width: 420 }}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="budget-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="budget-delete-title" style={{ marginTop: 0 }}>ลบงบประมาณ</h3>

            <p style={{ margin: '0 0 8px' }}>
              ต้องการลบงบประมาณหมวด <strong>"{deleteTarget.category_name}"</strong> ใช่หรือไม่?
            </p>
            <p data-delete-note style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
              {isPastMonth
                ? 'ลบเฉพาะงบของเดือนนี้ เดือนอื่นไม่เปลี่ยน และการแจ้งเตือนของงบนี้จะถูกลบด้วย'
                : 'งบนี้จะไม่ถูกยกไปเดือนถัดไป และการแจ้งเตือนของงบนี้จะถูกลบด้วย (เดือนก่อนหน้าไม่เปลี่ยน และตั้งงบหมวดนี้ใหม่ได้ภายหลัง)'}
            </p>

            {deleteError && <div className="alert" style={{ marginBottom: 12 }}>{deleteError}</div>}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-light" onClick={closeDelete} disabled={deleting}>
                ยกเลิก
              </button>
              <button type="button" className="btn btn-danger" data-confirm-delete onClick={confirmDelete} disabled={deleting}>
                {deleting ? 'กำลังลบ...' : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div style={overlay} onClick={closeForm}>
          <div style={box} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>
              {editing ? 'แก้ไขงบประมาณ' : 'ตั้งงบประมาณ'} · {MONTHS[month - 1]} {year + 543}
            </h3>

            <form onSubmit={submit}>
              <div style={{ marginBottom: 12 }}>
                <label style={label}>หมวดหมู่ (รายจ่าย)</label>
                <CategorySelect
                  style={field}
                  categories={cats}
                  type="expense"
                  value={form.category_id}
                  onChange={(v) => setForm({ ...form, category_id: v })}
                  onCreated={(c) => setCats((prev) => (prev.some((x) => String(x.category_id) === String(c.category_id)) ? prev : [...prev, c]))}
                  extra={editing ? { category_id: editing.category_id, name: editing.category_name, type: 'expense' } : null}
                  disabled={!!editing}
                  required
                />
                {!editing && (
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                    ถ้าหมวดนี้มีงบของเดือนนี้อยู่แล้ว ระบบจะอัปเดตวงเงินให้ใหม่
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={label}>วงเงิน (บาท)</label>
                  <input
                    style={field}
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.amount_limit}
                    onChange={(e) => setForm({ ...form, amount_limit: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label style={label}>แจ้งเตือนเมื่อใช้ถึง (%)</label>
                  <input
                    style={field}
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    value={form.alert_threshold}
                    onChange={(e) => setForm({ ...form, alert_threshold: e.target.value })}
                    required
                  />
                </div>
              </div>

              <label
                data-repeat-field
                style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 8, fontSize: 13, marginBottom: 12, color: '#374151', cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={form.repeat}
                  onChange={(e) => setForm({ ...form, repeat: e.target.checked })}
                  style={{ width: 18, height: 18, minHeight: 0, padding: 0, margin: '1px 0 0', flexShrink: 0, cursor: 'pointer' }}
                />
                <span>ยกงบนี้ไปเดือนถัดไปให้อัตโนมัติ (ไม่ต้องตั้งใหม่ทุกเดือน)</span>
              </label>

              {formError && <div className="alert" style={{ marginBottom: 12 }}>{formError}</div>}

              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-light" onClick={closeForm} disabled={busy}>ยกเลิก</button>
                <button className="btn" style={{ flex: 1 }} disabled={busy}>
                  {busy ? 'กำลังบันทึก...' : 'บันทึกงบประมาณ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
