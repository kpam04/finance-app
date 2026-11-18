import { useEffect, useRef, useState } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';
import { baht, num1, catLevel, ratioLabel, LEVEL_COLORS } from '../utils/planFormat.js';
import { IconWarning, IconPiggy, IconRepeat, IconTarget, IconCheckCircle, IconChart } from './PlanIcons.jsx';

// การ์ด "บทวิเคราะห์อัตโนมัติ" บนแดชบอร์ด แบบไทล์ 4 ช่อง (เห็นแล้วรู้ทันที ไม่ต้องอ่านเป็นประโยค)
// stats = /dashboard/insights (ทุกเดือน) / plan = /plan/summary (เฉพาะเดือนปัจจุบัน ไม่มี = null)
// คำแนะนำจาก AI ไม่แสดงที่นี่ (ดูที่หน้าวางแผน)
const css = `
.it-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.it-t { position: relative; min-width: 0; border-radius: 12px; background: #FAF8F4; border: 1px solid #EFE9DF; transition: border-color .15s, box-shadow .15s; }
.it-t.link:hover { border-color: #DCD3C5; box-shadow: 0 2px 8px rgba(100,82,60,.08); }
.it-main { display: flex; align-items: center; gap: 12px; min-width: 0; height: 100%; box-sizing: border-box; padding: 12px 30px 12px 12px; border-radius: 12px; color: inherit; text-decoration: none; }
.it-main > div { min-width: 0; }
.it-info { position: absolute; top: 6px; right: 6px; z-index: 2; display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; padding: 0; border: none; border-radius: 999px; background: transparent; color: #B3AA9C; cursor: pointer; transition: background .15s, color .15s; }
.it-info:hover, .it-info[aria-expanded="true"] { background: #EEE8DD; color: #6b6358; }
.it-info:focus-visible { outline: 2px solid #9AAB91; outline-offset: 1px; }
.it-pop { position: absolute; top: 32px; right: 0; z-index: 20; width: 290px; max-width: calc(100vw - 32px); box-sizing: border-box; padding: 12px 14px; border-radius: 12px; background: #fff; border: 1px solid #E6DFD3; box-shadow: 0 8px 24px rgba(60,48,36,.16); font-size: 12.5px; line-height: 1.55; color: #4B4740; text-align: left; cursor: default; }
.it-pop h4 { margin: 0 0 6px; font-size: 13px; color: #3F3A34; }
.it-pop dl { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px 12px; margin: 0; }
.it-pop dt { color: #6b6358; }
.it-pop dd { margin: 0; text-align: right; font-weight: 600; white-space: nowrap; color: #3F3A34; }
.it-pop .tot { padding-top: 4px; border-top: 1px dashed #E6DFD3; font-weight: 700; color: #3F3A34; }
.it-pop .tot + dd { padding-top: 4px; border-top: 1px dashed #E6DFD3; }
.it-pop p { margin: 8px 0 0; color: #8A8177; font-size: 12px; }
@media (hover: hover) and (min-width: 481px) { .it-t:has(.it-info:hover) .it-pop.hov { display: block; } }
.it-pop.hov { display: none; }
.it-tiles > .it-t:nth-child(odd) .it-pop { right: auto; left: 0; }
@media (max-width: 480px) { .it-pop, .it-tiles > .it-t:nth-child(odd) .it-pop { position: fixed; top: auto; left: 16px; right: 16px; bottom: 16px; width: auto; max-width: none; } }
.it-t small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; line-height: 1.45; color: #8A8177; }
.it-t .v { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 20px; font-weight: 700; line-height: 1.25; color: #3F3A34; }
.it-t .s { font-weight: 600; }
.it-ic { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 42px; height: 42px; border-radius: 12px; background: #EEF1EA; color: #74896F; }
.it-ring { flex: none; display: block; }
.it-row { display: flex; align-items: center; gap: 10px; margin-top: 10px; padding: 10px 12px; border-radius: 12px; background: #FAF8F4; border: 1px solid #EFE9DF; font-size: 13px; color: #4B4740; text-decoration: none; }
.it-row .it-ic { width: 32px; height: 32px; border-radius: 9px; }
.it-row .tx { flex: 1; min-width: 0; }
.it-row .tx b { color: #3F3A34; }
.it-row .pc { font-weight: 700; white-space: nowrap; }
.it-bar { height: 6px; margin-top: 5px; border-radius: 3px; background: #ECE6DA; overflow: hidden; }
.it-bar i { display: block; height: 100%; border-radius: 3px; background: #9AAB91; }
.it-act { flex: none; padding: 4px 12px; border-radius: 999px; background: #7E9677; color: #fff; font-size: 12px; font-weight: 600; white-space: nowrap; text-decoration: none; }
.it-act:hover { background: #6B8264; }
.it-act.ghost { background: #fff; border: 1px solid #C9D4C2; color: #5E7558; }
.it-act.ghost:hover { border-color: #9AAB91; background: #F3F6F0; }
.it-empty { margin: 0; padding: 14px; border-radius: 12px; background: #FAF8F4; font-size: 13.5px; color: #8A8177; text-align: center; }
@media (max-width: 480px) {
  .it-tiles { gap: 8px; }
  .it-main { flex-direction: column; align-items: flex-start; gap: 6px; padding: 10px 26px 10px 10px; }
  .it-t small { white-space: normal; }
  .it-t .v { font-size: 16.5px; }
  .it-t small { font-size: 11px; }
  .it-ic { width: 32px; height: 32px; border-radius: 9px; }
  .it-ic svg { width: 17px; height: 17px; }
  .it-ring { width: 36px; height: 36px; }
  .it-row .it-ic { width: 30px; height: 30px; }
}
`;

