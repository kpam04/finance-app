import { useEffect } from 'react';
import { CONTACT_EMAIL } from '../config.js';

export const POLICY_VERSION = '1.1';

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1100,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};
const box = {
  background: '#fff', borderRadius: 14, padding: 24, width: 640, maxWidth: '100%',
  maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
};

// การ์ดประกาศความเป็นส่วนตัว (หน้าต่างลอย)
// onClose: ปิดการ์ด | onAccept (ไม่บังคับ): ถ้าส่งมาจะมีปุ่ม "ยอมรับ" (ใช้ในหน้าสมัคร)
export default function PrivacyModal({ onClose, onAccept }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} role="dialog" aria-modal="true" aria-label="ประกาศความเป็นส่วนตัว" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>ประกาศความเป็นส่วนตัว</h3>
        <p style={{ color: '#6b7280', marginTop: 0, fontSize: 13 }}>เวอร์ชัน {POLICY_VERSION}</p>

        <ol style={{ lineHeight: 1.8, paddingLeft: 20, marginTop: 0 }}>
          <li>
            <strong>ข้อมูลที่เก็บ:</strong> ชื่อ-นามสกุล อีเมล รหัสผ่าน (เก็บแบบเข้ารหัส ผู้ดูแลระบบอ่านรหัสผ่านจริงไม่ได้)
            รายการรายรับ-รายจ่าย งบประมาณ ข้อมูลโปรไฟล์ที่คุณกรอกเอง (ไม่บังคับ) เช่น ชื่อเล่น เบอร์โทร วันเกิด อาชีพ รายได้ต่อเดือน
            และเวลาที่คุณใช้งานระบบล่าสุด (เพื่อดูแลระบบ)
          </li>
          <li>
            <strong>วัตถุประสงค์:</strong> เพื่อให้บริการบันทึกและวิเคราะห์การเงินส่วนบุคคลของคุณ เช่น สรุปยอด กราฟ การแจ้งเตือนงบประมาณ และคำแนะนำ
          </li>
          <li>
            <strong>ที่เก็บข้อมูล:</strong> ฐานข้อมูลบนคลาวด์ (MongoDB Atlas ภูมิภาคสิงคโปร์)
          </li>
          <li>
            <strong>ผู้เข้าถึงข้อมูล:</strong> เจ้าของบัญชีเห็นข้อมูลของตนเองทั้งหมด ผู้ดูแลระบบเห็นเฉพาะข้อมูลบัญชีพื้นฐาน
            (ชื่อ-นามสกุล อีเมล วันที่สมัคร เวลาใช้งานล่าสุด สถานะ) และไม่เห็นรายการรายรับ-รายจ่าย งบประมาณ หรือข้อมูลโปรไฟล์อื่น
            ระบบไม่ขายหรือเปิดเผยข้อมูลให้บุคคลอื่น
          </li>
          <li>
            <strong>บันทึกการดำเนินการของผู้ดูแลระบบ:</strong> เมื่อผู้ดูแลระบบดำเนินการกับบัญชี (เช่น ระงับ ลบ) ระบบเก็บบันทึกไว้ 1 ปี
            โดยเก็บอีเมลแบบปิดบางส่วนและเหตุผลที่ระบุ
          </li>
          <li>
            <strong>การบันทึกด้วยเสียง (เมื่อเปิดใช้ฟังก์ชันนี้):</strong> เบราว์เซอร์ที่คุณใช้จะส่งเสียงไปประมวลผลกับผู้ให้บริการของเบราว์เซอร์
            (เช่น Google สำหรับ Chrome)
          </li>
          <li>
            <strong>ระยะเวลาเก็บ:</strong> จนกว่าคุณจะลบบัญชี
          </li>
          <li>
            <strong>สิทธิของคุณ:</strong> ดูและแก้ไขข้อมูลได้ที่หน้าโปรไฟล์ และลบบัญชีพร้อมข้อมูลทั้งหมดได้ด้วยตนเองที่หน้าเดียวกัน
          </li>
          <li>
            <strong>ติดต่อ:</strong> {CONTACT_EMAIL}
          </li>
        </ol>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-light" onClick={onClose}>
            ปิด
          </button>
          {onAccept && (
            <button type="button" className="btn" onClick={onAccept}>
              ยอมรับ
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
