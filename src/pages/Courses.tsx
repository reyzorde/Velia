import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Pencil, Trash2, Loader2, BookOpen } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';
import { loadUsage, canCreateCourse, TELEGRAM_PAYMENT_URL, type UsageSnapshot } from '../lib/subscription';
import { useToast } from '../lib/toast-context';
import type { Course } from '../types/database';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import ExportExcelButton from '../components/ui/ExportExcelButton';
import { exportDate } from '../lib/export/excel';

const emptyForm = { name: '', description: '' };

export default function Courses() {
  const { t } = useTranslation();
  const { center, subscription } = useAuth();
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const { toast } = useToast();

  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchCourses = useCallback(async () => {
    if (!center?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('center_id', center.id)
        .order('name');
      if (error) throw error;
      setUsage(await loadUsage(center!.id, subscription));
      setCourses(data || []);
    } catch (err) {
      console.error(err);
      toast(t('common.error'), 'error');
    } finally {
      setLoading(false);
    }
  }, [center?.id, subscription, toast, t]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  const filtered = courses.filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.description && c.description.toLowerCase().includes(search.toLowerCase()))
  );

  const openAdd = () => {
    if (usage) {
      const check = canCreateCourse(usage);
      if (!check.ok) {
        toast(check.reason || 'Limit', 'error');
        return;
      }
    }
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (c: Course) => {
    setEditing(c);
    setForm({ name: c.name, description: c.description || '' });
    setModalOpen(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !center?.id) return;
    if (!editing) {
      const u = usage || (await loadUsage(center.id, subscription));
      const check = canCreateCourse(u);
      if (!check.ok) {
        toast(check.reason || 'Limit', 'error');
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        center_id: center.id,
      };
      if (editing) {
        const { error } = await supabase.from('courses').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('courses').insert(payload);
        if (error) throw error;
      }
      toast(t('common.success'));
      setModalOpen(false);
      fetchCourses();
    } catch (err) {
      console.error(err);
      toast(t('common.error'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('courses').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      toast(t('common.success'));
      setDeleteTarget(null);
      fetchCourses();
    } catch (err) {
      console.error(err);
      toast(t('common.error'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>{t('courses.title')}</h1>
        <div className="page-actions">
          <ExportExcelButton
            data={filtered}
            filename={`velia-courses-${exportDate()}`}
            sheetName="Courses"
            columns={[
              { header: 'Kurs nomi', key: 'name' },
              { header: 'Tavsif', key: 'description' },
            ]}
          />
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={18} />
            {t('courses.add')}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 20, maxWidth: 320, position: 'relative' }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
        <input className="input" style={{ paddingLeft: 36 }} placeholder={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 72, borderRadius: 12 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <BookOpen size={48} color="var(--color-text-muted)" />
          <h3>{t('courses.empty')}</h3>
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={18} />
            {t('courses.add')}
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {filtered.map((c) => (
            <div key={c.id} className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{c.name}</div>
              {c.description && (
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: 12 }}>
                  {c.description}
                </p>
              )}
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)} aria-label={t('common.edit')}>
                  <Pencil size={16} />
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(c)} style={{ color: 'var(--color-danger)' }} aria-label={t('common.delete')}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t('courses.edit') : t('courses.add')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModalOpen(false)} disabled={saving}>{t('common.cancel')}</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 size={16} className="animate-spin" />{t('common.loading')}</> : t('common.save')}
            </button>
          </>
        }
      >
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="input-group">
            <label className="input-label">{t('courses.name')} *</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
          </div>
          <div className="input-group">
            <label className="input-label">{t('courses.description')}</label>
            <textarea className="input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ resize: 'vertical' }} />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={t('common.delete')}
        message={t('courses.deleteConfirm')}
        loading={deleting}
      />
    </div>
  );
}
