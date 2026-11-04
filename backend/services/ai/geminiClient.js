const { AiError, extractJson, intEnv } = require('./aiClient');

// ตัวอ่านใบเสร็จตัวสำรอง: Google Gemini (อ่านรูปได้โดยตรง และตอบเป็น JSON ในคำขอเดียว)
// คีย์เก็บฝั่งเซิร์ฟเวอร์ใน .env (GEMINI_API_KEY) ส่งทางหัวข้อ x-goog-api-key (ไม่ใส่ในที่อยู่ URL กันคีย์หลุดลงบันทึก)
// แผนฟรีของ Google: เนื้อหาที่ส่งอาจถูกนำไปปรับปรุงผลิตภัณฑ์ของ Google จึงต้องผ่านความยินยอมของผู้ใช้ก่อนเสมอ
function geminiConfig(env = process.env) {
  const apiKey = env.GEMINI_API_KEY || '';
  return {
    configured: !!apiKey,
    apiKey,
    model: env.GEMINI_MODEL || 'gemini-3.8-flash', // Google ปิดรุ่น 2.5 Flash สำหรับผู้ใช้ใหม่แล้ว (ตอบ 404) รุ่นแนะนำตอนนี้คือ 3.8 Flash
    baseUrl: (env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, ''),
    timeoutMs: intEnv(env.GEMINI_TIMEOUT_MS, 45000),
    // ระดับการ "คิด" ของโมเดล (ยิ่งต่ำยิ่งเร็ว): รุ่น 3.x ใช้ GEMINI_THINKING_LEVEL (low | medium | high | minimal ถ้ารุ่นนั้นรองรับ) ไม่ตั้ง = ใช้ low กับ 3.8 Flash (รุ่นนี้ไม่รองรับ minimal)
    // รุ่น 2.5 Flash ใช้ GEMINI_THINKING_BUDGET (ตัวเลข ไม่ตั้ง = 0 คือปิด) ตั้งเป็น none = ไม่ส่งค่าเกี่ยวกับการคิดเลย
    thinkingLevel: env.GEMINI_THINKING_LEVEL,
    thinkingBudget: env.GEMINI_THINKING_BUDGET,
  };
}

const IMG_RE = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/;
const BLOCKED = ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY'];

// ส่งคำสั่ง + รูป (data URL) ให้ Gemini แล้วรับผลเป็น JSON
async function geminiJSON({ prompt, imageDataUrl, config = geminiConfig(), fetchImpl = globalThis.fetch, timeoutMs }) {
  if (!config.configured) throw new AiError('AUTH', 'ยังไม่ได้ตั้งค่าคีย์ Gemini');
  const m = IMG_RE.exec(imageDataUrl || '');
  if (!m) throw new AiError('BAD_OUTPUT', 'รูปไม่ถูกต้อง');

  const generationConfig = { temperature: 0.1, maxOutputTokens: 2000, responseMimeType: 'application/json' };
  // การคิด: ค่าที่ผู้ดูแลตั้งเองมาก่อน แล้วค่าเริ่มต้นตามรุ่น (รุ่นที่ไม่รู้จักไม่ส่งพารามิเตอร์นี้ กันคำขอถูกปฏิเสธ)
  const lv = config.thinkingLevel;
  const tb = config.thinkingBudget;
  if (lv && lv !== 'none') generationConfig.thinkingConfig = { thinkingLevel: lv };
  else if (!lv && /gemini-3\.8/.test(config.model)) generationConfig.thinkingConfig = { thinkingLevel: 'low' };
  else if (lv !== 'none' && tb !== 'none' && /gemini-2\.5-flash/.test(config.model)) generationConfig.thinkingConfig = { thinkingBudget: tb === undefined || tb === '' || !Number.isFinite(Number(tb)) ? 0 : Number(tb) };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || config.timeoutMs);
  let res;
  try {
    res = await fetchImpl(`${config.baseUrl}/models/${encodeURIComponent(config.model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: m[1], data: m[2] } }] }], generationConfig }),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new AiError('UNAVAILABLE', e && e.name === 'AbortError' ? 'Gemini ตอบช้าเกินไป' : 'ติดต่อ Gemini ไม่ได้');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let info = '';
    try { const j = await res.json(); info = (j && j.error && (j.error.message || j.error.status)) || ''; } catch (e) { /* ไม่มีเนื้อหา */ }
    if (res.status === 401 || res.status === 403 || (res.status === 400 && /api key|API_KEY/i.test(info))) throw new AiError('AUTH', 'Gemini ปฏิเสธคีย์');
    if (res.status === 429) throw new AiError('BUSY', 'Gemini ถูกใช้งานหนาแน่นหรือโควต้าเต็ม');
    // 400/404 อื่น ๆ มักเป็นการตั้งค่า (ชื่อรุ่นไม่มี/พารามิเตอร์ไม่รองรับ) บันทึกเหตุผลสั้น ๆ จาก Google (ไม่มีเนื้อหาของผู้ใช้) ให้ผู้ดูแลแก้
    if (res.status === 400 || res.status === 404) console.error('[gemini]', res.status, String(info).slice(0, 200));
    throw new AiError('UNAVAILABLE', `Gemini ตอบผิดพลาด (${res.status})`);
  }

  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new AiError('BAD_OUTPUT', 'Gemini ตอบในรูปแบบที่อ่านไม่ได้');
  }
  if (data && data.promptFeedback && data.promptFeedback.blockReason) throw new AiError('BAD_OUTPUT', 'Gemini ไม่อ่านรูปนี้');
  const cand = data && data.candidates && data.candidates[0];
  if (!cand || BLOCKED.includes(cand.finishReason)) throw new AiError('BAD_OUTPUT', 'Gemini ไม่ให้ผลลัพธ์');
  const text = ((cand.content && cand.content.parts) || []).map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('').trim();
  if (!text) throw new AiError('BAD_OUTPUT', 'Gemini ไม่ให้ผลลัพธ์');
  return { json: extractJson(text), model: (data && data.modelVersion) || config.model };
}

module.exports = { geminiConfig, geminiJSON };
