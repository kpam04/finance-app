import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import ColorPalette from './ColorPalette.jsx';
import CategoryCreateModal from './CategoryCreateModal.jsx';
import { TYPE_LABEL } from '../utils/categoryColors.js';

// การ์ด "หมวดหมู่ของฉัน" (อยู่ในหน้าโปรไฟล์): ดู/สร้าง/แก้ชื่อ-สี/ลบ/แสดงอีกครั้ง
//  ลบ: ไม่เคยใช้ = ลบจริง / เคยมีรายการ = ซ่อน (ประวัติเดิมยังอยู่) / ยังมีงบหรือรายการซ้ำที่ใช้อยู่ = ไม่ให้ลบ (ระบบหลังบ้านตัดสินและบอกเหตุผล)
const css = `
.mc-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }
.mc-head h3 { margin: 0; }
.mc-count { margin: 0 0 12px; font-size: 13px; color: #6b7280; }
.mc-count.full { color: #b45309; }
.mc-add { display: flex; gap: 8px; flex-wrap: wrap; }
.mc-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 0; border-top: 1px solid #e5e7eb; }
.mc-row:first-of-type { border-top: none; }
.mc-dot { width: 14px; height: 14px; border-radius: 50%; flex: 0 0 14px; }
.mc-name { font-weight: 600; word-break: break-word; }
.mc-info { flex: 1 1 160px; min-width: 0; }
.mc-meta { margin-top: 2px; font-size: 12px; color: #6b7280; }
.mc-badge { margin-left: 6px; padding: 1px 8px; border-radius: 999px; background: #f3f4f6; color: #6b7280; font-size: 11px; font-weight: 500; }
.mc-badge.hidden { background: #fef3c7; color: #92400e; }
.mc-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.mc-edit { flex: 1 1 100%; padding: 8px 0 4px; }
.mc-edit input { width: 100%; box-sizing: border-box; margin-bottom: 10px; }
.mc-edit-actions { display: flex; gap: 8px; margin-top: 12px; }
.mc-empty { margin: 8px 0 4px; color: #9ca3af; font-size: 14px; }
.mc-notice { margin: 0 0 10px; padding: 8px 12px; border-radius: 8px; font-size: 13px; }
.mc-notice.ok { background: #ecfdf5; color: #065f46; }
.mc-notice.error { background: #fee2e2; color: #991b1b; }
.mc-defaults summary { cursor: pointer; font-size: 13px; color: #4b5563; }
.mc-defaults ul { margin: 8px 0 0; padding-left: 0; list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 6px 12px; font-size: 13px; }
.mc-defaults li { display: flex; align-items: center; gap: 8px; }
.mc-confirm-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0, 0, 0, 0.45); }
.mc-confirm { width: 420px; max-width: 100%; box-sizing: border-box; padding: 22px; border-radius: 14px; background: #fff; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25); }
.mc-confirm h3 { margin: 0 0 8px; }
.mc-confirm p { margin: 0 0 14px; font-size: 14px; line-height: 1.6; color: #4b5563; }
.mc-confirm-actions { display: flex; gap: 10px; justify-content: flex-end; }
`;

const totalUsage = (u) => (u ? (u.transactions || 0) + (u.budgets || 0) + (u.recurring || 0) : 0);

