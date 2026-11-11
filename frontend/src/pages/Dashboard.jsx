import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Link } from 'react-router-dom';
import PlanSummary from '../components/PlanSummary.jsx';

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

  // กำหนดขนาดและตำแหน่งของวงกลม
  const size = 180;
  const center = size / 2;
  const radius = 75;

  // คำนวณตำแหน่งของแต่ละส่วนในกราฟ
  let currentAngle = -90;

  const slices = data.map((item, index) => {
    const percentage = (item.total / total) * 100;
    const angle = (percentage / 100) * 360;

    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;

    // แปลงองศาเป็นพิกัดบน SVG
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = center + radius * Math.cos(startRad);
    const y1 = center + radius * Math.sin(startRad);

    const x2 = center + radius * Math.cos(endRad);
    const y2 = center + radius * Math.sin(endRad);

    const largeArc = angle > 180 ? 1 : 0;

    const path = [
      `M ${center} ${center}`,
      `L ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
      'Z'
    ].join(' ');

    currentAngle = endAngle;

    return {
      ...item,
      index,
      percentage,
      path
    };
  });

  const selected = hovered !== null ? slices[hovered] : null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 24,
      flexWrap: 'wrap'
    }}>

      {/* กราฟวงกลม SVG */}
      <div style={{
        width: size,
        height: size,
        flexShrink: 0,
        position: 'relative'
      }}>
        <svg
          viewBox={`0 0 ${size} ${size}`}
          width="100%"
          height="100%"
          style={{ overflow: 'visible' }}
        >
          {slices.map((item, index) => (
            <path
              key={index}
              d={item.path}
              fill={item.color || '#4f46e5'}
              stroke="#fff"
              strokeWidth="2"
              style={{
                cursor: 'pointer',
                opacity:
                  hovered === null || hovered === index ? 1 : 0.45,
                transition: 'opacity 0.2s ease'
              }}
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
        </svg>

        {/* Tooltip แสดงข้อมูลหมวดหมู่ที่กำลังชี้ */}
        {selected && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: '#3F3A34',
            color: '#fff',
            padding: '10px 12px',
            borderRadius: 8,
            width: 135,
            textAlign: 'center',
            pointerEvents: 'none',
            boxShadow: '0 3px 10px rgba(0,0,0,0.2)',
            zIndex: 5
          }}>
            <div style={{
              fontSize: 12,
              marginBottom: 5,
              color: '#e5e7eb'
            }}>
              {selected.category_name}
            </div>

            <div style={{
              fontSize: 15,
              fontWeight: 700
            }}>
              ฿{fmt(selected.total)}
            </div>

            <div style={{
              fontSize: 12,
              color: '#d1d5db',
              marginTop: 3
            }}>
              {selected.percentage.toFixed(1)}%
            </div>
          </div>
        )}
      </div>

      {/* รายการหมวดหมู่ด้านข้าง */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        fontSize: 13
      }}>
        {slices.map((item, index) => (
          <div
            key={index}
            onMouseEnter={() => setHovered(index)}
            onMouseLeave={() => setHovered(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              opacity:
                hovered === null || hovered === index ? 1 : 0.45,
              transition: 'opacity 0.2s ease'
            }}
          >
            <span style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: item.color || '#4f46e5',
              flexShrink: 0
            }} />

            <span>{item.category_name}</span>

            <span style={{ color: '#6b7280' }}>
              {item.percentage.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}


// แถบ "ใช้ได้อีก" + รายการยอดเหลือแยกหมวด (เลื่อนขยายด้วย grid-template-rows 0fr ↔ 1fr)
const spendCss = `
  .sp-strip { margin: -4px 0 16px; padding: 10px 14px; border-radius: 12px; font-size: 14px; background: #fff; color: #4F6B47; border: 1px solid #E3E8DE; border-left: 4px solid #9AAB91; box-shadow: 0 1px 4px rgba(0,0,0,0.06); transition: border-color 0.2s, box-shadow 0.2s; }
  .sp-strip:hover { border-color: #D5DECF; border-left-color: #74896F; box-shadow: 0 2px 8px rgba(79,107,71,0.10); }
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
  .sp-nextbill { display: flex; align-items: center; gap: 8px; margin: -8px 0 16px; padding: 8px 14px; border-radius: 10px; font-size: 13px; color: #5E5A52; text-decoration: none; transition: background 0.2s; }
  .sp-nextbill:hover { background: rgba(116,137,111,0.08); }
  .sp-nextbill b { color: #3F3A34; }
  .sp-nextbill.over { color: #9A3412; }
  .sp-nextbill.over b { color: #9A3412; }
  .sp-nextbill-go { margin-left: auto; color: #74896F; }
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

  const selectStyle = { padding: '6px 12px', borderRadius: 6, border: '1px solid #ccc', fontSize: 14 };
  const cardStyle = { background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' };
  const grid = (cols) => ({
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fit, minmax(${cols === 3 ? 220 : 340}px, 1fr))`,
    gap: 16,
    marginBottom: 16,
  });

  const header = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
      <h2 style={{ margin: 0 }}>📊 แดชบอร์ดสรุปภาพรวม</h2>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <label
        style={{
          fontSize: 14,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          display: 'inline-block',
          margin: 0,
          }}
          >
            เลือกเดือน/ปี:
            </label>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={selectStyle}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {new Date(2000, m - 1, 1).toLocaleString('th-TH', { month: 'long' })}
            </option>
          ))}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={selectStyle}>
          {[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
            <option key={y} value={y}>{y + 543}</option>
          ))}
        </select>
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
        const neg = spendable.available < 0;
        const cats = spendable.categories || [];
        const shown = cats.slice(0, 5);
        const more = cats.length - shown.length;
        return (
          <div data-spendable className={`sp-strip${neg ? ' neg' : ''}`}>
            <div className="sp-head">
              <span className="sp-text">
                {!neg
                  ? <>💰 ใช้ได้อีก <strong>฿{baht0(spendable.available)}</strong> ตามงบ</>
                  : <>ใช้เกินแผนไป <strong>฿{baht0(-spendable.available)}</strong> ลองดูหมวดที่ยังเหลือ</>}
                {spendable.reserved > 0 && (
                  <span className="sp-muted"> (กันค่าประจำและงวดผ่อนไว้แล้ว ฿{baht0(spendable.reserved)})</span>
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
            {cats.length > 0 && (
              <div className={`sp-details${spendOpen ? ' open' : ''}`} data-spendable-details data-open={spendOpen ? 'true' : 'false'} aria-hidden={!spendOpen} inert={spendOpen ? undefined : ''}>
                <div className="sp-details-inner">
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
        <Link to="/plan?tab=installments" className={`sp-nextbill${nextBill.overdue ? ' over' : ''}`} data-next-bill>
          <span aria-hidden="true">💳</span>
          <span>บิลผ่อนถัดไป <b>{nextBill.channel_label}</b> {new Date(`${nextBill.due_date}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} · ฿{baht0(nextBill.total)} · {nextBill.overdue ? `ค้างชำระ ${-nextBill.days} วัน` : nextBill.days === 0 ? 'ครบกำหนดวันนี้' : `อีก ${nextBill.days} วัน`}</span>
          <span className="sp-nextbill-go" aria-hidden="true">→</span>
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
          <h3 style={{ marginTop: 0, fontSize: 16 }}>📈 แนวโน้มรายรับ-รายจ่าย 6 เดือนล่าสุด</h3>
          <TrendChart data={summary.monthly_trend} balances={balances} />
        </div>
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0, fontSize: 16 }}>🍕 สัดส่วนรายจ่ายตามหมวดหมู่</h3>
          <ExpensePieChart data={summary.expense_by_category} />
        </div>
      </div>

      {/* อันดับหมวด + Insight */}
      <div style={grid(2)}>
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0, fontSize: 16 }}>🏆 หมวดหมู่ที่ใช้จ่ายสูงสุด</h3>
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
          <h3 style={{ marginTop: 0, fontSize: 16 }}>💡 บทวิเคราะห์อัตโนมัติ (Insight)</h3>
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
