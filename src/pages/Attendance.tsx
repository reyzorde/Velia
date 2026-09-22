import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Check, ClipboardCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';
import { useToast } from '../lib/toast-context';
import type { Group, Student, AttendanceStatus } from '../types/database';
import ExportExcelButton from '../components/ui/ExportExcelButton';
import { exportDate } from '../lib/export/excel';

interface StudentAtt {
  student: Student;
  status: AttendanceStatus | null;
  attendanceId?: string;
}

export default function Attendance() {
  const { t } = useTranslation();
  const { center } = useAuth();
  const { toast } = useToast();

  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<StudentAtt[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(true);

  useEffect(() => {
    if (!center?.id) return;
    supabase
      .from('groups')
      .select('*')
      .eq('center_id', center.id)
      .eq('status', 'active')
      .order('name')
      .then(({ data }) => {
        setGroups(data || []);
        setGroupsLoading(false);
      });
  }, [center?.id]);

  const loadAttendance = useCallback(async () => {
    if (!selectedGroup || !date) return;
    setLoading(true);
    try {
      // Students in group
      const { data: gs } = await supabase
        .from('group_students')
        .select('student_id, students(*)')
        .eq('group_id', selectedGroup)
        .eq('status', 'active');

      const students: Student[] = (gs || [])
        .map((r: any) => r.students)
        .filter(Boolean);

      // Existing attendance
      const { data: att } = await supabase
        .from('attendance')
        .select('*')
        .eq('group_id', selectedGroup)
        .eq('date', date);

      const attMap = new Map((att || []).map((a) => [a.student_id, a]));

      setRows(
        students.map((s) => ({
          student: s,
          status: attMap.get(s.id)?.status || null,
          attendanceId: attMap.get(s.id)?.id,
        }))
      );
    } catch (err) {
      console.error(err);
      toast(t('common.error'), 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedGroup, date, toast, t]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  const setStatus = (studentId: string, status: AttendanceStatus) => {
    setRows((prev) =>
      prev.map((r) =>
        r.student.id === studentId ? { ...r, status } : r
      )
    );
  };

  const markAllPresent = () => {
    setRows((prev) => prev.map((r) => ({ ...r, status: 'present' as AttendanceStatus })));
  };

  const handleSave = async () => {
    if (!selectedGroup || !date) return;
    setSaving(true);
    try {
      const upserts = rows
        .filter((r) => r.status)
        .map((r) => ({
          id: r.attendanceId,
          group_id: selectedGroup,
          student_id: r.student.id,
          date,
          status: r.status!,
        }));

      // Upsert (insert or update)
      for (const row of upserts) {
        if (row.id) {
          await supabase
            .from('attendance')
            .update({ status: row.status })
            .eq('id', row.id);
        } else {
          const { data } = await supabase
            .from('attendance')
            .insert({
              group_id: row.group_id,
              student_id: row.student_id,
              date: row.date,
              status: row.status,
            })
            .select()
            .single();
          if (data) {
            setRows((prev) =>
              prev.map((r) =>
                r.student.id === row.student_id
                  ? { ...r, attendanceId: data.id }
                  : r
              )
            );
          }
        }
      }
      toast(t('attendance.saved'));
      loadAttendance();
    } catch (err) {
      console.error(err);
      toast(t('common.error'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const statusButtons: { key: AttendanceStatus; label: string; color: string }[] = [
    { key: 'present', label: t('attendance.present'), color: 'var(--color-success)' },
    { key: 'absent', label: t('attendance.absent'), color: 'var(--color-danger)' },
    { key: 'late', label: t('attendance.late'), color: 'var(--color-warning)' },
    { key: 'excused', label: t('attendance.excused'), color: 'var(--color-info)' },
  ];

  return (
    <div>
      <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 'var(--space-6)' }}>
        {t('attendance.title')}
      </h1>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div className="input-group" style={{ flex: '1 1 200px' }}>
          <label className="input-label">{t('attendance.selectGroup')}</label>
          <select
            className="input"
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            disabled={groupsLoading}
          >
            <option value="">—</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
        <div className="input-group" style={{ flex: '0 1 160px' }}>
          <label className="input-label">{t('attendance.selectDate')}</label>
          <input
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      {!selectedGroup ? (
        <div className="empty-state">
          <ClipboardCheck size={48} color="var(--color-text-muted)" />
          <h3>{t('attendance.empty')}</h3>
        </div>
      ) : loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton" style={{ height: 56, borderRadius: 10 }} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <h3>Guruhda o'quvchi yo'q</h3>
          <p>Avval guruhga o'quvchi qo'shing</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <div className="page-actions">
              <ExportExcelButton
                data={rows}
                filename={`velia-attendance-${date}-${exportDate()}`}
                sheetName="Attendance"
                columns={[
                  { header: 'O‘quvchi', value: (row) => row.student.full_name },
                  { header: 'Telefon', value: (row) => row.student.phone },
                  { header: 'Sana', value: () => date },
                  { header: 'Holat', value: (row) => row.status ? statusButtons.find((button) => button.key === row.status)?.label || row.status : 'Belgilanmagan' },
                ]}
              />
              <button className="btn btn-secondary btn-sm" onClick={markAllPresent}>
                <Check size={16} />
                {t('attendance.markAllPresent')}
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <><Loader2 size={16} className="animate-spin" />{t('common.loading')}</>
                ) : (
                  t('common.save')
                )}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map((r) => (
              <div
                key={r.student.id}
                className="card"
                style={{
                  padding: '12px 16px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 12,
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ fontWeight: 500, minWidth: 120 }}>{r.student.full_name}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {statusButtons.map((btn) => (
                    <button
                      key={btn.key}
                      className="btn btn-sm"
                      onClick={() => setStatus(r.student.id, btn.key)}
                      style={{
                        background: r.status === btn.key ? btn.color : 'var(--color-surface-2)',
                        color: r.status === btn.key ? '#fff' : 'var(--color-text-secondary)',
                        border: r.status === btn.key ? 'none' : '1px solid var(--color-border)',
                        minWidth: 72,
                      }}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
