import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import CategorySelect from './CategorySelect.jsx';
import AiConsentModal from './AiConsentModal.jsx';
import ReceiptPanel from './ReceiptPanel.jsx';
import { compareWithAi, fallbackReasonFor, itemsToDrafts } from '../utils/aiDrafts.js';

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};
const box = {
  background: '#fff', borderRadius: 14, padding: 22, width: 520, maxWidth: '100%',
  maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
};
const label = { display: 'block', fontSize: 13, marginBottom: 4, color: '#4b5563' };
const field = { width: '100%', boxSizing: 'border-box' };
const grid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 };

// สีป้ายความมั่นใจของ AI: เขียว (>= 80%) เหลือง (>= 50%) แดง (ต่ำกว่านั้น)
const confTone = (c) => (c >= 0.8 ? { bg: '#ecfdf5', fg: '#065f46', label: 'มั่นใจ' } : c >= 0.5 ? { bg: '#fef3c7', fg: '#92400e', label: 'ค่อนข้างมั่นใจ' } : { bg: '#fee2e2', fg: '#991b1b', label: 'ไม่ค่อยมั่นใจ' });
const warnRing = { boxShadow: '0 0 0 2px #fbbf24', borderRadius: 8 };
const hint = { fontSize: 12, color: '#b45309', marginTop: 4 };

