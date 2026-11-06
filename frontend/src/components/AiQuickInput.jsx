import { useEffect, useRef, useState } from 'react';
import { parseNaturalLanguage } from '../utils/aiParser.js';
import { api } from '../api.js';
import { prepareReceiptImage } from '../utils/receiptImage.js';
import { receiptToDraft, receiptReady, itemsToDrafts, fallbackReasonFor } from '../utils/aiDrafts.js';
import AiConsentModal from './AiConsentModal.jsx';
import { normalizeThaiNumbers } from '../utils/thaiNumbers.js';
import { createSpeechSession, isSpeechSupported, SPEECH_MESSAGES } from '../utils/speechInput.js';
import PrivacyModal from './PrivacyModal.jsx';

const VOICE_OK_KEY = 'finance_voice_notice_ok';
const readFlag = () => {
  try {
    return localStorage.getItem(VOICE_OK_KEY) === '1';
  } catch {
    return false;
  }
};
const saveFlag = () => {
  try {
    localStorage.setItem(VOICE_OK_KEY, '1');
  } catch {
    /* ไม่มี localStorage ก็แจ้งใหม่ทุกครั้ง */
  }
};
// ผู้ใช้กด "ไม่ยินยอม" ให้ส่งข้อความไป AI แล้ว: ใช้กฎไปเลย ไม่ถามซ้ำ (เปลี่ยนใจได้ที่การ์ดตั้งค่า AI หน้าโปรไฟล์) จำไว้ในเบราว์เซอร์นี้
const AI_DECLINED_KEY = 'finance_ai_text_declined';
const readDeclined = () => {
  try {
    return localStorage.getItem(AI_DECLINED_KEY) === '1';
  } catch {
    return false;
  }
};
const saveDeclined = () => {
  try {
    localStorage.setItem(AI_DECLINED_KEY, '1');
  } catch {
    /* ไม่มี localStorage: ครั้งหน้าจะถามใหม่ */
  }
};

// รอ AI แยกข้อความได้นานสุดเท่านี้ ถ้าเกินใช้ผลจากกฎแทน
const AI_WAIT_MS = 10000;

const linkBtn = {
  background: 'none', border: 'none', padding: 0, font: 'inherit',
  color: '#4f46e5', textDecoration: 'underline', cursor: 'pointer',
};

// speechEngine: ไม่ต้องใส่ (ใช้ของเบราว์เซอร์) ใส่เฉพาะตอนทดสอบ
// สไตล์ของการ์ด: ช่องพิมพ์ที่มีปุ่มส่งอยู่ภายใน, แถวปุ่มพูด/สแกน, ไอคอน i แสดงตัวอย่างประโยค
//  คอมพิวเตอร์: [ ช่องพิมพ์ ➤ ] [🎤 พูด] [📷 สแกน] แถวเดียวกัน
//  มือถือ (ไม่เกิน 640px): แถวบน = ช่องพิมพ์ / แถวล่าง = ปุ่มพูดและปุ่มสแกนเท่ากัน (กฎกลางของ .form-row เรียงเป็นคอลัมน์อยู่แล้ว)
const css = `
.ai-title { position: relative; display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.ai-title h3 { margin: 0; }
.ai-sub { margin: 0 0 12px; font-size: 13px; line-height: 1.5; color: #6b7280; }
.ai-info-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; padding: 0;
  border: 1.5px solid #9ca3af; border-radius: 50%;
  background: #fff; color: #6b7280;
  font: italic 700 12px/1 Georgia, 'Times New Roman', serif;
  cursor: pointer;
}
.ai-info-btn:hover, .ai-info-btn:focus-visible, .ai-title.open .ai-info-btn {
  background: #f3f4f6; color: #374151; border-color: #6b7280; outline: none;
}
.ai-info-pop {
  display: none;
  position: absolute; left: 0; top: calc(100% + 8px); z-index: 30;
  width: min(400px, calc(100vw - 44px));
  padding: 16px 20px;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  font-size: 13px; line-height: 1.7; color: #4b5563;
}
.ai-info-pop::before { content: ''; position: absolute; left: 0; right: 0; top: -10px; height: 10px; }
.ai-info-pop p { margin: 0 0 6px; }
.ai-info-pop ul { margin: 0; padding-left: 18px; }
.ai-info-pop li + li { margin-top: 6px; }
.ai-title.open .ai-info-pop { display: block; }
@media (hover: hover) {
  .ai-info-btn:hover + .ai-info-pop, .ai-info-btn:focus-visible + .ai-info-pop, .ai-info-pop:hover { display: block; }
}
.ai-info-anchor { display: inline-flex; }
/* คอมพิวเตอร์ (มีเมาส์ และจอกว้างพอ): กล่องตัวอย่างแสดงที่ด้านขวาล่างของไอคอน i (ห่าง 6px)
   แถบโปร่งใสต่อระหว่าง i กับกล่อง เมาส์เลื่อนไปทางไหนก็ไม่หายกลางทาง โดยไม่ทับตัวไอคอน i เอง */
@media (hover: hover) and (min-width: 700px) {
  .ai-info-anchor { position: relative; }
  .ai-info-pop { left: calc(100% + 6px); top: calc(100% + 6px); }
  .ai-info-pop::before { left: -6px; right: 0; top: -26px; width: auto; height: 26px; }
  .ai-info-pop::after { content: ''; position: absolute; left: -26px; top: -6px; bottom: 0; width: 26px; }
}

.ai-input { position: relative; }
.ai-input .ai-text { padding-right: 56px; }
.ai-send {
  position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
  display: inline-flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; padding: 0;
  border: none; border-radius: 10px;
  background: var(--primary, #9AAB91); color: #fff;
  cursor: pointer; transition: background 0.2s ease;
}
.ai-send:hover:not(:disabled) { background: var(--primary-dark, #74896F); }
.ai-send:disabled { background: #EDE6DA; color: #B5ADA2; cursor: not-allowed; }
.form-row > .ai-actions { flex: 0 0 auto; display: flex; gap: 10px; }

@media (max-width: 640px) {
  .form-row > .ai-actions { flex: 1 1 auto; width: 100%; }
  .ai-actions .btn { flex: 1 1 0; min-width: 0; }
}
`;

