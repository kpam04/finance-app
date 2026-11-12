import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import AiQuickInput from '../components/AiQuickInput.jsx';
import AiConfirmModal from '../components/AiConfirmModal.jsx';
import { editedFields } from '../utils/aiDrafts.js';
import CategorySelect from '../components/CategorySelect.jsx';
import CategoryFilterSelect from '../components/CategoryFilterSelect.jsx';
import InfoTitle from '../components/InfoTitle.jsx';
import ExportCsvModal from '../components/ExportCsvModal.jsx';
import { IconList, IconFilter, IconDownload } from '../components/PlanIcons.jsx';

// คืนค่าวันที่ปัจจุบันในรูปแบบ YYYY-MM-DD
const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');

  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// จัดรูปแบบตัวเลขจำนวนเงิน
const money = (n) =>
  Number(n).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// ค่าเริ่มต้นของฟอร์มเพิ่มรายการ
const emptyForm = () => ({
  type: '', // ยังไม่เลือก: ต้องเลือกรายรับหรือรายจ่ายเองก่อนบันทึก
  amount: '',
  category_id: '',
  note: '',
  transaction_date: today(),
});

// แจ้งให้กระดิ่งแจ้งเตือนโหลดใหม่ทันที (บันทึกรายจ่ายแล้วอาจใช้งบถึงเกณฑ์ ไม่ต้องรอรอบ 60 วินาที)
const refreshBell = () => {
  try {
    window.dispatchEvent(new Event('notifications:refresh'));
  } catch {
    /* การรีเฟรชกระดิ่งล้มเหลวต้องไม่กระทบการบันทึก */
  }
};


// ไอคอนปุ่มแก้ไข/ลบ (แสดงบนมือถือแทนตัวหนังสือเพื่อประหยัดที่ บนคอมยังเป็นตัวหนังสือเหมือนเดิม)
const IconEdit = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);
const IconTrash = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

const TYPE_OPTIONS = [['', 'ทั้งหมด'], ['expense', 'รายจ่าย'], ['income', 'รายรับ']];

// สไตล์เฉพาะหน้านี้ (เพิ่มชื่อโซน ป้ายกำกับช่องกรอง และกันช่องวันที่ล้นขอบบนมือถือ) ไม่แตะ index.css
const txCss = `
.ai-quick-section > .card { border: 1px solid var(--primary, #9AAB91); }
.tx-list-head { margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.tx-export { display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; }
.tx-export svg { color: var(--primary-dark, #74896F); }
.tx-list-head h3 { margin: 0; font-size: 17px; }
.tx-filter-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; font-size: 13px; font-weight: 600; color: #4b5563; }
.tx-clear { padding: 0; border: none; background: none; font: inherit; font-size: 13px; font-weight: 400; color: var(--primary-dark, #74896F); text-decoration: underline; cursor: pointer; }
.tx-filter-grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr); gap: 10px 12px; margin-bottom: 14px; }
.tx-seg { display: flex; border: 1px solid var(--border, #E9E1D6); border-radius: 10px; overflow: hidden; background: #fff; }
.tx-seg button { flex: 1; min-height: 42px; padding: 8px 6px; border: none; background: #fff; color: #6b7280; font: inherit; font-size: 14px; cursor: pointer; }
.tx-seg button + button { border-left: 1px solid var(--border, #E9E1D6); }
.tx-seg button.on { background: #E8EDE4; color: #40563C; font-weight: 600; }
.tx-seg button:focus-visible { outline: 2px solid var(--primary, #9AAB91); outline-offset: -2px; }
.tx-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; margin: 0; }
.tx-field > span { font-size: 12px; font-weight: 400; color: #6b7280; }
.tx-field select, .tx-field input { width: 100%; min-width: 0; max-width: 100%; box-sizing: border-box; margin: 0; }
.transactions-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.transactions-table td.actions { display: table-cell; vertical-align: middle; text-align: center; white-space: nowrap; }
.tx-actions { display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
.tx-empty strong { display: block; margin-bottom: 4px; color: #3F3A34; font-weight: 600; }
.tx-empty .btn { margin-top: 10px; }
.tx-scroll-hint { margin: 6px 0 0; font-size: 12px; color: #8A8177; text-align: center; }
@media (max-width: 760px) { .tx-filter-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .tx-field.tx-wide { grid-column: 1 / -1; } }
.tx-act .tx-ico { display: none; }
@media (max-width: 640px) {
  .ai-actions .btn { font-size: 13px; padding-left: 6px; padding-right: 6px; }
  .transactions-page .transaction-card { width: auto; margin-left: -8px; margin-right: -8px; padding-left: 8px; padding-right: 8px; }
  .tx-act .tx-txt { display: none; }
  .tx-act .tx-ico { display: inline-flex; }
  .transactions-table td.actions .tx-act { width: 34px; min-width: 34px; height: 34px; min-height: 34px; padding: 0; }
  .transactions-table { display: table; width: 100%; overflow: visible; white-space: normal; }
  .transactions-table th, .transactions-table td { padding: 10px 4px; font-size: 13px; }
  .transactions-table th { font-size: 12px; }
  .transactions-table td[data-label="วันที่"], .transactions-table td[data-label="จำนวนเงิน"], .transactions-table td.actions, .transactions-table th { white-space: nowrap; }
  .tx-actions { gap: 4px; }
}
`;

