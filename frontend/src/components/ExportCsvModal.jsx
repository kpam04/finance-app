import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

// หน้าต่าง "ส่งออก CSV": เลือกช่วงเดือน (เดือนเดียวหรือหลายเดือน) / ทั้งหมด / ตามตัวกรองที่เลือกอยู่ + ประเภท
// ช่วงเดือนเลือก เดือน + ปี (พ.ศ.) แยกกัน: ปีมีตั้งแต่ปีของรายการแรกถึงปีนี้ / เดือนของปีแรกเริ่มที่เดือนของรายการแรก
// เดือนของปีนี้ถึงเดือนปัจจุบัน / เดือนที่ไม่ได้บันทึกอยู่ระหว่างทางยังเลือกได้ตามปกติ (ขึ้นปีใหม่ ปีใหม่จะเพิ่มเองตามวันที่จริง)
// นับจำนวนรายการให้ดูก่อนดาวน์โหลด (ใช้ /transactions แบบ limit 1) แล้วดาวน์โหลดผ่าน /transactions/export
// ชื่อไฟล์ใช้ปี พ.ศ. ให้ตรงกับที่แสดงในแอป (วันที่ในไฟล์ยังเป็น ค.ศ. ให้ Excel อ่านเป็นวันที่ได้)

const pad = (n) => String(n).padStart(2, '0');
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const lastDay = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${pad(new Date(y, m, 0).getDate())}`;
};
const be = (iso) => `${Number(iso.slice(0, 4)) + 543}${iso.slice(4)}`; // 2026-11 -> 2569-11
const TYPE_TH = { income: 'รายรับ', expense: 'รายจ่าย' };
const TYPES = [['', 'ทั้งหมด'], ['income', 'รายรับ'], ['expense', 'รายจ่าย']];
const MONTH_TH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const ymOf = (y, m) => `${y}-${pad(m)}`;
const splitYm = (ym) => ym.split('-').map(Number);

const css = `
.xm-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0,0,0,0.45); }
.xm-box { width: 460px; max-width: 100%; max-height: 92vh; overflow-y: auto; padding: 22px; border-radius: 14px; background: #fff; box-shadow: 0 20px 50px rgba(0,0,0,0.25); }
.xm-box h3 { margin: 0 0 14px; }
.xm-sec { margin-bottom: 14px; }
.xm-label { display: block; margin-bottom: 6px; font-size: 13px; color: #4b5563; font-weight: 600; }
.xm-opt { display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px; border: 1px solid #E9E1D6; border-radius: 10px; margin-bottom: 8px; cursor: pointer; font-size: 14px; flex-direction: row; }
.xm-opt.on { border-color: var(--primary, #9AAB91); background: #F7F9F4; }
.xm-opt input { margin-top: 3px; flex: 0 0 auto; }
.xm-opt small { display: block; color: #8A8177; font-size: 12px; margin-top: 2px; }
.xm-range { display: grid; grid-template-columns: auto 1fr auto; gap: 8px 10px; align-items: center; margin-top: 10px; }
.xm-range > span { font-size: 13px; color: #8A8177; }
.xm-range select { width: 100%; margin: 0; }
.xm-range select.xm-year { width: 96px; }
.xm-seg { display: flex; background: #EEE7DC; border-radius: 10px; padding: 3px; }
.xm-seg button { flex: 1; border: none; background: none; padding: 7px 0; border-radius: 8px; font: inherit; font-size: 13px; cursor: pointer; color: #4b5563; }
.xm-seg button.on { background: #FFFDFA; color: var(--primary-dark, #74896F); font-weight: 700; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
.xm-seg button:disabled { cursor: not-allowed; opacity: 0.6; }
.xm-count { margin: 4px 0 14px; font-size: 13px; color: #4b5563; }
.xm-actions { display: flex; gap: 10px; }
@media (max-width: 420px) { .xm-range select.xm-year { width: 84px; } }
`;

export default function ExportCsvModal({ filter, filterSummary, onClose }) {
  const hasFilter = !!(filter && (filter.type || filter.category_id || filter.start || filter.end));
  const cur = thisMonth();
  const [curY, curM] = splitYm(cur);
  const [first, setFirst] = useState(cur); // เดือนของรายการแรก (ยังไม่รู้ = เดือนนี้)

  // หาเดือนของรายการแรก: รายการเรียงใหม่ไปเก่า หน้าสุดท้าย (limit 1) คือรายการเก่าสุด
  useEffect(() => {
    let live = true;
    api.getTransactions({ page: 1, limit: 1 })
      .then((r) => {
        const total = (r.pagination && r.pagination.total) || 0;
        return total > 0 ? api.getTransactions({ page: total, limit: 1 }) : null;
      })
      .then((r) => {
        const d = r && r.data && r.data[0] && r.data[0].transaction_date;
        if (live && d && d.slice(0, 7) < cur) setFirst(d.slice(0, 7));
      })
      .catch(() => {});
    return () => { live = false; };
  }, [cur]);

  const [firstY, firstM] = splitYm(first);
  const years = [];
  for (let y = firstY; y <= curY; y += 1) years.push(y);
  const monthsOf = (y) => {
    const lo = y === firstY ? firstM : 1;
    const hi = y === curY ? curM : 12;
    const out = [];
    for (let m = lo; m <= hi; m += 1) out.push(m);
    return out;
  };
  // เดือนที่เลือกต้องอยู่ในช่วงที่มี (เปลี่ยนปีแล้วเดือนเดิมไม่มี → ขยับไปเดือนที่ใกล้ที่สุด)
  const clampYm = (y, m) => {
    const ms = monthsOf(y);
    return ymOf(y, Math.min(ms[ms.length - 1], Math.max(ms[0], m)));
  };

  const [mode, setMode] = useState('range'); // range | all | filter
  const [from, setFrom] = useState(cur);
  const [to, setTo] = useState(cur);
  const [type, setType] = useState('');
  const [count, setCount] = useState(null); // null = กำลังนับ
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // ช่วงเดือน: ถ้าเลือกเดือนเริ่มหลังเดือนสิ้นสุด ให้ขยับอีกฝั่งตาม
  const pickFrom = (v) => { setFrom(v); if (v > to) setTo(v); };
  const pickTo = (v) => { setTo(v); if (v < from) setFrom(v); };
  const ymSelects = (value, onPick, label) => {
    const [y, m] = splitYm(value);
    return (
      <>
        <select aria-label={`${label}: เดือน`} value={m} onChange={(e) => onPick(clampYm(y, Number(e.target.value)))}>
          {monthsOf(y).map((mm) => <option key={mm} value={mm}>{MONTH_TH[mm - 1]}</option>)}
        </select>
        <select className="xm-year" aria-label={`${label}: ปี พ.ศ.`} value={y} onChange={(e) => onPick(clampYm(Number(e.target.value), m))}>
          {years.map((yy) => <option key={yy} value={yy}>{yy + 543}</option>)}
        </select>
      </>
    );
  };

  const params = useMemo(() => {
    if (mode === 'filter') return { ...filter };
    const p = type ? { type } : {};
    if (mode === 'range') return { ...p, start: `${from}-01`, end: lastDay(to) };
    return p;
  }, [mode, filter, type, from, to]);

  useEffect(() => {
    let live = true;
    setCount(null);
    setErr('');
    const t = setTimeout(() => {
      api.getTransactions({ ...params, page: 1, limit: 1 })
        .then((r) => { if (live) setCount((r.pagination && r.pagination.total) || 0); })
        .catch((e) => { if (live) { setCount(0); setErr(e.message); } });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [params]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const fileName = () => {
    const suffix = mode !== 'filter' && type ? `_${TYPE_TH[type]}` : '';
    if (mode === 'range') return `รายรับรายจ่าย_${from === to ? be(from) : `${be(from)}_ถึง_${be(to)}`}${suffix}.csv`;
    if (mode === 'all') return `รายรับรายจ่าย_ทั้งหมด_${be(todayIso())}${suffix}.csv`;
    return `รายรับรายจ่าย_ตามตัวกรอง_${be(todayIso())}.csv`;
  };

  const download = async () => {
    setBusy(true);
    setErr('');
    try {
      const blob = await api.exportTransactionsCsv(params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      onClose();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  // ตัวเลือกช่วงข้อมูล: ช่องเลือกเดือนวางนอก <label> (กันการคลิกในช่องเลือกเดือนไปสลับตัวเลือก)
  const opt = (value, title, note, extra) => (
    <div className={`xm-opt${mode === value ? ' on' : ''}`} data-xm-mode={value} style={{ flexDirection: 'column', alignItems: 'stretch', cursor: 'default' }}>
      <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 8, margin: 0, cursor: 'pointer' }}>
        <input type="radio" name="xm-mode" checked={mode === value} onChange={() => setMode(value)} />
        <span style={{ flex: 1, minWidth: 0 }}>
          {title}
          {note && <small>{note}</small>}
        </span>
      </label>
      {mode === value && extra}
    </div>
  );

  return (
    <div className="xm-overlay" data-export-modal onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <style>{css}</style>
      <div className="xm-box" role="dialog" aria-modal="true" aria-label="ส่งออก CSV">
        <h3>⬇️ ส่งออก CSV</h3>

        <div className="xm-sec">
          <span className="xm-label">ช่วงข้อมูล</span>
          {opt('range', 'ช่วงเดือน', 'เลือกเดือนเดียว หรือหลายเดือนต่อกัน', (
            <div className="xm-range" data-xm-range>
              <span>ตั้งแต่</span>
              {ymSelects(from, pickFrom, 'ตั้งแต่')}
              <span>ถึง</span>
              {ymSelects(to, pickTo, 'ถึง')}
            </div>
          ))}
          {opt('all', 'ทั้งหมด', 'ทุกรายการตั้งแต่เริ่มใช้')}
          {hasFilter && opt('filter', 'ตามตัวกรองที่เลือกอยู่', filterSummary || 'ตรงกับรายการที่เห็นในตาราง')}
        </div>

        <div className="xm-sec">
          <span className="xm-label">ประเภท</span>
          <div className="xm-seg" role="radiogroup" aria-label="ประเภทรายการ">
            {TYPES.map(([v, label]) => (
              <button
                key={v || 'all'}
                type="button"
                role="radio"
                aria-checked={(mode === 'filter' ? filter.type || '' : type) === v}
                className={(mode === 'filter' ? filter.type || '' : type) === v ? 'on' : ''}
                disabled={mode === 'filter'}
                onClick={() => setType(v)}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === 'filter' && <small style={{ display: 'block', marginTop: 4, color: '#8A8177', fontSize: 12 }}>ใช้ประเภทตามตัวกรองที่เลือกอยู่</small>}
        </div>

        <div className="xm-count" data-xm-count>
          {count === null ? 'กำลังนับรายการ...' : count === 0 ? 'ไม่มีรายการในช่วงนี้' : `จะส่งออก ${count.toLocaleString('th-TH')} รายการ`}
        </div>

        {err && <div className="alert" style={{ marginBottom: 12 }}>{err}</div>}

        <div className="xm-actions">
          <button type="button" className="btn btn-light" onClick={onClose} disabled={busy}>ยกเลิก</button>
          <button type="button" className="btn" style={{ flex: 1 }} data-xm-download onClick={download} disabled={busy || !count}>
            {busy ? 'กำลังส่งออก...' : '⬇️ ดาวน์โหลด'}
          </button>
        </div>
      </div>
    </div>
  );
}
