import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import InstallmentModal from './InstallmentModal.jsx';
import { IconEdit, IconTrash } from './PlanIcons.jsx';

// เนื้อหาแท็บ "รายการผ่อน" ในหน้าวางแผน
//  สรุปเดือนนี้ / แผนผ่อนจัดกลุ่มตามช่องทาง (หัวกลุ่ม = บิลของช่องทางนั้น กด "จ่ายทั้งบิล") / ผ่อนเสร็จแล้ว
//  การ์ดแต่ละรายการ: แก้ไข / ลบ / ปิดยอดก่อนกำหนด
//  ค้างชำระใช้สีส้มเข้ม (ทั้งแอปเลี่ยงสีแดงเพื่อไม่กดดันผู้ใช้)
const css = `
.in-sum { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
.in-sum .m { min-width: 0; padding: 12px 14px; border-radius: 12px; border: 1px solid #E6E0D4; background: #fff; }
.in-sum .l { font-size: 12px; color: #6b7280; }
.in-sum .v { margin-top: 2px; font-size: 20px; font-weight: 700; color: #3F3A34; overflow-wrap: anywhere; }
.in-sum .v.sm { font-size: 16px; }
.in-sum .s { margin-top: 2px; font-size: 12px; color: #8A8177; }
.in-sum .s.over { color: #C2410C; font-weight: 600; }
.in-sec { margin: 4px 0 10px; font-size: 14px; font-weight: 700; color: #4B4740; }
.in-bill { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; padding: 14px 16px; border-radius: 14px; border: 1px solid #E6E0D4; border-left: 4px solid #9AAB91; background: #fff; }
.in-bill.over { border-left-color: #C2410C; background: #FFF8F3; }
.in-bill-top { display: flex; align-items: center; gap: 6px 10px; flex-wrap: wrap; }
.in-bill-ch { font-weight: 700; color: #3F3A34; }
.in-bill-due { font-size: 12px; color: #6b7280; }
.in-tag { padding: 1px 8px; border-radius: 999px; background: #EEF1EA; color: #5E7558; font-size: 11px; font-weight: 700; white-space: nowrap; }
.in-tag.over { background: #FDE7D7; color: #9A3412; }
.in-tag.today { background: #FDF0DC; color: #92400e; }
.in-bill-tot { margin-left: auto; font-size: 18px; font-weight: 700; color: #3F3A34; }
.in-bill-items { display: grid; gap: 3px; font-size: 13px; color: #4B4740; }
.in-bill-items div { display: flex; justify-content: space-between; gap: 10px; }
.in-bill-items span:last-child { color: #6b7280; white-space: nowrap; }
.in-pay { align-self: flex-end; padding: 7px 16px; border: 1px solid #C9D4C2; border-radius: 999px; background: #fff; font: inherit; font-size: 13px; font-weight: 700; color: #5E7558; cursor: pointer; }
.in-pay:hover { border-color: #9AAB91; background: #F1F3ED; }
.in-bill.over .in-pay, .in-pay.solid { border-color: #7E9677; background: #7E9677; color: #fff; }
.in-bill.over .in-pay:hover, .in-pay.solid:hover { background: #6B8364; }
.in-empty { margin: 0 0 14px; padding: 14px 16px; border-radius: 12px; background: #F6F4EE; font-size: 13px; color: #6b7280; }
.in-plans { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; align-items: start; }
@media (max-width: 1023px) { .in-plans { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .in-plans { grid-template-columns: minmax(0, 1fr); } .in-sum { grid-template-columns: minmax(0, 1fr); gap: 8px; } .in-sum .m { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 8px; } .in-sum .l { width: 100%; } .in-bill { padding: 12px 14px; } }
.in-plan { position: relative; padding: 14px 16px; border-radius: 14px; border: 1px solid #E6E0D4; background: #fff; box-shadow: var(--shadow); }
.in-plan-name { padding-right: 28px; font-weight: 700; color: #3F3A34; overflow-wrap: anywhere; }
.in-chip { display: inline-block; margin-top: 4px; padding: 1px 8px; border-radius: 999px; background: #F3EFE6; color: #6b7280; font-size: 11px; }
.in-plan-pg { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-top: 10px; }
.in-plan-pg b { font-size: 18px; color: #3F3A34; }
.in-plan-pg span { font-size: 12px; color: #6b7280; }
.in-bar { height: 6px; margin: 6px 0 8px; border-radius: 999px; background: #EEE9DD; overflow: hidden; }
.in-bar i { display: block; height: 100%; border-radius: 999px; background: #7E9677; }
.in-row { display: flex; justify-content: space-between; gap: 8px; margin-top: 4px; font-size: 13px; }
.in-row span:first-child { color: #6b7280; }
.in-row b { color: #3F3A34; text-align: right; }
.in-row b.over { color: #C2410C; }
.in-menu-wrap { position: absolute; top: 8px; right: 8px; }
.in-more { width: 28px; height: 28px; border: none; border-radius: 8px; background: none; color: #9a9185; font-size: 18px; line-height: 1; cursor: pointer; }
.in-more:hover, .in-more[aria-expanded="true"] { background: #F3EFE6; color: #4b5563; }
.in-menu { position: absolute; top: 32px; right: 0; z-index: 20; display: grid; min-width: 160px; padding: 6px; border-radius: 12px; border: 1px solid #E6E0D4; background: #fff; box-shadow: 0 8px 24px rgba(0,0,0,0.12); }
.in-menu button { padding: 8px 10px; border: none; border-radius: 8px; background: none; font: inherit; font-size: 13px; color: #3F3A34; text-align: left; cursor: pointer; }
.in-menu button:hover { background: #F5F2EA; }
.in-menu button.danger { color: #b91c1c; }
.in-confirm { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 10px; font-size: 13px; }
.in-confirm small { width: 100%; color: #8A8177; }
.in-done { opacity: 0.95; background: #FBFAF6; }
.in-done-tag { display: inline-block; margin-top: 8px; padding: 1px 8px; border-radius: 999px; background: #E4F2E6; color: #166534; font-size: 11px; font-weight: 700; }
.in-msg { margin: 0 0 12px; padding: 8px 12px; border-radius: 8px; font-size: 13px; }
.in-msg.ok { background: #E4F2E6; color: #166534; }
.in-msg.err { background: #fef2f2; color: #b91c1c; }
.in-pm-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0,0,0,0.45); }
.in-pm { width: 100%; max-width: 420px; max-height: 100%; overflow-y: auto; box-sizing: border-box; padding: 20px; border-radius: 16px; background: #fff; box-shadow: 0 20px 50px rgba(0,0,0,0.25); }
.in-pm h3 { margin: 0 0 4px; }
.in-pm-sub { margin: 0 0 14px; font-size: 13px; color: #6b7280; }
.in-pm-row { display: grid; grid-template-columns: minmax(0, 1fr) 120px; align-items: center; gap: 10px; margin-bottom: 8px; font-size: 13px; }
.in-pm-row input { width: 100%; box-sizing: border-box; text-align: right; }
.in-pm-row small { display: block; color: #8A8177; }
.in-pm-total { display: flex; justify-content: space-between; margin: 12px 0; padding-top: 10px; border-top: 1px dashed #E6E0D4; font-weight: 700; }
.in-pm-date { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: #4b5563; }
.in-pm-note { margin: 10px 0 0; font-size: 12px; line-height: 1.6; color: #8A8177; }
.in-pm-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.in-grp { margin-bottom: 16px; padding: 12px; border-radius: 16px; border: 1px solid #E6E0D4; background: #FBFAF6; }
.in-grp.over { border-color: #F3CDB4; background: #FFF8F3; }
.in-grp-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.in-grp-name { font-size: 15px; font-weight: 700; color: #3F3A34; }
.in-grp-bills { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-left: auto; }
.in-grp-bill { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.in-chipd { padding: 2px 9px; border-radius: 999px; background: #EEF1EA; color: #5E7558; font-size: 12px; font-weight: 700; white-space: nowrap; }
.in-chipd.over { background: #FDE7D7; color: #9A3412; }
.in-chipd.today { background: #FDF0DC; color: #92400e; }
.in-chipd.none { background: #F3EFE6; color: #8A8177; font-weight: 600; }
.in-paybtn { padding: 6px 14px; border: 1px solid #C9D4C2; border-radius: 999px; background: #fff; font: inherit; font-size: 13px; font-weight: 700; color: #5E7558; cursor: pointer; white-space: nowrap; }
.in-paybtn:hover { border-color: #9AAB91; background: #F1F3ED; }
.in-paybtn.solid { border-color: #7E9677; background: #7E9677; color: #fff; }
.in-paybtn.solid:hover { background: #6B8364; }
@media (max-width: 640px) { .in-grp { padding: 10px; } .in-grp-bills { margin-left: 0; width: 100%; } .in-grp-bill { width: 100%; justify-content: space-between; } }
.in-tools { position: absolute; top: 8px; right: 8px; display: inline-flex; gap: 2px; }
.in-tools button { display: inline-flex; padding: 4px 5px; border: none; border-radius: 6px; background: none; color: #9a9185; cursor: pointer; }
.in-tools button:hover { color: #4b5563; background: #F3EFE6; }
.in-tools button.del:hover { color: #b91c1c; }
.in-plan-name { padding-right: 56px; }
.in-due { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 10px; padding-top: 8px; border-top: 1px dashed #E6E0D4; font-size: 13px; color: #6b7280; }
.in-card-foot { display: flex; justify-content: flex-end; margin-top: 10px; }
.in-payoff { display: inline-flex; align-items: center; gap: 6px; padding: 6px 13px; border: 1px solid #C9D4C2; border-radius: 999px; background: #fff; font: inherit; font-size: 13px; font-weight: 700; color: #5E7558; cursor: pointer; transition: border-color 0.2s, background 0.2s; }
.in-payoff:hover { border-color: #9AAB91; background: #F1F3ED; }
.in-saved { display: block; margin-top: 6px; font-size: 12px; color: #166534; }
.in-pm-row.off { opacity: 0.5; }
.in-pm-row .in-pm-name { display: flex; flex-direction: row; align-items: flex-start; gap: 8px; margin: 0; font-size: 13px; }
.in-pm-row input[type='checkbox'] { width: 16px; height: 16px; margin-top: 2px; accent-color: #7E9677; }
.in-po-box { display: grid; gap: 4px; margin: 0 0 12px; padding: 10px 12px; border-radius: 10px; background: #F6F4EE; font-size: 13px; }
.in-po-box div { display: flex; justify-content: space-between; gap: 8px; }
.in-po-box b { color: #3F3A34; }
.in-po-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; font-size: 13px; color: #4b5563; }
.in-po-saved { margin: 0 0 8px; padding: 8px 12px; border-radius: 8px; background: #E4F2E6; color: #166534; font-size: 13px; }
`;

