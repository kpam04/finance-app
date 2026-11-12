import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Link } from 'react-router-dom';
import PlanSummary from '../components/PlanSummary.jsx';
import MonthYearPicker from '../components/MonthYearPicker.jsx';

// ตัวเลขแบบไม่มีทศนิยม (ใช้ในแถบ "ใช้ได้อีก") ถ้ามีสตางค์จริงยังแสดงทศนิยม
const baht0 = (n) => (n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });

const fmt = (n) =>
  (n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const monthShort = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('th-TH', { month: 'short' });
};

// ยอดคงเหลือสิ้นเดือนของทั้ง 6 เดือนในกราฟ: เริ่มจากยอดของเดือนที่เลือก แล้วย้อนกลับด้วยรายรับ-รายจ่ายของแต่ละเดือน
function closingSeries(trend, closing) {
  const out = new Array(trend.length);
  out[trend.length - 1] = closing;
  for (let i = trend.length - 2; i >= 0; i -= 1) {
    out[i] = Math.round((out[i + 1] - (trend[i + 1].income - trend[i + 1].expense)) * 100) / 100;
  }
  return out;
}

// ---------- กราฟแนวโน้ม 6 เดือน (แท่งคู่ รายรับ/รายจ่าย + เส้นยอดคงเหลือ) ----------
function TrendChart({ data, balances }) {
  // เก็บข้อมูลของเดือนที่กำลังถูกเมาส์ชี้ (ชี้ที่แท่งหรือที่ว่างของคอลัมน์เดือนนั้นก็ได้)
  const [hovered, setHovered] = React.useState(null);
  // ตำแหน่งจริงบนหน้าจอ (px) ของกึ่งกลางแต่ละเดือนและพื้นที่แท่ง ใช้วาดเส้นให้ตรงกับแท่งโดยไม่เปลี่ยนเลย์เอาต์เดิม
  const [geo, setGeo] = React.useState(null);
  const plotRef = React.useRef(null);

  const n = data.length;
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
  const hasLine = !!balances && balances.length === n;
  const balancesKey = hasLine ? balances.join(',') : '';

  React.useLayoutEffect(() => {
    const el = plotRef.current;
    if (!hasLine || !el) {
      setGeo(null);
      return undefined;
    }
    const measure = () => {
      const cols = el.querySelectorAll('[data-month]');
      const bars = el.querySelector('[data-bars]');
      if (!el.clientWidth || cols.length !== n || !bars) {
        setGeo(null);
        return;
      }
      setGeo({
        w: el.clientWidth,
        h: el.clientHeight,
        top: cols[0].offsetTop + bars.offsetTop,
        height: bars.offsetHeight,
        x: Array.from(cols).map((c) => c.offsetLeft + c.offsetWidth / 2),
      });
    };
    measure();
    window.addEventListener('resize', measure);
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    return () => {
      window.removeEventListener('resize', measure);
      if (ro) ro.disconnect();
    };
  }, [n, hasLine, balancesKey]);

  // เส้นยอดคงเหลือใช้สเกลของตัวเอง (ต่ำสุด-สูงสุดของ 6 เดือน เว้นขอบบน/ล่าง) เพราะยอดคงเหลืออาจใหญ่หรือติดลบเทียบกับแท่ง
  let line = null;
  if (hasLine && geo) {
    const lo = Math.min(...balances);
    const hi = Math.max(...balances);
    const yPct = (v) => (hi === lo ? 50 : 10 + ((v - lo) / (hi - lo)) * 80);
    const r2 = (v) => Math.round(v * 100) / 100; // ปัดเศษทศนิยม 2 ตำแหน่ง ให้พิกัด SVG อ่านง่าย
    line = balances.map((v, i) => ({ x: r2(geo.x[i]), y: r2(geo.top + geo.height * (1 - yPct(v) / 100)) }));
  }

  return (
    <div>
      {/* พื้นที่กราฟ */}
      <div
        ref={plotRef}
        data-trend-plot
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
          gap: 12,
          height: 180,
          padding: '0 4px'
        }}
      >
        {data.map((d, i) => (
          <div
            key={d.month}
            data-month={d.month}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              height: '100%',
              justifyContent: 'flex-end',
              position: 'relative'
            }}
          >
            {/* กล่อง Tooltip แสดงข้อมูลของเดือนที่กำลังชี้ */}
            {hovered === i && (
              <div data-trend-tip style={{
                position: 'absolute',
                bottom: '100%',
                marginBottom: 8,
                background: '#3F3A34',
                color: '#fff',
                padding: '10px 12px',
                borderRadius: 8,
                fontSize: 12,
                width: 150,
                zIndex: 10,
                boxShadow: '0 3px 10px rgba(0,0,0,0.2)',
                pointerEvents: 'none'
              }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  {monthShort(d.month)}
                </div>
                <div style={{ color: '#86efac', marginBottom: 3 }}>
                  รายรับ: ฿{fmt(d.income)}
                </div>
                <div style={{ color: '#fca5a5', marginBottom: hasLine ? 3 : 0 }}>
                  รายจ่าย: ฿{fmt(d.expense)}
                </div>
                {hasLine && (
                  <div data-trend-tip-balance style={{ color: '#c7d2fe' }}>
                    ยอดคงเหลือ: ฿{fmt(balances[i])}
                  </div>
                )}
              </div>
            )}

            {/* แท่งกราฟรายรับและรายจ่าย */}
            <div data-bars style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 3,
              width: '100%',
              height: '100%',
              justifyContent: 'center'
            }}>
              <div
                data-bar="income"
                style={{
                  width: '40%',
                  height: `${(d.income / max) * 100}%`,
                  background: '#16a34a',
                  borderRadius: '4px 4px 0 0',
                  minHeight: d.income > 0 ? 2 : 0,
                  cursor: 'pointer'
                }}
              />

              <div
                data-bar="expense"
                style={{
                  width: '40%',
                  height: `${(d.expense / max) * 100}%`,
                  background: '#dc2626',
                  borderRadius: '4px 4px 0 0',
                  minHeight: d.expense > 0 ? 2 : 0,
                  cursor: 'pointer'
                }}
              />
            </div>

            {/* ชื่อเดือน */}
            <div style={{
              fontSize: 12,
              marginTop: 6,
              color: '#6b7280'
            }}>
              {monthShort(d.month)}
            </div>
          </div>
        ))}

        {/* เส้นยอดคงเหลือ (วาดทับแท่ง ไม่รับเมาส์) */}
        {line && (
          <svg
            data-balance-line
            width={geo.w}
            height={geo.h}
            style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', overflow: 'visible' }}
          >
            <polyline
              points={line.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#4f46e5"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            {line.map((p, i) => (
              <circle
                key={data[i].month}
                data-balance-dot
                cx={p.x}
                cy={p.y}
                r={hovered === i ? 6 : 4}
                fill="#4f46e5"
                stroke="#fff"
                strokeWidth="2"
              />
            ))}
          </svg>
        )}
      </div>

      {/* คำอธิบายสีของกราฟ */}
      <div style={{
        display: 'flex',
        gap: 16,
        justifyContent: 'center',
        flexWrap: 'wrap',
        marginTop: 10,
        fontSize: 12
      }}>
        <span>
          <span style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            background: '#16a34a',
            borderRadius: 2,
            marginRight: 4
          }} />
          รายรับ
        </span>

        <span>
          <span style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            background: '#dc2626',
            borderRadius: 2,
            marginRight: 4
          }} />
          รายจ่าย
        </span>

        {hasLine && (
          <span data-balance-legend>
            <span style={{
              display: 'inline-block',
              width: 16,
              height: 3,
              background: '#4f46e5',
              borderRadius: 2,
              marginRight: 4,
              verticalAlign: 'middle'
            }} />
            ยอดคงเหลือ <span style={{ color: '#9ca3af' }}>(เส้น ใช้สเกลแยกจากแท่ง)</span>
          </span>
        )}
      </div>
    </div>
  );
}


 // ---------- กราฟวงกลมสัดส่วนรายจ่าย พร้อม Tooltip ----------
