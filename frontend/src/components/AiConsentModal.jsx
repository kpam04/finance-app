import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import PrivacyModal from './PrivacyModal.jsx';

// หน้าต่างขอความยินยอมก่อนส่งข้อความไปบริการ AI ภายนอก (opt-in) ปิดอยู่เป็นค่าเริ่มต้น ผู้ใช้เลือกเปิดเองและปิดได้ทุกเมื่อ
const css = `
.ac-overlay { position: fixed; inset: 0; z-index: 1100; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0, 0, 0, 0.45); }
.ac-box { width: 520px; max-width: 100%; max-height: 92vh; overflow-y: auto; box-sizing: border-box; padding: 22px; border-radius: 14px; background: #fff; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25); }
.ac-box h3 { margin: 0 0 8px; }
.ac-lead { margin: 0 0 12px; font-size: 14px; color: #4b5563; line-height: 1.6; }
.ac-list { margin: 0 0 12px; padding-left: 20px; font-size: 14px; line-height: 1.7; color: #374151; }
.ac-list li { margin-bottom: 4px; }
.ac-note { margin: 0 0 14px; padding: 10px 12px; border-radius: 8px; background: #FEF3C7; color: #78350F; font-size: 13px; line-height: 1.6; }
.ac-link { padding: 0; border: none; background: none; font: inherit; font-size: 13px; color: var(--primary-dark, #74896F); text-decoration: underline; cursor: pointer; }
.ac-actions { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; margin-top: 16px; }
`;