export default function MyCategories() {
  const [mine, setMine] = useState([]);
  const [meta, setMeta] = useState(null);
  const [defaults, setDefaults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null); // { kind: 'ok' | 'error', text }
  const [creatingType, setCreatingType] = useState(null);
  const [editing, setEditing] = useState(null); // { id, name, color }
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, d] = await Promise.all([api.getMyCategories(), api.getCategories()]);
      setMine(m.data || []);
      setMeta(m.meta || null);
      setDefaults((d.data || []).filter((c) => c.is_default));
    } catch (e) {
      setNotice({ kind: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const full = !!meta && meta.custom_active >= meta.max_active;

  const startEdit = (c) => {
    setEditing({ id: String(c.category_id), name: c.name, color: c.color });
    setEditError('');
    setNotice(null);
  };

  const saveEdit = async () => {
    if (!editing || saving) return;
    setSaving(true);
    setEditError('');
    try {
      await api.updateCategory(editing.id, { name: editing.name, color: editing.color });
      setEditing(null);
      setNotice({ kind: 'ok', text: 'บันทึกการแก้ไขแล้ว' });
      await load();
    } catch (e) {
      setEditError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await api.deleteCategory(deleteTarget.category_id);
      setDeleteTarget(null);
      setNotice({ kind: 'ok', text: res.message || 'เรียบร้อย' });
      await load();
    } catch (e) {
      setDeleteError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const restore = async (c) => {
    setNotice(null);
    try {
      const res = await api.restoreCategory(c.category_id);
      setNotice({ kind: 'ok', text: res.message || 'แสดงหมวดหมู่อีกครั้งแล้ว' });
      await load();
    } catch (e) {
      setNotice({ kind: 'error', text: e.message });
    }
  };

  const onCreated = async (cat) => {
    setCreatingType(null);
    setNotice({ kind: 'ok', text: `สร้างหมวด “${cat.name}” แล้ว` });
    await load();
  };

  const deleteText = (c) => {
    const n = totalUsage(c.usage);
    if (c.hidden) {
      return n === 0
        ? 'หมวดนี้ซ่อนอยู่และไม่มีข้อมูลใช้อยู่ จะลบถาวร (กู้คืนไม่ได้)'
        : 'หมวดนี้ยังมีข้อมูลเก่าใช้อยู่ จึงลบถาวรไม่ได้ (ซ่อนอยู่แล้ว)';
    }
    return n === 0
      ? 'หมวดนี้ยังไม่เคยถูกใช้ จะลบถาวร (กู้คืนไม่ได้)'
      : `หมวดนี้ถูกใช้แล้ว (รายการ ${c.usage.transactions || 0} · งบ ${c.usage.budgets || 0} · รายการซ้ำ ${c.usage.recurring || 0}) จะถูกซ่อนแทนการลบ: ไม่แสดงในตัวเลือก แต่ประวัติเดิมยังแสดงชื่อหมวดนี้ และกด “แสดงอีกครั้ง” ได้`;
  };

  return (
    <div className="card" data-my-categories>
      <style>{css}</style>
      <div className="mc-head">
        <h3>หมวดหมู่ของฉัน</h3>
        <div className="mc-add">
          <button type="button" className="btn btn-sm btn-light" data-create="expense" disabled={full} onClick={() => setCreatingType('expense')}>+ หมวดรายจ่าย</button>
          <button type="button" className="btn btn-sm btn-light" data-create="income" disabled={full} onClick={() => setCreatingType('income')}>+ หมวดรายรับ</button>
        </div>
      </div>

      {meta && (
        <p className={`mc-count${full ? ' full' : ''}`} data-mc-count>
          {full
            ? `ใช้หมวดของตัวเองครบ ${meta.max_active} หมวดแล้ว (สร้างเพิ่มไม่ได้จนกว่าจะลบหรือซ่อนหมวดที่ไม่ใช้)`
            : `ใช้อยู่ ${meta.custom_active}/${meta.max_active} หมวด`}
          {meta.custom_total > meta.custom_active ? ` · ซ่อนอยู่ ${meta.custom_total - meta.custom_active} (รวม ${meta.custom_total}/${meta.max_total})` : ''}
        </p>
      )}

      {notice && <div className={`mc-notice ${notice.kind === 'error' ? 'error' : 'ok'}`} role={notice.kind === 'error' ? 'alert' : 'status'} data-mc-notice>{notice.text}</div>}

      {loading ? (
        <p className="mc-empty">กำลังโหลด...</p>
      ) : mine.length === 0 ? (
        <p className="mc-empty" data-mc-empty>ยังไม่ได้สร้างหมวดของตัวเอง กดปุ่ม “+ หมวดรายจ่าย” หรือ “+ หมวดรายรับ” เพื่อสร้าง (หมวดมาตรฐานใช้ได้เลย)</p>
      ) : (
        <div>
          {mine.map((c) => {
            const isEditing = editing && editing.id === String(c.category_id);
            const used = totalUsage(c.usage);
            return (
              <div className="mc-row" key={c.category_id} data-mc-row data-hidden={c.hidden ? '1' : '0'} style={{ opacity: c.hidden ? 0.75 : 1 }}>
                <span className="mc-dot" style={{ background: c.color }} />
                <div className="mc-info">
                  <div>
                    <span className="mc-name">{c.name}</span>
                    <span className="mc-badge">{TYPE_LABEL[c.type] || c.type}</span>
                    {c.hidden && <span className="mc-badge hidden">ซ่อนอยู่</span>}
                  </div>
                  <div className="mc-meta">
                    {used === 0 ? 'ยังไม่เคยถูกใช้' : `ใช้แล้ว: รายการ ${c.usage.transactions || 0} · งบ ${c.usage.budgets || 0} · รายการซ้ำ ${c.usage.recurring || 0}`}
                  </div>
                </div>
                {!isEditing && (
                  <div className="mc-actions">
                    {c.hidden && <button type="button" className="btn btn-sm btn-light" data-restore onClick={() => restore(c)}>แสดงอีกครั้ง</button>}
                    <button type="button" className="btn btn-sm btn-light" data-edit onClick={() => startEdit(c)}>แก้ไข</button>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      data-delete
                      disabled={c.hidden && used > 0}
                      title={c.hidden && used > 0 ? 'ลบถาวรไม่ได้ เพราะยังมีข้อมูลเก่าใช้หมวดนี้อยู่' : undefined}
                      onClick={() => { setDeleteError(''); setDeleteTarget(c); }}
                    >
                      ลบ
                    </button>
                  </div>
                )}
                {isEditing && (
                  <div className="mc-edit" data-mc-edit>
                    <input
                      aria-label="ชื่อหมวดหมู่"
                      maxLength={40}
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(); } }}
                    />
                    <ColorPalette value={editing.color} onChange={(v) => setEditing({ ...editing, color: v })} disabled={saving} />
                    {editError && <div className="alert" data-mc-edit-error style={{ marginTop: 10 }}>{editError}</div>}
                    <div className="mc-edit-actions">
                      <button type="button" className="btn btn-sm btn-light" onClick={() => setEditing(null)} disabled={saving}>ยกเลิก</button>
                      <button type="button" className="btn btn-sm" data-save onClick={saveEdit} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <details className="mc-defaults" style={{ marginTop: 14 }}>
        <summary>ดูหมวดมาตรฐาน ({defaults.length} หมวด ใช้ร่วมกันทุกคน แก้ไม่ได้)</summary>
        <ul>
          {defaults.map((c) => (
            <li key={c.category_id}>
              <span className="mc-dot" style={{ background: c.color }} />
              <span>{c.name} <span className="mc-meta" style={{ display: 'inline' }}>· {TYPE_LABEL[c.type] || c.type}</span></span>
            </li>
          ))}
        </ul>
      </details>

      {creatingType && <CategoryCreateModal type={creatingType} onClose={() => setCreatingType(null)} onCreated={onCreated} />}

      {deleteTarget && (
        <div className="mc-confirm-overlay" onClick={deleting ? undefined : () => setDeleteTarget(null)}>
          <div className="mc-confirm" role="alertdialog" aria-modal="true" aria-labelledby="mc-del-title" data-mc-confirm onClick={(e) => e.stopPropagation()}>
            <h3 id="mc-del-title">ลบหมวดหมู่ “{deleteTarget.name}”</h3>
            <p data-mc-confirm-text>{deleteText(deleteTarget)}</p>
            {deleteError && <div className="alert" data-mc-delete-error style={{ marginBottom: 12 }}>{deleteError}</div>}
            <div className="mc-confirm-actions">
              <button type="button" className="btn btn-light" onClick={() => setDeleteTarget(null)} disabled={deleting}>ยกเลิก</button>
              <button type="button" className="btn btn-danger" data-confirm-delete onClick={confirmDelete} disabled={deleting}>{deleting ? 'กำลังดำเนินการ...' : 'ยืนยัน'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