// ไอคอนหัวการ์ด (SVG แทนอิโมจิ) สีตามธีม
const ICON_PATHS = {
  dashboard: ['M4 4h7v7H4z', 'M13 4h7v4h-7z', 'M13 10h7v10h-7z', 'M4 13h7v7H4z'],
  trend: ['M3 20h18', 'M5 15l4-5 4 3 6-7', 'M15 6h4v4'],
  pie: ['M12 3a9 9 0 1 0 9 9h-9z', 'M15 3.5A9 9 0 0 1 20.5 9H15z'],
  rank: ['M5 20V12', 'M12 20V5', 'M19 20v-5', 'M3 20h18'],
};
function CardIcon({ name, size = 18 }) {
  return (
    <svg className="card-ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
function CardTitle({ icon, children }) {
  return <h3 className="card-title"><CardIcon name={icon} />{children}</h3>;
}

// การ์ดสัดส่วนรายจ่าย: กราฟโดนัทซ้าย (ยอดรวมตรงกลาง) รายการขวา / ชี้หรือแตะหมวดเพื่อดูยอดหมวดนั้นตรงกลาง
const pieCss = `
  .pie-wrap { display: flex; align-items: center; justify-content: flex-start; gap: 32px; flex-wrap: wrap; padding-left: 8px; }
  .pie-chart { position: relative; flex-shrink: 0; }
  .pie-chart svg { display: block; overflow: visible; }
  .pie-slice { cursor: pointer; transition: opacity 0.2s ease, transform 0.2s ease; }
  .pie-slice.dim { opacity: 0.35; }
  .pie-slice.on { transform: scale(1.04); }
  .pie-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; text-align: center; padding: 0 48px; }
  .pie-c-label { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: #8A8177; }
  .pie-c-amt { margin: 2px 0; font-size: 18px; font-weight: 700; color: #3F3A34; font-variant-numeric: tabular-nums; }
  .pie-c-sub { font-size: 12px; color: #8A8177; }
  .pie-legend { flex: 1; min-width: 160px; display: flex; flex-direction: column; gap: 4px; font-size: 14px; }
  .pie-row { display: flex; align-items: center; gap: 8px; padding: 4px 8px; border-radius: 6px; cursor: pointer; transition: opacity 0.2s ease, background 0.2s ease; -webkit-tap-highlight-color: transparent; }
  .pie-row.dim { opacity: 0.45; }
  .pie-row.on { background: #F6F3EC; }
  .pie-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .pie-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #3F3A34; }
  .pie-pct { margin-left: auto; padding-left: 8px; color: #8A8177; font-variant-numeric: tabular-nums; }
  @media (prefers-reduced-motion: reduce) { .pie-slice, .pie-row { transition: none; } }
  @media (max-width: 560px) {
    .pie-wrap { flex-wrap: nowrap; gap: 14px; padding-left: 0; }
    .pie-chart { width: 130px !important; height: 130px !important; }
    .pie-center { padding: 0 24px; }
    .pie-c-label { font-size: 10px; }
    .pie-c-amt { font-size: 13px; margin: 0; }
    .pie-c-sub { display: none; }
    .pie-legend { min-width: 0; gap: 2px; font-size: 13px; }
    .pie-row { padding: 4px 6px; }
    .pie-dot { width: 8px; height: 8px; }
    .pie-pct { font-size: 12px; }
  }
`;

function ExpensePieChart({ data }) {
  const [hovered, setHovered] = React.useState(null);

  const total = data.reduce((sum, item) => sum + item.total, 0);

  if (total <= 0) {
    return (
      <p style={{ color: '#9ca3af', fontSize: 14 }}>
        ยังไม่มีข้อมูลรายจ่ายในเดือนนี้
      </p>
    );
  }

  // กราฟโดนัท: วงนอก/วงใน ตรงกลางแสดงยอดรวม (ชี้/แตะหมวด → แสดงยอดของหมวดนั้นแทน)
  const size = 220;
  const c = size / 2;
  const R = 100;
  const r = 68;
  const GAP = data.length > 1 ? 0.8 : 0; // ช่องว่างระหว่างชิ้น (องศา)

  const pt = (rad, deg) => {
    const a = (deg * Math.PI) / 180;
    return [c + rad * Math.cos(a), c + rad * Math.sin(a)];
  };

  let current = -90;
  const slices = data.map((item, index) => {
    const percentage = (item.total / total) * 100;
    const angle = (percentage / 100) * 360;
    const start = current + GAP / 2;
    const end = current + Math.max(angle - GAP / 2, GAP / 2 + 0.01);
    current += angle;
    let path;
    if (angle >= 359.99) {
      // หมวดเดียว 100%: วาดเป็นวงแหวนเต็ม
      path = `M ${c - R} ${c} A ${R} ${R} 0 1 1 ${c + R} ${c} A ${R} ${R} 0 1 1 ${c - R} ${c} M ${c - r} ${c} A ${r} ${r} 0 1 0 ${c + r} ${c} A ${r} ${r} 0 1 0 ${c - r} ${c} Z`;
    } else {
      const large = end - start > 180 ? 1 : 0;
      const [x1, y1] = pt(R, start);
      const [x2, y2] = pt(R, end);
      const [x3, y3] = pt(r, end);
      const [x4, y4] = pt(r, start);
      path = `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${large} 0 ${x4} ${y4} Z`;
    }
    return { ...item, index, percentage, path };
  });

  const selected = hovered !== null ? slices[hovered] : null;
  // มือถือไม่มี hover: แตะเพื่อเลือก/แตะซ้ำเพื่อยกเลิก
  const toggle = (index) => setHovered((h) => (h === index ? null : index));
  const hoverOn = (index) => (e) => { if (e.pointerType === 'mouse') setHovered(index); };
  const hoverOff = (e) => { if (e.pointerType === 'mouse') setHovered(null); };

  return (
    <div className="pie-wrap">
      <style>{pieCss}</style>

      <div className="pie-chart" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%" role="img" aria-label="สัดส่วนรายจ่ายตามหมวดหมู่">
          {slices.map((item, index) => (
            <path
              key={index}
              d={item.path}
              fill={item.color || '#9AAB91'}
              fillRule="evenodd"
              className={`pie-slice${hovered !== null && hovered !== index ? ' dim' : ''}${hovered === index ? ' on' : ''}`}
              style={{ transformOrigin: `${c}px ${c}px` }}
              onPointerEnter={hoverOn(index)}
              onPointerLeave={hoverOff}
              onClick={() => toggle(index)}
            />
          ))}
        </svg>

        {/* ตรงกลางโดนัท */}
        <div className="pie-center" aria-live="polite">
          {selected ? (
            <>
              <div className="pie-c-label">{selected.category_name}</div>
              <div className="pie-c-amt">฿{baht0(selected.total)}</div>
              <div className="pie-c-sub">{selected.percentage.toFixed(1)}%</div>
            </>
          ) : (
            <>
              <div className="pie-c-label">รายจ่ายรวม</div>
              <div className="pie-c-amt">฿{baht0(total)}</div>
              <div className="pie-c-sub">{slices.length} หมวด</div>
            </>
          )}
        </div>
      </div>

      {/* รายการหมวดหมู่ข้างกราฟ */}
      <div className="pie-legend">
        {slices.map((item, index) => (
          <div
            key={index}
            className={`pie-row${hovered !== null && hovered !== index ? ' dim' : ''}${hovered === index ? ' on' : ''}`}
            onPointerEnter={hoverOn(index)}
            onPointerLeave={hoverOff}
            onClick={() => toggle(index)}
          >
            <span className="pie-dot" style={{ background: item.color || '#9AAB91' }} />
            <span className="pie-name">{item.category_name}</span>
            <span className="pie-pct">{item.percentage.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}


// แถบ "ใช้ได้อีก" + รายการยอดเหลือแยกหมวด (เลื่อนขยายด้วย grid-template-rows 0fr ↔ 1fr)
const spendCss = `
  .sp-strip { margin: -4px 0 16px; padding: 14px 18px; border-radius: var(--radius, 14px); font-size: 14px; background: var(--card, #FFFDFA); color: #4F6B47; border: 1px solid var(--border, #E9E1D6); border-left: 4px solid var(--primary, #9AAB91); box-shadow: var(--shadow, 0 2px 8px rgba(100,82,60,0.05)); transition: border-color 0.2s, box-shadow 0.2s; }
  .sp-strip:hover { border-color: #DCD3C5; border-left-color: var(--primary-dark, #74896F); box-shadow: 0 4px 14px rgba(100,82,60,0.09); }
  .sp-title { margin-right: 8px; font-weight: 700; color: #40563C; }
  .sp-pct { color: #8A8177; font-size: 13px; }
  .sp-over { color: #A2522A; font-weight: 600; }
  .sp-meter { position: relative; display: flex; height: 8px; margin: 10px 0 2px; border-radius: 4px; background: #EFEBE3; overflow: hidden; }
  .sp-meter i { display: block; height: 100%; }
  .sp-meter .u { background: #9AAB91; }
  .sp-meter.full .u { background: #E2A27E; }
  .sp-strip .sp-text { color: #4B4740; }
  .sp-meter .r { background: repeating-linear-gradient(135deg, #C9D4C2 0 4px, #E3E8DE 4px 8px); }
  .sp-reserved { margin: 8px 0 0; font-size: 12.5px; color: #8A8177; }
  .sp-strip.neg { color: #A2522A; border-color: #F3E1D5; border-left-color: #E2A27E; }
  .sp-strip.neg:hover { border-color: #F1CDB7; border-left-color: #D08A60; box-shadow: 0 2px 8px rgba(162,82,42,0.10); }
  .sp-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .sp-muted { color: #8A8177; font-size: 13px; }
  .sp-actions { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; }
  .sp-link { display: inline-flex; align-items: center; gap: 5px; padding: 4px 12px; border-radius: 999px; background: #fff; border: 1px solid #C9D4C2; color: #5E7558; font-size: 13px; font-weight: 500; text-decoration: none; transition: border-color 0.2s, color 0.2s, box-shadow 0.2s; }
  .sp-link svg { transition: transform 0.2s ease; }
  .sp-link:hover { border-color: #9AAB91; color: #4F6B47; box-shadow: 0 1px 3px rgba(79,107,71,0.12); }
  .sp-link:hover svg { transform: translateX(2px); }
  .sp-strip.neg .sp-link { border-color: #EDC7AE; color: #A2522A; }
  .sp-strip.neg .sp-link:hover { border-color: #E2A27E; }
  .sp-toggle { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 999px; border: none; background: transparent; color: #74896F; cursor: pointer; transition: background 0.2s, color 0.2s; }
  .sp-toggle:hover { background: rgba(116,137,111,0.12); color: #4F6B47; }
  .sp-strip.neg .sp-toggle { color: #B9764F; }
  .sp-chev { transition: transform 0.25s ease; }
  .sp-chev.open { transform: rotate(180deg); }
  .sp-details { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows 0.25s ease, opacity 0.2s ease; }
  .sp-details.open { grid-template-rows: 1fr; opacity: 1; }
  .sp-details-inner { overflow: hidden; min-height: 0; }
  .sp-list { margin-top: 10px; padding-top: 10px; border-top: 1px dashed #E6EAE2; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 28px; row-gap: 12px; }
  .sp-strip.neg .sp-list { border-top-color: #F3E1D5; }
  .sp-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: 10px; row-gap: 5px; font-size: 13px; color: #4B4740; }
  .sp-name { display: inline-flex; align-items: center; gap: 7px; min-width: 0; }
  .sp-dot { width: 8px; height: 8px; border-radius: 999px; flex: none; }
  .sp-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sp-bar { grid-column: 1 / -1; grid-row: 2; height: 6px; border-radius: 999px; background: #F0F2EE; overflow: hidden; }
  .sp-bar > span { display: block; height: 100%; border-radius: 999px; opacity: 0.85; }
  .sp-amt { white-space: nowrap; text-align: right; color: #4F6B47; font-weight: 500; }
  .sp-amt.over { color: #B9622F; }
  .sp-amt .sp-muted { font-weight: 400; font-size: 12px; }
  .sp-more { grid-column: 1 / -1; font-size: 12px; color: #74896F; text-decoration: none; justify-self: start; }
  .sp-more:hover { text-decoration: underline; }
  @media (max-width: 620px) {
    .sp-list { grid-template-columns: 1fr; row-gap: 10px; }
  }
  .sp-nextbill { display: flex; align-items: center; gap: 14px; width: 100%; box-sizing: border-box; margin: -4px 0 18px; padding: 14px 18px; border-radius: var(--radius, 14px); background: var(--card, #FFFDFA); border: 1px solid var(--border, #E9E1D6); border-left: 4px solid var(--primary, #9AAB91); box-shadow: var(--shadow, 0 2px 8px rgba(100,82,60,0.05)); font-size: 13px; color: var(--muted, #8A8177); text-decoration: none; transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s; }
  .sp-nextbill:hover { border-color: #DCD3C5; border-left-color: var(--primary-dark, #74896F); box-shadow: 0 4px 14px rgba(100,82,60,0.09); }
  .sp-nextbill.soon { border-left-color: #D9B26A; }
  .sp-nextbill.over { border-left-color: #E2A27E; }
  .sp-nb-ic { display: inline-flex; flex: none; align-items: center; justify-content: center; width: 42px; height: 42px; border-radius: 12px; background: #EEF1EA; color: var(--primary-dark, #74896F); }
  .sp-nextbill.soon .sp-nb-ic { background: #F7EFDC; color: #8A6A1F; }
  .sp-nextbill.over .sp-nb-ic { background: #FBEBDD; color: #A2522A; }
  .sp-nb-txt { display: flex; flex-direction: column; min-width: 0; line-height: 1.45; }
  .sp-nb-txt small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--muted, #8A8177); }
  .sp-nb-txt b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; font-weight: 700; color: var(--text, #3F3A34); }
  .sp-nb-amt { margin-left: auto; font-size: 18px; font-weight: 700; color: var(--text, #3F3A34); white-space: nowrap; }
  .sp-nb-pill { flex: none; padding: 3px 12px; border-radius: 999px; background: #F1EDE4; color: #6b6358; font-size: 12px; font-weight: 600; white-space: nowrap; }
  .sp-nb-pill.soon { background: #F7EFDC; color: #8A6A1F; }
  .sp-nb-pill.over { background: #FBEBDD; color: #A2522A; }
  .sp-nextbill-go { flex: none; display: inline-flex; color: #C2B9AB; transition: transform 0.2s, color 0.2s; }
  .sp-nextbill:hover .sp-nextbill-go { color: var(--primary-dark, #74896F); transform: translateX(3px); }
  @media (max-width: 480px) { .sp-nextbill { gap: 10px; padding: 12px 14px; } .sp-nb-amt { font-size: 15px; } .sp-nb-ic { width: 36px; height: 36px; } }
.page-title { display: inline-flex; align-items: center; gap: 10px; margin: 0; }
.page-title .card-ic { color: var(--primary-dark, #74896F); }
.card-title { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; font-size: 16px; }
.card-ic { flex: 0 0 auto; color: var(--primary-dark, #74896F); }
.ins-head { display: flex; align-items: center; justify-content: space-between; gap: 8px 12px; flex-wrap: wrap; margin-bottom: 12px; }
.ins-head h3 { display: inline-flex; align-items: center; gap: 8px; margin: 0; font-size: 16px; }
.ins-head .ins-ic { flex: 0 0 auto; color: var(--primary-dark, #74896F); }
.ps-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 16px; border: 1px solid var(--primary, #9AAB91); border-radius: 999px; background: #F3F6F0; color: var(--primary-dark, #74896F); font-size: 13px; font-weight: 600; text-decoration: none; transition: background .15s, color .15s; }
.ps-btn:hover { background: var(--primary-dark, #74896F); border-color: var(--primary-dark, #74896F); color: #fff; }
.ps-btn:focus-visible { outline: 2px solid var(--primary, #9AAB91); outline-offset: 2px; }
.ps-btn svg { flex: 0 0 auto; }
  @media (prefers-reduced-motion: reduce) { .sp-chev, .sp-details, .sp-link svg { transition: none; } }
`;

export default function Dashboard() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [summary, setSummary] = useState(null);
  const [insights, setInsights] = useState([]);
  const [planSummary, setPlanSummary] = useState(null); // สรุปการวางแผน (เฉพาะเดือนปัจจุบัน) โหลดแยก ถ้าโหลดไม่ได้ก็ไม่กระทบแดชบอร์ด
  const [spendOpen, setSpendOpen] = useState(false); // แถบ "ใช้ได้อีก": เปิดดูยอดเหลือแยกหมวด (เปิดหน้ามาหุบไว้ก่อน)
  const [nextBill, setNextBill] = useState(null); // บิลผ่อนถัดไป (เฉพาะเดือนปัจจุบัน)
  const [spendable, setSpendable] = useState(null); // "ใช้ได้อีก" ตามงบ (เฉพาะเดือนปัจจุบัน) โหลดแยก ไม่กระทบแดชบอร์ดถ้าล้มเหลว
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const params = { month, year };
        const [s, i] = await Promise.all([
          api.get('/dashboard/summary', { params }),
          api.get('/dashboard/insights', { params }),
        ]);
        setSummary(s.data.data);
        setInsights(i.data.data.insights);
      } catch (err) {
        console.error('Error loading dashboard data:', err);
        // api.js โยนข้อผิดพลาดพร้อมข้อความภาษาไทย (เช่น เชื่อมต่อเซิร์ฟเวอร์ไม่ได้) ให้แสดงข้อความนั้น
        setError(err.message || 'โหลดข้อมูลแดชบอร์ดไม่สำเร็จ');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [month, year]);

  const curMonth = now.getMonth() + 1;
  const curYear = now.getFullYear();
  useEffect(() => {
    if (month !== curMonth || year !== curYear) {
      setPlanSummary(null);
      return undefined;
    }
    let live = true;
    api.getPlanSummary().then((r) => { if (live) setPlanSummary(r.data); }).catch(() => { if (live) setPlanSummary(null); });
    return () => { live = false; };
  }, [month, year, curMonth, curYear]);

  useEffect(() => {
    if (month !== curMonth || year !== curYear) {
      setSpendable(null);
      return undefined;
    }
    let live = true;
    api.get('/dashboard/spendable')
      .then((r) => { if (live) setSpendable(r.data.data); })
      .catch(() => { if (live) setSpendable(null); });
    // บิลผ่อนถัดไป (บรรทัดเล็กใต้แถบ "ใช้ได้อีก")
    api.getInstallments()
      .then((r) => { if (live) setNextBill((r && r.data && r.data.summary && r.data.summary.next_bill) || null); })
      .catch(() => { if (live) setNextBill(null); });
    return () => { live = false; };
  }, [month, year, curMonth, curYear]);

  const cardStyle = { background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' };
  const grid = (cols) => ({
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fit, minmax(min(${cols === 3 ? 220 : 340}px, 100%), 1fr))`,
    gap: 16,
    marginBottom: 16,
  });

  const header = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
      <h2 className="page-title"><CardIcon name="dashboard" size={22} />แดชบอร์ดสรุปภาพรวม</h2>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <MonthYearPicker
          month={month}
          year={year}
          years={[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]}
          onChange={(m, y) => { setMonth(m); setYear(y); }}
        />
      </div>
    </div>
  );

  if (error) {
    return (
      <div>
        {header}
        <p style={{ color: '#dc2626' }}>{error}</p>
      </div>
    );
  }
  if (loading || !summary) {
    return (
      <div>
        {header}
        <p>กำลังโหลดข้อมูลแดชบอร์ด...</p>
      </div>
    );
  }

  const prevExpense = summary.previous_month.expense;
  const changePct =
    prevExpense > 0 ? ((summary.total_expense - prevExpense) / prevExpense) * 100 : null;
  const topCategories = summary.expense_by_category || [];
  let changeLabel = null;
  if (changePct !== null) {
    const pctText = Math.abs(changePct).toFixed(1);
    if (pctText === '0.0') changeLabel = { text: 'เท่ากับเดือนก่อน', color: '#6b7280' };
    else if (changePct > 0) changeLabel = { text: `▲ เพิ่มขึ้น ${pctText}% จากเดือนก่อน`, color: '#dc2626' };
    else changeLabel = { text: `▼ ลดลง ${pctText}% จากเดือนก่อน`, color: '#16a34a' };
  }

  // ยอดยกมา / ยอดคงเหลือ (มาจาก backend รอบ 1) ถ้า backend ยังเป็นรุ่นเก่า ให้แสดงการ์ดแบบเดิม
  const hasCarry =
    typeof summary.opening_balance === 'number' && typeof summary.closing_balance === 'number';
  const opening = hasCarry ? summary.opening_balance : 0;
  const closing = hasCarry ? summary.closing_balance : summary.balance;
  const monthNet = summary.balance;
  const round2 = (n) => Math.round(n * 100) / 100;
  const balances = hasCarry ? closingSeries(summary.monthly_trend, summary.closing_balance) : null;

  return (
    <div>
      <style>{spendCss}</style>
      {header}

      {/* การ์ดสรุปยอด 3 ใบ: รายรับ (+ ยอดยกมา) / รายจ่าย / ยอดคงเหลือ */}
      <div style={grid(3)}>
        <div style={{ ...cardStyle, borderLeft: '4px solid #16a34a' }}>
          <div style={{ fontSize: 13, color: '#6b7280' }}>รายรับรวมประจำเดือน</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#16a34a' }}>฿{fmt(summary.total_income)}</div>
          {/* ตัวเลขใหญ่คือรายรับของเดือนนี้ล้วน ๆ ยอดยกมากับยอดรวมแสดงบรรทัดเดียวกัน แยกด้วยสี (ซ่อนเมื่อยอดยกมาเป็นศูนย์) */}
          {hasCarry && opening !== 0 && (
            <div data-carry-line style={{ display: 'flex', flexWrap: 'wrap', columnGap: 12, rowGap: 2, marginTop: 4, fontSize: 12 }}>
              <span data-carry-opening style={{ color: opening < 0 ? '#dc2626' : '#0369a1' }}>
                ยอดยกมา ฿{fmt(opening)}
              </span>
              <span data-carry-total style={{ color: '#6b7280' }}>
                รวมเงินที่มี ฿{fmt(round2(opening + summary.total_income))}
              </span>
            </div>
          )}
        </div>
        <div style={{ ...cardStyle, borderLeft: '4px solid #dc2626' }}>
          <div style={{ fontSize: 13, color: '#6b7280' }}>รายจ่ายรวมประจำเดือน</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#dc2626' }}>฿{fmt(summary.total_expense)}</div>
          {/* เทียบกับเดือนก่อน: ใช้ลูกศรและคำแทนเครื่องหมาย (ลดลง = เขียว, เพิ่มขึ้น = แดง) */}
          {changeLabel && (
            <div data-expense-change style={{ fontSize: 12, fontWeight: 600, color: changeLabel.color, marginTop: 4 }}>
              {changeLabel.text}
            </div>
          )}
          {prevExpense > 0 && (
            <div data-expense-prev style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              เดือนก่อน ฿{fmt(prevExpense)}
            </div>
          )}
        </div>
        <div style={{ ...cardStyle, borderLeft: '4px solid #4f46e5' }}>
          <div style={{ fontSize: 13, color: '#6b7280' }}>
            {hasCarry ? 'ยอดคงเหลือ' : 'ยอดคงเหลือสุทธิ'}
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: closing < 0 ? '#dc2626' : '#4f46e5' }}>
            ฿{fmt(closing)}
          </div>
          {hasCarry && (
            <div style={{ fontSize: 12, color: monthNet < 0 ? '#dc2626' : '#16a34a', marginTop: 4 }}>
              สุทธิเดือนนี้ {monthNet >= 0 ? '+' : '−'}฿{fmt(Math.abs(monthNet))}
            </div>
          )}
        </div>
      </div>

      {/* แถบ "ใช้ได้อีก" ตามงบ (เฉพาะเดือนปัจจุบัน และมีงบอย่างน้อย 1 หมวด) กดลูกศรเพื่อดูยอดเหลือแยกหมวด */}
      {spendable && spendable.has_budget && (() => {
        // งบเดือนนี้: ใช้ไปเท่าไรจากงบรวม (ไม่ใช่เงินคงเหลือในบัญชี) / สีส้มเฉพาะเมื่อมีหมวดที่ใช้เกินงบจริง
        const cats = spendable.categories || [];
        const overCats = cats.filter((c) => c.spent > c.limit);
        const neg = overCats.length > 0;
        const pct = spendable.limit > 0 ? Math.round((spendable.spent / spendable.limit) * 100) : 0;
        const spentW = spendable.limit > 0 ? Math.min(100, (spendable.spent / spendable.limit) * 100) : 0;
        const resW = spendable.limit > 0 ? Math.min(100 - spentW, (spendable.reserved / spendable.limit) * 100) : 0;
        const shown = cats.slice(0, 5);
        const more = cats.length - shown.length;
        return (
          <div data-spendable className={`sp-strip${neg ? ' neg' : ''}`}>
            <div className="sp-head">
              <span className="sp-text">
                <span className="sp-title">งบเดือนนี้</span>
                ใช้ไป <strong>฿{baht0(spendable.spent)}</strong> จาก ฿{baht0(spendable.limit)} <span className="sp-pct">({pct}%)</span>
                {neg && (
                  <span className="sp-over" data-spendable-over> · เกินงบ {overCats.length} หมวด <span className="sp-muted">({overCats.slice(0, 2).map((c) => c.name).join(', ')}{overCats.length > 2 ? ' ฯลฯ' : ''})</span></span>
                )}
              </span>
              <span className="sp-actions">
                <Link to="/budgets" className="sp-link" data-spendable-link>
                  ดูงบ
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M2.5 6h7M6.5 3l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
                {cats.length > 0 && (
                  <button
                    type="button"
                    className="sp-toggle"
                    data-spendable-toggle
                    aria-expanded={spendOpen}
                    aria-label={spendOpen ? 'ซ่อนยอดแยกหมวด' : 'ดูยอดเหลือแยกหมวด'}
                    title={spendOpen ? 'ซ่อนยอดแยกหมวด' : 'ดูยอดเหลือแยกหมวด'}
                    onClick={() => setSpendOpen((v) => !v)}
                  >
                    <svg className={`sp-chev${spendOpen ? ' open' : ''}`} width="14" height="14" viewBox="0 0 12 12" aria-hidden="true">
                      <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
              </span>
            </div>
            <div className={`sp-meter${pct > 100 ? ' full' : ''}`} aria-hidden="true" title={spendable.reserved > 0 ? `ส่วนลายคือเงินที่กันไว้สำหรับค่าประจำและงวดผ่อน ฿${baht0(spendable.reserved)}` : ''}>
              <i className="u" style={{ width: `${spentW}%` }} />
              {resW > 0 && <i className="r" style={{ width: `${resW}%` }} />}
            </div>
            {cats.length > 0 && (
              <div className={`sp-details${spendOpen ? ' open' : ''}`} data-spendable-details data-open={spendOpen ? 'true' : 'false'} aria-hidden={!spendOpen} inert={spendOpen ? undefined : ''}>
                <div className="sp-details-inner">
                  {spendable.reserved > 0 && <p className="sp-reserved" data-spendable-reserved>กันไว้สำหรับค่าประจำและงวดผ่อนที่ยังไม่จ่าย ฿{baht0(spendable.reserved)} (ส่วนลายในแถบ)</p>}
                  <div className="sp-list">
                    {shown.map((c) => {
                      const used = c.limit > 0 ? Math.min(100, ((c.spent + c.reserved) / c.limit) * 100) : 100;
                      const over = c.remaining < 0;
                      return (
                        <div key={c.category_id} className="sp-row" data-spendable-row>
                          <span className="sp-name">
                            <span className="sp-dot" style={{ background: c.color }} />
                            <span className="sp-ellipsis">{c.name}</span>
                          </span>
                          <span className="sp-bar"><span style={{ width: `${used}%`, background: over ? '#E2A27E' : c.color }} /></span>
                          <span className={`sp-amt${over ? ' over' : ''}`}>
                            {over ? `เกิน ฿${baht0(-c.remaining)}` : `เหลือ ฿${baht0(c.remaining)}`}
                            {c.reserved > 0 && <span className="sp-muted"> (กันไว้ ฿{baht0(c.reserved)})</span>}
                          </span>
                        </div>
                      );
                    })}
                    {more > 0 && (
                      <Link to="/budgets" className="sp-more">อีก {more} หมวด · ดูที่หน้างบ</Link>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* บิลผ่อนถัดไป กดแล้วไปแท็บรายการผ่อน */}
      {nextBill && (
        <Link to="/plan?tab=installments" className={`sp-nextbill${nextBill.overdue ? ' over' : nextBill.days <= 3 ? ' soon' : ''}`} data-next-bill>
          <span className="sp-nb-ic" aria-hidden="true">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19" /><path d="M6.5 15h4" /></svg>
          </span>
          <span className="sp-nb-txt">
            <small>บิลผ่อนถัดไป · {new Date(`${nextBill.due_date}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</small>
            <b>{nextBill.channel_label}</b>
          </span>
          <span className="sp-nb-amt">฿{baht0(nextBill.total)}</span>
          <span className={`sp-nb-pill${nextBill.overdue ? ' over' : nextBill.days <= 3 ? ' soon' : ''}`}>{nextBill.overdue ? `ค้างชำระ ${-nextBill.days} วัน` : nextBill.days === 0 ? 'วันนี้' : `อีก ${nextBill.days} วัน`}</span>
          <span className="sp-nextbill-go" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg></span>
        </Link>
      )}

      {hasCarry && (
        <p data-carry-note style={{ fontSize: 12, color: '#9ca3af', margin: '-4px 0 16px' }}>
          ยอดยกมาและยอดคงเหลือคำนวณจากรายการที่บันทึกในแอพเท่านั้น ไม่รวมเงินที่มีอยู่ก่อนเริ่มบันทึก
        </p>
      )}

      {/* กราฟ */}
      <div style={grid(2)}>
        <div style={cardStyle}>
          <CardTitle icon="trend">แนวโน้มรายรับ-รายจ่าย 6 เดือนล่าสุด</CardTitle>
          <TrendChart data={summary.monthly_trend} balances={balances} />
        </div>
        <div style={cardStyle}>
          <CardTitle icon="pie">สัดส่วนรายจ่ายตามหมวดหมู่</CardTitle>
          <ExpensePieChart data={summary.expense_by_category} />
        </div>
      </div>

      {/* อันดับหมวด + Insight */}
      <div style={grid(2)}>
        <div style={cardStyle}>
          <CardTitle icon="rank">หมวดหมู่ที่ใช้จ่ายสูงสุด</CardTitle>
          {topCategories.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: 14 }}>ยังไม่มีข้อมูลการใช้จ่ายในเดือนนี้</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topCategories.slice(0, 5).map((cat, idx) => {
                const pct = summary.total_expense > 0 ? (cat.total / summary.total_expense) * 100 : 0;
                const color = cat.color || '#4f46e5';
                return (
                  <div key={idx} style={{ background: '#f9fafb', padding: '10px 12px', borderRadius: 8, borderLeft: `4px solid ${color}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>
                        อันดับ {idx + 1}. {cat.category_name}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#dc2626' }}>
                        ฿{fmt(cat.total)} ({pct.toFixed(1)}%)
                      </span>
                    </div>
                    <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <div className="ins-head">
            <h3>
              <svg className="ins-ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 18h6M10 21h4" />
                <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z" />
              </svg>
              บทวิเคราะห์อัตโนมัติ (Insight)
            </h3>
            <Link to="/plan" className="ps-btn" data-ps-link>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 19h16" /><path d="M7 15l4-4 3 3 5-6" />
              </svg>
              ดูการวิเคราะห์ทั้งหมด
            </Link>
          </div>
          <PlanSummary summary={planSummary} />
          <ul style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
            {insights.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
