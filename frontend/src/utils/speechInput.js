// ตัวห่อการฟังเสียงของเบราว์เซอร์ (Web Speech API) ไว้ที่เดียว
// ภายหลังถ้าเปลี่ยนวิธีฟังเสียง (เช่น ปลั๊กอินของแอพมือถือ) แก้ที่ไฟล์นี้ไฟล์เดียว หน้าจอไม่ต้องเปลี่ยน
// หมายเหตุ: Chrome ส่งเสียงไปประมวลผลบนเซิร์ฟเวอร์ของผู้ให้บริการเบราว์เซอร์ ต้องมีอินเทอร์เน็ต และบนเว็บจริงต้องเป็น HTTPS

export const SPEECH_MESSAGES = {
  unsupported: 'เบราว์เซอร์นี้ไม่รองรับการพูด ใช้ Chrome, Edge หรือ Safari',
  'not-allowed': 'ไม่ได้รับอนุญาตให้ใช้ไมโครโฟน กดไอคอนกุญแจ/ไมค์ข้างช่องที่อยู่เว็บเพื่ออนุญาต แล้วลองใหม่',
  'service-not-allowed': 'ไม่ได้รับอนุญาตให้ใช้บริการแปลงเสียง ตรวจการตั้งค่าไมโครโฟนของเบราว์เซอร์แล้วลองใหม่',
  'audio-capture': 'ไม่พบไมโครโฟน กรุณาเสียบหรือเปิดไมโครโฟนแล้วลองใหม่',
  'no-speech': 'ไม่ได้ยินเสียง ลองพูดใหม่ให้ใกล้ไมโครโฟนขึ้น',
  network: 'ต้องมีอินเทอร์เน็ตเพื่อแปลงเสียงเป็นข้อความ กรุณาตรวจการเชื่อมต่อแล้วลองใหม่',
  'language-not-supported': 'เบราว์เซอร์นี้ไม่รองรับการฟังภาษาไทย',
  busy: 'กำลังฟังอยู่แล้ว กรุณารอสักครู่',
};

export function getSpeechRecognitionCtor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export const isSpeechSupported = (EngineCtor) => !!(EngineCtor || getSpeechRecognitionCtor());

/**
 * สร้างตัวควบคุมการฟัง 1 ประโยค (ไม่ต่อเนื่อง)
 * onInterim(text): ข้อความระหว่างพูด | onFinal(text): ข้อความสุดท้าย (เรียกครั้งเดียว)
 * onError(code, messageThai): ข้อผิดพลาด (ยกเลิกเองด้วย abort() จะไม่แจ้งข้อผิดพลาด) | onEnd(): จบการฟังทุกกรณี
 * EngineCtor: ใส่เพื่อทดสอบหรือเปลี่ยนเครื่องมือฟังเสียง
 */
export function createSpeechSession({ lang = 'th-TH', onInterim, onFinal, onError, onEnd, EngineCtor } = {}) {
  const Ctor = EngineCtor || getSpeechRecognitionCtor();
  const fireError = (code) => onError && onError(code, SPEECH_MESSAGES[code] || `ใช้เสียงไม่สำเร็จ (รหัส ${code})`);

  if (!Ctor) {
    return { supported: false, start: () => fireError('unsupported'), stop() {}, abort() {} };
  }

  let rec = null;
  let transcript = '';
  let gotFinal = false;
  let failed = false;
  let aborted = false;
  let active = false;

  return {
    supported: true,
    start() {
      if (active) return fireError('busy');
      transcript = '';
      gotFinal = false;
      failed = false;
      aborted = false;
      try {
        rec = new Ctor();
        rec.lang = lang;
        rec.continuous = false;
        rec.interimResults = true;
        rec.maxAlternatives = 1;

        rec.onresult = (e) => {
          let interim = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i];
            const t = (r[0] && r[0].transcript) || '';
            if (r.isFinal) {
              gotFinal = true;
              transcript += t;
            } else {
              interim += t;
            }
          }
          if (interim && onInterim) onInterim(interim.trim());
        };
        rec.onerror = (e) => {
          failed = true; // เกิดข้อผิดพลาดแล้ว ตอน onend จะไม่แจ้งซ้ำว่า "ไม่ได้ยินเสียง"
          if (e.error === 'aborted' || aborted) return; // ถูกยกเลิก (โดยเรา หรือเบราว์เซอร์) จบเงียบ ๆ
          fireError(e.error);
        };
        rec.onend = () => {
          active = false;
          if (!failed && !aborted) {
            if (gotFinal && transcript.trim()) onFinal && onFinal(transcript.trim());
            else fireError('no-speech');
          }
          onEnd && onEnd();
        };
        active = true;
        rec.start();
      } catch (e) {
        active = false;
        failed = true;
        fireError(e && e.name === 'InvalidStateError' ? 'busy' : (e && e.name) || 'unknown');
        onEnd && onEnd();
      }
    },
    stop() {
      if (rec && active) rec.stop(); // หยุดฟังแล้วขอผลที่ได้ยินแล้ว
    },
    abort() {
      aborted = true;
      if (rec && active) rec.abort();
    },
  };
}
