// ไอคอนเส้นเรียบของหน้า "วางแผน" และการ์ดสรุปบนแดชบอร์ด (ใช้สีตามตัวอักษร ซ่อนจากโปรแกรมอ่านหน้าจอ)
const Svg = ({ children, size = 16, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest} style={{ verticalAlign: '-0.18em', flexShrink: 0, ...(rest.style || {}) }}>
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
// ไอคอนทั่วไปของแอป (ใช้แทนอิโมจิ)
export const IconBot = (p) => (<Svg {...p}><rect x="4" y="8" width="16" height="12" rx="3" /><path d="M12 4v4" /><circle cx="12" cy="3" r="1" /><path d="M9 13v1M15 13v1" /><path d="M10 17h4" /></Svg>);
export const IconPlus = (p) => (<Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></Svg>);
export const IconMic = (p) => (<Svg {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" /></Svg>);
export const IconCamera = (p) => (<Svg {...p}><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.5" /></Svg>);
export const IconImage = (p) => (<Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-9 9" /></Svg>);
export const IconWallet = (p) => (<Svg {...p}><path d="M4 7h15a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11v3" /><path d="M16 13.5h.01" /></Svg>);
export const IconUser = (p) => (<Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Svg>);
export const IconLogout = (p) => (<Svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></Svg>);
export const IconBell = (p) => (<Svg {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></Svg>);
export const IconCard = (p) => (<Svg {...p}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /><path d="M6 15h4" /></Svg>);
export const IconTrendUp = (p) => (<Svg {...p}><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></Svg>);
export const IconSprout = (p) => (<Svg {...p}><path d="M12 21v-9" /><path d="M12 12C12 8 9 5 4 5c0 4 3 7 8 7z" /><path d="M12 14c0-3 2.5-6 7-6 0 3.5-2.5 6-7 6z" /></Svg>);
export const IconPiggy = (p) => (<Svg {...p}><path d="M19 10c1 .5 2 1.5 2 3h-1.5c-.4 1.3-1.2 2.3-2.5 3v3h-3v-2h-4v2H7v-3.3A6 6 0 0 1 5 11c0-3.3 3.1-6 7-6 1.6 0 3 .4 4.2 1.2L19 5z" /><path d="M15.5 10h.01" /></Svg>);
export const IconTrophy = (p) => (<Svg {...p}><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4a3 3 0 0 0 3 4" /><path d="M17 6h3a3 3 0 0 1-3 4" /></Svg>);
export const IconParty = (p) => (<Svg {...p}><path d="M4 20l4-12 8 8z" /><path d="M14 4l.5 2M19 9l-2 .5M17 3l-1.5 3.5M20.5 6.5 17 8" /></Svg>);
export const IconList = (p) => (<Svg {...p}><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></Svg>);
export const IconFilter = (p) => (<Svg {...p}><path d="M3 5h18l-7 8v6l-4 2v-8z" /></Svg>);
export const IconCheckCircle = (p) => (<Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5L16 9.5" /></Svg>);
export const IconDot = ({ color = 'currentColor', size = 12, ...p }) => (<svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" style={{ verticalAlign: '-0.05em', flexShrink: 0 }} {...p}><circle cx="6" cy="6" r="5" fill={color} /></svg>);

export const IconRepeat = (p) => (<Svg {...p}><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><path d="M3 21v-5h5" /></Svg>);
export const IconDownload = (p) => (<Svg {...p}><path d="M12 4v11" /><path d="M7 10l5 5 5-5" /><path d="M4 20h16" /></Svg>);
export const IconChevronDown = (p) => (<Svg {...p}><path d="M6 9l6 6 6-6" /></Svg>);

export function AdviceIcon({ tag, size = 18 }) {
  const Cmp = BY_TAG[tag] || IconBulb;
  return <span className={`adv-ic adv-${BY_TAG[tag] ? tag : 'tip'}`} data-advice-icon={BY_TAG[tag] ? tag : 'tip'}><Cmp size={size} /></span>;
}
