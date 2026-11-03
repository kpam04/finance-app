import { useEffect, useState } from 'react';

// รูปโปรไฟล์แบบวงกลม: มีรูป (data URL) แสดงรูป ไม่มีหรือรูปเสียแสดงตัวอักษรย่อบนพื้นเขียว Sage
export default function Avatar({ src, name = '', size = 40, alt = '', style }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [src]);

  const base = {
    width: size,
    height: size,
    minWidth: size,
    flex: `0 0 ${size}px`,
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    background: '#E8EDE4',
    ...style,
  };

  if (src && !broken) {
    return <img src={src} alt={alt} data-avatar-img style={{ ...base, objectFit: 'cover', display: 'block' }} onError={() => setBroken(true)} />;
  }
  return (
    <span data-avatar-initial aria-hidden="true" style={{ ...base, color: '#40563C', fontWeight: 700, fontSize: Math.max(11, Math.round(size * 0.42)) }}>
      {(name || '?').charAt(0).toUpperCase()}
    </span>
  );
}