export default function AiConfirmModal({ draft, categories, onConfirm, onClose, onSkip, onCategoryCreated, aiStatus, onAiStatusChange, onUseAiDrafts }) {
  const [form, setForm] = useState({
    type: draft.type || 'expense',
    category_id: draft.category_id || '',
    amount: draft.amount === '' || draft.amount == null ? '' : String(draft.amount),
    transaction_date: draft.transaction_date,
    note: draft.note || '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // ปุ่ม "ให้ AI ช่วยตรวจ": กฎวิเคราะห์ให้ทันทีเสมอ AI ทำเมื่อผู้ใช้กดเท่านั้น แล้วแสดงผลเทียบ ไม่เขียนทับฟอร์มเอง
  const [aiState, setAiState] = useState('idle'); // idle | loading | done | error
  const [aiElapsed, setAiElapsed] = useState(0);
  const [aiResult, setAiResult] = useState(null); // { drafts, ms, cmp }
  const [aiMsg, setAiMsg] = useState('');
  const [showConsent, setShowConsent] = useState(false);
  const [keptEventId, setKeptEventId] = useState(null); // ผู้ใช้เก็บค่าของกฎไว้ (ไว้รายงานว่าแก้ฟิลด์ไหนหลังยืนยัน)
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => {
    if (aiState !== 'loading') return undefined;
    const t = setInterval(() => setAiElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [aiState]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // ข้อมูลจาก AI: ความมั่นใจ ลำดับในชุด (กรณีข้อความเดียวมีหลายรายการ) และฟิลด์ที่ AI ไม่แน่ใจ (ธงหายเมื่อผู้ใช้แก้ฟิลด์นั้นแล้ว)
  const ai = draft.ai || null;
  const total = ai ? ai.total : 1;
  const tone = ai ? confTone(ai.confidence) : null;
  const flagCategory = !!ai && ai.flags.category_guessed && form.category_id === (draft.category_id || '');
  const flagDate = !!ai && ai.flags.date_defaulted && form.transaction_date === draft.transaction_date;
  const isReceipt = !!draft.receipt; // ร่างที่ได้จากการสแกนใบเสร็จ (แสดงแผงใบเสร็จ รูปย่อ และธงเตือนเฉพาะใบเสร็จ)
  const amountUntouched = form.amount === (draft.amount === '' || draft.amount == null ? '' : String(draft.amount));
  const amountFlag = !ai ? null : ai.flags.total_mismatch ? 'mismatch' : ai.flags.amount_from_items ? 'items' : ai.confidence < 0.6 ? 'low' : null;
  const flagAmount = !!amountFlag && amountUntouched;

  const canAskAi = !draft.ai && !draft.is_simulated && !!draft.raw_text && !!aiStatus && !!aiStatus.configured;
  const report = (eventId, body) => {
    if (eventId && api && typeof api.aiFeedback === 'function') Promise.resolve(api.aiFeedback(eventId, body)).catch(() => {});
  };

  const askAi = async () => {
    setAiMsg('');
    setAiElapsed(0);
    setAiState('loading');
    const started = Date.now();
    const voice = draft.source === 'voice';
    try {
      const res = await api.aiParseText({ text: voice ? draft.normalized_text || draft.raw_text : draft.raw_text, source: voice ? 'voice' : 'typed' });
      if (!alive.current) return;
      const ms = Date.now() - started;
      const items = (res.data && res.data.items) || [];
      if (items.length === 0) {
        setAiState('error');
        setAiMsg('AI ไม่พบรายการในข้อความนี้ ใช้ผลจากกฎต่อได้');
        return;
      }
      const drafts = itemsToDrafts(items, { rawText: draft.raw_text, inputSource: voice ? 'voice' : 'typed', eventId: res.data.event_id, model: res.data.model, redactions: res.data.redactions });
      if (voice) drafts.forEach((x) => { x.normalized_text = draft.normalized_text; });
      const cmp = compareWithAi(form, items[0], categories);
      report(res.data.event_id, { action: 'compared', diff: cmp.diff, client_ms: ms });
      setAiResult({ drafts, ms, cmp, eventId: res.data.event_id });
      setAiState('done');
    } catch (e) {
      if (!alive.current) return;
      if (e && e.code === 'AI_CONSENT_REQUIRED' && onAiStatusChange) onAiStatusChange({ ...(aiStatus || {}), enabled: false });
      setAiState('error');
      setAiMsg(`ใช้ AI ไม่ได้: ${fallbackReasonFor(e)} ใช้ผลจากกฎต่อได้`);
    }
  };

  // กดปุ่ม: ถ้ายังไม่เคยเปิด AI ถามความยินยอมก่อน (ข้อความจะถูกส่งไปบริการ AI ภายนอก)
  const onAskClick = () => {
    if (aiStatus && aiStatus.enabled) askAi();
    else setShowConsent(true);
  };

  const adoptAi = () => {
    report(aiResult.eventId, { action: 'adopted' });
    onUseAiDrafts(aiResult.drafts); // แทนร่างปัจจุบันด้วยผลของ AI (ถ้าได้หลายรายการ ตรวจทีละรายการ)
  };
  const keepRules = () => {
    report(aiResult.eventId, { action: 'kept' });
    setKeptEventId(aiResult.eventId);
    setAiResult(null);
    setAiState('kept');
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const amount = parseFloat(form.amount);
    if (!form.category_id) return setError('กรุณาเลือกหมวดหมู่');
    if (!(amount > 0)) return setError('กรุณากรอกจำนวนเงินให้ถูกต้อง');

    setBusy(true);
    try {
      await onConfirm({
        type: form.type,
        category_id: form.category_id,
        amount,
        transaction_date: form.transaction_date,
        note: form.note.trim(),
      }, { keptEventId });
    } catch (err) {
      setError(err.message || 'บันทึกรายการไม่สำเร็จ');
      setBusy(false);
    }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>🤖 ตรวจสอบก่อนบันทึก</h3>

        {total > 1 && (
          <div data-queue style={{ fontSize: 13, color: '#6b7280', margin: '-4px 0 10px' }}>
            รายการที่ {ai.index + 1} จาก {total} (ข้อความเดียวมีหลายรายการ ตรวจทีละรายการ)
          </div>
        )}

        {ai && (
          <div data-ai-badge style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 999, background: '#EEEDFE', color: '#3C3489' }}>{isReceipt ? '✨ AI อ่านจากรูปใบเสร็จ' : '✨ AI แยกรายการให้'}</span>
            <span data-ai-confidence style={{ fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 999, background: tone.bg, color: tone.fg }}>
              {tone.label} {Math.round(ai.confidence * 100)}%
            </span>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>{isReceipt ? 'ตรวจเทียบกับรูปใบเสร็จก่อนกดยืนยันเสมอ' : 'ตรวจให้ตรงกับที่ต้องการก่อนกดยืนยันเสมอ'}</span>
          </div>
        )}

        {isReceipt && <ReceiptPanel receipt={draft.receipt} image={draft.receipt_image} flags={ai ? ai.flags : {}} clientMs={ai ? ai.client_ms : undefined} engine={ai ? ai.engine : undefined} attempts={ai ? ai.attempts : undefined} />}

        {draft.fallback_reason && (
          <div data-fallback className="alert" style={{ marginBottom: 14 }}>
            ใช้การแยกแบบกฎแทน AI: {draft.fallback_reason} กรุณาตรวจสอบรายการก่อนบันทึก
          </div>
        )}

        {draft.is_simulated ? (
          <div className="alert" style={{ marginBottom: 14 }}>
            โหมดสาธิต: ระบบยังไม่ได้อ่านตัวอักษรในรูปจริง ตัวเลขและร้านค้าเป็นค่าตัวอย่างที่เดาจากชื่อไฟล์
            กรุณาแก้ให้ตรงกับใบเสร็จก่อนบันทึก
          </div>
        ) : (
          !draft.ai && draft.confidence !== 'high' && (
            <div className="alert" style={{ marginBottom: 14 }}>
              ระบบไม่แน่ใจบางส่วน (จำนวนเงินหรือหมวดหมู่) กรุณาตรวจสอบก่อนบันทึก
            </div>
          )
        )}

        {draft.image_url && (
          <div style={{ textAlign: 'center', marginBottom: 14 }}>
            <img src={draft.image_url} alt="ตัวอย่างใบเสร็จ" style={{ maxHeight: 160, borderRadius: 8, border: '1px solid #e5e7eb' }} />
          </div>
        )}

        {draft.raw_text && (
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 0 }} data-heard>
            {draft.source === 'voice' ? 'ข้อความที่ได้ยิน' : 'ข้อความที่พิมพ์'}: “{draft.raw_text}”
            {draft.source === 'voice' && draft.normalized_text && draft.normalized_text !== draft.raw_text && (
              <>
                <br />
                แปลงเลขเป็น: “{draft.normalized_text}”
              </>
            )}
          </p>
        )}
        {draft.source === 'voice' && (
          <p data-voice-hint style={{ fontSize: 12, color: '#9ca3af', marginTop: -6 }}>
            การถอดเสียงอาจผิดพลาด โปรดตรวจจำนวนเงิน วันที่ และหมวดหมู่ให้ตรงกับที่พูดก่อนบันทึก
          </p>
        )}

        {canAskAi && aiState !== 'kept' && (
          <div data-ai-helper style={{ margin: '0 0 14px', padding: '10px 12px', border: '1px dashed #c7c2e8', borderRadius: 10, background: '#faf9ff' }}>
            {aiState === 'idle' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-sm btn-light" data-ai-ask onClick={onAskClick}>✨ ให้ AI ช่วยตรวจ</button>
                <span style={{ fontSize: 12, color: '#8A8177' }}>
                  {aiStatus.enabled ? 'ใช้เวลาไม่กี่วินาที ข้อความจะถูกส่งไปบริการ AI ภายนอก ผลที่ได้ไม่เขียนทับฟอร์มเอง' : 'ต้องเปิดใช้ AI ก่อน (จะถามความยินยอมก่อนส่งข้อความ)'}
                </span>
              </div>
            )}
            {aiState === 'loading' && (
              <div data-ai-loading style={{ fontSize: 13, color: '#4b5563' }}>
                ✨ AI กำลังอ่านข้อความ... {aiElapsed} วินาที <span style={{ color: '#9ca3af' }}>(ระหว่างรอ แก้ฟอร์มหรือกดยืนยันได้ตามปกติ)</span>
              </div>
            )}
            {aiState === 'error' && (
              <div data-ai-error style={{ fontSize: 13, color: '#92400e' }}>
                {aiMsg} <button type="button" className="btn btn-sm btn-light" data-ai-retry style={{ marginLeft: 6 }} onClick={onAskClick}>ลองอีกครั้ง</button>
              </div>
            )}
            {aiState === 'done' && aiResult && (
              <div data-ai-result>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  ✨ AI ตรวจแล้ว ใช้เวลา <span data-ai-time>{(aiResult.ms / 1000).toFixed(1)}</span> วินาที (มั่นใจ {Math.round(aiResult.drafts[0].ai.confidence * 100)}%)
                </div>
                {aiResult.cmp.keyCount === 0 ? (
                  <div data-ai-agree style={{ fontSize: 13, color: '#065f46', marginBottom: 8 }}>AI เห็นตรงกับค่าในฟอร์ม ✓ (ประเภท จำนวนเงิน หมวด วันที่)</div>
                ) : (
                  <div data-ai-diff-count style={{ fontSize: 13, color: '#92400e', marginBottom: 6 }}>AI เห็นต่างจากค่าในฟอร์ม {aiResult.cmp.keyCount} ช่อง</div>
                )}
                {aiResult.cmp.rows.length > 0 && (
                  <table data-ai-diff style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginBottom: 8 }}>
                    <thead>
                      <tr style={{ color: '#6b7280', textAlign: 'left' }}><th style={{ padding: '2px 6px 2px 0' }}>ช่อง</th><th style={{ padding: '2px 6px' }}>ในฟอร์มตอนนี้</th><th style={{ padding: '2px 0 2px 6px' }}>AI</th></tr>
                    </thead>
                    <tbody>
                      {aiResult.cmp.rows.map((r) => (
                        <tr key={r.key} data-diff-row={r.key} style={{ opacity: r.minor ? 0.7 : 1 }}>
                          <td style={{ padding: '2px 6px 2px 0' }}>{r.label}</td>
                          <td style={{ padding: '2px 6px' }}>{r.cur}</td>
                          <td style={{ padding: '2px 0 2px 6px', fontWeight: 600, color: '#3C3489' }}>{r.ai}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {aiResult.drafts.length > 1 && <div data-ai-multi style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>AI แยกได้ {aiResult.drafts.length} รายการ (ตารางด้านบนเทียบรายการแรก)</div>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(aiResult.cmp.keyCount > 0 || aiResult.drafts.length > 1) && (
                    <button type="button" className="btn btn-sm" data-ai-adopt onClick={adoptAi}>ใช้ผลของ AI{aiResult.drafts.length > 1 ? ` (${aiResult.drafts.length} รายการ)` : ''}</button>
                  )}
                  <button type="button" className="btn btn-sm btn-light" data-ai-keep onClick={keepRules}>{aiResult.cmp.keyCount === 0 && aiResult.drafts.length === 1 ? 'ตกลง' : 'คงของเดิม'}</button>
                </div>
              </div>
            )}
          </div>
        )}

        <form onSubmit={submit}>
          <div style={grid}>
            <div>
              <label style={label}>ประเภท</label>
              <select style={field} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, category_id: '' })}>
                <option value="expense">รายจ่าย</option>
                <option value="income">รายรับ</option>
              </select>
            </div>
            <div>
              <label style={label}>หมวดหมู่</label>
              <CategorySelect
                style={flagCategory ? { ...field, ...warnRing } : field}
                categories={categories}
                type={form.type}
                value={form.category_id}
                onChange={(v) => setForm((f) => ({ ...f, category_id: v }))}
                onCreated={onCategoryCreated}
                required
              />
              {flagCategory && <div data-flag-category style={hint}>AI เดาหมวดนี้ (ไม่พบหมวดที่ตรง) ตรวจสอบอีกครั้ง</div>}
            </div>
          </div>

          <div style={grid}>
            <div>
              <label style={label}>จำนวนเงิน</label>
              <input style={flagAmount ? { ...field, ...warnRing } : field} type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')} required />
              {flagAmount && <div data-flag-amount style={hint}>{amountFlag === 'mismatch' ? 'ยอดรวมไม่ตรงกับผลรวมรายการสินค้า ตรวจกับรูปใบเสร็จ' : amountFlag === 'items' ? 'อ่านยอดรวมไม่ชัด ใช้ผลรวมรายการแทน ตรวจกับรูปใบเสร็จ' : 'AI ไม่ค่อยมั่นใจ ตรวจจำนวนเงินอีกครั้ง'}</div>}
            </div>
            <div>
              <label style={label}>วันที่</label>
              <input style={flagDate ? { ...field, ...warnRing } : field} type="date" value={form.transaction_date} onChange={set('transaction_date')} required />
              {flagDate && <div data-flag-date style={hint}>{isReceipt ? 'AI ไม่พบวันที่ในใบเสร็จ ใช้วันนี้ให้' : 'AI ไม่พบวันที่ในข้อความ ใช้วันนี้ให้'}</div>}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={label}>บันทึกช่วยจำ</label>
            <input style={field} value={form.note} onChange={set('note')} placeholder="ไม่บังคับ" />
          </div>

          {error && <div className="alert" style={{ marginBottom: 12 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-light" data-cancel onClick={onClose} disabled={busy}>{total > 1 ? 'ยกเลิกทั้งหมด' : 'ยกเลิก'}</button>
            {total > 1 && onSkip && <button type="button" className="btn btn-light" data-skip onClick={onSkip} disabled={busy}>ข้ามรายการนี้</button>}
            <button className="btn" style={{ flex: 1 }} disabled={busy}>
              {busy ? 'กำลังบันทึก...' : '✅ ยืนยันบันทึก'}
            </button>
          </div>
        </form>
      </div>
      {showConsent && (
        <AiConsentModal
          version={(aiStatus && aiStatus.consent_version) || '1.0'}
          onAccepted={(data) => { setShowConsent(false); if (onAiStatusChange) onAiStatusChange(data); askAi(); }}
          onDeclined={() => setShowConsent(false)}
        />
      )}
    </div>
  );
}
