import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import CategorySelect from './CategorySelect.jsx';
import MonthPicker from './MonthPicker.jsx';
import { matchCategoryByKeyword } from '../utils/autoCategorize.js';

// ป๊อปอัปเพิ่ม/แก้ไขรายการผ่อน
//  กรอกยอดต่องวดตามที่แอปผู้ให้ผ่อนแสดง (ไม่มีตัวคำนวณจาก % ดอกเบี้ย)
//  ยอดรวมที่ต้องจ่าย (ไม่บังคับ): ใส่แล้วงวดสุดท้าย = ยอดรวม − ยอดต่องวด × (จำนวนงวด − 1)
//  ปิด "ทุกงวดยอดเท่ากัน" = กรอกยอดทีละงวดเอง
//  แก้ไขรายการที่จ่ายผ่านแอปไปแล้ว: แก้ได้เฉพาะชื่อ ช่องทาง หมวด วันครบกำหนด (ยอดและงวดล็อกไว้)
const css = `
.im-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0, 0, 0, 0.45); }
.im-box { width: 100%; max-width: 520px; max-height: 100%; overflow-y: auto; box-sizing: border-box; padding: 20px; border-radius: 16px; background: #fff; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25); }
.im-box h3 { margin: 0 0 14px; }
.im-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
@media (max-width: 340px) { .im-grid { grid-template-columns: 1fr; } }
@media (max-width: 480px) { .im-grid { gap: 0 8px; } .im-overlay { padding: 8px; align-items: flex-end; } .im-box { border-radius: 16px 16px 12px 12px; padding: 16px; } }
.im-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; min-width: 0; font-size: 14px; }
.im-field > span { font-size: 13px; color: #4b5563; }
.im-field > small { font-size: 12px; color: #8A8177; line-height: 1.5; }
.im-field input, .im-field select { width: 100%; box-sizing: border-box; min-width: 0; }
.im-switch { position: relative; display: flex; flex-direction: row; align-items: center; justify-content: flex-start; gap: 10px; margin: 2px 0 12px; font-size: 13px; color: #4b5563; cursor: pointer; }
.im-switch input { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; padding: 0; }
.im-switch i { position: relative; flex: none; width: 36px; height: 20px; border-radius: 999px; background: #D6D0C4; transition: background 0.2s; }
.im-switch i::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.2); transition: transform 0.2s; }
.im-switch input:checked + i { background: #7E9677; }
.im-switch input:checked + i::after { transform: translateX(16px); }
.im-switch input:focus-visible + i { outline: 2px solid #9AAB91; outline-offset: 2px; }
.im-table { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; margin: -4px 0 12px; }
.im-table label { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: #6b7280; }
.im-calc { display: grid; gap: 4px; margin: 4px 0 8px; padding: 10px 12px; border-radius: 10px; background: #F6F4EE; font-size: 13px; color: #4b5563; }
.im-calc div { display: flex; justify-content: space-between; gap: 8px; }
.im-calc b { color: #3F3A34; }
.im-warn { margin: 0 0 8px; padding: 8px 12px; border-radius: 8px; background: #FDF0DC; color: #92400e; font-size: 13px; line-height: 1.6; }
.im-note { margin: 0 0 8px; font-size: 12px; line-height: 1.6; color: #8A8177; }
.im-lock { margin: 0 0 12px; padding: 8px 12px; border-radius: 8px; background: #EEF2F8; color: #3b5b8f; font-size: 13px; line-height: 1.6; }
.im-span { grid-column: 1 / -1; }
.im-row3 { display: grid; grid-template-columns: minmax(0, 1fr) 84px; gap: 4px 8px; margin-bottom: 12px; font-size: 14px; }
.im-row3-l { font-size: 13px; color: #4b5563; }
.im-ym { display: flex; gap: 8px; min-width: 0; }
.im-ym-m { flex: 1; min-width: 0; }
.im-ym-y { width: 92px; flex: none; }
.im-row3 > input { width: 100%; box-sizing: border-box; text-align: center; }
.im-ym .cs-wrap { width: 100%; }
.im-auto { margin-left: 4px; padding: 0 7px; border-radius: 999px; background: #EEF1EA; color: #5E7558; font-size: 11px; font-style: normal; font-weight: 600; }
.im-relink { padding: 0; border: none; background: none; font: inherit; font-size: 12px; color: #5E7558; text-decoration: underline; cursor: pointer; }
.im-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.im-error { margin: 0 0 10px; padding: 8px 12px; border-radius: 8px; background: #fef2f2; color: #b91c1c; font-size: 13px; }
`;

