import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowUpRight, BarChart3, CircleDollarSign, Sparkles } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { buildDirectorContext } from '../lib/insights';
import { generateCenterHealthExplanation } from '../services/gemini';
import { useTranslation } from 'react-i18next';

export default function BusinessIntelligence() {
  const { t, i18n } = useTranslation();
  const { center } = useAuth();
  const [context, setContext] = useState<any>(null);
  const [analysis, setAnalysis] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const maybeCenterId = center?.id;
    if (!maybeCenterId) {
      setLoading(false);
      return;
    }

    const centerId: string = maybeCenterId;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await buildDirectorContext(centerId);
        const explanation = await generateCenterHealthExplanation({
          totalStudents: data.totalStudents,
          activeStudents: data.activeStudents,
          attendance: data.attendanceRate,
          revenue: data.revenue,
          overdue: data.overdue,
          lowCapacityGroups: data.lowCapacityGroups,
          riskSummary: data.riskSummary,
        }, i18n.language);

        if (!cancelled) {
          setContext(data);
          setAnalysis(explanation);
        }
      } catch (error) {
        console.error('Business intelligence failed', error);
        if (!cancelled) {
          setContext({ totalStudents: 0, activeStudents: 0, attendanceRate: 0, revenue: 0, overdue: 0, lowCapacityGroups: 0, riskSummary: { low: 0, medium: 0, high: 0 } });
          setAnalysis(t('businessIntelligence.unavailable'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [center?.id, i18n.language]);

  const metrics = useMemo(() => [
    { label: t('businessIntelligence.totalStudents'), value: context?.totalStudents || 0 },
    { label: t('businessIntelligence.activeStudents'), value: context?.activeStudents || 0 },
    { label: t('businessIntelligence.attendance'), value: `${context?.attendanceRate || 0}%` },
    { label: t('businessIntelligence.revenue'), value: context?.revenue || 0 },
    { label: t('businessIntelligence.totalGroups'), value: context?.totalGroups || 0 },
  ], [context, t]);

  if (loading) {
    return <div className="empty-state"><BarChart3 size={32} className="animate-spin" color="var(--color-primary)" /><h3>{t('businessIntelligence.loading')}</h3></div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="dashboard-hero" style={{ minHeight: 170 }}>
        <div>
          <div className="dashboard-hero__eyebrow"><BarChart3 size={14} /> {t('businessIntelligence.centerHealth')}</div>
          <h1>{t('businessIntelligence.latestMetrics')}</h1>
          <p>{analysis}</p>
        </div>
        <div className="dashboard-hero__actions">
          <button className="btn btn-primary" type="button"><Sparkles size={16} /> {t('businessIntelligence.healthCheck')}</button>
        </div>
      </div>

      <div className="stats-grid dashboard-stats-grid">
        {metrics.map((metric) => (
          <div key={metric.label} className="card dashboard-stat-card">
            <div className="dashboard-stat-card__top">
              <div className="dashboard-stat-card__icon" style={{ background: 'rgba(79,70,229,0.12)' }}><CircleDollarSign size={18} color="var(--color-primary)" /></div>
            </div>
            <div className="stat-label">{metric.label}</div>
            <div className="stat-value" style={{ fontSize: 'var(--text-xl)' }}>{metric.value}</div>
          </div>
        ))}
      </div>

      <div className="dashboard-lower-grid">
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2>{t('businessIntelligence.trendOverview')}</h2>
            <ArrowUpRight size={18} color="var(--color-primary)" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: 14 }}><div style={{ color: 'var(--color-text-secondary' }}>{t('businessIntelligence.revenue')}</div><div style={{ fontWeight: 700, fontSize: 'var(--text-xl)' }}>{context?.revenue || 0}</div></div>
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: 14 }}><div style={{ color: 'var(--color-text-secondary' }}>{t('businessIntelligence.revenueChange')}</div><div style={{ fontWeight: 700, fontSize: 'var(--text-xl)' }}>{context?.revenueChange || 0}%</div></div>
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: 14 }}><div style={{ color: 'var(--color-text-secondary' }}>{t('businessIntelligence.attendance')}</div><div style={{ fontWeight: 700, fontSize: 'var(--text-xl)' }}>{context?.attendanceRate || 0}%</div></div>
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: 14 }}><div style={{ color: 'var(--color-text-secondary' }}>{t('businessIntelligence.totalGroups')}</div><div style={{ fontWeight: 700, fontSize: 'var(--text-xl)' }}>{context?.totalGroups || 0}</div></div>
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ marginBottom: 12 }}>{t('businessIntelligence.operationalSummary')}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div><strong>{context?.totalStudents || 0}</strong> {t('businessIntelligence.totalStudents')}</div>
            <div><strong>{context?.activeStudents || 0}</strong> {t('businessIntelligence.activeStudents')}</div>
            <div><strong>{context?.riskSummary?.high || 0}</strong> {t('businessIntelligence.highRiskStudents')}</div>
            <div><strong>{context?.overdue || 0}</strong> {t('businessIntelligence.overdueAmounts')}</div>
            <div><strong>{context?.lowCapacityGroups || 0}</strong> {t('businessIntelligence.lowCapacityGroups')}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