// ไอคอน i ต่อท้ายชื่อการ์ด: ตัวอย่างประโยค (คอมพิวเตอร์: เมาส์ชี้/โฟกัส, ทุกอุปกรณ์: คลิกหรือแตะเพื่อเปิด-ปิด, Esc หรือแตะที่อื่นเพื่อปิด)
function AiTitle() {
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
    <div className={`ai-title${open ? ' open' : ''}`} ref={ref}>
      <h3>➕ เพิ่มรายการใหม่</h3>
      <span className="ai-info-anchor">
      <button
        type="button"
        className="ai-info-btn"
        data-info-btn
        aria-label="ตัวอย่างประโยคที่ใช้ได้"
        aria-expanded={open}
        aria-controls="ai-info-pop"
        onClick={() => setOpen((v) => !v)}
      >
        i
      </button>
      <div id="ai-info-pop" className="ai-info-pop" role="tooltip" data-info-pop>
        <p>พิมพ์หรือกด 🎤 แล้วพูดเป็นประโยคธรรมดา ระบบจะเปิดการ์ดให้ตรวจก่อนบันทึกทุกครั้ง เช่น</p>
        <ul>
          <li>“เมื่อวาน ค่ากาแฟ 65”</li>
          <li>“วันที่ 25 ก.ย. ได้รับเงินเดือน 38000”</li>
        </ul>
      </div>
      </span>
    </div>
  );
}