const CHANNEL_OPTIONS = [
  { value: 'spaylater', label: 'SPayLater' },
  { value: 'lazpaylater', label: 'LazPayLater' },
  { value: 'tiktok', label: 'TikTok PayLater' },
  { value: 'credit_card', label: 'บัตรเครดิต' },
  { value: 'store', label: 'ผ่อนกับร้านค้า' },
  { value: 'other', label: 'อื่น ๆ' },
];
const NAME_HINT = { credit_card: 'ชื่อบัตร เช่น KBank (ไม่บังคับ)', store: 'ชื่อร้าน เช่น Power Buy (ไม่บังคับ)', other: 'ชื่อช่องทาง' };

const pad = (n) => String(n).padStart(2, '0');
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
const baht = (n) => `฿${(Math.round(n * 100) / 100).toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;
const MONTH_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
// ตัวเลือกเดือนของงวดแรก: ย้อนหลัง 24 เดือน ถึงล่วงหน้า 12 เดือน (เรียงใหม่ → เก่า)
function monthChoices(curYm) {
  const [y, m] = curYm.split('-').map(Number);
  const out = [];
  for (let i = 12; i >= -24; i -= 1) {
    const idx = y * 12 + (m - 1) + i;
    const yy = Math.floor(idx / 12);
    const mm = (idx % 12) + 1;
    out.push({ value: `${yy}-${pad(mm)}`, label: `${MONTH_SHORT[mm - 1]} ${yy + 543}` });
  }
  return out;
}
const MONTH_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const floor2 = (n) => Math.floor((Number(n) + 1e-9) * 100) / 100;
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// เดาหมวดจากชื่อสินค้า: 1) เคยผ่อนสินค้าชื่อคล้ายกัน ใช้หมวดเดิม 2) ตัวจัดหมวดของแอป (คำสำคัญ) 3) ช้อปปิ้ง (ผ่อนส่วนใหญ่เป็นการซื้อของ)
export function guessCategory(name, categories, history = []) {
  const n = norm(name);
  if (!n) return '';
  const word = n.split(' ')[0];
  const prev = history.find((h) => { const hn = norm(h.name); return hn && (hn === n || (word.length >= 3 && hn.split(' ')[0] === word)); });
  if (prev && categories.some((c) => String(c.category_id) === String(prev.category_id))) return prev.category_id;
  const kw = matchCategoryByKeyword(name, categories, 'expense');
  if (kw) return kw;
  const shop = categories.find((c) => c.type === 'expense' && /ช้อป|shopping/i.test(c.name));
  return shop ? shop.category_id : '';
}

const thisMonth = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 7);
const nextMonth = () => { const [y, m] = thisMonth().split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`; };

