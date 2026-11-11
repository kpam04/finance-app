/**
 * ระบบจัดหมวดหมู่อัตโนมัติ (Rule-based Auto-categorize)
 * ใช้คีย์เวิร์ดภาษาไทย/อังกฤษ จับคู่กับชื่อหมวดหมู่มาตรฐานของระบบ
 */

const CATEGORY_RULES = [
  // --- รายรับ ---
  {
    category: 'เงินเดือน',
    type: 'income',
    keywords: ['เงินเดือน', 'salary', 'เงินประจำ', 'ค่าตอบแทนประจำ', 'ค่าแรง', 'เงินงวด', 'สลิปเงินเดือน'],
  },
  {
    category: 'รายได้เสริม',
    type: 'income',
    keywords: [
      'ฟรีแลนซ์', 'ค่าจ้าง', 'งานนอก', 'ขายของ', 'ขายได้', 'กำไร', 'ปันผล', 'ค่าคอม', 'คอมมิชชั่น',
      'รายได้เสริม', 'งานพิเศษ', 'จ๊อบพิเศษ', 'รับจ้าง', 'ค่าบริการ', 'เงินคืน', 'cashback',
      'ดอกเบี้ย', 'เงินเข้า', 'รับโอน', 'โอนเข้า', 'ได้เงิน', 'รับเงิน', 'ลูกหนี้คืนเงิน',
    ],
  },
  {
    category: 'ของขวัญ/โบนัส',
    type: 'income',
    keywords: ['โบนัส', 'bonus', 'ของขวัญ', 'อั่งเปา', 'เงินขวัญถุง', 'รางวัล', 'ถูกหวย', 'สลาก', 'แต๊ะเอีย'],
  },

  // --- รายจ่าย ---
  // สัตว์เลี้ยงต้องตรวจก่อนอาหาร เพื่อให้ "อาหารแมว" ไม่ถูกจับเป็นอาหารทั่วไป
  {
    category: 'สัตว์เลี้ยง',
    type: 'expense',
    keywords: [
      'น้องหมา', 'น้องแมว', 'สุนัข', 'แมว', 'สัตว์เลี้ยง', 'สัตวแพทย์', 'ทรายแมว', 'อาหารแมว', 'อาหารหมา',
      'อาหารสุนัข', 'ขนมแมว', 'ขนมหมา', 'หมอแมว', 'หมอหมา', 'คลินิกสัตว์', 'โรงพยาบาลสัตว์', 'วัคซีนสัตว์',
      'ตัดขนน้อง', 'เพ็ท', 'pet',
    ],
  },
  {
    category: 'อาหาร',
    type: 'expense',
    keywords: [
      'กาแฟ', 'ข้าว', 'อาหาร', 'ส้มตำ', 'หมูกระทะ', 'ชานม', 'คาเฟ่', 'ขนม', 'เค้ก', 'บุฟเฟ่ต์',
      '7-eleven', '7-11', 'เซเว่น', 'kfc', 'mcdonald', 'amazon', 'starbucks', 'เตี๋ยว', 'ก๋วยเตี๋ยว',
      'มื้อเย็น', 'เที่ยง', 'เช้า', 'ซูเปอร์มาร์เก็ต', 'โลตัส', 'บิ๊กซี', 'ของกิน', 'ชาบู', 'กับข้าว',
    ],
  },
  {
    category: 'เดินทาง',
    type: 'expense',
    keywords: [
      'น้ำมัน', 'ปตท', 'ptt', 'shell', 'caltex', 'bts', 'mrt', 'แท็กซี่', 'taxi', 'ทางด่วน',
      'ตั๋วเครื่องบิน', 'แกร็บ', 'grab', 'วินมอเตอร์ไซค์', 'รถเมล์', 'ค่าเดินทาง', 'ตั๋วรถไฟ',
      'ที่จอดรถ', 'ค่าจอดรถ', 'ซ่อมรถ', 'เปลี่ยนถ่ายน้ำมันเครื่อง',
    ],
  },
  {
    category: 'ที่พัก/ค่าเช่า',
    type: 'expense',
    keywords: ['ค่าเช่า', 'ค่าห้อง', 'เช่าคอนโด', 'หอพัก', 'ผ่อนบ้าน', 'ส่วนกลาง', 'ค่างวดบ้าน'],
  },
  // ความงาม: ตรวจก่อนการศึกษา/ช้อปปิ้ง เพื่อให้ "คอร์สความงาม" ไม่ถูกจับเป็นการศึกษา
  // ใช้หมวดความงามของผู้ใช้ถ้ามี (ชื่อมีคำว่า ความงาม/สวย/beauty) ไม่มีจึงใช้ "อื่นๆ"
  {
    category: 'ความงาม',
    nameHints: ['ความงาม', 'สวย', 'beauty', 'บิวตี้'],
    alt: ['อื่นๆ'],
    type: 'expense',
    keywords: [
      'ความงาม', 'เสริมความงาม', 'คลินิกความงาม', 'ทรีตเมนต์', 'treatment', 'เลเซอร์', 'laser', 'โบท็อก', 'botox',
      'ฟิลเลอร์', 'filler', 'ร้อยไหม', 'ทำหน้า', 'ฉีดหน้า', 'ทำผม', 'ทำเล็บ', 'สปา', 'spa', 'นวดหน้า', 'สักคิ้ว', 'ต่อขนตา', 'ศัลยกรรม',
    ],
  },
  // ผลิตภัณฑ์ความงาม: ไปหมวด "ความงาม" เฉพาะเมื่อผู้ใช้มีหมวดนี้ ไม่มีก็ปล่อยให้กฎช้อปปิ้งด้านล่างจับ
  {
    category: 'ความงาม',
    nameHints: ['ความงาม', 'สวย', 'beauty', 'บิวตี้'],
    type: 'expense',
    keywords: ['เครื่องสำอาง', 'สกินแคร์', 'skincare', 'ครีม', 'เซรั่ม', 'ลิป', 'น้ำหอม'],
  },
  {
    category: 'ช้อปปิ้ง',
    type: 'expense',
    keywords: [
      'เสื้อผ้า', 'รองเท้า', 'กระเป๋า', 'shopee', 'lazada', 'zara', 'uniqlo', 'ของใช้',
      'ช้อปปิ้ง', 'shopping', 'เครื่องสำอาง', 'หูฟัง', 'เคส', 'สั่งของ',
    ],
  },
  {
    category: 'สาธารณูปโภค',
    type: 'expense',
    keywords: ['ค่าไฟ', 'ค่าน้ำ', 'ค่าเน็ต', 'เน็ต', 'wifi', 'ais', 'true', 'dtac', 'ไฟฟ้า', 'ประปา', 'ค่าโทรศัพท์', 'เติมเงิน'],
  },
  {
    category: 'สุขภาพ',
    type: 'expense',
    keywords: ['ค่ายา', 'ซื้อยา', 'หมอ', 'โรงพยาบาล', 'คลินิก', 'อาหารเสริม', 'วิตามิน', 'ฟิตเนส', 'รักษา', 'ทำฟัน'],
  },
  // บริการสมาชิกตรวจก่อนบันเทิง (Netflix / Spotify / YouTube / สตรีมมิ่ง ย้ายมาอยู่หมวดนี้)
  {
    category: 'บริการสมาชิก',
    type: 'expense',
    keywords: [
      'netflix', 'spotify', 'youtube', 'disney', 'hbo', 'prime video', 'icloud', 'google one', 'chatgpt',
      'canva', 'adobe', 'office 365', 'microsoft 365', 'apple music', 'apple one', 'vpn', 'สตรีมมิ่ง',
      'ค่าสมาชิก', 'สมาชิกรายเดือน', 'สมาชิกรายปี', 'subscription', 'membership',
    ],
  },
  {
    category: 'บันเทิง',
    type: 'expense',
    keywords: ['หนัง', 'ตั๋วหนัง', 'คอนเสิร์ต', 'เกม', 'steam', 'playstation', 'เติมเกม', 'ท่องเที่ยว'],
  },
  {
    category: 'การศึกษา',
    type: 'expense',
    keywords: ['หนังสือ', 'ค่าเทอม', 'เรียน', 'คอร์ส', 'อบรม', 'ค่าหนังสือ', 'อุปกรณ์การเรียน', 'เรียนพิเศษ'],
  },
];