export default function AiQuickInput({ categories, onDraftGenerated, speechEngine, aiStatus, onAiStatusChange, onManualAdd, prepareImage = prepareReceiptImage }) {
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [scanState, setScanState] = useState('idle'); // idle | preparing | reading (สแกนใบเสร็จ: เตรียมรูป -> AI อ่าน)
  const [scanElapsed, setScanElapsed] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false); // มือถือ: เมนูเลือก "ถ่ายรูป" หรือ "เลือกรูปจากเครื่อง"
  const [consentFile, setConsentFile] = useState(null); // รูปที่รอผู้ใช้ตัดสินใจเรื่องความยินยอมให้ส่งรูป (ถามครั้งแรก)
  const scanning = scanState !== 'idle';
  const [listening, setListening] = useState(false);
  const [showNotice, setShowNotice] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false); // AI กำลังแยกข้อความ (ยังไม่เปิดการ์ด)
  const [aiElapsed, setAiElapsed] = useState(0);
  const [consentReq, setConsentReq] = useState(null); // ข้อความที่รอผู้ใช้ตัดสินใจเรื่องความยินยอมใช้ AI (ถามครั้งแรก)
  const aiCtrlRef = useRef(null);
  const fileRef = useRef(null);
  const camRef = useRef(null);
  const abortRef = useRef(null);
  const alive = useRef(true);
  const statusRef = useRef(null);
  const sessionRef = useRef(null);
  const catsRef = useRef(categories);
  const draftCb = useRef(onDraftGenerated);
  catsRef.current = categories;
  draftCb.current = onDraftGenerated;
  statusRef.current = aiStatus;

  const supported = isSpeechSupported(speechEngine);

  // ปิดการฟัง/ยกเลิกการอ่านใบเสร็จเมื่อออกจากหน้า
  useEffect(() => () => {
    alive.current = false;
    if (sessionRef.current) sessionRef.current.abort();
    if (abortRef.current) abortRef.current.abort();
    if (aiCtrlRef.current) aiCtrlRef.current.ctrl.abort();
  }, []);

  useEffect(() => {
    if (!aiBusy) return undefined;
    const t = setInterval(() => setAiElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [aiBusy]);

  useEffect(() => {
    if (scanState !== 'reading') return undefined;
    const t = setInterval(() => setScanElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [scanState]);

  // ร่างจากกฎ (ใช้เมื่อไม่ได้เปิด AI หรือ AI ใช้ไม่ได้) reason = เหตุผลที่ไม่ได้ใช้ AI (แสดงในการ์ดยืนยัน)
  const rulesDraft = (req, reason) => {
    const draft = parseNaturalLanguage(req.parseText, catsRef.current);
    if (!draft) return null;
    if (req.source === 'voice') {
      draft.raw_text = req.raw; // ข้อความที่ได้ยินจริง (ไว้ให้ผู้ใช้เทียบในหน้ายืนยัน)
      draft.normalized_text = req.parseText;
      draft.source = 'voice';
    }
    if (reason) draft.fallback_reason = reason;
    return draft;
  };

  const openRules = (req, reason) => {
    const draft = rulesDraft(req, reason);
    if (!draft) {
      setMsg(req.source === 'voice' ? SPEECH_MESSAGES['no-speech'] : 'ไม่พบข้อความ กรุณาพิมพ์ใหม่');
      return;
    }
    draftCb.current(draft);
    setText('');
  };

  // AI เป็นตัวหลัก: รอผลไม่เกิน AI_WAIT_MS แล้วเปิดการ์ด ถ้า AI ใช้ไม่ได้ / ช้าเกิน / ผู้ใช้กดยกเลิก ใช้ผลจากกฎแทน
  const runAi = async (req) => {
    setMsg('');
    setAiElapsed(0);
    setAiBusy(true);
    const ctrl = new AbortController();
    const job = { ctrl, why: '' }; // why: timeout | cancel
    aiCtrlRef.current = job;
    const timer = setTimeout(() => { job.why = 'timeout'; ctrl.abort(); }, AI_WAIT_MS);
    const started = Date.now();
    try {
      const res = await api.aiParseText({ text: req.parseText, source: req.source }, ctrl.signal);
      if (!alive.current || job.why) return;
      const data = res.data || {};
      const items = data.items || [];
      if (items.length === 0) {
        openRules(req, fallbackReasonFor({ code: 'AI_EMPTY' }));
        return;
      }
      const drafts = itemsToDrafts(items, { rawText: req.raw, inputSource: req.source, eventId: data.event_id, model: data.model, redactions: data.redactions });
      const ms = Date.now() - started;
      drafts.forEach((d) => {
        d.ai.client_ms = ms;
        if (req.source === 'voice') d.normalized_text = req.parseText;
      });
      draftCb.current(drafts); // ข้อความเดียวมีหลายรายการ: ตรวจทีละรายการ
      setText('');
    } catch (err) {
      if (!alive.current) return;
      if (job.why === 'timeout') return openRules(req, `AI ตอบช้าเกิน ${AI_WAIT_MS / 1000} วินาที`);
      if (job.why === 'cancel') return openRules(req, 'ยกเลิกการรอ AI');
      if (err && err.code === 'AI_CONSENT_REQUIRED' && onAiStatusChange) onAiStatusChange({ ...(statusRef.current || {}), enabled: false });
      openRules(req, fallbackReasonFor(err));
    } finally {
      clearTimeout(timer);
      if (aiCtrlRef.current === job) aiCtrlRef.current = null;
      if (alive.current) setAiBusy(false);
    }
  };

  const cancelAi = () => {
    const job = aiCtrlRef.current;
    if (!job) return;
    job.why = 'cancel';
    job.ctrl.abort();
  };

  // เลือกทาง: เปิด AI แล้ว -> AI ก่อน / ยังไม่เคยตอบเรื่องความยินยอม -> ถาม / ไม่ยินยอมหรือระบบ AI ไม่พร้อม -> กฎ
  const processInput = (req) => {
    setMsg('');
    if (catsRef.current.length === 0) {
      setMsg('ยังโหลดหมวดหมู่ไม่เสร็จ กรุณารอสักครู่แล้วลองใหม่');
      return;
    }
    if (!req.parseText.trim()) {
      setMsg(req.source === 'voice' ? SPEECH_MESSAGES['no-speech'] : 'ไม่พบข้อความ กรุณาพิมพ์ใหม่');
      return;
    }
    const st = statusRef.current;
    if (!st || !st.configured) return openRules(req); // ระบบ AI ยังไม่ตั้งค่า (หรือโหลดสถานะไม่ได้) ใช้กฎตามเดิม
    if (st.enabled) return runAi(req);
    if (readDeclined()) return openRules(req);
    setConsentReq(req); // ครั้งแรก: ถามความยินยอมก่อนส่งข้อความไปบริการ AI ภายนอก
  };

  const handleText = (e) => {
    e.preventDefault();
    if (aiBusy || !text.trim()) return;
    processInput({ raw: text, parseText: text, source: 'typed' });
  };

  const handleHeard = (heard) => {
    const normalized = normalizeThaiNumbers(heard); // "หกสิบห้า" -> 65 ก่อนอ่านวันที่/จำนวนเงิน
    processInput({ raw: heard, parseText: normalized, source: 'voice' });
  };

  const startListening = () => {
    setMsg('');
    const session = createSpeechSession({
      EngineCtor: speechEngine,
      onInterim: (t) => setText(t),
      onFinal: handleHeard,
      onError: (code, message) => setMsg(message),
      onEnd: () => {
        setListening(false);
        sessionRef.current = null;
      },
    });
    sessionRef.current = session;
    setText('');
    setListening(true);
    session.start();
  };

  const onMic = () => {
    if (listening) {
      if (sessionRef.current) sessionRef.current.stop();
      return;
    }
    if (!supported) {
      setMsg(SPEECH_MESSAGES.unsupported);
      return;
    }
    if (!readFlag()) {
      setShowNotice(true); // ครั้งแรก: แจ้งเรื่องเสียงถูกประมวลผลโดยเบราว์เซอร์ก่อน
      return;
    }
    startListening();
  };

  const acceptNotice = () => {
    saveFlag();
    setShowNotice(false);
    startListening();
  };

  // สแกนใบเสร็จ: ย่อรูปในเครื่อง -> ส่งให้หลังบ้านอ่าน (Typhoon OCR + LLM) -> หน้ายืนยันเดิม (มีรูปย่อ/รายการสินค้าให้เทียบ)
  // ครั้งแรกต้องยินยอมให้ส่งรูปไปบริการภายนอกก่อน ระบบเราไม่เก็บรูปและข้อความที่อ่านได้
  const scanError = (e) => `${e && e.message ? e.message : 'อ่านใบเสร็จไม่สำเร็จ'} (กรอกรายการเองได้ตามปกติ)`;

  const runScan = async (file) => {
    setMsg('');
    setScanElapsed(0);
    setScanState('preparing');
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let prepared;
    try {
      prepared = await prepareImage(file);
    } catch (err) {
      if (alive.current) { setScanState('idle'); setMsg(err.message); }
      return;
    }
    if (ctrl.signal.aborted || !alive.current) return;
    setScanState('reading');
    const started = Date.now();
    try {
      const res = await api.aiParseReceipt({ image: prepared.dataUrl }, ctrl.signal);
      if (ctrl.signal.aborted || !alive.current) return;
      draftCb.current(receiptToDraft(res.data, { thumb: prepared.thumb, clientMs: Date.now() - started }));
    } catch (err) {
      if (ctrl.signal.aborted || !alive.current || (err && err.name === 'AbortError')) return;
      if (err && err.code === 'AI_IMAGE_CONSENT_REQUIRED' && onAiStatusChange) onAiStatusChange({ ...(statusRef.current || {}), image_enabled: false });
      setMsg(scanError(err));
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      if (alive.current && !ctrl.signal.aborted) setScanState('idle');
    }
  };

  const cancelScan = () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = null;
    setScanState('idle');
  };

  const onScanClick = () => {
    setMsg('');
    const st = statusRef.current;
    if (!receiptReady(st)) {
      setMsg('ยังสแกนใบเสร็จไม่ได้ในตอนนี้ (ฟีเจอร์นี้ยังไม่เปิดให้ใช้งาน) กรุณาเพิ่มรายการด้วยการพิมพ์ พูด หรือกรอกรายการเอง');
      return;
    }
    const coarse = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (coarse) setMenuOpen((o) => !o); // มือถือ: เลือกถ่ายรูป/เลือกรูปจากเครื่อง
    else if (fileRef.current) fileRef.current.click(); // คอมพิวเตอร์: เลือกไฟล์รูปทันที
  };

  const handleFile = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // เลือกไฟล์เดิมซ้ำได้
    setMenuOpen(false);
    if (!file) return;
    setMsg('');
    if (!String(file.type || '').startsWith('image/')) {
      setMsg('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
      return;
    }
    const st = statusRef.current;
    if (st && !st.image_enabled) setConsentFile(file); // ยังไม่เคยยินยอมเรื่องรูป: ถามก่อน
    else runScan(file);
  };

  return (
    <form className="card" onSubmit={handleText}>
      <style>{css}</style>
      <AiTitle />
      <p className="ai-sub" data-ai-sub>เลือกวิธีที่สะดวก: พิมพ์หรือพูดให้ AI ช่วยแยกรายการ สแกนใบเสร็จ หรือกรอกเอง ระบบจะให้ตรวจก่อนบันทึกทุกครั้ง</p>
      <div className="form-row ai-row">
        {/* ช่องพิมพ์: ปุ่มส่ง (ลูกศร) อยู่ในช่อง ใช้ได้เมื่อมีข้อความ หรือกด Enter ก็ได้เหมือนกัน */}
        <div className="grow ai-input">
          <input
            className="ai-text"
            placeholder='พิมพ์หรือกด 🎤 แล้วพูด เช่น "เมื่อวาน ค่ากาแฟ 65"'
            aria-label="พิมพ์รายการที่ต้องการบันทึก"
            enterKeyHint="send"
            value={text}
            onChange={(e) => setText(e.target.value)}
            readOnly={listening || aiBusy}
          />
          <button
            type="submit"
            className="ai-send"
            data-send
            aria-label="ตรวจสอบรายการ"
            title="ตรวจสอบรายการ (หรือกด Enter)"
            disabled={listening || scanning || aiBusy || !text.trim()}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14" />
              <path d="M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>

        <div className="ai-actions">
          <button
            type="button"
            className={`btn ${listening ? '' : 'btn-light'}`}
            style={{ minHeight: 44, minWidth: 44 }}
            onClick={onMic}
            disabled={(!supported && !listening) || scanning || aiBusy}
            title={supported ? 'กดแล้วพูดหนึ่งประโยค เช่น "เมื่อวาน ค่ากาแฟหกสิบห้าบาท"' : SPEECH_MESSAGES.unsupported}
            aria-label={listening ? 'หยุดฟัง' : 'พูดเพื่อบันทึกรายการ'}
            data-mic
          >
            {listening ? '🔴 กำลังฟัง... (กดเพื่อหยุด)' : '🎤 พูด'}
          </button>
          <button
            type="button"
            className="btn btn-light"
            data-scan
            disabled={scanning || listening || aiBusy}
            onClick={onScanClick}
            title="ถ่ายหรือเลือกรูปใบเสร็จ ให้ AI อ่านยอดที่ชำระ วันที่ ร้านค้า และหมวดให้"
          >
            {scanState === 'preparing' ? 'กำลังเตรียมรูป...' : scanState === 'reading' ? `กำลังอ่านใบเสร็จ... ${scanElapsed} วินาที` : '📷 สแกนใบเสร็จ'}
          </button>
          <input type="file" accept="image/*" capture="environment" ref={camRef} data-scan-camera onChange={handleFile} style={{ display: 'none' }} />
          <input type="file" accept="image/*" ref={fileRef} data-scan-file onChange={handleFile} style={{ display: 'none' }} />
          {/* กรอกเอง: เปิดฟอร์มเพิ่มรายการ (ย้ายมาไว้ในการ์ดนี้ เพื่อให้ทุกวิธีเพิ่มรายการอยู่ที่เดียวกัน) */}
          {onManualAdd && (
            <button type="button" className="btn btn-light" data-manual disabled={scanning || listening || aiBusy} onClick={onManualAdd} title="เปิดฟอร์มกรอกรายการเอง">
              ✏️ กรอกเอง
            </button>
          )}
        </div>
      </div>

      {menuOpen && (
        <div data-scan-menu style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <button type="button" className="btn btn-sm" data-scan-take onClick={() => { setMenuOpen(false); if (camRef.current) camRef.current.click(); }}>📷 ถ่ายรูปใบเสร็จ</button>
          <button type="button" className="btn btn-sm btn-light" data-scan-pick onClick={() => { setMenuOpen(false); if (fileRef.current) fileRef.current.click(); }}>🖼 เลือกรูปจากเครื่อง</button>
        </div>
      )}

      {aiBusy && (
        <div data-ai-thinking style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, color: '#4b5563' }}>
          <span>✨ AI กำลังวิเคราะห์ข้อความ... {aiElapsed} วินาที <span style={{ color: '#9ca3af' }}>(ถ้าเกิน {AI_WAIT_MS / 1000} วินาที ระบบจะใช้การแยกแบบกฎแทน)</span></span>
          <button type="button" className="btn btn-sm btn-light" data-ai-cancel onClick={cancelAi}>ยกเลิก ใช้แบบกฎ</button>
        </div>
      )}

      {scanning && (
        <div data-scan-progress style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, color: '#4b5563' }}>
          <span>{scanState === 'preparing' ? '📷 กำลังเตรียมรูป...' : '✨ AI กำลังอ่านใบเสร็จ ปกติ 10-20 วินาที บางครั้งนานได้ถึง 1-2 นาที (บริการฟรี) ไม่ต้องปิดหน้านี้ กดยกเลิกแล้วกรอกเองได้'}</span>
          <button type="button" className="btn btn-sm btn-light" data-scan-cancel onClick={cancelScan}>ยกเลิก</button>
        </div>
      )}

      {!supported && (
        <div data-voice-unsupported style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>
          ปุ่มพูดใช้ไม่ได้: {SPEECH_MESSAGES.unsupported}
        </div>
      )}

      {showNotice && (
        <div className="alert" data-voice-notice style={{ marginTop: 10 }}>
          <div style={{ marginBottom: 8 }}>
            การใช้ปุ่มพูด เบราว์เซอร์ของคุณจะส่งเสียงไปแปลงเป็นข้อความกับผู้ให้บริการของเบราว์เซอร์ (เช่น Google สำหรับ Chrome) ต้องมีอินเทอร์เน็ต
            ระบบของเราไม่เก็บไฟล์เสียง{' '}
            <button type="button" style={linkBtn} onClick={() => setShowPolicy(true)}>อ่านนโยบายความเป็นส่วนตัว</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-sm" onClick={acceptNotice}>ตกลง เริ่มพูด</button>
            <button type="button" className="btn btn-sm btn-light" onClick={() => setShowNotice(false)}>ยกเลิก</button>
          </div>
        </div>
      )}

      {msg && <div className="alert" data-voice-msg style={{ marginTop: 10 }}>{msg}</div>}
      <div aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>
        {listening ? 'กำลังฟัง' : ''}
      </div>

      {showPolicy && <PrivacyModal onClose={() => setShowPolicy(false)} />}
      {consentReq && (
        <AiConsentModal
          version={(aiStatus && aiStatus.consent_version) || '1.0'}
          onAccepted={(data) => {
            const req = consentReq;
            setConsentReq(null);
            if (onAiStatusChange) onAiStatusChange(data);
            statusRef.current = data;
            runAi(req);
          }}
          onDeclined={() => {
            const req = consentReq;
            setConsentReq(null);
            saveDeclined();
            openRules(req);
          }}
        />
      )}
      {consentFile && (
        <AiConsentModal
          scope="image"
          engines={(aiStatus && aiStatus.receipt_engines) || []}
          version={(aiStatus && aiStatus.image_consent_version) || '1.0'}
          onAccepted={(data) => {
            const f = consentFile;
            setConsentFile(null);
            if (onAiStatusChange) onAiStatusChange(data);
            runScan(f);
          }}
          onDeclined={() => setConsentFile(null)}
        />
      )}
    </form>
  );
}
