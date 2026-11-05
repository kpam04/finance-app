import { useEffect, useRef, useState } from 'react';

// หัวข้อการ์ดที่มีไอคอน i ต่อท้าย กดแล้วเปิดกล่องคำอธิบายสั้น ๆ (หน้าตาและการทำงานเหมือนไอคอน i ของการ์ด "เพิ่มรายการใหม่")
//  คอมพิวเตอร์: เมาส์ชี้/โฟกัสก็เปิด / ทุกอุปกรณ์: คลิกหรือแตะเพื่อเปิด-ปิด Esc หรือแตะที่อื่นเพื่อปิด
const css = `
.it-title { position: relative; display: flex; align-items: center; gap: 8px; }
.it-title h3 { margin: 0; }
.it-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; padding: 0;
  border: 1.5px solid #9ca3af; border-radius: 50%;
  background: #fff; color: #6b7280;
  font: italic 700 12px/1 Georgia, 'Times New Roman', serif;
  cursor: pointer;
}
.it-btn:hover, .it-btn:focus-visible, .it-title.open .it-btn { background: #f3f4f6; color: #374151; border-color: #6b7280; outline: none; }
.it-pop {
  display: none;
  position: absolute; left: 0; top: calc(100% + 8px); z-index: 30;
  width: min(380px, calc(100vw - 40px));
  padding: 14px 18px;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  font-size: 13px; line-height: 1.7; color: #4b5563;
}
.it-pop::before { content: ''; position: absolute; left: 0; right: 0; top: -10px; height: 10px; }
.it-pop p { margin: 0; }
.it-title.open .it-pop { display: block; }
@media (hover: hover) {
  .it-btn:hover + .it-pop, .it-btn:focus-visible + .it-pop, .it-pop:hover { display: block; }
}
.it-anchor { display: inline-flex; }
/* คอมพิวเตอร์ (มีเมาส์ และจอกว้างพอ): กล่องคำอธิบายแสดงที่ด้านขวาล่างของไอคอน i (ห่าง 6px)
   แถบโปร่งใสต่อระหว่าง i กับกล่อง เมาส์เลื่อนจาก i ไปกล่องทางไหนก็ไม่หายกลางทาง โดยไม่ทับตัวไอคอน i เอง (คลิก i ได้ตามปกติ)
     ::before = เหนือกล่อง ตั้งแต่ขอบขวาของ i ถึงขอบขวากล่อง  ::after = ด้านซ้ายของกล่อง ตั้งแต่ใต้ i ลงไปถึงก้นกล่อง */
@media (hover: hover) and (min-width: 700px) {
  .it-anchor { position: relative; }
  .it-pop { left: calc(100% + 6px); top: calc(100% + 6px); }
  .it-pop::before { left: -6px; right: 0; top: -26px; width: auto; height: 26px; }
  .it-pop::after { content: ''; position: absolute; left: -26px; top: -6px; bottom: 0; width: 26px; }
}
`;

export default function InfoTitle({ title, label, popId, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`it-title${open ? ' open' : ''}`} ref={ref}>
      <style>{css}</style>
      <h3>{title}</h3>
      <span className="it-anchor">
        <button
          type="button"
          className="it-btn"
          data-it-btn
          aria-label={label}
          aria-expanded={open}
          aria-controls={popId}
          onClick={() => setOpen((v) => !v)}
        >
          i
        </button>
        <div id={popId} className="it-pop" role="tooltip" data-it-pop>
          {children}
        </div>
      </span>
    </div>
  );
}
