import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';
import { getStudentDebt } from '../lib/debt';
import type { AttendanceStatus, Student, Payment } from '../types/database';
import ExportExcelButton from '../components/ui/ExportExcelButton';
import { exportDate } from '../lib/export/excel';
import { calculateStudentRisk } from '../services/risk';

export default function StudentDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { center } = useAuth();
  const navigate = useNavigate();

  const [student, setStudent] = useState<Student | null>(null);
  const [groups, setGroups] = useState<{ id: string; name: string; price: number }[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [attendanceHistory, setAttendanceHistory] = useState<{ date: string; status: AttendanceStatus }[]>([]);
  const [attendanceStats, setAttendanceStats] = useState({ present: 0, absent: 0, late: 0, excused: 0 });
  const [debtInfo, setDebtInfo] = useState({ expected: 0, paid: 0, debt: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !center?.id) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const { data: s, error } = await supabase
          .from('students')
          .select('*')
          .eq('id', id)
          .eq('center_id', center!.id)
          .single();
        if (error) throw error;
        if (cancelled) return;
        setStudent(s);

        const [{ data: gs }, { data: pays }, { data: att }, debt] = await Promise.all([
          supabase
            .from('group_students')
            .select('groups(id, name, price)')
            .eq('student_id', id)
            .eq('status', 'active'),
          supabase
            .from('payments')
            .select('*')
            .eq('student_id', id)
            .order('payment_date', { ascending: false }),
          supabase.from('attendance').select('date, status').eq('student_id', id).order('date', { ascending: false }),
          getStudentDebt(id!),
        ]);

        if (cancelled) return;

        setGroups(
          (gs || [])
            .map((r: any) => {
              const g = Array.isArray(r.groups) ? r.groups[0] : r.groups;
              return g ? { id: g.id, name: g.name, price: Number(g.price) || 0 } : null;
            })
            .filter(Boolean) as { id: string; name: string; price: number }[]
        );
        setPayments(pays || []);
        setAttendanceHistory((att || []) as { date: string; status: AttendanceStatus }[]);
        setDebtInfo(debt);

        const stats = { present: 0, absent: 0, late: 0, excused: 0 };
        (att || []).forEach((a) => {
          if (a.status in stats) stats[a.status as keyof typeof stats]++;
        });
        setAttendanceStats(stats);
      } catch (err) {
        console.error(err);
        navigate('/students');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, center?.id, navigate]);

  const formatMoney = (n: number) =>
    new Intl.NumberFormat('uz-UZ').format(n) + " so'm";

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  if (!student) return null;

  const attendanceTotal = Object.values(attendanceStats).reduce((sum, value) => sum + value, 0);
  const attendanceRate = attendanceTotal ? Math.round(((attendanceStats.present + attendanceStats.late) / attendanceTotal) * 100) : 100;
  const lastActivity = attendanceHistory[0]?.date;
  const daysInactive = lastActivity ? Math.max(0, Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86_400_000)) : 0;
  const risk = calculateStudentRisk({ attendanceRate, daysSinceLastActivity: daysInactive, overdueAmount: debtInfo.debt, recentPaymentRatio: payments.length ? 1 : 0, recentAbsenceRate: attendanceStats.absent / Math.max(1, attendanceTotal) });
  const recentLate = attendanceHistory.slice(0, 4).filter(item => item.status === 'late').length;

  return (
    <div>
      <button className="btn btn-ghost" onClick={() => navigate('/students')} style={{ marginBottom: 16 }}>
        <ArrowLeft size={18} />
        {t('studentDetail.back')}
      </button>

      <div className="page-actions" style={{ justifyContent: 'flex-end', marginBottom: 16 }}>
        <ExportExcelButton
          data={payments}
          filename={`velia-${student.full_name.toLowerCase().replace(/\s+/g, '-')}-payments-${exportDate()}`}
          sheetName="Payments"
          columns={[
            { header: 'Sana', key: 'payment_date' },
            { header: 'Summa (so‘m)', key: 'amount', format: (value) => Number(value) || 0 },
            { header: 'To‘lov usuli', key: 'payment_method' },
            { header: 'Izoh', key: 'note' },
          ]}
        />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 24, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 240px' }}>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>{student.full_name}</h1>
          <div style={{ marginTop: 8, color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            {student.phone && <div>{student.phone}</div>}
            {student.email && <div>{student.email}</div>}
            {student.birth_date && <div>{student.birth_date}</div>}
            <span className={`badge ${student.status === 'active' ? 'badge-success' : 'badge-neutral'}`} style={{ marginTop: 8 }}>
              {student.status === 'active' ? t('common.active') : t('common.inactive')}
            </span>
          </div>
          {student.notes && (
            <p style={{ marginTop: 12, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{student.notes}</p>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <div className="stat-card" style={{ minWidth: 140 }}>
            <div className="stat-label">{t('studentDetail.totalPaid')}</div>
            <div className="stat-value" style={{ fontSize: 'var(--text-lg)' }}>{formatMoney(debtInfo.paid)}</div>
          </div>
          <div className="stat-card" style={{ minWidth: 140 }}>
            <div className="stat-label">{t('studentDetail.debt')}</div>
            <div className="stat-value" style={{ fontSize: 'var(--text-lg)', color: debtInfo.debt > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
              {debtInfo.debt > 0 ? formatMoney(debtInfo.debt) : t('studentDetail.noDebt')}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        <div className="card" style={{ borderLeft: `4px solid ${risk.level === 'HIGH' ? 'var(--color-danger)' : risk.level === 'MEDIUM' ? 'var(--color-warning)' : 'var(--color-success)'}` }}>
          <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 8 }}>Student 360° · Risk: {risk.level === 'HIGH' ? 'Yuqori' : risk.level === 'MEDIUM' ? 'Diqqat' : 'Sog‘lom'}</h2>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{risk.reasons[0]}</p>
          {risk.level !== 'LOW' && <p style={{ marginTop: 8, fontSize: 'var(--text-sm)', fontWeight: 600 }}>Tavsiya: o‘quvchi yoki ota-onasi bilan bog‘laning.</p>}
        </div>
        <div className="card">
          <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 12 }}>{t('studentDetail.groups')}</h2>
          {groups.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>{t('studentDetail.noGroups')}</p>
          ) : (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {groups.map((g) => (
                <li key={g.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                  <span>{g.name}</span>
                  <span style={{ color: 'var(--color-text-secondary)' }}>{formatMoney(g.price)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 12 }}>{t('studentDetail.attendance')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 'var(--text-sm)' }}>
            <div>{t('attendance.present')}: <strong>{attendanceStats.present}</strong></div>
            <div>{t('attendance.absent')}: <strong>{attendanceStats.absent}</strong></div>
            <div>{t('attendance.late')}: <strong>{attendanceStats.late}</strong></div>
            <div>{t('attendance.excused')}: <strong>{attendanceStats.excused}</strong></div>
          </div>
          {recentLate >= 2 && <p style={{ marginTop: 12, fontSize: 'var(--text-sm)', color: 'var(--color-warning)' }}>So‘nggi 4 darsning {recentLate} tasiga kechikkan.</p>}
          {attendanceStats.absent >= 2 && <p style={{ marginTop: 8, fontSize: 'var(--text-sm)', color: 'var(--color-danger)' }}>{attendanceStats.absent} ta yo‘qlik qayd etilgan.</p>}
        </div>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 12 }}>{t('studentDetail.payments')}</h2>
          {payments.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>{t('payments.empty')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {payments.map((p) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                  <span>{p.payment_date} · {p.payment_method}</span>
                  <strong style={{ color: 'var(--color-success)' }}>{formatMoney(Number(p.amount))}</strong>
                </div>
              ))}
            </div>
          )}
          <Link to="/payments" className="btn btn-secondary btn-sm" style={{ marginTop: 12, display: 'inline-flex' }}>
            {t('payments.add')}
          </Link>
        </div>
      </div>
    </div>
  );
}