// อ่านตัวกรองเริ่มต้นจาก query: month=YYYY-MM → ช่วงวันที่ทั้งเดือน / category=<id> → หมวด (ประเภทรายจ่าย)
function filterFromQuery(search) {
  const f = { type: '', category_id: '', start: '', end: '' };
  const q = new URLSearchParams(search || '');
  const m = /^(\d{4})-(\d{2})$/.exec(q.get('month') || '');
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
    const last = new Date(Number(m[1]), Number(m[2]), 0).getDate();
    f.start = `${m[1]}-${m[2]}-01`;
    f.end = `${m[1]}-${m[2]}-${String(last).padStart(2, '0')}`;
  }
  const c = q.get('category') || '';
  if (/^[a-f0-9]{24}$/i.test(c)) { f.category_id = c; f.type = 'expense'; }
  return f;
}

export default function Transactions() {
  // ข้อมูลหมวดหมู่และรายการธุรกรรม
  const [cats, setCats] = useState([]);
  const [rows, setRows] = useState([]);

  // ข้อมูล Pagination
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
  });

  // ตัวกรองรายการ (เปิดจากลิงก์ได้ เช่น /transactions?month=2026-11&category=<id> จากปุ่ม "ดูรายการ" ในหน้าวางแผน)
  const [filter, setFilter] = useState(() => filterFromQuery(window.location.search));

  // สถานะของหน้าและฟอร์ม
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(emptyForm());
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // สถานะการแจ้งเตือนและการบันทึก
  const [showExport, setShowExport] = useState(false); // หน้าต่างส่งออก CSV
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  // ข้อมูลที่ AI วิเคราะห์และรอผู้ใช้ยืนยัน
  // คิวร่างรายการจาก AI/กฎ (ข้อความเดียวอาจได้หลายรายการ ตรวจยืนยันทีละรายการ)
  const [aiQueue, setAiQueue] = useState([]);
  const aiDraft = aiQueue[0] || null;
  const [aiStatus, setAiStatus] = useState(null); // สถานะผู้ช่วย AI (มีคีย์ไหม ผู้ใช้เปิดไหม) ใช้ตัดสินว่าจะแสดงปุ่ม "ให้ AI ช่วยตรวจ" ในหน้ายืนยัน

  // โหลดหมวดหมู่จาก API
  useEffect(() => {
    api
      .getCategories({ include_hidden: 1 }) // รวมหมวดที่ซ่อน เพื่อให้กรองรายการเก่าด้วยหมวดนั้นได้ (ฟอร์ม/AI ใช้เฉพาะหมวดที่ไม่ซ่อน)
      .then((r) => setCats(r.data))
      .catch((e) => setError(e.message));
  }, []);

  // โหลดรายการรายรับ-รายจ่ายตามตัวกรองและหน้าปัจจุบัน
  const load = useCallback(async () => {
    try {
      const res = await api.getTransactions({
        ...filter,
        page,
        limit: 20,
      });

      setRows(res.data);
      setPagination(res.pagination);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [filter, page]);

  useEffect(() => {
    load();
  }, [load]);


  // หมวดที่ใช้เลือกได้ (ไม่รวมหมวดที่ซ่อน) สำหรับฟอร์มและ AI
  const activeCats = useMemo(() => cats.filter((c) => !c.hidden), [cats]);

  // หมวดเดิมของรายการที่กำลังแก้ไข (ถ้าถูกซ่อนไปแล้วก็ยังต้องแสดงในช่องเลือก)
  const [editExtra, setEditExtra] = useState(null);

  // เพิ่ม/อัปเดตหมวดที่เพิ่งสร้างหรือเพิ่งแสดงอีกครั้ง เข้าในรายการหมวดทันที
  const addCat = useCallback((cat) => {
    setCats((prev) => (prev.some((c) => String(c.category_id) === String(cat.category_id))
      ? prev.map((c) => (String(c.category_id) === String(cat.category_id) ? cat : c))
      : [...prev, cat]));
  }, []);

  // เปิดฟอร์มเพิ่มรายการ
  const openAdd = () => {
    setEditingId(null);
    setEditExtra(null);
    setForm(emptyForm());
    setFormError('');
    setShowForm(true);
  };

  // มาจากปุ่ม "+ เพิ่มรายการ" ในแดชบอร์ด (navigate('/transactions', { state: { openAdd: true } })): เปิดฟอร์มเพิ่มรายการทันที
  // แล้วล้าง state ออกจากประวัติ กันฟอร์มเด้งซ้ำเมื่อรีเฟรชหรือกดย้อนกลับ
  const location = useLocation();
  const navigate = useNavigate();
  const wantAdd = !!(location.state && location.state.openAdd);
  useEffect(() => {
    if (!wantAdd) return;
    setEditingId(null);
    setEditExtra(null);
    setForm(emptyForm());
    setFormError('');
    setShowForm(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [wantAdd, location.pathname, navigate]);

  // ปิดฟอร์มและคืนค่าเริ่มต้น
  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
    setFormError('');
  }, []);

  // กด Esc เพื่อปิดฟอร์ม
  useEffect(() => {
    if (!showForm) return undefined;

    const onKey = (e) => {
      if (e.key === 'Escape') closeForm();
    };

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [showForm, closeForm]);

  // เปลี่ยนประเภทแล้วล้างหมวดหมู่เดิม
  const changeType = (type) => {
    setForm({
      ...form,
      type,
      category_id: '',
    });
  };

  // บันทึกข้อมูลเพิ่มหรือแก้ไขรายการ
  const submit = async (e) => {
    e.preventDefault();

    // กันกรณีที่เบราว์เซอร์ไม่ตรวจช่องบังคับ: ต้องเลือกประเภทก่อนเสมอ
    if (!form.type) {
      setFormError('โปรดระบุประเภท');
      return;
    }

    setFormError('');
    setBusy(true);

    const payload = {
      ...form,
      amount: Number(form.amount),
    };

    try {
      if (editingId) {
        await api.updateTransaction(editingId, payload);
      } else {
        await api.createTransaction(payload);
      }

      closeForm();
      await load();
      refreshBell();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // ยืนยันรายการที่ได้จาก AI และบันทึกลงระบบ
  // รายงานผลตอบรับของผู้ใช้ต่อรายการที่ AI สกัด (ไม่ส่งเนื้อหา ใช้วัดความแม่นยำ) ล้มเหลวก็ไม่กระทบการใช้งาน
  const reportAi = (draft, action, data) => {
    if (!draft || !draft.ai || !draft.ai.event_id || !api.aiFeedback) return;
    const body = { action };
    if (action === 'confirmed' && data) body.edited = editedFields(draft, data);
    Promise.resolve(api.aiFeedback(draft.ai.event_id, body)).catch(() => {});
  };

  const skipAiDraft = () => {
    reportAi(aiDraft, 'skipped');
    setAiQueue((q) => q.slice(1));
  };

  useEffect(() => {
    let live = true;
    if (api && typeof api.aiStatus === 'function') {
      api.aiStatus().then((r) => { if (live) setAiStatus(r.data); }).catch(() => { if (live) setAiStatus({ configured: false }); });
    }
    return () => { live = false; };
  }, []);

  const closeAiQueue = () => {
    aiQueue.forEach((d) => reportAi(d, 'cancelled'));
    setAiQueue([]);
  };

  const confirmAiDraft = async (data, meta) => {
    await api.createTransaction(data);

    reportAi(aiDraft, 'confirmed', data);
    // ผู้ใช้เคยให้ AI ตรวจแล้วเลือกเก็บค่าของกฎ: รายงานว่าแก้ฟิลด์ไหนจากที่กฎอ่านได้ (วัดความแม่นของกฎเทียบกับ AI)
    if (meta && meta.keptEventId && api.aiFeedback) {
      Promise.resolve(api.aiFeedback(meta.keptEventId, { action: 'rules_confirmed', edited: editedFields(aiDraft, data) })).catch(() => {});
    }
    setAiQueue((q) => q.slice(1));
    setError('');

    await load();
    refreshBell();
  };

  // เปิดฟอร์มแก้ไขรายการ
  const startEdit = (t) => {
    setEditingId(t.transaction_id);

    setForm({
      type: t.type,
      amount: String(t.amount),
      category_id: t.category_id,
      note: t.note || '',
      transaction_date: t.transaction_date,
    });

    setEditExtra({ category_id: t.category_id, name: t.category_name, type: t.type });
    setFormError('');
    setShowForm(true);
  };

  // ลบรายการ
  const remove = async (t) => {
    const confirmed = window.confirm(
      `ลบรายการ "${t.note || t.category_name}" ใช่หรือไม่?`
    );

    if (!confirmed) return;

    try {
      await api.deleteTransaction(t.transaction_id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  // ตารางกว้างกว่าจอ (จอแคบมาก) ถึงต้องเลื่อนไปทางขวา: ตรวจจริงทุกครั้งที่รายการหรือขนาดจอเปลี่ยน แล้วค่อยบอกผู้ใช้ให้เลื่อน
  const wrapRef = useRef(null);
  const [scrollable, setScrollable] = useState(false);
  useEffect(() => {
    const check = () => {
      const el = wrapRef.current;
      setScrollable(!!el && el.scrollWidth > el.clientWidth + 6);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [rows]);

  // มีตัวกรองที่ใช้อยู่หรือไม่ (ใช้ขึ้นปุ่ม "ล้างตัวกรอง" และเลือกข้อความหน้าว่าง)
  const hasFilter = !!(filter.type || filter.category_id || filter.start || filter.end);

  // สรุปตัวกรองที่เลือกอยู่ (แสดงในหน้าต่างส่งออก CSV)
  const filterSummary = useMemo(() => {
    const th = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('th-TH', { dateStyle: 'medium' });
    const parts = [];
    if (filter.type) parts.push(filter.type === 'income' ? 'รายรับ' : 'รายจ่าย');
    if (filter.category_id) {
      const c = cats.find((x) => String(x.category_id) === String(filter.category_id));
      if (c) parts.push(c.name);
    }
    if (filter.start && filter.end) parts.push(`${th(filter.start)} – ${th(filter.end)}`);
    else if (filter.start) parts.push(`ตั้งแต่ ${th(filter.start)}`);
    else if (filter.end) parts.push(`ถึง ${th(filter.end)}`);
    return parts.join(' · ');
  }, [filter, cats]);
  const clearFilters = () => {
    setPage(1);
    setFilter({ type: '', category_id: '', start: '', end: '' });
  };

  // เลือกประเภท: ถ้าหมวดที่เลือกค้างอยู่เป็นของอีกประเภท ให้ล้างกลับเป็น "ทุกหมวดหมู่" (รายการหมวดแสดงเฉพาะประเภทที่เลือก)
  const setType = (val) => {
    setPage(1);
    setFilter((f) => {
      const cat = cats.find((c) => String(c.category_id) === String(f.category_id));
      const keep = !val || !cat || cat.type === val;
      return { ...f, type: val, category_id: keep ? f.category_id : '' };
    });
  };
  const setCategory = (id) => {
    setPage(1);
    setFilter((f) => ({ ...f, category_id: id }));
  };
  const typeKey = (e) => {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const i = TYPE_OPTIONS.findIndex(([v]) => v === filter.type);
    setType(TYPE_OPTIONS[(i + keys[e.key] + TYPE_OPTIONS.length) % TYPE_OPTIONS.length][0]);
  };

  // เปลี่ยนค่าตัวกรองและกลับไปหน้าแรก
  const setF = (key) => (e) => {
    setPage(1);

    setFilter({
      ...filter,
      [key]: e.target.value,
    });
  };

  // คำนวณจำนวนหน้าทั้งหมด
  const totalPages = Math.max(
    1,
    Math.ceil(pagination.total / pagination.limit)
  );

  return (
    <div className="transactions-page">
      <style>{txCss}</style>

      {/* =================================
          PAGE HEADER
      ================================= */}

      <div className="transaction-heading">
        <h2>รายการรายรับ-รายจ่าย</h2>
      </div>

      {/* แจ้งเตือนข้อผิดพลาด */}
      {error && (
        <div className="alert">
          {error}
        </div>
      )}

      {/* =================================
          AI QUICK INPUT
      ================================= */}

      <div className="ai-quick-section">
        <AiQuickInput
          categories={activeCats}
          onDraftGenerated={(d) => setAiQueue(Array.isArray(d) ? d : [d])}
          aiStatus={aiStatus}
          onAiStatusChange={setAiStatus}
          onManualAdd={openAdd}
        />
      </div>

      {/* =================================
          FILTER & TRANSACTION TABLE
      ================================= */}

      <div className="card transaction-card">

        {/* ชื่อโซน: บอกว่าข้างล่างคือรายการที่บันทึกแล้ว คำอธิบายอยู่ในไอคอน i (ไม่ให้การ์ดแน่น) */}
        <div className="tx-list-head" data-tx-list-head>
          <InfoTitle title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><IconList size={18} style={{ color: 'var(--primary-dark, #74896F)' }} />รายการที่บันทึกแล้ว</span>} label="คำอธิบายส่วนนี้" popId="tx-info-pop">
            <p>ใช้ตัวกรองเพื่อค้นหาเท่านั้น ไม่ได้ใช้เพิ่มรายการ ถ้าจะเพิ่มรายการใช้กล่อง “เพิ่มรายการใหม่” ด้านบน</p>
            <p>ปุ่ม “ส่งออก CSV” ดาวน์โหลดรายการเป็นไฟล์ที่เปิดด้วย Excel ได้ เลือกได้ทั้งช่วงเดือน ทั้งหมด หรือตามตัวกรองที่เลือกอยู่</p>
          </InfoTitle>
          <button
            type="button"
            className="btn btn-sm btn-light tx-export"
            data-tx-export
            onClick={() => setShowExport(true)}
            title="ดาวน์โหลดรายการเป็นไฟล์ CSV (เลือกช่วงเดือนได้)"
          >
            <IconDownload size={16} />
            <span>ส่งออก CSV</span>
          </button>
        </div>

        {/* ตัวกรองรายการ (มีป้ายชื่อทุกช่อง) */}
        <div className="tx-filter-head" data-tx-filter-head>
          <span><IconFilter size={14} /> กรองรายการ</span>
          {hasFilter && (
            <button type="button" className="tx-clear" data-tx-clear onClick={clearFilters}>
              ล้างตัวกรอง
            </button>
          )}
        </div>

        <div className="transaction-filters tx-filter-grid">

          <div className="tx-field tx-wide">
            <span>ประเภท</span>
            <div className="tx-seg" role="radiogroup" aria-label="กรองตามประเภท" data-tx-type onKeyDown={typeKey}>
              {TYPE_OPTIONS.map(([v, label]) => (
                <button
                  key={v || 'all'}
                  type="button"
                  role="radio"
                  aria-checked={filter.type === v}
                  tabIndex={filter.type === v ? 0 : -1}
                  className={filter.type === v ? 'on' : ''}
                  data-tx-type-opt={v || 'all'}
                  onClick={() => setType(v)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="tx-field tx-wide">
            <span data-tx-cat-label>หมวดหมู่{filter.type ? ` (เฉพาะ${filter.type === 'income' ? 'รายรับ' : 'รายจ่าย'})` : ''}</span>
            <CategoryFilterSelect
              categories={cats}
              type={filter.type}
              value={filter.category_id}
              onChange={setCategory}
              ariaLabel="กรองตามหมวดหมู่"
            />
          </div>

          <label className="tx-field">
            <span>ตั้งแต่วันที่</span>
            <input
              type="date"
              value={filter.start}
              onChange={setF('start')}
              aria-label="ตั้งแต่วันที่"
            />
          </label>

          <label className="tx-field">
            <span>ถึงวันที่</span>
            <input
              type="date"
              value={filter.end}
              onChange={setF('end')}
              aria-label="ถึงวันที่"
            />
          </label>

        </div>

        {/* ตารางรายการรายรับ-รายจ่าย */}
        <div className="transactions-table-wrap" ref={wrapRef}>

          <table className={`table transactions-table${rows.length > 0 ? ' has-rows' : ''}`}>

            <thead>
              <tr>
                <th>วันที่</th>
                <th>หมวดหมู่</th>
                <th>บันทึก</th>
                <th className="num">จำนวนเงิน</th>
                <th className="actions">จัดการ</th>
              </tr>
            </thead>

            <tbody>

              {/* กรณีไม่มีข้อมูล */}
              {rows.length === 0 && (
                <tr className="empty-row">
                  <td colSpan="5" className="center-msg tx-empty" data-tx-empty>
                    {hasFilter ? (
                      <>
                        <strong>ไม่พบรายการตามตัวกรอง</strong>
                        ลองเปลี่ยนหรือล้างตัวกรอง
                        <br />
                        <button type="button" className="btn btn-sm btn-light" data-tx-empty-clear onClick={clearFilters}>
                          ล้างตัวกรอง
                        </button>
                      </>
                    ) : (
                      <>
                        <strong>ยังไม่มีรายการที่บันทึก</strong>
                        เพิ่มรายการได้ที่กล่อง “เพิ่มรายการใหม่” ด้านบน
                      </>
                    )}
                  </td>
                </tr>
              )}

              {/* แสดงข้อมูลแต่ละรายการ */}
              {rows.map((t) => (
                <tr key={t.transaction_id}>

                  <td data-label="วันที่">
                    {t.transaction_date}
                  </td>

                  <td data-label="หมวดหมู่">
                    <span
                      className="dot"
                      style={{
                        background: t.category_color,
                      }}
                    />

                    {t.category_name}
                  </td>

                  <td data-label="บันทึก">
                    {t.note || '-'}
                  </td>

                  <td
                    data-label="จำนวนเงิน"
                    className={`num ${t.type}`}
                  >
                    {t.type === 'income' ? '+' : '-'}
                    {money(t.amount)}
                  </td>

                  <td data-label="จัดการ" className="actions">
                    {/* ครอบปุ่มด้วย span (ไม่ใช้ display:flex ที่ตัว td) เส้นขอบแถวจึงต่อเนื่องไม่เหลื่อม */}
                    <span className="tx-actions">
                      <button
                        className="btn btn-sm btn-light tx-act"
                        aria-label="แก้ไข"
                        title="แก้ไข"
                        onClick={() => startEdit(t)}
                      >
                        <span className="tx-ico"><IconEdit /></span>
                        <span className="tx-txt">แก้ไข</span>
                      </button>

                      <button
                        className="btn btn-sm btn-danger tx-act"
                        aria-label="ลบ"
                        title="ลบ"
                        onClick={() => remove(t)}
                      >
                        <span className="tx-ico"><IconTrash /></span>
                        <span className="tx-txt">ลบ</span>
                      </button>
                    </span>
                  </td>

                </tr>
              ))}

            </tbody>
          </table>

        </div>

        {/* จอแคบมากจนตารางไม่พอดี: บอกให้เลื่อนไปทางขวา (ขึ้นเฉพาะเมื่อกว้างกว่าจอจริง ๆ) */}
        {rows.length > 0 && scrollable && <p className="tx-scroll-hint" data-tx-scroll-hint>เลื่อนตารางไปทางขวาเพื่อดูจำนวนเงินและปุ่มแก้ไข/ลบ</p>}

        {/* =================================
            PAGINATION
        ================================= */}

        <div className="pager">

          <button
            className="btn btn-light btn-sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            ก่อนหน้า
          </button>

          <span>
            หน้า {page} / {totalPages}
            {' '} (ทั้งหมด {pagination.total} รายการ)
          </span>

          <button
            className="btn btn-light btn-sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            ถัดไป
          </button>

        </div>

      </div>

      {/* =================================
          ADD / EDIT MODAL
      ================================= */}

      {showForm && (
        <div
          className="transaction-overlay"
          onClick={closeForm}
        >

          <div
            className="transaction-modal"
            onClick={(e) => e.stopPropagation()}
          >

            <h3>
              {editingId ? 'แก้ไขรายการ' : 'เพิ่มรายการ'}
            </h3>

            <form onSubmit={submit}>

              {/* ประเภทและหมวดหมู่ */}
              <div className="transaction-form-grid">

                <div>
                  <label>ประเภท</label>

                  <select
                    value={form.type}
                    onChange={(e) => {
                      e.target.setCustomValidity('');
                      changeType(e.target.value);
                    }}
                    onInvalid={(e) => e.target.setCustomValidity('โปรดระบุประเภท')}
                    disabled={!!editingId}
                    required
                  >
                    <option value="">โปรดเลือกประเภทรายการ</option>
                    <option value="expense">รายจ่าย</option>
                    <option value="income">รายรับ</option>
                  </select>

                  {editingId && (
                    <small className="muted" data-type-locked>
                      เปลี่ยนประเภทไม่ได้ ถ้าเลือกผิดให้ลบแล้วเพิ่มใหม่
                    </small>
                  )}
                </div>

                <div>
                  <label>หมวดหมู่</label>

                  <CategorySelect
                    categories={cats}
                    type={form.type}
                    value={form.category_id}
                    onChange={(v) => setForm({ ...form, category_id: v })}
                    onCreated={addCat}
                    extra={editExtra}
                    placeholder={form.type ? '-- เลือกหมวดหมู่ --' : '-- เลือกประเภทก่อน --'}
                    disabled={!form.type}
                    required
                  />
                </div>

              </div>

              {/* จำนวนเงินและวันที่ */}
              <div className="transaction-form-grid">

                <div>
                  <label>จำนวนเงิน</label>

                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        amount: e.target.value,
                      })
                    }
                    required
                  />
                </div>

                <div>
                  <label>วันที่</label>

                  <input
                    type="date"
                    value={form.transaction_date}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        transaction_date: e.target.value,
                      })
                    }
                    required
                  />
                </div>

              </div>

              {/* บันทึกช่วยจำ */}
              <div className="transaction-note-field">

                <label>บันทึกช่วยจำ</label>

                <input
                  type="text"
                  placeholder="ไม่บังคับ"
                  maxLength={200}
                  value={form.note}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      note: e.target.value,
                    })
                  }
                />

              </div>

              {/* แจ้งเตือนข้อผิดพลาดในฟอร์ม */}
              {formError && (
                <div className="alert">
                  {formError}
                </div>
              )}

              {/* ปุ่มยกเลิกและบันทึก */}
              <div className="transaction-form-actions">

                <button
                  type="button"
                  className="btn btn-light"
                  onClick={closeForm}
                  disabled={busy}
                >
                  ยกเลิก
                </button>

                <button
                  type="submit"
                  className="btn"
                  disabled={busy}
                >
                  {busy
                    ? 'กำลังบันทึก...'
                    : editingId
                      ? 'บันทึกการแก้ไข'
                      : 'เพิ่มรายการ'}
                </button>

              </div>

            </form>

          </div>

        </div>
      )}

      {/* =================================
          AI CONFIRMATION MODAL
      ================================= */}

      {showExport && <ExportCsvModal filter={filter} filterSummary={filterSummary} onClose={() => setShowExport(false)} />}

      {aiDraft && (
        <AiConfirmModal
          key={aiDraft.ai ? `${aiDraft.ai.event_id}-${aiDraft.ai.index}` : 'single'}
          draft={aiDraft}
          categories={activeCats}
          onCategoryCreated={addCat}
          onConfirm={confirmAiDraft}
          onSkip={skipAiDraft}
          onClose={closeAiQueue}
          aiStatus={aiStatus}
          onAiStatusChange={setAiStatus}
          onUseAiDrafts={(ds) => setAiQueue((q) => [...ds, ...q.slice(1)])}
        />
      )}

    </div>
  );
}
