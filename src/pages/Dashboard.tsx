import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  UserCheck,
  UsersRound,
  ClipboardCheck,
  Banknote,
  AlertCircle,
  Plus,
  ArrowUpRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';
import type { DashboardStats } from '../types/database';
import { getCenterDebtors } from '../lib/debt';
import DashboardHero from '../components/dashboard/DashboardHero';
import DashboardStatCard from '../components/dashboard/DashboardStatCard';
import DashboardQuickLinks from '../components/dashboard/DashboardQuickLinks';
import ExportExcelButton from '../components/ui/ExportExcelButton';
import { exportDate } from '../lib/export/excel';
import { buildDirectorContext, type DirectorContext } from '../services/director';
import { AlertTriangle, CircleCheck, CalendarDays, WalletCards, ShieldAlert } from 'lucide-react';
import ProductAds from '../components/ProductAds';
import { loadUsage, formatUsage, type UsageSnapshot } from '../lib/subscription';

export default function Dashboard() {
  const { t } = useTranslation();
  const { center, subscription } = useAuth();
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [insights, setInsights] = useState<DirectorContext | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!center?.id) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        let debtorsCount = 0;
        try {
          const debtors = await getCenterDebtors(center!.id);
          debtorsCount = debtors.length;
        } catch { /* ignore */ }

        // Prefer RPC if available, otherwise parallel queries
        const { data: rpcData, error: rpcError } = await supabase.rpc(
          'get_dashboard_stats',
          { p_center_id: center!.id }
        );

        if (!rpcError && rpcData) {
          if (!cancelled) {
            setStats({ ...(rpcData as DashboardStats), debtors_count: debtorsCount });
          }
        } else {
          const [{ count: totalStudents }, { count: activeStudents }, { count: totalGroups }, { data: payments }, { data: groups }] = await Promise.all([
            supabase
              .from('students')
              .select('*', { count: 'exact', head: true })
              .eq('center_id', center!.id),
            supabase
              .from('students')
              .select('*', { count: 'exact', head: true })
              .eq('center_id', center!.id)
              .eq('status', 'active'),
            supabase
              .from('groups')
              .select('*', { count: 'exact', head: true })
              .eq('center_id', center!.id)
              .eq('status', 'active'),
            supabase
              .from('payments')
              .select('amount')
              .eq('center_id', center!.id)
              .gte('payment_date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)),
            supabase
              .from('groups')
              .select('id')
              .eq('center_id', center!.id),
          ]);

          const groupIds = (groups || []).map((group) => group.id);
          let todayAtt = 0;

          if (groupIds.length > 0) {
            const { count } = await supabase
              .from('attendance')
              .select('id', { count: 'exact', head: true })
              .eq('date', new Date().toISOString().slice(0, 10))
              .in('group_id', groupIds);
            todayAtt = count || 0;
          }

          if (!cancelled) {
            setStats({
              total_students: totalStudents || 0,
              active_students: activeStudents || 0,
              total_groups: totalGroups || 0,
              today_attendance: todayAtt || 0,
              month_revenue: (payments || []).reduce((s, p) => s + Number(p.amount), 0),
              debtors_count: debtorsCount,
            });
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [center?.id]);

  useEffect(() => {
    if (!center?.id) return;
    let cancelled = false;
    buildDirectorContext(center.id).then((data) => { if (!cancelled) setInsights(data); }).catch(console.error);
    return () => { cancelled = true; };
  }, [center?.id]);

  const formatMoney = (n: number) =>
    new Intl.NumberFormat('uz-UZ').format(n) + " so'm";

  const cards = [
    {
      key: 'totalStudents',
      label: t('dashboard.totalStudents'),
      value: stats?.total_students ?? 0,
      icon: Users,
      color: 'var(--color-primary)',
    },
    {
      key: 'activeStudents',
      label: t('dashboard.activeStudents'),
      value: stats?.active_students ?? 0,
      icon: UserCheck,
      color: 'var(--color-success)',
    },
    {
      key: 'groups',
      label: t('dashboard.groups'),
      value: stats?.total_groups ?? 0,
      icon: UsersRound,
      color: '#8b5cf6',
    },
    {
      key: 'todayAttendance',
      label: t('dashboard.todayAttendance'),
      value: stats?.today_attendance ?? 0,
      icon: ClipboardCheck,
      color: 'var(--color-info)',
    },
    {
      key: 'monthRevenue',
      label: t('dashboard.monthRevenue'),
      value: stats ? formatMoney(stats.month_revenue) : '—',
      icon: Banknote,
      color: 'var(--color-warning)',
      isMoney: true,
    },
    {
      key: 'debtors',
      label: t('dashboard.debtors'),
      value: stats?.debtors_count ?? 0,
      icon: AlertCircle,
      color: 'var(--color-danger)',
    },
  ];

  const isEmpty = !loading && stats && stats.total_students === 0;
  const today = new Intl.DateTimeFormat('uz-UZ', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  return (
    <div className="dashboard-page">
      <DashboardHero
        title={t('dashboard.title')}
        date={today}
        onAddStudent={() => navigate('/students')}
        onOpenPayments={() => navigate('/payments')}
        exportAction={(
          <ExportExcelButton
            data={cards}
            disabled={loading}
            filename={`velia-dashboard-${exportDate()}`}
            sheetName="Overview"
            columns={[
              { header: 'Ko‘rsatkich', key: 'label' },
              { header: 'Qiymat', key: 'value' },
            ]}
          />
        )}
      />

      {loading ? (
        <div className="stats-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton" style={{ height: 100, borderRadius: 12 }} />
          ))}
        </div>
      ) : isEmpty ? (
        <div className="empty-state">
          <Users size={48} color="var(--color-text-muted)" />
          <h3>{t('dashboard.emptyTitle')}</h3>
          <p>{t('dashboard.emptyDesc')}</p>
          <button className="btn btn-primary" onClick={() => navigate('/students')}>
            <Plus size={18} />
            {t('dashboard.addStudent')}
          </button>
        </div>
      ) : (
        <div className="stats-grid dashboard-stats-grid">
          {cards.map((card) => (
            <DashboardStatCard
              key={card.key}
              className={`dashboard-stat-card--${card.key}`}
              label={card.label}
              value={card.value}
              icon={card.icon}
              color={card.color}
              isMoney={card.isMoney}
            />
          ))}
        </div>
      )}

      {!loading && !isEmpty && (
        <>
          <section className="dashboard-panel dashboard-today">
            <div className="dashboard-panel__heading"><div><span className="dashboard-panel__eyebrow">TODAY</span><h2>Bugun markazda nima bo‘lyapti?</h2></div><CalendarDays size={20} /></div>
            <div className="today-grid">
              <div><strong>Diqqat talab qiladi</strong><p>{stats?.debtors_count || 0} ta qarzdor · {insights?.riskSummary.high || 0} ta xavfdagi o‘quvchi · {insights?.lowCapacityGroups || 0} ta bo‘sh guruh</p></div>
              <div><strong>Davomat</strong><p>Umumiy davomat: {insights?.attendanceRate || 0}%</p></div>
              <div><strong>Moliya</strong><p>Bu oy: {formatMoney(insights?.revenue || 0)} {insights && insights.revenueChange !== 0 ? `(${insights.revenueChange > 0 ? '+' : ''}${insights.revenueChange}%)` : ''}</p></div>
            </div>
          </section>
          <section className="dashboard-lower-grid">
            <div className="dashboard-panel">
              <div className="dashboard-panel__heading"><div><span className="dashboard-panel__eyebrow">REAL SIGNALS</span><h2>Amal kerak bo‘lganlar</h2></div><ShieldAlert size={20} /></div>
              {(insights?.students || []).filter(s => s.level !== 'LOW').slice(0, 5).map(student => <button key={student.id} className="insight-row" onClick={() => navigate(`/students/${student.id}`)}><span className={student.level === 'HIGH' ? 'signal-dot signal-dot--red' : 'signal-dot signal-dot--yellow'} /> <span><strong>{student.full_name}</strong><small>{student.reasons[0]}</small></span><ArrowUpRight size={16} /></button>)}
              {!insights?.students.filter(s => s.level !== 'LOW').length && <p>Hozircha xavf signali topilmadi.</p>}
            </div>
            <div className="dashboard-panel">
              <div className="dashboard-panel__heading"><div><span className="dashboard-panel__eyebrow">PAYMENTS</span><h2>To‘lov nazorati</h2></div><WalletCards size={20} /></div>
              <p><AlertTriangle size={15} /> Qarzdorlar: <strong>{stats?.debtors_count || 0}</strong></p>
              <p><CircleCheck size={15} /> Daromad trendi: <strong>{insights ? `${insights.revenueChange >= 0 ? '+' : ''}${insights.revenueChange}%` : '—'}</strong></p>
              <button className="dashboard-panel__link" onClick={() => navigate('/payments')}>To‘lovlarni ochish <ArrowUpRight size={15} /></button>
            </div>
          </section>
          <section className="dashboard-panel">
            <div className="dashboard-panel__heading"><h2>Guruhlar holati</h2><button className="dashboard-panel__link" onClick={() => navigate('/groups')}>Guruhlar <ArrowUpRight size={15} /></button></div>
            <div className="group-health-grid">{insights && insights.totalGroups > 0 ? <><span>Faol guruhlar: <strong>{insights.totalGroups}</strong></span><span>Umumiy davomat: <strong>{insights.attendanceRate}%</strong></span><span>Xavfdagi o‘quvchilar: <strong>{insights.riskSummary.high + insights.riskSummary.medium}</strong></span></> : <p>Guruhlar uchun yetarli ma’lumot yo‘q.</p>}</div>
          </section>
        </>
      )}
          {usage && (
        <div className="card" style={{ marginTop: 16, padding: 14, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
          <div><div className="muted" style={{ fontSize: 12 }}>{usage.plan.nameUz}</div></div>
          <div><div className="muted" style={{ fontSize: 12 }}>O‘quvchilar</div><strong>{formatUsage(usage.studentsUsed, usage.plan.maxStudents)}</strong></div>
          <div><div className="muted" style={{ fontSize: 12 }}>Guruhlar</div><strong>{formatUsage(usage.groupsUsed, usage.plan.maxGroups)}</strong></div>
          <div><div className="muted" style={{ fontSize: 12 }}>Mock/oy</div><strong>{formatUsage(usage.mockUsedMonth, usage.plan.maxMockTestsMonth)}</strong></div>
          <div><div className="muted" style={{ fontSize: 12 }}>Xabar/kun</div><strong>{formatUsage(usage.messagesUsedDay, usage.plan.maxMessagesDay)}</strong></div>
        </div>
      )}
      <div style={{ marginTop: 24 }}><ProductAds /></div>
    </div>
  );
}
