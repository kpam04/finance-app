// ไอคอนเส้นเรียบของหน้า "วางแผน" และการ์ดสรุปบนแดชบอร์ด (ใช้สีตามตัวอักษร ซ่อนจากโปรแกรมอ่านหน้าจอ)
const Svg = ({ children, size = 16, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
    {children}
  </svg>
);

export const IconWarning = (p) => (<Svg {...p}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></Svg>);
export const IconTarget = (p) => (<Svg {...p}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></Svg>);
export const IconBulb = (p) => (<Svg {...p}><path d="M9 18h6" /><path d="M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z" /></Svg>);
export const IconSpark = (p) => (<Svg {...p}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" /><path d="M19 15l.7 1.8L21.5 17.5l-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7L19 15z" /></Svg>);
export const IconFlag = (p) => (<Svg {...p}><path d="M5 22V4" /><path d="M5 4h12l-2 4 2 4H5" /></Svg>);
export const IconChart = (p) => (<Svg {...p}><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-8" /><path d="M22 20H2" /></Svg>);
export const IconEdit = (p) => (<Svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></Svg>);
export const IconTrash = (p) => (<Svg {...p}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /></Svg>);
export const IconThumb = ({ down, ...p }) => (<Svg {...p} style={down ? { transform: 'rotate(180deg)' } : undefined}><path d="M7 10v11H3V10h4z" /><path d="M7 10l4-7a2 2 0 0 1 2 2l-1 5h6.2a2 2 0 0 1 2 2.4l-1.4 7A2 2 0 0 1 16.8 21H7" /></Svg>);

const BY_TAG = { warning: IconWarning, goal: IconTarget, tip: IconBulb };
// ไอคอนตามชนิดคำแนะนำ (warning = เตือน / goal = เป้าหมาย / tip = เคล็ดลับ)
export function AdviceIcon({ tag, size = 18 }) {
  const Cmp = BY_TAG[tag] || IconBulb;
  return <span className={`adv-ic adv-${BY_TAG[tag] ? tag : 'tip'}`} data-advice-icon={BY_TAG[tag] ? tag : 'tip'}><Cmp size={size} /></span>;
}