export default function AiConsentModal({ version = '1.0', scope = 'text', engines = [], onAccepted, onDeclined }) {
  const image = scope === 'image';
  const hasGemini = image && engines.includes('gemini'); // ตัวอ่านสำรอง: รูปอาจถูกส่งให้ Google Gemini ด้วย
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPolicy, setShowPolicy] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || showPolicy) return;
      e.stopPropagation();
      if (!busy) onDeclined();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [busy, onDeclined, showPolicy]);

  const accept = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.aiConsent({ enabled: true, accept_version: version, ...(image ? { scope: 'image' } : {}) });
      onAccepted(res.data);
    } catch (e) {
      setError(e.message || 'เปิดใช้ AI ไม่สำเร็จ');
      setBusy(false);
    }
  };

  return createPortal(
    <div className="ac-overlay" data-ai-consent data-scope={scope} onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget && !busy) onDeclined(); }}>
      <style>{css}</style>
      <div className="ac-box" role="dialog" aria-modal="true" aria-labelledby="ac-title" onClick={(e) => e.stopPropagation()}>
        {image ? (
          <>
            <h3 id="ac-title">ให้ AI อ่านรูปใบเสร็จไหม?</h3>
            <p className="ac-lead">ถ่ายหรือเลือกรูปใบเสร็จ แล้ว AI อ่านยอดที่ชำระ วันที่ ชื่อร้าน และเลือกหมวดหมู่ให้ คุณต้องตรวจเทียบกับรูปและกดยืนยันทุกครั้งก่อนบันทึก</p>

            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>ข้อมูลที่ถูกส่งไปบริการ AI ภายนอก</div>
            <ul className="ac-list" data-ai-sent>
              <li><strong>รูปใบเสร็จที่คุณเลือก</strong> (ระบบย่อขนาดและลบข้อมูลตำแหน่งที่ติดมากับรูปก่อนส่ง) ไปให้โมเดลอ่านภาพ (OCR) ของ Typhoon (SCB 10X)</li>
              {hasGemini && <li data-ai-gemini><strong>ถ้า Typhoon ไม่ตอบหรืออ่านไม่สำเร็จ</strong> ระบบจะส่ง <strong>รูปเดียวกันไปให้ Google Gemini</strong> (ผู้ให้บริการอีกราย) อ่านและสรุปแทน</li>}
              <li>ข้อความที่อ่านได้ (ระบบปิดเลขยาว เบอร์โทร และอีเมลให้อัตโนมัติ) ส่งต่อให้โมเดลภาษาสรุปเป็นรายการ พร้อมรายชื่อหมวดรายจ่ายของคุณ</li>
            </ul>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>ข้อมูลที่ไม่ถูกส่ง / ที่เราไม่เก็บ</div>
            <ul className="ac-list" data-ai-not-sent>
              <li>ชื่อ อีเมล รหัสผู้ใช้ รหัสผ่าน รูปโปรไฟล์ และรายการอื่นของคุณ</li>
              <li><strong>ระบบเราไม่เก็บรูปและข้อความที่อ่านได้</strong> (ใช้ชั่วคราวระหว่างอ่าน) เก็บเฉพาะรายการที่คุณกดยืนยัน</li>
            </ul>

            <div className="ac-note" data-ai-free-note>
              ใบเสร็จอาจมีข้อมูลส่วนตัว (ชื่อ เลขสมาชิก เลขบัตร เบอร์โทร) ควรครอบตัดส่วนที่ไม่ต้องการออกก่อนส่ง และบริการ AI ที่ใช้เป็นแผนฟรี ผู้ให้บริการ{hasGemini ? ' (รวมถึง Google)' : ''}อาจเก็บข้อมูลหรือนำเนื้อหาไปปรับปรุงโมเดล/ผลิตภัณฑ์ของเขา
            </div>
          </>
        ) : (
          <>
            <h3 id="ac-title">เปิดใช้ผู้ช่วย AI ไหม?</h3>
            <p className="ac-lead">ปกติระบบแยกข้อความด้วยกฎในเครื่องเราทันที ถ้าเปิด AI จะมีปุ่ม “✨ ให้ AI ช่วยตรวจ” ในหน้ายืนยัน กดแล้ว AI อ่านข้อความที่คุณพิมพ์หรือพูด (เช่น “เมื่อวาน ค่ากาแฟ 65 บาท”) แล้วเทียบกับผลของระบบให้ดู คุณเลือกใช้หรือคงของเดิม และต้องกดยืนยันทุกครั้งก่อนบันทึก</p>

            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>ข้อมูลที่ถูกส่งไปบริการ AI ภายนอก</div>
            <ul className="ac-list" data-ai-sent>
              <li>เฉพาะ <strong>ข้อความที่คุณพิมพ์/พูด</strong> ระบบปิดเลขยาว (เลขบัตร เลขบัญชี เบอร์โทร) และอีเมลก่อนส่งให้อัตโนมัติ</li>
              <li>รายชื่อหมวดหมู่ของคุณ (เพื่อให้ AI เลือกหมวดได้)</li>
            </ul>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>ข้อมูลที่ไม่ถูกส่ง</div>
            <ul className="ac-list" data-ai-not-sent>
              <li>ชื่อ อีเมล รหัสผู้ใช้ รหัสผ่าน รูปโปรไฟล์ และรายการรายรับ-รายจ่ายอื่น ๆ ของคุณ</li>
            </ul>

            <div className="ac-note" data-ai-free-note>
              บริการ AI ที่ใช้เป็นแผนฟรี ผู้ให้บริการอาจเก็บข้อมูลการใช้งานเพื่อปรับปรุงโมเดล จึงไม่ควรพิมพ์ข้อมูลที่ไม่อยากให้ผู้อื่นเห็นลงในช่องนี้
            </div>
          </>
        )}

        <p className="ac-lead" style={{ marginBottom: 6 }}>
          {image ? 'ถ้าไม่เปิด คุณกรอกรายการจากใบเสร็จเองได้ตามปกติ ไม่มีอะไรถูกส่งออกไป ' : 'ถ้าไม่เปิด ระบบยังแยกข้อความให้ด้วยกฎในระบบเราเอง ไม่ส่งข้อมูลออกไปไหน '}คุณเปลี่ยนใจปิด/เปิดได้ที่หน้าโปรไฟล์ทุกเมื่อ{' '}
          <button type="button" className="ac-link" onClick={() => setShowPolicy(true)}>อ่านนโยบายความเป็นส่วนตัว</button>
        </p>

        {error && <div className="alert" data-ai-consent-error style={{ marginTop: 10 }}>{error}</div>}

        <div className="ac-actions">
          <button type="button" className="btn btn-light" data-ai-decline onClick={onDeclined} disabled={busy}>{image ? 'ไม่ใช้ ฉันกรอกเอง' : 'ไม่เปิด ใช้แบบกฎ'}</button>
          <button type="button" className="btn" data-ai-accept onClick={accept} disabled={busy}>{busy ? 'กำลังเปิดใช้...' : image ? 'เปิดให้ AI อ่านใบเสร็จ' : 'เปิดใช้ AI'}</button>
        </div>
      </div>
      {showPolicy && <PrivacyModal onClose={() => setShowPolicy(false)} />}
    </div>,
    document.body
  );
}
