import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import AiConsentModal from './AiConsentModal.jsx';
import { receiptReady } from '../utils/aiDrafts.js';

// การ์ด "ผู้ช่วย AI" ในหน้าโปรไฟล์: เปิด/ปิดการส่งข้อความไปบริการ AI ภายนอก (ปิดอยู่เป็นค่าเริ่มต้น) และดูโควต้าวันนี้
const css = `
.as-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.as-row h3 { margin: 0 0 4px; }
.as-desc { margin: 0; font-size: 13px; color: #6b7280; line-height: 1.6; }
.as-meta { margin: 8px 0 0; font-size: 12px; color: #8A8177; }
.as-switch { position: relative; flex: 0 0 auto; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; color: #4b5563; }
.as-switch input { position: absolute; opacity: 0; width: 44px; height: 24px; margin: 0; cursor: pointer; }
.as-track { width: 44px; height: 24px; border-radius: 999px; background: #d1d5db; transition: background 0.2s; position: relative; flex: 0 0 44px; }
.as-track::after { content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.25); }
.as-switch input:checked + .as-track { background: #7E9677; }
.as-switch input:checked + .as-track::after { transform: translateX(20px); }
.as-switch input:focus-visible + .as-track { outline: 2px solid #91A68A; outline-offset: 2px; }
.as-switch input:disabled + .as-track { opacity: 0.5; cursor: not-allowed; }
@media (max-width: 520px) { .as-row { flex-direction: column; } }
`;

export default function AiSettingsCard() {
  const [status, setStatus] = useState(null);
  const [showConsent, setShowConsent] = useState(null); // null | 'text' | 'image' | 'plan' (หน้าต่างขอความยินยอมที่เปิดอยู่)
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.aiStatus();
      setStatus(res.data);
    } catch (e) {
      setStatus({ configured: false });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!status) return null;

  const toggleScope = (scope) => async (e) => {
    setMsg('');
    if (e.target.checked) {
      setShowConsent(scope); // เปิดต้องผ่านหน้าต่างขอความยินยอมก่อนเสมอ
      return;
    }
    setBusy(true);
    try {
      const res = await api.aiConsent({ enabled: false, ...(scope === 'image' || scope === 'plan' ? { scope } : {}) });
      setStatus(res.data);
    } catch (err) {
      setMsg(err.message || 'ปิดการใช้ AI ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" data-ai-settings>
      <style>{css}</style>
      <div className="as-row">
        <div>
          <h3>ผู้ช่วย AI</h3>
          <p className="as-desc">
            ปกติระบบแยกข้อความด้วยกฎในเครื่องเราทันที (ไม่ส่งข้อมูลออกไป) ถ้าเปิดไว้ จะมีปุ่ม “✨ ให้ AI ช่วยตรวจ” ในหน้ายืนยันรายการ เมื่อกดข้อความจะถูกส่งไปบริการ AI ภายนอกเพื่อเทียบผลกับกฎ (ปิดอยู่เป็นค่าเริ่มต้น)
          </p>
          {!status.configured && <p className="as-meta" data-ai-unconfigured>ระบบนี้ยังไม่เปิดให้บริการ AI ภายนอก (ใช้การแยกแบบกฎอยู่)</p>}
          {status.configured && status.enabled && (
            <p className="as-meta" data-ai-usage>วันนี้ใช้ AI ไปแล้ว {status.used_today}/{status.daily_limit} ครั้ง (นับเมื่อส่งข้อความให้ AI)</p>
          )}
        </div>
        <label className="as-switch" data-ai-switch>
          <input type="checkbox" role="switch" aria-label="เปิดใช้ผู้ช่วย AI" checked={!!status.enabled} disabled={!status.configured || busy} onChange={toggleScope('text')} />
          <span className="as-track" />
          <span>{status.enabled ? 'เปิดอยู่' : 'ปิดอยู่'}</span>
        </label>
      </div>
      <div className="as-row" data-ai-image-row style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #E9E1D6' }}>
        <div>
          <h3 style={{ fontSize: 16 }}>อ่านรูปใบเสร็จด้วย AI</h3>
          <p className="as-desc">
            ปุ่ม 📷 สแกนใบเสร็จ: ถ่ายหรือเลือกรูป แล้ว AI อ่านยอดที่ชำระ วันที่ ชื่อร้าน และหมวดให้ รูปจะถูกส่งไปบริการ AI ภายนอก (ระบบเราไม่เก็บรูปและข้อความที่อ่านได้) ปิดอยู่เป็นค่าเริ่มต้น
          </p>
          {receiptReady(status) && Array.isArray(status.receipt_engines) && status.receipt_engines.length > 0 && (
            <p className="as-meta" data-ai-engines>ตัวอ่านใบเสร็จ: {status.receipt_engines.map((e, i) => `${e === 'gemini' ? 'Google Gemini' : 'Typhoon OCR'}${i === 0 && status.receipt_engines.length > 1 ? ' (หลัก)' : i > 0 ? ' (สำรอง)' : ''}`).join(' · ')}</p>
          )}
          {receiptReady(status) && status.image_enabled && (
            <p className="as-meta" data-ai-image-usage>วันนี้อ่านใบเสร็จไปแล้ว {status.receipts_used_today}/{status.receipt_daily_limit} ใบ</p>
          )}
        </div>
        <label className="as-switch" data-ai-image-switch>
          <input type="checkbox" role="switch" aria-label="เปิดให้ AI อ่านรูปใบเสร็จ" checked={!!status.image_enabled} disabled={!receiptReady(status) || busy} onChange={toggleScope('image')} />
          <span className="as-track" />
          <span>{status.image_enabled ? 'เปิดอยู่' : 'ปิดอยู่'}</span>
        </label>
      </div>
      <div className="as-row" data-ai-plan-row style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #E9E1D6' }}>
        <div>
          <h3 style={{ fontSize: 16 }}>ให้ AI วิเคราะห์แผนการเงิน</h3>
          <p className="as-desc">
            หน้า “วางแผน”: ให้ AI เขียนคำแนะนำจากตัวเลขสรุปของคุณ (ไม่ส่งรายการรายตัวหรือบันทึกช่วยจำ) ระบบตรวจตัวเลขทุกตัวก่อนแสดง และคุณกดขอเองทุกครั้ง ปิดอยู่เป็นค่าเริ่มต้น
          </p>
          {status.configured && status.plan_enabled && (
            <p className="as-meta" data-ai-plan-usage>วันนี้ขอคำแนะนำจาก AI ไปแล้ว {status.plans_used_today}/{status.plan_daily_limit} ครั้ง</p>
          )}
        </div>
        <label className="as-switch" data-ai-plan-switch>
          <input type="checkbox" role="switch" aria-label="เปิดให้ AI วิเคราะห์แผนการเงิน" checked={!!status.plan_enabled} disabled={!status.configured || busy} onChange={toggleScope('plan')} />
          <span className="as-track" />
          <span>{status.plan_enabled ? 'เปิดอยู่' : 'ปิดอยู่'}</span>
        </label>
      </div>
      {msg && <div className="alert" data-ai-settings-error style={{ marginTop: 10 }}>{msg}</div>}
      {showConsent && (
        <AiConsentModal
          scope={showConsent}
          engines={status.receipt_engines || []}
          version={showConsent === 'image' ? status.image_consent_version : showConsent === 'plan' ? status.plan_consent_version : status.consent_version}
          onAccepted={(data) => { setStatus(data); setShowConsent(null); }}
          onDeclined={() => setShowConsent(null)}
        />
      )}
    </div>
  );
}