const baht = (n) => `฿${(Math.round(Number(n) * 100) / 100).toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;
const thaiDay = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
};
const thaiDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
};
const todayIso = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

function dueTag(bill) {
  if (bill.overdue) return { cls: 'over', text: `ค้างชำระ ${-bill.days} วัน` };
  if (bill.days === 0) return { cls: 'today', text: 'ครบกำหนดวันนี้' };
  return { cls: '', text: `อีก ${bill.days} วัน` };
}

// ป๊อปอัปยืนยันการจ่ายบิล: แก้ยอดแต่ละชิ้น / ติ๊กออกชิ้นที่ยังไม่ได้จ่าย / วันที่จ่าย
function PayModal({ bill, onClose, onPaid }) {
  const [amounts, setAmounts] = useState(() => bill.items.map((it) => String(it.amount)));
  const [on, setOn] = useState(() => bill.items.map(() => true));
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const total = amounts.reduce((s, a, i) => s + (on[i] ? Number(a) || 0 : 0), 0);
  const changed = amounts.some((a, i) => on[i] && Number(a) !== bill.items[i].amount);
  const count = on.filter(Boolean).length;
  const submit = async (e) => {
    e.preventDefault();
    if (busy || count === 0) return;
    setError('');
    setBusy(true);
    try {
      const items = bill.items.map((it, i) => ({ plan_id: it.plan_id, n: it.n, amount: amounts[i] })).filter((_, i) => on[i]);
      const res = await api.payInstallments({ date, items });
      onPaid(res.data, res.message);
    } catch (err) {
      setError(err.message || 'บันทึกไม่สำเร็จ');
      setBusy(false);
    }
  };
  const multi = bill.items.length > 1;
  return (
    <div className="in-pm-overlay" data-pay-modal onClick={onClose}>
      <form className="in-pm" role="dialog" aria-modal="true" aria-labelledby="in-pm-title" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3 id="in-pm-title">จ่ายบิล {bill.channel_label}</h3>
        <p className="in-pm-sub">ครบกำหนด {thaiDate(bill.due_date)} · ตรวจยอดแล้วกดบันทึก แก้ยอดได้ถ้าจ่ายจริงไม่ตรง{multi ? ' ชิ้นที่ยังไม่ได้จ่าย ติ๊กออกได้' : ''}</p>
        {error && <p className="in-msg err" role="alert">{error}</p>}
        {bill.items.map((it, i) => (
          <div className={`in-pm-row${on[i] ? '' : ' off'}`} key={`${it.plan_id}-${it.n}`}>
            <label className="in-pm-name">
              {multi && <input type="checkbox" checked={on[i]} onChange={(e) => setOn((o) => o.map((x, j) => (j === i ? e.target.checked : x)))} aria-label={`จ่าย ${it.name}`} data-pay-check />}
              <span>{it.name}<small>งวด {it.n}/{it.months}</small></span>
            </label>
            <input type="number" inputMode="decimal" min="0.01" step="any" required={on[i]} disabled={!on[i]} value={amounts[i]} onChange={(e) => setAmounts((a) => a.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`ยอดที่จ่าย ${it.name}`} data-pay-amount />
          </div>
        ))}
        <div className="in-pm-total"><span>รวม{multi && count < bill.items.length ? ` (${count} จาก ${bill.items.length} ชิ้น)` : ''}</span><span>{baht(total)}</span></div>
        <label className="in-pm-date">
          วันที่จ่าย
          <input type="date" value={date} max={todayIso()} required onChange={(e) => setDate(e.target.value)} data-pay-date />
        </label>
        {changed && <p className="in-pm-note">ยอดที่ต่างจากงวด จะไปปรับที่งวดสุดท้าย (จ่ายเกิน → งวดท้ายลดลง / จ่ายขาด → งวดท้ายเพิ่มขึ้น และอาจมีค่าปรับจากผู้ให้ผ่อน)</p>}
        <p className="in-pm-note">ระบบจะบันทึกเป็นรายจ่ายแยกตามหมวดของแต่ละชิ้น</p>
        <div className="in-pm-actions">
          <button type="button" className="btn btn-light" onClick={onClose} disabled={busy}>ยกเลิก</button>
          <button type="submit" className="btn" disabled={busy || count === 0} data-pay-save>{busy ? 'กำลังบันทึก...' : 'บันทึกการจ่าย'}</button>
        </div>
      </form>
    </div>
  );
}

// ป๊อปอัปปิดยอดก่อนกำหนด: จ่ายยอดคงเหลือทั้งหมดครั้งเดียว (มักได้ส่วนลด) ส่วนต่าง = ประหยัดได้
function PayoffModal({ plan, onClose, onDone }) {
  const [amount, setAmount] = useState(String(plan.remaining));
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const left = plan.months - plan.paid_count;
  const saved = Math.round((plan.remaining - (Number(amount) || 0)) * 100) / 100;
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const res = await api.payoffInstallment(plan.plan_id, { amount, date });
      onDone(res.data, res.message);
    } catch (err) {
      setError(err.message || 'บันทึกไม่สำเร็จ');
      setBusy(false);
    }
  };
  return (
    <div className="in-pm-overlay" data-payoff-modal onClick={onClose}>
      <form className="in-pm" role="dialog" aria-modal="true" aria-labelledby="in-po-title" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3 id="in-po-title">ปิดยอด {plan.name}</h3>
        <p className="in-pm-sub">จ่ายยอดที่เหลือทั้งหมดครั้งเดียว ผู้ให้ผ่อนบางเจ้าลดดอกเบี้ยที่เหลือให้ กรอกยอดที่จ่ายจริงได้เลย</p>
        {error && <p className="in-msg err" role="alert">{error}</p>}
        <div className="in-po-box">
          <div><span>งวดที่เหลือ</span><b>{left} งวด</b></div>
          <div><span>ยอดคงเหลือตามตาราง</span><b>{baht(plan.remaining)}</b></div>
        </div>
        <label className="in-po-field">
          ยอดที่จ่ายปิดจริง (บาท)
          <input type="number" inputMode="decimal" min="0.01" step="any" required value={amount} onChange={(e) => setAmount(e.target.value)} data-payoff-amount />
        </label>
        <label className="in-po-field">
          วันที่จ่าย
          <input type="date" value={date} max={todayIso()} required onChange={(e) => setDate(e.target.value)} data-payoff-date />
        </label>
        {saved > 0 && <p className="in-po-saved" data-payoff-saved>ประหยัดได้ {baht(saved)}</p>}
        <p className="in-pm-note">ระบบจะบันทึกเป็นรายจ่าย 1 รายการ ปิดรายการผ่อนนี้ และเลิกกันเงินงวดที่เหลือในงบ</p>
        <div className="in-pm-actions">
          <button type="button" className="btn btn-light" onClick={onClose} disabled={busy}>ยกเลิก</button>
          <button type="submit" className="btn" disabled={busy} data-payoff-save>{busy ? 'กำลังบันทึก...' : 'ปิดยอด'}</button>
        </div>
      </form>
    </div>
  );
}

// คีย์ช่องทาง (ตรงกับหลังบ้าน): ช่องทาง + ชื่อบัตร/ร้าน (ไม่สนตัวพิมพ์เล็กใหญ่/ช่องว่าง)
const channelKey = (p) => `${p.channel}:${(p.channel_name || '').trim().toLowerCase().replace(/\s+/g, ' ')}`;

export default function InstallmentsPanel({ inst, view, categories, onCategoryCreated, onData, onReload, addSignal }) {
  const [modal, setModal] = useState(null); // null | { plan } (plan = null เพิ่มใหม่)
  const [payBill, setPayBill] = useState(null);
  const [payoff, setPayoff] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [msg, setMsg] = useState(null); // { ok, text }
  // กดปุ่ม "+ เพิ่มรายการผ่อน" ที่หัวข้อ (เปิดฟอร์มเฉพาะเมื่อค่าเปลี่ยนหลังแสดงแท็บนี้แล้ว ไม่เปิดเองตอนสลับแท็บกลับมา)
  const seenAdd = useRef(addSignal);
  useEffect(() => {
    if (addSignal !== seenAdd.current) { seenAdd.current = addSignal; setModal({ plan: null }); }
  }, [addSignal]);

  if (!inst) return <p>กำลังโหลดรายการผ่อน...</p>;
  const { summary, bills, plans, done } = inst;
  const catName = (id) => (categories.find((c) => String(c.category_id) === String(id)) || {}).name || '';
  const full = plans.length >= inst.max_active;

  // งวดในบิลเดือนนี้ของแต่ละแผน (ไว้แสดงแถบ "งวดนี้" ในการ์ด)
  const dueOf = new Map();
  for (const b of bills) for (const it of b.items) dueOf.set(it.plan_id, { bill: b, item: it });

  // จัดกลุ่มแผนตามช่องทาง: กลุ่มที่มีบิลค้างชำระก่อน → บิลใกล้ครบกำหนด → ไม่มีบิลเดือนนี้
  const groups = new Map();
  for (const p of plans) {
    const k = channelKey(p);
    const g = groups.get(k) || { key: k, label: p.channel_label, plans: [], bills: [] };
    g.plans.push(p);
    groups.set(k, g);
  }
  for (const b of bills) {
    const g = groups.get(b.key.split('|')[0]);
    if (g) g.bills.push(b);
  }
  const groupList = [...groups.values()].sort((a, b) => {
    const ao = a.bills.some((x) => x.overdue) ? 0 : a.bills.length ? 1 : 2;
    const bo = b.bills.some((x) => x.overdue) ? 0 : b.bills.length ? 1 : 2;
    if (ao !== bo) return ao - bo;
    const ad = a.bills[0] ? a.bills[0].due_date : '9999';
    const bd = b.bills[0] ? b.bills[0].due_date : '9999';
    return ad.localeCompare(bd) || a.label.localeCompare(b.label);
  });

  const del = async (p) => {
    try {
      const r = await api.deleteInstallment(p.plan_id);
      setConfirmDel(null);
      setMsg({ ok: true, text: r.message });
      await onReload();
    } catch (e) {
      setMsg({ ok: false, text: e.message || 'ลบไม่สำเร็จ' });
    }
  };

  const card = (p, isDone, showChannel) => {
    const pct = p.months ? Math.round((p.paid_count / p.months) * 100) : 0;
    const due = !isDone && dueOf.get(p.plan_id);
    const tag = due ? dueTag(due.bill) : null;
    const nextPer = p.schedule.find((s) => !s.paid);
    return (
      <div className={`in-plan${isDone ? ' in-done' : ''}`} key={p.plan_id} data-inst-plan>
        <div className="in-tools">
          {!isDone && <button type="button" aria-label={`แก้ไข ${p.name}`} title="แก้ไข" data-inst-edit onClick={() => setModal({ plan: p })}><IconEdit size={15} /></button>}
          <button type="button" className="del" aria-label={`ลบ ${p.name}`} title="ลบ" data-inst-del onClick={() => setConfirmDel(p.plan_id)}><IconTrash size={15} /></button>
        </div>
        <div className="in-plan-name">{p.name}</div>
        <span className="in-chip">{showChannel ? `${p.channel_label} · ` : ''}{catName(p.category_id) || 'ไม่ระบุหมวด'}</span>
        <div className="in-plan-pg">
          <b>งวด {p.paid_count}/{p.months}</b>
          <span>{nextPer || p.schedule[0] ? `งวดละ ${baht((nextPer || p.schedule[0]).scheduled)}` : ''}</span>
        </div>
        <div className="in-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`ความคืบหน้า ${p.name}`}><i style={{ width: `${pct}%` }} /></div>
        {isDone ? (
          <>
            <div className="in-row"><span>จ่ายรวม</span><b>{baht(p.paid_total + (p.down_payment || 0))}</b></div>
            {p.payoff ? (
              <span className="in-saved">ปิดยอดก่อนกำหนด {thaiDate(p.payoff.date)}{p.payoff.saved > 0 ? ` · ประหยัดได้ ${baht(p.payoff.saved)}` : ''}</span>
            ) : p.fee > 0 && <div className="in-row"><span>ดอกเบี้ย/ค่าธรรมเนียม</span><b>{baht(p.fee)}</b></div>}
            <span className="in-done-tag">✓ ผ่อนเสร็จ {thaiDate(p.closed_at)}</span>
          </>
        ) : (
          <>
            <div className="in-row"><span>เหลือต้องจ่าย</span><b>{baht(p.remaining)}</b></div>
            {p.next_due && !due && <div className="in-row"><span>งวดถัดไป</span><b>{thaiDay(p.next_due.due_date)} · {baht(p.next_due.amount)}</b></div>}
            {due && (
              <div className="in-due" data-inst-due>
                <span className={`in-chipd ${tag.cls}`}>{due.bill.overdue ? tag.text : `ครบ ${thaiDay(due.bill.due_date)}`}</span>
                <span>งวดนี้ {baht(due.item.amount)}</span>
              </div>
            )}
            {p.remaining > 0 && (
              <div className="in-card-foot">
                <button type="button" className="in-payoff" data-inst-payoff onClick={() => setPayoff(p)}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 6l7 6-7 6" /><path d="M12 6l7 6-7 6" /></svg>
                  ปิดยอดก่อนกำหนด
                </button>
              </div>
            )}
          </>
        )}
        {confirmDel === p.plan_id && (
          <div className="in-confirm" data-inst-confirm>
            <span>ลบรายการผ่อนนี้?</span>
            <button type="button" className="btn btn-sm btn-danger" data-inst-del-yes onClick={() => del(p)}>ลบ</button>
            <button type="button" className="btn btn-sm btn-light" onClick={() => setConfirmDel(null)}>ยกเลิก</button>
            <small>รายการรายจ่ายที่บันทึกจากงวดที่จ่ายไปแล้วยังอยู่ในหน้ารายการ</small>
          </div>
        )}
      </div>
    );
  };

  const addCard = (
    <button type="button" className="pl-add-card" style={{ minHeight: 150 }} data-inst-add disabled={full} onClick={() => setModal({ plan: null })}>
      <span className="pl-add-plus" aria-hidden="true">+</span>
      เพิ่มรายการผ่อน
      {full && <small>ครบ {inst.max_active} รายการแล้ว</small>}
    </button>
  );

  return (
    <div data-inst-panel>
      <style>{css}</style>
      {msg && <p className={`in-msg ${msg.ok ? 'ok' : 'err'}`} role="status">{msg.text}</p>}

      {view === 'done' ? (
        done.length === 0 ? (
          <p className="in-empty">ยังไม่มีรายการที่ผ่อนเสร็จ เมื่อจ่ายครบทุกงวดหรือปิดยอด รายการจะย้ายมาอยู่ที่นี่</p>
        ) : (
          <div className="in-plans" data-inst-done>{done.map((p) => card(p, true, true))}</div>
        )
      ) : (
        <>
          <div className="in-sum" data-inst-summary>
            <div className="m">
              <div className="l">ต้องจ่ายเดือนนี้</div>
              <div className="v">{baht(summary.due_month)}</div>
              <div className="s">{summary.due_month > 0 ? `จ่ายแล้ว ${baht(summary.paid_month)} · เหลือ ${baht(summary.left_month)}` : 'ไม่มีงวดที่ต้องจ่ายเดือนนี้'}</div>
            </div>
            <div className="m">
              <div className="l">ยอดผ่อนคงเหลือทั้งหมด</div>
              <div className="v">{baht(summary.remaining)}</div>
              <div className="s">{summary.active_count} รายการ</div>
            </div>
            <div className="m">
              <div className="l">บิลถัดไป</div>
              <div className="v sm">{summary.next_bill ? `${summary.next_bill.channel_label} · ${thaiDay(summary.next_bill.due_date)}` : '-'}</div>
              {summary.next_bill && <div className={`s${summary.next_bill.overdue ? ' over' : ''}`}>{dueTag(summary.next_bill).text} · {baht(summary.next_bill.total)}</div>}
            </div>
          </div>

          {plans.length === 0 ? (
            <div className="in-plans" data-inst-plans>{addCard}</div>
          ) : (
            <>
              {groupList.map((g) => {
                const over = g.bills.some((b) => b.overdue);
                return (
                  <section className={`in-grp${over ? ' over' : ''}`} key={g.key} data-inst-group aria-label={g.label}>
                    <div className="in-grp-head">
                      <span className="in-grp-name">{g.label}</span>
                      {g.bills.length === 0 && <span className="in-chipd none">ไม่มีบิลเดือนนี้</span>}
                      {g.bills.length > 0 && (
                        <div className="in-grp-bills">
                          {g.bills.map((b) => {
                            const tag = dueTag(b);
                            return (
                              <span className="in-grp-bill" key={b.key} data-inst-bill>
                                <span className={`in-chipd ${tag.cls}`}>บิล {thaiDay(b.due_date)} · {tag.text}</span>
                                <button type="button" className={`in-paybtn${b.days <= 0 ? ' solid' : ''}`} data-inst-pay onClick={() => setPayBill(b)}>
                                  {b.items.length > 1 ? 'จ่ายทั้งบิล' : 'จ่ายแล้ว'} {baht(b.total)}
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="in-plans">{g.plans.map((p) => card(p, false, false))}</div>
                  </section>
                );
              })}
            </>
          )}
        </>
      )}

      {modal && (
        <InstallmentModal
          plan={modal.plan}
          categories={categories}
          history={[...plans, ...done].map((p) => ({ name: p.name, category_id: p.category_id }))}
          onCategoryCreated={onCategoryCreated}
          onClose={() => setModal(null)}
          onSaved={async (d) => {
            const editing = !!modal.plan;
            setModal(null);
            setMsg({ ok: true, text: `${editing ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มรายการผ่อนแล้ว'}${d && d.warnings && d.warnings.length ? ` (${d.warnings.join(' ')})` : ''}` });
            await onReload();
          }}
        />
      )}
      {payBill && (
        <PayModal
          bill={payBill}
          onClose={() => setPayBill(null)}
          onPaid={(data, message) => { setPayBill(null); setMsg({ ok: true, text: message || 'บันทึกการจ่ายแล้ว' }); onData(data); }}
        />
      )}
      {payoff && (
        <PayoffModal
          plan={payoff}
          onClose={() => setPayoff(null)}
          onDone={(data, message) => { setPayoff(null); setMsg({ ok: true, text: message || 'ปิดยอดแล้ว' }); onData(data); }}
        />
      )}
    </div>
  );
}
