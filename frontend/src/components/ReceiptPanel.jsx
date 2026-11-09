import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { engineLabel } from '../utils/aiDrafts.js';

// แผงใบเสร็จในหน้ายืนยัน: รูปย่อให้เทียบ (แตะขยาย) ชื่อร้าน ชนิดเอกสาร ธงเตือน และรายการสินค้า (ดูอย่างเดียว)
const DOC_TH = { receipt: 'ใบเสร็จ', bill: 'ใบแจ้งหนี้', other: 'เอกสารอื่น' };
const money = (n) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const css = `
.rp-box { display: flex; gap: 12px; margin: 0 0 14px; padding: 10px; border: 1px solid #E9E1D6; border-radius: 10px; background: #FDFBF7; }
.rp-thumb { flex: 0 0 auto; width: 96px; height: 128px; padding: 0; border: 1px solid #E9E1D6; border-radius: 8px; overflow: hidden; background: #fff; cursor: zoom-in; }
.rp-thumb img { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; }
.rp-info { min-width: 0; flex: 1 1 auto; }
.rp-merchant { font-weight: 600; word-break: break-word; }
.rp-pill { display: inline-block; margin-left: 6px; padding: 1px 8px; border-radius: 999px; background: #EEEDFE; color: #3C3489; font-size: 12px; font-weight: 600; vertical-align: middle; }
.rp-note { margin: 6px 0 0; font-size: 12px; line-height: 1.5; color: #92400e; }
.rp-info-note { margin: 6px 0 0; font-size: 12px; color: #6b7280; }
.rp-items summary { margin-top: 8px; cursor: pointer; font-size: 13px; color: #4b5563; }
.rp-items table { width: 100%; margin-top: 6px; border-collapse: collapse; font-size: 13px; }
.rp-items td { padding: 2px 0; vertical-align: top; }
.rp-items td:last-child { text-align: right; white-space: nowrap; padding-left: 8px; }
.rp-items .rp-sum td { border-top: 1px solid #E9E1D6; padding-top: 4px; font-weight: 600; }
.rp-lightbox { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center; padding: 12px; background: rgba(0, 0, 0, 0.8); }
.rp-lightbox img { max-width: 100%; max-height: 100%; border-radius: 8px; background: #fff; }
@media (max-width: 420px) { .rp-box { flex-direction: column; } .rp-thumb { width: 100%; height: 160px; } }
`;

export default function ReceiptPanel({ receipt, image, flags = {}, itemsSumLabel = 'รวมรายการสินค้า', clientMs, engine, attempts }) {
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    if (!zoom) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setZoom(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [zoom]);

  // ผลรวมรายการไม่ตรงยอด = OCR อ่านรายการสินค้าไม่ชัด (ชื่อ/ราคาอาจเพี้ยน) ไม่แสดงรายการ กันผู้ใช้เห็นข้อมูลที่ผิด
  const itemsUnreliable = !!flags.total_mismatch;
  const items = itemsUnreliable ? [] : (receipt && receipt.items) || [];
  const docType = (receipt && receipt.document_type) || 'receipt';
  return (
    <div className="rp-box" data-receipt-panel>
      <style>{css}</style>
      {image && (
        <button type="button" className="rp-thumb" data-receipt-thumb aria-label="ขยายรูปใบเสร็จ" onClick={() => setZoom(true)}>
          <img src={image} alt="รูปใบเสร็จที่เลือก" />
        </button>
      )}
      <div className="rp-info">
        <div>
          <span className="rp-merchant" data-receipt-merchant>{(receipt && receipt.merchant) || 'ไม่พบชื่อร้าน'}</span>
          <span className="rp-pill" data-receipt-doctype>{DOC_TH[docType] || DOC_TH.other}</span>
        </div>
        {flags.is_bill && <p className="rp-note" data-flag-bill>นี่คือใบแจ้งหนี้ (ยังไม่ใช่หลักฐานการชำระเงิน) ตรวจวันที่ให้ตรงกับวันที่จ่ายจริง</p>}
        {itemsUnreliable && (
          <p className="rp-info-note" data-flag-mismatch>อ่านรายการสินค้าได้ไม่ชัด จึงไม่แสดงรายการ (ไม่กระทบยอดที่บันทึก)</p>
        )}
        {flags.total_conflict && <p className="rp-note" data-flag-total-conflict>ยอดที่ AI อ่านไม่ตรงกับตัวเลขหลังคำว่า “ยอดสุทธิ/รวม” ในใบเสร็จ ระบบใช้ตัวเลขจากใบเสร็จแทน ตรวจกับรูปอีกครั้ง</p>}
        {flags.amount_from_rules && <p className="rp-note" data-flag-amount-rules>AI หายอดไม่เจอ ระบบใช้ตัวเลขหลังคำว่า “ยอดสุทธิ/รวม” แทน ตรวจกับรูปอีกครั้ง</p>}
        {flags.total_checked && <p className="rp-info-note" data-flag-total-checked>✓ ยอดเงินตรงกับตัวเลขหลังคำว่า “ยอดสุทธิ/รวม” ในใบเสร็จ</p>}
        {flags.date_from_rules && <p className="rp-info-note" data-flag-date-rules>วันที่ได้จากการค้นหาในข้อความใบเสร็จ</p>}
        {flags.amount_from_items && <p className="rp-note" data-flag-from-items>อ่านยอดรวมไม่ชัด จึงใช้ผลรวมรายการสินค้าแทน ตรวจยอดกับรูป</p>}
        {flags.date_converted_be && <p className="rp-info-note" data-flag-be>แปลงปี พ.ศ. ในใบเสร็จเป็น ค.ศ. ให้แล้ว</p>}
        {engineLabel(engine, attempts) && <p className="rp-info-note" data-receipt-engine>{engineLabel(engine, attempts)}</p>}
        {Number.isFinite(clientMs) && <p className="rp-info-note" data-receipt-time>AI อ่านใบเสร็จใช้เวลา {(clientMs / 1000).toFixed(1)} วินาที</p>}
        {items.length > 0 && (
          <details className="rp-items" data-receipt-items>
            <summary>รายการสินค้า ({items.length} รายการ) · ดูอย่างเดียว</summary>
            <table>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} data-receipt-item>
                    <td>{it.name}{it.qty && it.qty !== 1 ? ` ×${it.qty}` : ''}</td>
                    <td>{money(it.amount)}</td>
                  </tr>
                ))}
                <tr className="rp-sum"><td>{itemsSumLabel}</td><td>{money(receipt.items_sum)}</td></tr>
              </tbody>
            </table>
          </details>
        )}
      </div>
      {zoom && createPortal(
        <div className="rp-lightbox" data-lightbox onClick={(e) => { e.stopPropagation(); setZoom(false); }}>
          <img src={image} alt="รูปใบเสร็จขยาย" />
        </div>,
        document.body
      )}
    </div>
  );
}