/** หา category_id จากคีย์เวิร์ด (ไม่เจอคืน null — ไม่มีค่าเริ่มต้น) */
export function matchCategoryByKeyword(text, categories = [], preferredType = null) {
  if (!text) return null;
  const lower = text.toLowerCase();

  for (const rule of CATEGORY_RULES) {
    if (preferredType && rule.type !== preferredType) continue;
    if (!rule.keywords.some((kw) => lower.includes(kw))) continue;

    // หมวดที่ผู้ใช้สร้างเองและชื่อบอกความหมายเดียวกัน (nameHints) เช่น "ความสวยความงาม" / "Beauty"
    if (rule.nameHints) {
      const own = categories.find((c) => c.type === rule.type && rule.nameHints.some((h) => c.name.toLowerCase().includes(h)));
      if (own) return own.category_id;
    }
    // ชื่อหมวดตามกฎ ถ้าผู้ใช้ไม่มีหมวดนั้น ลองชื่อสำรอง (alt) ตามลำดับ
    for (const name of [rule.category, ...(rule.alt || [])]) {
      const found = categories.find(
        (c) => c.name.toLowerCase() === name.toLowerCase() && c.type === rule.type
      );
      if (found) return found.category_id;
    }
  }
  return null;
}

/** เหมือนด้านบน แต่ถ้าไม่เจอจะใช้หมวดสำรอง (รายจ่าย = "อื่นๆ", รายรับ = "รายได้เสริม") */
export function autoCategorize(text, categories = [], preferredType = null) {
  const matched = matchCategoryByKeyword(text, categories, preferredType);
  if (matched) return matched;
  if (!preferredType) return null;

  const fallbackName = preferredType === 'income' ? 'รายได้เสริม' : 'อื่นๆ';
  const fallback =
    categories.find((c) => c.type === preferredType && c.name === fallbackName) ||
    categories.find((c) => c.type === preferredType);
  return fallback ? fallback.category_id : null;
}
