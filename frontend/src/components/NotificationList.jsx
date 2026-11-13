import { IconDot, IconTrendUp, IconCard, IconRepeat } from './PlanIcons.jsx';
const fmtTime = (s) => {
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
};

// สัญลักษณ์ตามระดับการแจ้งเตือนงบประมาณ: 1 ใกล้ถึงวงเงิน, 2 ถึง/เกินวงเงิน (การแจ้งเตือนเก่าไม่มีระดับ)
const LEVEL = {
  1: { icon: <IconDot color="#E0B35A" size={11} />, label: 'ใกล้ถึงวงเงิน' },
  2: { icon: <IconDot color="#E2A27E" size={11} />, label: 'ถึงหรือเกินวงเงิน' },
};

// การแจ้งเตือนเชิงพยากรณ์ "ที่ความเร็วนี้คาดว่าจะเกินงบ" (kind = forecast)
const FORECAST = { icon: <IconTrendUp size={15} style={{ color: '#B98A2E' }} />, label: 'คาดการณ์ว่าจะเกินงบ' };
// บิลผ่อนใกล้ครบกำหนด / ครบกำหนดวันนี้ (kind = installment) กดแล้วไปแท็บรายการผ่อน
const INSTALLMENT = { icon: <IconCard size={15} style={{ color: '#74896F' }} />, label: 'บิลผ่อน' };
// พบรายจ่ายที่น่าจะเป็นรายการประจำ (kind = recurring) กดแล้วไปหน้ารายการเกิดซ้ำ
const RECURRING = { icon: <IconRepeat size={15} style={{ color: '#74896F' }} />, label: 'ชวนตั้งรายการเกิดซ้ำ' };

// รายการแจ้งเตือน (ใช้ในกระดิ่ง)
//  - onRead(id): ทำเครื่องหมายอ่านแล้ว (ใช้เมื่อไม่ส่ง onSelect)
//  - onSelect(n): เมื่อกดรายการ (ใช้ในกระดิ่ง: อ่านแล้ว + ไปหน้างบประมาณของเดือนนั้น)
export default function NotificationList({ items, onRead, onSelect, emptyText = 'ยังไม่มีการแจ้งเตือน' }) {
  if (items.length === 0) {
    return <p style={{ color: '#9ca3af', margin: 0, padding: '8px 0' }}>{emptyText}</p>;
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {items.map((n) => {
        const unread = !n.is_read;
        const lv = n.kind === 'forecast' ? FORECAST : n.kind === 'installment' ? INSTALLMENT : n.kind === 'recurring' ? RECURRING : LEVEL[n.level];
        // เปิดหน้างบประมาณของเดือนนั้นได้เมื่อยังมีงบอยู่ (งบถูกลบแล้ว = ไม่มีเดือน/ปี)
        const canOpen = !!(onSelect && ((n.period_month && n.period_year) || n.kind === 'installment' || n.kind === 'recurring'));
        const clickable = canOpen || unread;
        const title = canOpen
          ? (n.kind === 'installment' ? 'คลิกเพื่อดูรายการผ่อน' : n.kind === 'recurring' ? 'คลิกเพื่อไปหน้ารายการเกิดซ้ำ' : 'คลิกเพื่อดูงบประมาณของเดือนนั้น')
          : unread
            ? 'คลิกเพื่อทำเครื่องหมายว่าอ่านแล้ว'
            : '';
        const handleClick = () => {
          if (onSelect) onSelect(n);
          else if (unread) onRead(n.notification_id);
        };
        return (
          <li
            key={n.notification_id}
            onClick={clickable ? handleClick : undefined}
            title={title}
            style={{
              display: 'flex',
              gap: 10,
              padding: '10px 6px',
              borderBottom: '1px solid #f3f4f6',
              cursor: clickable ? 'pointer' : 'default',
              background: unread ? '#fffbeb' : 'transparent',
            }}
          >
            {lv ? (
              <span
                role="img"
                aria-label={lv.label}
                title={lv.label}
                style={{ fontSize: 14, lineHeight: '20px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', height: 20 }}
              >
                {lv.icon}
              </span>
            ) : (
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  marginTop: 6,
                  flexShrink: 0,
                  background: unread ? '#f59e0b' : 'transparent',
                }}
              />
            )}
            <div>
              <div style={{ fontWeight: unread ? 600 : 400, fontSize: 14 }}>{n.message}</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{fmtTime(n.created_at)}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
