import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Loader2,
  Users,
  Copy,
  Check,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';
import { useToast } from '../lib/toast-context';
import type { Group, Student, StudentStatus } from '../types/database';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import ExportExcelButton from '../components/ui/ExportExcelButton';
import { exportDate } from '../lib/export/excel';
import { FREE_STUDENT_LIMIT, TELEGRAM_PAYMENT_URL, getPlan, formatStudentLimit } from '../lib/pricing';
import { loadUsage, canCreateStudent, type UsageSnapshot } from '../lib/subscription';

const emptyForm = {
  full_name: '',
  phone: '',
  email: '',
  notes: '',
  status: 'active' as StudentStatus,
  group_id: '',
};

export default function Students() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { center, subscription } = useAuth();
  const { toast } = useToast();

  const [students, setStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | StudentStatus>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);

  const planDef = getPlan(subscription?.plan);
  const studentLimit =
    typeof subscription?.student_limit === 'number'
      ? subscription.student_limit
      : planDef.maxStudents;
  const isFree = planDef.id === 'start' || !subscription;
  const activeCount = students.filter((s) => s.status === 'active').length;

  const fetchStudents = useCallback(async () => {
    if (!center?.id) return;
    setLoading(true);
    try {
      const [studentsRes, groupsRes] = await Promise.all([
        supabase.from('students').select('*').eq('center_id', center.id).order('full_name'),
        supabase.from('groups').select('*').eq('center_id', center.id).eq('status', 'active').order('name'),
      ]);
      if (studentsRes.error) throw studentsRes.error;
      if (groupsRes.error) throw groupsRes.error;
      setStudents(studentsRes.data || []);
      const u = await loadUsage(center.id, subscription);
      setUsage(u);
      setGroups(groupsRes.data || []);

    } catch (err) {
      console.error(err);
      toast(t('common.error'), 'error');
    } finally {
      setLoading(false);
    }
  }, [center?.id, subscription, toast, t]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const filtered = students.filter((s) => {
    const matchSearch =
      !search ||
      s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (s.phone && s.phone.includes(search)) ||
      (s.email && s.email.toLowerCase().includes(search.toLowerCase()));
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const openAdd = () => {
    if (usage) {
      const check = canCreateStudent(usage);
      if (!check.ok) {
        setUpgradeOpen(true);
        return;
      }
    } else if (isFree && activeCount >= studentLimit) {
      setUpgradeOpen(true);
      return;
    }
    setEditing(null);
    setForm(emptyForm);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (s: Student) => {
    setEditing(s);
    setForm({
      full_name: s.full_name,
      phone: s.phone || '',
      email: s.email || '',
      notes: s.notes || '',
      status: s.status,
      group_id: '',
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing && !form.group_id) {
      setFormError('O‘quvchi qo‘shish uchun guruhni tanlang.');
      return;
    }
    if (!form.full_name.trim()) {
      setFormError(t('auth.required'));
      return;
    }
    if (!center?.id) return;

    if (!editing && isFree && activeCount >= studentLimit && form.status === 'active') {
      setModalOpen(false);
      setUpgradeOpen(true);
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const payload = {
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        notes: form.notes.trim() || null,
        status: form.status,
        center_id: center.id,
      };

      if (editing) {
        const { error } = await supabase
          .from('students')
          .update(payload)
          .eq('id', editing.id);
        if (error) throw error;
        toast(t('common.success'));
      } else {
        const { data: createdStudent, error } = await supabase.from('students').insert(payload).select('id').single();
        if (error) throw error;
        if (form.group_id && createdStudent) {
          const { error: groupError } = await supabase.from('group_students').insert({
            group_id: form.group_id,
            student_id: createdStudent.id,
            status: 'active',
          });
          if (groupError) throw groupError;
        }
        toast(t('students.add') + ' ✓');
      }
      setModalOpen(false);
      fetchStudents();
    } catch (err) {
      console.error(err);
      setFormError(t('common.error'));
      toast(t('common.error'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('students')
        .delete()
        .eq('id', deleteTarget.id);
      if (error) throw error;
      toast(t('common.success'));
      setDeleteTarget(null);
      fetchStudents();
    } catch (err) {
      console.error(err);
      toast(t('common.error'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const selectedGroup = groups.find((group) => group.id === form.group_id);
  const formatMoney = (amount: number) => new Intl.NumberFormat('uz-UZ').format(amount) + " so'm";

  return (
    <div className="students-page">
      <div className="students-page__header">
        <div>
          <div className="students-page__eyebrow">Velia workspace</div>
          <h1>{t('students.title')}</h1>
          {!loading && (
            <p className="students-page__count">
              {activeCount} / {formatStudentLimit(isFree ? studentLimit : (subscription?.student_limit ?? getPlan(subscription?.plan).maxStudents))} {t('common.active').toLowerCase()}
            </p>
          )}
        </div>
        <div className="students-page__actions">
          <ExportExcelButton
            data={filtered}
            filename={`velia-students-${exportDate()}`}
            sheetName="Students"
            columns={[
              { header: 'To‘liq ism', key: 'full_name' },
              { header: 'Telefon', key: 'phone' },
              { header: 'Email', key: 'email' },
              { header: 'Holat', value: (student) => student.status === 'active' ? 'Faol' : 'Nofaol' },
              { header: 'Izoh', key: 'notes' },
            ]}
          />
          <button className="btn btn-primary students-page__add" onClick={openAdd}>
            <Plus size={18} />
            {t('students.add')}
          </button>
        </div>
      </div>

      <div className="students-toolbar">
        <div className="students-toolbar__search">
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input className="input" style={{ paddingLeft: 36 }} placeholder={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input students-toolbar__filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | StudentStatus)}>
          <option value="all">{t('common.all')}</option>
          <option value="active">{t('common.active')}</option>
          <option value="inactive">{t('common.inactive')}</option>
        </select>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: 64, borderRadius: 12 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <Users size={48} color="var(--color-text-muted)" />
          <h3>{t('students.empty')}</h3>
          <p>{t('dashboard.emptyDesc')}</p>
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={18} />
            {t('students.emptyCta')}
          </button>
        </div>
      ) : (
        <>
          <div className="table-wrapper" style={{ display: 'none' }} id="students-table">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>{t('students.fullName')}</th>
                  <th>{t('students.phone')}</th>
                  <th>{t('students.email')}</th>
                  <th>{t('common.status')}</th>
                  <th style={{ width: 100 }}>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <code style={{ fontSize: 11 }}>{s.id.slice(0, 8)}…</code>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        title="ID nusxalash"
                        onClick={() => {
                          void navigator.clipboard.writeText(s.id);
                          toast('ID nusxalandi');
                        }}
                      >
                        <Copy size={14} />
                      </button>
                    </td>
                    <td style={{ fontWeight: 500 }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: 0, fontWeight: 600, color: 'var(--color-primary)' }}
                        onClick={() => navigate(`/students/${s.id}`)}
                      >
                        {s.full_name}
                      </button>
                    </td>
                    <td>{s.phone || '—'}</td>
                    <td>{s.email || '—'}</td>
                    <td>
                      <span className={`badge ${s.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>
                        {s.status === 'active' ? t('common.active') : t('common.inactive')}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost table-action-btn" onClick={() => openEdit(s)} aria-label={t('common.edit')} title={t('common.edit')}>
                          <Pencil size={19} />
                        </button>
                        <button className="btn btn-ghost table-action-btn" onClick={() => setDeleteTarget(s)} aria-label={t('common.delete')} title={t('common.delete')} style={{ color: 'var(--color-danger)' }}>
                          <Trash2 size={19} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="students-cards" id="students-cards">
            {filtered.map((s) => (
              <div key={s.id} className="card student-card">
                <div className="student-card__content">
                  <div className="student-card__identity">
                    <button
                      type="button"
                      onClick={() => navigate(`/students/${s.id}`)}
                      style={{ fontWeight: 600, marginBottom: 4, background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', padding: 0, textAlign: 'left' }}
                    >
                      {s.full_name}
                    </button>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <code>{s.id}</code>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          void navigator.clipboard.writeText(s.id);
                          toast('ID nusxalandi');
                        }}
                        title="Nusxalash"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                    {s.phone && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{s.phone}</div>}
                    {s.email && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{s.email}</div>}
                  </div>
                  <div className="student-card__actions">
                    <span className={`badge ${s.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>
                      {s.status === 'active' ? t('common.active') : t('common.inactive')}
                    </span>
                    <button className="btn btn-ghost table-action-btn" onClick={() => openEdit(s)} aria-label={t('common.edit')} title={t('common.edit')}><Pencil size={19} /></button>
                    <button className="btn btn-ghost table-action-btn" onClick={() => setDeleteTarget(s)} aria-label={t('common.delete')} title={t('common.delete')} style={{ color: 'var(--color-danger)' }}><Trash2 size={19} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <style>{`@media (min-width: 768px) { #students-table { display: block !important; } #students-cards { display: none !important; } }`}</style>
        </>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t('students.edit') : t('students.add')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModalOpen(false)} disabled={saving}>{t('common.cancel')}</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? (<><Loader2 size={16} className="animate-spin" />{t('common.loading')}</>) : t('common.save')}
            </button>
          </>
        }
      >
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="input-group">
            <label className="input-label">{t('students.fullName')} *</label>
            <input className={`input ${formError ? 'input-error' : ''}`} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required autoFocus />
          </div>
          <div className="input-group">
            <label className="input-label">{t('students.phone')}</label>
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+998 90 123 45 67" />
          </div>
          <div className="input-group">
            <label className="input-label">{t('students.email')}</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          {!editing && (
            <div className="input-group">
              <label className="input-label">Guruh</label>
              <select className="input" required value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })}>
                <option value="">Guruhni tanlang</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
            </div>
          )}
          {!editing && selectedGroup && (
            <div className="student-payment-preview">
              <div>
                <strong>{formatMoney(Number(selectedGroup.price) || 0)}</strong>
                <span> {t('students.monthlyPayment')}</span>
              </div>
            </div>
          )}
          <div className="input-group">
            <label className="input-label">{t('common.status')}</label>
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as StudentStatus })}>
              <option value="active">{t('common.active')}</option>
              <option value="inactive">{t('common.inactive')}</option>
            </select>
          </div>
          <div className="input-group">
            <label className="input-label">{t('students.notes')}</label>
            <textarea className="input" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ resize: 'vertical' }} />
          </div>
          {formError && <p className="input-error-msg">{formError}</p>}
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={t('common.delete')}
        message={t('students.deleteConfirm')}
        loading={deleting}
      />

      <Modal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title={t('students.upgradeTitle')}
        size="sm"
      >
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
          20 tadan keyin har bir o‘quvchi uchun: oyiga 5 990 so‘m, 6 oyga 30 990 so‘m yoki yiliga 59 990 so‘m.
        </p>
        <p style={{ marginTop: 12, fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-primary)' }}>
          {activeCount} / {formatStudentLimit(studentLimit)} {t('plan.studentsUsed').toLowerCase()}
        </p>
        <a href={TELEGRAM_PAYMENT_URL} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ width: '100%', marginTop: 16 }}>
          Tarifni Telegram orqali olish
        </a>
      </Modal>
    </div>
  );
}