export default function InstallmentModal({ plan, categories, history = [], onCategoryCreated, onClose, onSaved }) {
  const editing = !!plan;
  const locked = editing && plan.has_app_payments;
  const [f, setF] = useState(() => (editing ? {
    name: plan.name, channel: plan.channel, channel_name: plan.channel_name || '', category_id: plan.category_id,
    price: String(plan.price), down_payment: plan.down_payment ? String(plan.down_payment) : '', months: String(plan.months),
    per_amount: String(plan.schedule[0] ? plan.schedule[0].scheduled : ''), total_payable: plan.total_payable ? String(plan.total_payable) : '',
    first_month: plan.first_month, due_day: String(plan.due_day), prepaid_count: String(plan.schedule.filter((s) => s.prepaid).length),
    equal: plan.equal, amounts: plan.schedule.map((s) => String(s.scheduled)),
  } : {
    name: '', channel: 'spaylater', channel_name: '', category_id: '', price: '', down_payment: '', months: '',
    per_amount: '', total_payable: '', first_month: nextMonth(), due_day: '', prepaid_count: '0', equal: true, amounts: [],
  }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [perAuto, setPerAuto] = useState(!editing); // ยอดต่องวดคำนวณให้อัตโนมัติ (หยุดเมื่อผู้ใช้พิมพ์เอง)
  const [catAuto, setCatAuto] = useState(!editing); // หมวดเลือกให้อัตโนมัติจากชื่อสินค้า (หยุดเมื่อผู้ใช้เลือกเอง)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e && e.target ? e.target.value : e }));
  const months = Math.max(0, Math.min(60, parseInt(f.months, 10) || 0));

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ยอดต่องวดอัตโนมัติ: ยอดรวมที่ต้องจ่าย ÷ งวด (ถ้ากรอก) ไม่งั้น (ราคา − ดาวน์) ÷ งวด ปัดลงเป็นสตางค์ เศษไปงวดสุดท้าย
  const autoBase = num(f.total_payable) > 0 ? num(f.total_payable) : num(f.price) - (num(f.down_payment) > 0 ? num(f.down_payment) : 0);
  useEffect(() => {
    if (!perAuto || !f.equal || locked) return;
    const v = months >= 1 && autoBase > 0 ? String(floor2(autoBase / months)) : '';
    setF((s) => (s.per_amount === v ? s : { ...s, per_amount: v }));
  }, [perAuto, f.equal, months, autoBase, locked]);

  // หมวดอัตโนมัติจากชื่อสินค้า
  useEffect(() => {
    if (!catAuto) return;
    const g = guessCategory(f.name, categories, history);
    setF((s) => (s.category_id === g ? s : { ...s, category_id: g }));
  }, [catAuto, f.name, categories, history]);

  // ตารางงวดเมื่อปิด "ทุกงวดยอดเท่ากัน": ปรับจำนวนช่องตามจำนวนงวด เติมยอดต่องวดไว้ให้
  useEffect(() => {
    if (f.equal) return;
    setF((s) => {
      const cur = s.amounts.slice(0, months);
      while (cur.length < months) cur.push(s.per_amount || '');
      return cur.length === s.amounts.length && cur.every((v, i) => v === s.amounts[i]) ? s : { ...s, amounts: cur };
    });
  }, [f.equal, months, f.per_amount]);

  // คำนวณสด: ตารางงวด / จ่ายรวม / ดอกเบี้ย-ค่าธรรมเนียม
  const calc = useMemo(() => {
    const per = num(f.per_amount);
    let amounts = null;
    if (months >= 1) {
      if (f.equal && per > 0) {
        amounts = Array.from({ length: months }, () => r2(per));
        const tot = num(f.total_payable) > 0 ? num(f.total_payable) : perAuto ? autoBase : NaN;
        if (tot > 0) amounts[months - 1] = r2(tot - per * (months - 1));
      } else if (!f.equal && f.amounts.length === months && f.amounts.every((a) => num(a) > 0)) {
        amounts = f.amounts.map((a) => r2(num(a)));
      }
    }
    if (!amounts) return null;
    const down = num(f.down_payment) > 0 ? num(f.down_payment) : 0;
    const total = r2(down + amounts.reduce((s, a) => s + a, 0));
    const price = num(f.price);
    const fee = price > 0 ? r2(total - price) : null;
    const last = amounts[amounts.length - 1];
    const warn = last <= 0
      ? 'ยอดรวมที่ต้องจ่ายน้อยกว่ายอดต่องวดรวมกัน ลองตรวจตัวเลขอีกครั้ง'
      : amounts.length >= 2 && Math.abs(last - amounts[0]) / amounts[0] > 0.5 ? `งวดสุดท้าย ${baht(last)} ต่างจากงวดอื่นมาก ลองตรวจยอดรวมที่ต้องจ่ายอีกครั้ง` : '';
    return { amounts, total, fee, feePct: fee !== null && price > 0 ? Math.round((fee / price) * 1000) / 10 : null, last, warn };
  }, [f, months, perAuto, autoBase]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const body = { name: f.name, channel: f.channel, channel_name: f.channel_name, category_id: f.category_id, due_day: f.due_day };
      if (!locked) {
        Object.assign(body, {
          price: f.price, down_payment: f.down_payment || 0, months: f.months, first_month: f.first_month,
          prepaid_count: f.prepaid_count || 0, equal: f.equal,
        });
        if (f.equal) {
          body.per_amount = f.per_amount;
          // ยอดต่องวดอัตโนมัติที่หารไม่ลงตัว: ส่งยอดรวมไปด้วย ให้เศษไปอยู่งวดสุดท้าย
          body.total_payable = f.total_payable || (perAuto && autoBase > 0 ? String(r2(autoBase)) : '');
        } else body.amounts = f.amounts;
      }
      const res = editing ? await api.updateInstallment(plan.plan_id, body) : await api.createInstallment(body);
      onSaved(res.data);
    } catch (err) {
      setError(err.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const nameHint = NAME_HINT[f.channel];
  return (
    <div className="im-overlay" data-inst-modal onClick={onClose}>
      <style>{css}</style>
      <form className="im-box" role="dialog" aria-modal="true" aria-labelledby="im-title" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3 id="im-title">{editing ? 'แก้ไขรายการผ่อน' : 'เพิ่มรายการผ่อน'}</h3>
        {error && <p className="im-error" role="alert" data-im-error>{error}</p>}
        {locked && <p className="im-lock">มีงวดที่จ่ายผ่านแอปแล้ว แก้ได้เฉพาะชื่อ ช่องทาง หมวด และวันครบกำหนด (ยอดและจำนวนงวดล็อกไว้)</p>}

        <div className="im-grid">
          <label className="im-field">
            <span>ชื่อสินค้า</span>
            <input type="text" value={f.name} maxLength={60} required placeholder="เช่น หูฟังไร้สาย" onChange={set('name')} data-im-name />
          </label>
          <label className="im-field">
            <span>ช่องทางผ่อน</span>
            <select value={f.channel} onChange={set('channel')} data-im-channel>
              {CHANNEL_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
        </div>
        {nameHint && (
          <label className="im-field">
            <span>{f.channel === 'other' ? 'ชื่อช่องทาง' : f.channel === 'credit_card' ? 'ชื่อบัตร' : 'ชื่อร้าน'}</span>
            <input type="text" value={f.channel_name} maxLength={40} required={f.channel === 'other'} placeholder={nameHint} onChange={set('channel_name')} data-im-channel-name />
            {f.channel !== 'other' && <small>ใส่ชื่อเพื่อแยกบิลของแต่ละบัตร/ร้าน รายการที่ชื่อเดียวกันและครบกำหนดวันเดียวกันจะรวมเป็นบิลเดียว</small>}
          </label>
        )}
        <div className="im-grid">
          <div className="im-field">
            <span>หมวด {catAuto && f.category_id && <em className="im-auto" data-im-cat-auto>ระบบเลือกให้</em>}</span>
            <CategorySelect categories={categories} type="expense" value={f.category_id} onChange={(v) => { setCatAuto(false); setF((s) => ({ ...s, category_id: v })); }} onCreated={onCategoryCreated} required />
          </div>
          <label className="im-field">
            <span>ราคาสินค้า (บาท)</span>
            <input type="number" inputMode="decimal" min="0.01" step="any" value={f.price} required disabled={locked} placeholder="ราคาเต็มก่อนผ่อน" onChange={set('price')} data-im-price />
          </label>
          <label className="im-field">
            <span>จำนวนงวด</span>
            <input type="number" inputMode="numeric" min="1" max="60" step="1" value={f.months} required disabled={locked} placeholder="เช่น 10" onChange={set('months')} data-im-months />
          </label>
          {f.equal && (
            <label className="im-field">
              <span>ยอดต่องวด (บาท) {perAuto && f.per_amount && <em className="im-auto" data-im-per-auto>คำนวณให้</em>}</span>
              <input type="number" inputMode="decimal" min="0.01" step="any" value={f.per_amount} required disabled={locked} placeholder="กรอกราคาและจำนวนงวด" onChange={(e) => { setPerAuto(false); set('per_amount')(e); }} data-im-per />
              {!locked && (perAuto
                ? f.per_amount && <small>ถ้าแอปผ่อนแสดงยอดต่างจากนี้ (เช่น มีดอกเบี้ย) แก้ได้เลย</small>
                : <small><button type="button" className="im-relink" data-im-per-recalc onClick={() => setPerAuto(true)}>คำนวณให้อีกครั้ง</button></small>)}
            </label>
          )}
          <div className="im-row3 im-span" data-im-row3>
            <span className="im-row3-l">งวดแรก (เดือน / ปี)</span>
            <span className="im-row3-l">ทุกวันที่</span>
            <div className="im-ym">
              {locked ? <input type="text" value={monthChoices(thisMonth()).find((o) => o.value === f.first_month)?.label || f.first_month} disabled /> : (() => {
              const range = monthChoices(thisMonth()).map((o) => o.value);
              const [sy, sm] = f.first_month.split('-').map(Number);
              const [cy, cm] = thisMonth().split('-').map(Number);
              const years = [...new Set(range.map((v) => Number(v.slice(0, 4))))].sort((x, z) => z - x);
              const monthsOf = (y) => range.filter((v) => Number(v.slice(0, 4)) === y).map((v) => Number(v.slice(5))).sort((x, z) => x - z);
              const ym = (y, m) => `${y}-${pad(m)}`;
              const pickYear = (y) => {
                const ms = monthsOf(y);
                const m = ms.includes(sm) ? sm : ms.reduce((best, x) => (Math.abs(x - sm) < Math.abs(best - sm) ? x : best), ms[0]);
                setF((s) => ({ ...s, first_month: ym(y, m) }));
              };
              return (
                <>
                  <div className="im-ym-m">
                    <MonthPicker options={monthsOf(sy).map((m) => ({ value: m, label: MONTH_FULL[m - 1] }))} value={sm} currentValue={sy === cy ? cm : null} onChange={(m) => setF((s) => ({ ...s, first_month: ym(sy, Number(m)) }))} ariaLabel="เดือนของงวดแรก" />
                  </div>
                  <div className="im-ym-y">
                    <MonthPicker options={years.map((y) => ({ value: y, label: String(y + 543) }))} value={sy} currentValue={null} onChange={(y) => pickYear(Number(y))} ariaLabel="ปีของงวดแรก (พ.ศ.)" />
                  </div>
                </>
              );
            })()}
            </div>
            <input type="number" inputMode="numeric" min="1" max="31" step="1" value={f.due_day} required placeholder="1–31" aria-label="ครบกำหนดทุกวันที่" onChange={set('due_day')} data-im-due />
          </div>
          <label className="im-field">
            <span>เงินดาวน์ (ไม่บังคับ)</span>
            <input type="number" inputMode="decimal" min="0" step="any" value={f.down_payment} disabled={locked} placeholder="0" onChange={set('down_payment')} data-im-down />
          </label>
          <label className="im-field">
            <span>จ่ายไปแล้วกี่งวด</span>
            <input type="number" inputMode="numeric" min="0" max={Math.max(0, months - 1)} step="1" value={f.prepaid_count} disabled={locked} onChange={set('prepaid_count')} data-im-prepaid />
            <small>งวดที่จ่ายก่อนเริ่มใช้แอป (ไม่สร้างรายการรายจ่ายย้อนหลัง)</small>
          </label>
        </div>

        {f.equal && (
          <label className="im-field">
            <span>ยอดรวมที่ต้องจ่าย (ไม่บังคับ)</span>
            <input type="number" inputMode="decimal" min="0.01" step="any" value={f.total_payable} disabled={locked} placeholder="ถ้าแอปผ่อนแสดงยอดรวม กรอกเพื่อให้งวดสุดท้ายตรง" onChange={set('total_payable')} data-im-total />
          </label>
        )}
        {!locked && (
          <label className="im-switch">
            <input type="checkbox" checked={f.equal} onChange={(e) => setF((s) => ({ ...s, equal: e.target.checked }))} data-im-equal />
            <i aria-hidden="true" />
            ทุกงวดยอดเท่ากัน
          </label>
        )}
        {!f.equal && !locked && months > 0 && (
          <div className="im-table" data-im-table>
            {f.amounts.map((a, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <label key={i}>
                งวดที่ {i + 1}
                <input type="number" inputMode="decimal" min="0.01" step="any" value={a} required onChange={(e) => setF((s) => ({ ...s, amounts: s.amounts.map((x, j) => (j === i ? e.target.value : x)) }))} />
              </label>
            ))}
          </div>
        )}

        {calc && (
          <>
            {calc.warn && <p className="im-warn" data-im-warn>{calc.warn}</p>}
            <div className="im-calc" data-im-calc>
              <div><span>จ่ายรวม{num(f.down_payment) > 0 ? ' (รวมเงินดาวน์)' : ''}</span><b>{baht(calc.total)}</b></div>
              {calc.fee !== null && <div><span>ดอกเบี้ย/ค่าธรรมเนียมรวม</span><b>{calc.fee >= 0 ? `${baht(calc.fee)} (${calc.feePct}%)` : `จ่ายน้อยกว่าราคา ${baht(-calc.fee)}`}</b></div>}
              <div><span>ภาระผ่อนต่อเดือน</span><b>{f.equal ? baht(calc.amounts[0]) : `${baht(Math.min(...calc.amounts))}–${baht(Math.max(...calc.amounts))}`}</b></div>
              {f.equal && calc.last !== calc.amounts[0] && calc.last > 0 && <div><span>งวดสุดท้าย</span><b>{baht(calc.last)}</b></div>}
            </div>
          </>
        )}
        {f.channel === 'credit_card' && <p className="im-note">ผ่อนผ่านบัตรเครดิต: ตอนจ่ายบิลบัตร ไม่ต้องบันทึกยอดบิลซ้ำ ระบบบันทึกรายจ่ายให้ทีละงวดเมื่อกด “จ่ายแล้ว”</p>}
        <p className="im-note">ระบบไม่บันทึกรายจ่ายเต็มราคาวันซื้อ แต่บันทึกตามงวดที่จ่ายจริงเมื่อกด “จ่ายแล้ว”</p>

        <div className="im-actions">
          <button type="button" className="btn btn-light" onClick={onClose} disabled={busy}>ยกเลิก</button>
          <button type="submit" className="btn" disabled={busy} data-im-save>{busy ? 'กำลังบันทึก...' : 'บันทึก'}</button>
        </div>
      </form>
    </div>
  );
}
