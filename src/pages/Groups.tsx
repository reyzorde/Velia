import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Pencil, Trash2, Loader2, UsersRound, UserPlus, MapPin, Clock3, Users, CircleDollarSign } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';
import { useToast } from '../lib/toast-context';
import type { Group, GroupStatus, Course, Student } from '../types/database';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import ExportExcelButton from '../components/ui/ExportExcelButton';
import { exportDate } from '../lib/export/excel';
import { loadUsage, canCreateGroup, TELEGRAM_PAYMENT_URL, type UsageSnapshot } from '../lib/subscription';

const emptyForm = {
  name: '',
  course_id: '',
  teacher_id: '',
  room: '',
  price: '',
  schedule: '',
  status: 'active' as GroupStatus,
};

export default function Groups() {
  const { t } = useTranslation();
  const { center, subscription } = useAuth();
  const { toast } = useToast();

  const [groups, setGroups] = useState<(Group & { course_name?: string; student_count?: number })[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<Array<{ id: string; full_name: string }>>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Group | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Enroll modal
  const [enrollGroup, setEnrollGroup] = useState<Group | null>(null);
  const [enrolledIds, setEnrolledIds] = useState<Set<string>>(new Set());
  const [enrollLoading, setEnrollLoading] = useState(false);
  const [enrollSaving, setEnrollSaving] = useState(false);
  const [enrollSearch, setEnrollSearch] = useState('');
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [limitError, setLimitError] = useState('');

  const fetchData = useCallback(async () => {
    if (!center?.id) return;
    setLoading(true);
    try {
      const [groupsRes, coursesRes, studentsRes] = await Promise.all([
        supabase.from('groups').select('*, courses(name)').eq('center_id', center.id).order('name'),
        supabase.from('courses').select('*').eq('center_id', center.id).order('name'),
        supabase.from('students').select('*').eq('center_id', center.id).eq('status', 'active').order('full_name'),
      ]);

      if (groupsRes.error) throw groupsRes.error;

      const groupIds = (groupsRes.data || []).map((g) => g.id);
      let counts: Record<string, number> = {};
      if (groupIds.length) {
        const { data: gs } = await supabase
          .from('group_students')
          .select('group_id')
          .in('group_id', groupIds)
          .eq('status', 'active');
        (gs || []).forEach((row) => {
          counts[row.group_id] = (counts[row.group_id] || 0) + 1;
        });
      }

      setGroups(
        (groupsRes.data || []).map((g: any) => ({
          ...g,
          course_name: g.courses?.name || null,
          student_count: counts[g.id] || 0,
        }))
      );
      setCourses(coursesRes.data || []);
      const u = await loadUsage(center.id, subscription);
      setUsage(u);
      const { data: memberRows, error: memberErr } = await supabase
        .from('center_members')
        .select('user_id, role, profiles(full_name)')
        .eq('center_id', center.id);
      if (memberErr) {
        console.warn('center_members load', memberErr.message);
        setTeachers([]);
      } else {
        const allowed = new Set(['teacher', 'administrator', 'owner', 'admin']);
        setTeachers(
          (memberRows || [])
            .filter((m: any) => allowed.has(String(m.role)))
            .map((m: any) => ({
              id: m.user_id,
              full_name: (Array.isArray(m.profiles) ? m.profiles[0]?.full_name : m.profiles?.full_name) || m.user_id,
            }))
        );
      }
      setAllStudents(studentsRes.data || []);
    } catch (err) {
      console.error(err);
      toast(t('common.error'), 'error');
    } finally {
      setLoading(false);
    }
  }, [center?.id, toast, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = groups.filter(
    (g) =>
      !search ||
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      (g.room && g.room.toLowerCase().includes(search.toLowerCase()))
  );

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (g: Group) => {
    setEditing(g);
    setForm({
      name: g.name,
      course_id: g.course_id || '',
      teacher_id: g.teacher_id || '',
      room: g.room || '',
      price: String(g.price || ''),
      schedule: g.schedule || '',
      status: g.status,
    });
    setModalOpen(true);
  };

  const openEnroll = async (g: Group) => {
    setEnrollGroup(g);
    setEnrollSearch('');
    setEnrollLoading(true);
    try {
      const { data } = await supabase
        .from('group_students')
        .select('student_id')
        .eq('group_id', g.id)
        .eq('status', 'active');
      setEnrolledIds(new Set((data || []).map((r) => r.student_id)));
    } catch (err) {
      console.error(err);
    } finally {
      setEnrollLoading(false);
    }
  };

  const filteredStudents = allStudents.filter((student) =>
    student.full_name.toLowerCase().includes(enrollSearch.toLowerCase())
  );

  const toggleEnroll = (studentId: string) => {
    setEnrolledIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const saveEnroll = async () => {
    if (!enrollGroup) return;
    setEnrollSaving(true);
    try {
      // Get current
      const { data: current } = await supabase
        .from('group_students')
        .select('id, student_id, status')
        .eq('group_id', enrollGroup.id);

      const currentMap = new Map((current || []).map((r) => [r.student_id, r]));

      // Add new
      for (const sid of enrolledIds) {
        const existing = currentMap.get(sid);
        if (!existing) {
          await supabase.from('group_students').insert({
            group_id: enrollGroup.id,
            student_id: sid,
            status: 'active',
          });
        } else if (existing.status !== 'active') {
          await supabase.from('group_students').update({ status: 'active' }).eq('id', existing.id);
        }
      }

      // Remove (set left)
      for (const [sid, row] of currentMap) {
        if (!enrolledIds.has(sid) && row.status === 'active') {
          await supabase.from('group_students').update({ status: 'left' }).eq('id', row.id);
        }
      }

      toast(t('common.success'));
      setEnrollGroup(null);
      fetchData();
    } catch (err) {
      console.error(err);
      toast(t('common.error'), 'error');
    } finally {
      setEnrollSaving(false);
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !center?.id) return;
    if (!editing) {
      const u = usage || (await loadUsage(center.id, subscription));
      const check = canCreateGroup(u);
      if (!check.ok) {
        setLimitError(check.reason || '');
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        course_id: form.course_id || null,
        teacher_id: form.teacher_id || null,
        room: form.room.trim() || null,
        price: Number(form.price) || 0,
        schedule: form.schedule.trim() || null,
        status: form.status,
        center_id: center.id,
      };

      if (editing) {
        const { error } = await supabase.from('groups').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast(t('common.success'));
      } else {
        const { error } = await supabase.from('groups').insert(payload);
        if (error) throw error;
        toast(t('groups.add') + ' ✓');
      }
      setModalOpen(false);
      fetchData();
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
      const { error } = await supabase.from('groups').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      toast(t('common.success'));
      setDeleteTarget(null);
      fetchData();
    } catch (err) {
      console.error(err);
      toast(t('common.error'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>{t('groups.title')}</h1>
        <div className="page-actions">
          <ExportExcelButton
            data={filtered}
            filename={`velia-groups-${exportDate()}`}
            sheetName="Groups"
            columns={[
              { header: 'Guruh nomi', key: 'name' },
              { header: 'Kurs', key: 'course_name' },
              { header: 'Xona', key: 'room' },
              { header: 'Jadval', key: 'schedule' },
              { header: 'O‘quvchilar soni', key: 'student_count' },
              { header: 'Narx (so‘m)', key: 'price', format: (value) => Number(value) || 0 },
              { header: 'Holat', value: (group) => group.status === 'active' ? 'Faol' : 'Nofaol' },
            ]}
          />
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={18} />
            {t('groups.add')}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 'var(--space-5)' }}>
        <div style={{ position: 'relative', maxWidth: 320 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input className="input" style={{ paddingLeft: 36 }} placeholder={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <UsersRound size={48} color="var(--color-text-muted)" />
          <h3>{t('groups.empty')}</h3>
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={18} />
            {t('groups.add')}
          </button>
        </div>
      ) : (
        <div className="groups-list">
          {filtered.map((g) => (
            <div key={g.id} className="card group-card">
              <div className="group-card__main">
                <div>
                  <div className="group-card__title">{g.name}</div>
                  {g.course_name && (
                    <div className="group-card__course">
                      {g.course_name}
                    </div>
                  )}
                </div>
                <span className={`badge group-card__status ${g.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>
                  {g.status === 'active' ? t('common.active') : t('common.inactive')}
                </span>
              </div>
              <div className="group-card__meta">
                {g.room && <span title="Xona"><MapPin size={15} /> {g.room}</span>}
                {g.schedule && <span title="Jadval"><Clock3 size={15} /> {g.schedule}</span>}
                <span title="O'quvchilar"><Users size={15} /> {g.student_count || 0}</span>
                {Number(g.price) > 0 && <span title="Narx"><CircleDollarSign size={15} /> {new Intl.NumberFormat('uz-UZ').format(Number(g.price))}</span>}
              </div>
              <div className="group-card__actions">
                <button className="btn btn-ghost btn-sm" onClick={() => openEnroll(g)} title="O'quvchilarni qo'shish" aria-label="O'quvchilarni qo'shish">
                  <UserPlus size={16} />
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(g)} title="Tahrirlash" aria-label="Tahrirlash">
                  <Pencil size={16} />
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(g)} style={{ color: 'var(--color-danger)' }} title="O'chirish" aria-label="O'chirish">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Group */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t('common.edit') : t('groups.add')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModalOpen(false)} disabled={saving}>{t('common.cancel')}</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 size={16} className="animate-spin" />{t('common.loading')}</> : t('common.save')}
            </button>
          </>
        }
      >
        {limitError && <p className="input-error-msg" role="alert">{limitError} <a href={TELEGRAM_PAYMENT_URL} target="_blank" rel="noreferrer">Tarifni yangilash</a></p>}
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="input-group">
            <label className="input-label">{t('groups.name')} *</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
          </div>
          <div className="input-group">
            <label className="input-label">{t('groups.course')}</label>
            <select className="input" value={form.course_id} onChange={(e) => setForm({ ...form, course_id: e.target.value })}>
              <option value="">—</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="input-group">
            <label className="input-label">O‘qituvchi</label>
            <select
              className="input"
              value={form.teacher_id}
              onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}
            >
              <option value="">— Tanlang —</option>
              {teachers.map((tch) => (
                <option key={tch.id} value={tch.id}>{tch.full_name}</option>
              ))}
            </select>
            {teachers.length === 0 && (
              <small style={{ color: 'var(--color-text-muted)' }}>
                Avval <strong>Jamoa</strong> bo‘limidan o‘qituvchi qo‘shing.
              </small>
            )}
          </div>
          <div className="input-group">
            <label className="input-label">{t('groups.room')}</label>
            <input className="input" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} />
          </div>
          <div className="input-group">
            <label className="input-label">{t('groups.price')}</label>
            <input className="input" type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
          <div className="input-group">
            <label className="input-label">{t('groups.schedule')}</label>
            <input className="input" value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} placeholder="Mon, Wed 18:00" />
          </div>
          <div className="input-group">
            <label className="input-label">{t('common.status')}</label>
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as GroupStatus })}>
              <option value="active">{t('common.active')}</option>
              <option value="inactive">{t('common.inactive')}</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </form>
      </Modal>

      {/* Enroll students */}
      <Modal
        open={!!enrollGroup}
        onClose={() => setEnrollGroup(null)}
        title={`${enrollGroup?.name || ''} — o'quvchilar`}
        size="md"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setEnrollGroup(null)} disabled={enrollSaving}>{t('common.cancel')}</button>
            <button className="btn btn-primary" onClick={saveEnroll} disabled={enrollSaving || enrollLoading}>
              {enrollSaving ? <><Loader2 size={16} className="animate-spin" />{t('common.loading')}</> : t('common.save')}
            </button>
          </>
        }
      >
        {enrollLoading ? (
          <div className="skeleton" style={{ height: 120 }} />
        ) : allStudents.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            Avval o'quvchi qo'shing
          </p>
        ) : (
          <div className="enroll-picker">
            <div className="enroll-picker__search">
              <Search size={16} />
              <input
                className="input"
                value={enrollSearch}
                onChange={(e) => setEnrollSearch(e.target.value)}
                placeholder="O'quvchini izlash..."
                autoFocus
              />
            </div>
            <div className="enroll-picker__list">
            {filteredStudents.map((s) => (
              <label
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: enrolledIds.has(s.id) ? 'var(--color-primary-light)' : 'var(--color-surface-2)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={enrolledIds.has(s.id)}
                  onChange={() => toggleEnroll(s.id)}
                />
                <span style={{ fontWeight: 500 }}>{s.full_name}</span>
              </label>
            ))}
            {filteredStudents.length === 0 && <p className="enroll-picker__empty">O'quvchi topilmadi</p>}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={t('common.delete')}
        message={`${deleteTarget?.name} — o'chirishni xohlaysizmi?`}
        loading={deleting}
      />
    </div>
  );
}