// โทนสีตามระดับ (ใช้ชุดเดียวกับเกณฑ์สีของหน้าวางแผน)
const TONE = {
  ok: { fg: LEVEL_COLORS.ok.text, bg: '#E6EFE2' },
  near: { fg: LEVEL_COLORS.near.text, bg: '#F7EDCB' },
  hit: { fg: LEVEL_COLORS.hit.text, bg: '#FBE6D6' },
  over: { fg: LEVEL_COLORS.over.text, bg: '#F8DDE4' },
  none: { fg: '#74896F', bg: '#EEF1EA' },
};
const pctTone = (pct) => (pct > 100 ? 'over' : pct >= 85 ? 'hit' : 'ok'); // รายจ่ายเทียบรายรับ

function SafeLink({ to, children, ...rest }) {
  const inRouter = useInRouterContext();
  return inRouter ? <Link to={to} {...rest}>{children}</Link> : <a href={to} {...rest}>{children}</a>;
}

// วงแหวน % (เกิน 100% เต็มวง)
function Ring({ pct, tone }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const w = Math.max(0, Math.min(100, pct)) / 100 * c;
  const t = TONE[tone];
  return (
    <svg className="it-ring" width="46" height="46" viewBox="0 0 46 46" aria-hidden="true">
      <circle cx="23" cy="23" r={r} fill="none" stroke="#ECE6DA" strokeWidth="5" />
      {w > 0 && <circle cx="23" cy="23" r={r} fill="none" stroke={tone === 'ok' ? '#9AAB91' : t.fg} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${w} ${c}`} transform="rotate(-90 23 23)" />}
      <text x="23" y="27" textAnchor="middle" fontSize={pct >= 100 ? 10 : 11} fontWeight="700" fill={t.fg}>{Math.round(pct)}%</text>
    </svg>
  );
}

const Arrow = ({ dir }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {dir === 'flat' ? <path d="M5 12h14M15 8l4 4-4 4" /> : dir === 'down' ? <><path d="M12 5v14" /><path d="M6 13l6 6 6-6" /></> : <><path d="M12 19V5" /><path d="M6 11l6-6 6 6" /></>}
  </svg>
);

const InfoIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5" /><path d="M12 11v5.5" /><path d="M12 7.5h.01" /></svg>
);

// กล่องวิธีคำนวณ: rows = [[ชื่อ, ค่า, 'tot'?], ...] / note = หมายเหตุท้ายกล่อง
function InfoPop({ title, rows, note, id }) {
  return (
    <div className="it-pop-in">
      <h4>{title}</h4>
      <dl>
        {rows.map(([k, v, cls], i) => (
          <div key={i} style={{ display: 'contents' }}>
            <dt className={cls || undefined}>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {note && <p>{note}</p>}
    </div>
  );
}

function Tile({ to, icon, tone = 'none', label, value, valueTone, sub, subTone, data, info }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  // แตะนอกกล่อง / กด Esc = ปิด
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (e.type === 'keydown' ? e.key === 'Escape' : !(ref.current && ref.current.contains(e.target))) setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close); document.removeEventListener('keydown', close); };
  }, [open]);
  const body = (
    <>
      {icon && typeof icon === 'object' && icon.ring !== undefined
        ? <Ring pct={icon.ring} tone={tone} />
        : <span className="it-ic" style={{ background: TONE[tone].bg, color: TONE[tone].fg }}>{icon}</span>}
      <div>
        <small>{label}</small>
        <div className="v" style={valueTone ? { color: TONE[valueTone].fg } : undefined}>{value}</div>
        {sub && <small className={subTone ? 's' : ''} style={subTone ? { color: TONE[subTone].fg } : undefined}>{sub}</small>}
      </div>
    </>
  );
  const popId = `it-pop-${data}`;
  return (
    <div className={`it-t${to ? ' link' : ''}`} data-it={data} ref={ref}>
      {to ? <SafeLink to={to} className="it-main">{body}</SafeLink> : <div className="it-main">{body}</div>}
      {info && (
        <>
          <button type="button" className="it-info" aria-label={`วิธีคำนวณ: ${label}`} aria-expanded={open} aria-controls={popId} data-it-info onClick={() => setOpen((v) => !v)}>
            <InfoIcon />
          </button>
          <div className={`it-pop${open ? '' : ' hov'}`} id={popId} role="dialog" aria-label={`วิธีคำนวณ: ${label}`} data-it-pop>
            <InfoPop {...info} />
          </div>
        </>
      )}
    </div>
  );
}

export default function InsightTiles({ stats, plan, isCurrent }) {
  if (!stats) return null;
  const p = isCurrent && plan && plan.has_data ? plan : null;
  const tiles = [];
  const dt = p && p.projection && p.projection.detail;
  // ที่มาของรายรับอ้างอิง (ใช้ในกล่องวิธีคำนวณ)
  const incomeNote = (ref) => {
    if (!dt) return null;
    if (dt.income_source === 'avg_spike') return `รายรับอ้างอิงใช้ค่าเฉลี่ย ${dt.base_months} เดือนก่อน (${baht(dt.income_avg)}) เพราะรายรับเดือนนี้ ${baht(dt.income_month)} สูงกว่าค่าเฉลี่ยเกิน 1.5 เท่า อาจมีเงินเดือนเข้าซ้อน`;
    if (dt.income_source === 'avg') return `รายรับอ้างอิงใช้ค่าเฉลี่ย ${dt.base_months} เดือนก่อน (${baht(ref)}) เพราะรายรับเดือนนี้ยังเข้าไม่ครบ (ตอนนี้ ${baht(dt.income_month)})`;
    return `รายรับอ้างอิงใช้รายรับเดือนนี้ (${baht(ref)}) เพราะมากกว่าค่าเฉลี่ยเดือนก่อน ๆ`;
  };

  // 1) รายจ่าย: เดือนปัจจุบัน = คาดสิ้นเดือน / เดือนที่ผ่านมา = รายจ่ายทั้งเดือน (วงแหวน = % ของรายรับ)
  const proj = p && p.projection && p.projection.expense_end !== null && p.projection.expense_end !== undefined ? p.projection : null;
  if (proj) {
    const has = proj.income_ref > 0;
    const tone = has ? pctTone(proj.pct_of_income) : 'none';
    tiles.push(<Tile key="proj" data="proj" to="/plan" tone={tone} icon={has ? { ring: proj.pct_of_income } : <IconChart size={20} />} label="คาดรายจ่ายสิ้นเดือน" value={baht(proj.expense_end)} sub={has ? `จากรายรับ ${baht(proj.income_ref)}` : 'ยังไม่มีรายรับให้เทียบ'} />);
  } else if (stats.expense > 0) {
    const has = stats.income > 0;
    const pct = has ? (stats.expense / stats.income) * 100 : 0;
    const tone = has ? pctTone(pct) : 'none';
    tiles.push(<Tile key="exp" data="exp" tone={tone} icon={has ? { ring: pct } : <IconChart size={20} />} label={isCurrent ? 'รายจ่ายเดือนนี้' : 'รายจ่ายทั้งเดือน'} value={baht(stats.expense)} sub={has ? `จากรายรับ ${baht(stats.income)}` : 'ไม่มีรายรับในเดือนนั้น'} info={{
      title: 'คิดอย่างไร',
      rows: [['รายจ่าย', baht(stats.expense)], ['รายรับ', baht(stats.income)], ...(has ? [['รายจ่าย ÷ รายรับ', `${num1(pct)}%`, 'tot']] : [])],
      note: isCurrent ? 'นับเฉพาะรายการที่บันทึกถึงวันนี้' : null,
    }} />);
  }

  // 2) เทียบเดือนก่อน (ต่างไม่เกิน 5% = ใกล้เคียง)
  if (stats.diff_pct !== null && stats.diff_pct !== undefined && stats.expense > 0) {
    const d = stats.diff_pct;
    const dir = d > 5 ? 'up' : d < -5 ? 'down' : 'flat';
    const tone = dir === 'up' ? 'hit' : dir === 'down' ? 'ok' : 'none';
    const amt = Math.abs(stats.diff_amount || 0);
    tiles.push(<Tile key="diff" data="diff" tone={tone} icon={<Arrow dir={dir} />} label="รายจ่ายเทียบเดือนก่อน" value={`${d > 0 ? '+' : d < 0 ? '−' : ''}${num1(Math.abs(d))}%`} valueTone={dir === 'flat' ? undefined : tone} sub={dir === 'down' ? `ใช้น้อยลง ${baht(amt)}` : dir === 'up' ? `ใช้มากขึ้น ${baht(amt)}` : 'ใกล้เคียงเดือนก่อน'} />);
  }

  // 3) หมวดที่ต้องระวัง: เกินยอดปกติ -> เกินงบ -> ทุกหมวดปกติ -> หมวดที่ใช้มากสุด
  const levels = (p && p.cat_levels) || [];
  const flagged = levels.filter((c) => catLevel(c) === 'over').sort((a, b) => (b.amount / b.expected_to_date) - (a.amount / a.expected_to_date))[0];
  const bOver = (stats.budget_over || [])[0];
  if (flagged) {
    tiles.push(<Tile key="watch" data="watch-normal" to="/plan" tone="over" icon={<IconWarning size={20} />} label="หมวดที่ต้องระวัง" value={flagged.name} sub={`${ratioLabel(flagged.amount / flagged.expected_to_date)}ของปกติ`} subTone="over" info={{
      title: `ทำไม “${flagged.name}” ต้องระวัง`,
      rows: [
        ['ใช้ไปแล้วเดือนนี้', baht(flagged.amount)],
        ['ยอดปกติถึงวันนี้', baht(flagged.expected_to_date)],
      ],
    }} />);
  } else if (bOver) {
    tiles.push(<Tile key="watch" data="watch-budget" to="/budgets" tone="hit" icon={<IconWarning size={20} />} label="หมวดที่เกินงบ" value={bOver.name} sub={`เกินงบ ${baht(bOver.over_amount)}${stats.budget_over.length > 1 ? ` · อีก ${stats.budget_over.length - 1} หมวด` : ''}`} subTone="hit" info={{
      title: `งบหมวด “${bOver.name}”`,
      rows: [
        ['งบที่ตั้งไว้', baht(bOver.limit)],
        ['ใช้ไปแล้ว', baht(bOver.spent)],
        ['เกินงบ', baht(bOver.over_amount), 'tot'],
        ['ใช้ไปเทียบงบ', `${num1(bOver.used_pct)}%`],
      ],
      note: stats.budget_over.length > 1 ? `หมวดอื่นที่เกินงบ: ${stats.budget_over.slice(1).map((x) => x.name).join(', ')}` : null,
    }} />);
  } else if (levels.length > 0) {
    tiles.push(<Tile key="watch" data="watch-ok" to="/plan" tone="ok" icon={<IconCheckCircle size={20} />} label="พฤติกรรมการใช้จ่าย" value="ปกติทุกหมวด" sub="ไม่มีหมวดเกินยอดปกติ" subTone="ok" info={{
      title: 'ปกติทุกหมวดหมายถึงอะไร',
      rows: [['หมวดที่มียอดปกติให้เทียบ', `${levels.length} หมวด`], ['หมวดที่เกินยอดปกติ', '0 หมวด', 'tot']],
      note: 'แต่ละหมวดเทียบกับค่าเฉลี่ย 3 เดือนก่อน ปรับตามวันที่ผ่านไป ถือว่าเกินเมื่อสูงกว่า 1.3 เท่าและเกินอย่างน้อย ฿200',
    }} />);
  } else if (stats.top) {
    tiles.push(<Tile key="watch" data="watch-top" tone="none" icon={<IconChart size={20} />} label="หมวดที่ใช้มากสุด" value={stats.top.name} sub={`${num1(stats.top.pct)}% ของรายจ่าย`} info={{
      title: 'หมวดที่ใช้มากสุด',
      rows: [[stats.top.name, baht(stats.top.total)], ['รายจ่ายทั้งหมด', baht(stats.expense)], ['สัดส่วน', `${num1(stats.top.pct)}%`, 'tot']],
      note: 'ยังไม่มีประวัติพอจะเทียบกับยอดปกติ จึงแสดงหมวดที่ใช้มากสุดแทน',
    }} />);
  }

  // 4) การออม: เดือนปัจจุบัน = คาดว่าจะออมได้ (จากยอดคาดสิ้นเดือนกับรายรับอ้างอิง ใช้ได้แม้เงินเดือนเข้าปลายเดือน)
  //    เดือนที่ผ่านมา / ยังคาดการณ์ไม่ได้ = อัตราการออมจริงของเดือนนั้น
  if (proj && proj.income_ref > 0) {
    const left = proj.income_ref - proj.expense_end;
    const r = (left / proj.income_ref) * 100;
    const tone = r < 0 ? 'over' : r < 10 ? 'hit' : 'ok';
    tiles.push(<Tile key="save" data="save-proj" to="/plan" tone={tone} icon={<IconPiggy size={20} />} label="คาดว่าจะออมได้" value={`${r < 0 ? '−' : ''}${num1(Math.abs(r))}%`} valueTone={tone} sub={left < 0 ? `ใช้เกินรายรับราว ${baht(-left)}` : `เหลือราว ${baht(left)} สิ้นเดือน`} info={{
      title: 'คาดว่าจะออมได้คิดอย่างไร',
      rows: [
        ['รายรับอ้างอิง', baht(proj.income_ref)],
        ['คาดรายจ่ายสิ้นเดือน', `−${baht(proj.expense_end)}`],
        ['คาดว่าเหลือ', `${left < 0 ? '−' : ''}${baht(Math.abs(left))}`, 'tot'],
        ['คาดว่าเหลือ ÷ รายรับอ้างอิง', `${r < 0 ? '−' : ''}${num1(Math.abs(r))}%`],
      ],
      note: incomeNote(proj.income_ref) || 'รายรับอ้างอิง = ค่าที่มากกว่าระหว่างรายรับเดือนนี้กับค่าเฉลี่ย 3 เดือนก่อน',
    }} />);
  } else if (stats.saving_rate !== null && stats.saving_rate !== undefined) {
    const r = stats.saving_rate;
    const tone = r < 0 ? 'over' : r < 10 ? 'hit' : 'ok';
    tiles.push(<Tile key="save" data="save" tone={tone} icon={<IconPiggy size={20} />} label={isCurrent ? 'อัตราการออมเดือนนี้' : 'อัตราการออม'} value={`${r < 0 ? '−' : ''}${num1(Math.abs(r))}%`} valueTone={tone} sub={r < 0 ? 'ใช้เกินรายรับ' : 'ของรายรับ'} info={{
      title: 'อัตราการออมคิดอย่างไร',
      rows: [
        ['รายรับ', baht(stats.income)],
        ['รายจ่าย', `−${baht(stats.expense)}`],
        ['เหลือ', `${stats.income - stats.expense < 0 ? '−' : ''}${baht(Math.abs(stats.income - stats.expense))}`, 'tot'],
        ['เหลือ ÷ รายรับ', `${r < 0 ? '−' : ''}${num1(Math.abs(r))}%`],
      ],
      note: 'เป็นส่วนต่างของรายรับกับรายจ่าย ไม่ได้ดูว่าโอนเข้าบัญชีออมแล้วหรือยัง',
    }} />);
  }

  const rec = p && p.rec_suggest;
  const goal = p && p.goal;
  return (
    <div data-insight-tiles>
      <style>{css}</style>
      {tiles.length < 2 ? (
        <p className="it-empty" data-it-empty>บันทึกรายการเพิ่มอีกนิด แล้วระบบจะเริ่มสรุปให้</p>
      ) : (
        <div className="it-tiles">{tiles}</div>
      )}
      {rec && (
        <div className="it-row" data-it-rec>
          <span className="it-ic"><IconRepeat size={17} /></span>
          <span className="tx">
            {rec.count > 1
              ? <>พบ <b>{rec.count} รายการ</b> ที่น่าจะเป็นรายการประจำ เช่น {rec.note}</>
              : <><b>{rec.note} {baht(rec.amount)}</b> น่าจะเป็นรายการประจำ</>}
          </span>
          <SafeLink to="/recurring" className="it-act">ตั้งเลย</SafeLink>
        </div>
      )}
      {p && (goal ? (
        <SafeLink to="/plan?tab=goals" className="it-row" data-it-goal>
          <span className="it-ic"><IconTarget size={17} /></span>
          <span className="tx">
            <b>{goal.name}</b> {baht(goal.saved_amount)} / {baht(goal.target_amount)}
            <div className="it-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={goal.progress_pct} aria-label={`ความคืบหน้า ${goal.name}`}><i style={{ width: `${Math.min(100, goal.progress_pct)}%` }} /></div>
          </span>
          <span className="pc" style={{ color: TONE.ok.fg }}>{num1(goal.progress_pct)}%</span>
        </SafeLink>
      ) : (
        <div className="it-row" data-it-setgoal>
          <span className="it-ic"><IconTarget size={17} /></span>
          <span className="tx">ยังไม่มีเป้าหมายการออม</span>
          <SafeLink to="/plan?tab=goals" className="it-act ghost">ตั้งเป้าหมาย</SafeLink>
        </div>
      ))}
    </div>
  );
}
