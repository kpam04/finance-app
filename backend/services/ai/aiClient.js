// ตัวกลางเรียกบริการ AI (รูปแบบเดียวกับ OpenAI "chat completions") ตั้งค่าผ่าน Environment ไม่มีคีย์ในโค้ด
// ค่าเริ่มต้นชี้ไป Typhoon API (SCB 10X): AI_BASE_URL=https://api.opentyphoon.ai/v1  AI_MODEL=typhoon-v2.5-30b-a3b-instruct
// เปลี่ยนผู้ให้บริการได้ด้วยการเปลี่ยน AI_BASE_URL / AI_MODEL / AI_API_KEY (ถ้าผู้ให้บริการใช้รูปแบบ OpenAI เหมือนกัน)
class AiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AiError';
    this.code = code; // AUTH | BUSY | UNAVAILABLE | BAD_OUTPUT
  }
}

const intEnv = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : d);

function aiConfig(env = process.env) {
  const apiKey = env.AI_API_KEY || env.TYPHOON_API_KEY || '';
  return {
    configured: !!apiKey,
    apiKey,
    provider: env.AI_PROVIDER || 'typhoon',
    baseUrl: (env.AI_BASE_URL || 'https://api.opentyphoon.ai/v1').replace(/\/+$/, ''),
    model: env.AI_MODEL || 'typhoon-v2.5-30b-a3b-instruct',
    timeoutMs: intEnv(env.AI_TIMEOUT_MS, 20000),
    ocrModel: env.AI_OCR_MODEL || 'typhoon-ocr', // Typhoon OCR 1.5
    ocrTimeoutMs: intEnv(env.AI_OCR_TIMEOUT_MS, 60000),
    ocrPrompt: env.AI_OCR_PROMPT || '',
  };
}

// ดึง JSON จากคำตอบของโมเดล (รองรับกรณีโมเดลใส่ ```json ครอบ หรือมีข้อความนำหน้า/ตามหลัง)
function extractJson(text) {
  const s = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new AiError('BAD_OUTPUT', 'AI ตอบในรูปแบบที่อ่านไม่ได้');
  try {
    return JSON.parse(s.slice(a, b + 1));
  } catch (e) {
    throw new AiError('BAD_OUTPUT', 'AI ตอบในรูปแบบที่อ่านไม่ได้');
  }
}

// ส่งคำขอ chat completions (รูปแบบ OpenAI) และแปลงข้อผิดพลาดเป็น AiError (ไม่แนบเนื้อหาตอบกลับ กันคีย์/ข้อมูลหลุดลงบันทึก)
async function postChat({ body, config = aiConfig(), timeoutMs, fetchImpl = globalThis.fetch }) {
  if (!config.configured) throw new AiError('AUTH', 'ยังไม่ได้ตั้งค่าคีย์ AI');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || config.timeoutMs);
  let res;
  try {
    res = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new AiError('UNAVAILABLE', e && e.name === 'AbortError' ? 'AI ตอบช้าเกินไป' : 'ติดต่อบริการ AI ไม่ได้');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) throw new AiError('AUTH', 'บริการ AI ปฏิเสธคีย์');
  if (res.status === 429) throw new AiError('BUSY', 'บริการ AI ถูกใช้งานหนาแน่น');
  if (!res.ok) throw new AiError('UNAVAILABLE', `บริการ AI ตอบผิดพลาด (${res.status})`);
  try {
    return await res.json();
  } catch (e) {
    throw new AiError('BAD_OUTPUT', 'AI ตอบในรูปแบบที่อ่านไม่ได้');
  }
}

const contentOf = (data) => data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;

// ส่งคำสั่ง + ข้อความ แล้วรับผลเป็น JSON (ข้อความผู้ใช้ต้องผ่านการปิดข้อมูลส่วนตัวมาก่อนที่นี่)
async function chatJSON({ system, user, temperature = 0.1, maxTokens = 450, config = aiConfig(), fetchImpl = globalThis.fetch, timeoutMs }) {
  const data = await postChat({
    body: { model: config.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature, max_tokens: maxTokens },
    config,
    timeoutMs,
    fetchImpl,
  });
  return { json: extractJson(contentOf(data)), model: (data && data.model) || config.model };
}

module.exports = { AiError, aiConfig, chatJSON, postChat, contentOf, extractJson, intEnv };
