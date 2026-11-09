const { postChat, contentOf, AiError, aiConfig, extractJson } = require('./aiClient');

// คำสั่งเริ่มต้นถึง Typhoon OCR: ปรับจากแม่แบบ "default" ที่เผยแพร่ของ Typhoon OCR รุ่นแรก (ให้ผลเป็น JSON ที่มีคีย์ natural_text)
// *** เป็นค่าที่ประมาณจากแม่แบบเดิม ถ้าผลอ่านเพี้ยน ใช้ tools\testReceipt.js ลองกับรูปจริง แล้วปรับด้วย AI_OCR_PROMPT ใน .env ***
const DEFAULT_OCR_PROMPT = [
  'Below is an image of a document page.',
  'Simply return the markdown representation of this document, presenting tables in markdown format as they naturally appear.',
  'If the document contains images, use a placeholder like dummy.png for each image.',
  'Your final output must be in JSON format with a single key `natural_text` containing the response.',
].join('\n');

const MAX_TEXT = 20000;

// ผลของโมเดล OCR อาจเป็นข้อความ Markdown ตรง ๆ หรือ JSON ที่มี natural_text (รุ่นแรก) รองรับทั้งสองแบบ
function textFromOcrContent(content) {
  let raw = content;
  if (Array.isArray(raw)) raw = raw.map((p) => (typeof p === 'string' ? p : p && p.text) || '').join('\n');
  if (typeof raw !== 'string') return '';
  const s = raw.trim();
  if (s.startsWith('{') || s.startsWith('```')) {
    try {
      const j = extractJson(s);
      if (j && typeof j.natural_text === 'string') return j.natural_text.trim();
    } catch (e) { /* ไม่ใช่ JSON ใช้ข้อความดิบ */ }
  }
  return s;
}

// อ่านข้อความจากรูป (data URL JPEG/PNG) คืนข้อความ Markdown ไม่เก็บรูปและข้อความไว้ที่ใด
async function ocrImage(dataUrl, { config = aiConfig(), fetchImpl = globalThis.fetch, timeoutMs } = {}) {
  const data = await postChat({
    body: {
      model: config.ocrModel,
      messages: [{ role: 'user', content: [{ type: 'text', text: config.ocrPrompt || DEFAULT_OCR_PROMPT }, { type: 'image_url', image_url: { url: dataUrl } }] }],
      max_tokens: 4096,
      temperature: 0, // ผลคงที่: รูปเดิมควรได้ข้อความเดิม
      top_p: 0.6,
      repetition_penalty: 1.2,
    },
    config,
    timeoutMs: timeoutMs || config.ocrTimeoutMs,
    fetchImpl,
  });
  const text = textFromOcrContent(contentOf(data));
  if (text.length < 3) throw new AiError('BAD_OUTPUT', 'โมเดลอ่านรูปแล้วไม่พบข้อความ');
  return { text: text.slice(0, MAX_TEXT), model: (data && data.model) || config.ocrModel };
}

module.exports = { ocrImage, textFromOcrContent, DEFAULT_OCR_PROMPT };
