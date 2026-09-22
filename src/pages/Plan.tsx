import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Crown } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { supabase } from '../lib/supabase';
import { PLANS, formatMoney, getPlan } from '../lib/pricing';
import {
  loadUsage,
  formatUsage,
  TELEGRAM_PAYMENT_URL,
  type UsageSnapshot,
} from '../lib/subscription';

export default function Plan() {
  const { t } = useTranslation();
  const { center, subscription } = useAuth();
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [studentCount, setStudentCount] = useState(0);

  useEffect(() => {
    if (!center?.id) return;
    void (async () => {
      const u = await loadUsage(center.id, subscription);
      setUsage(u);
      setStudentCount(u.studentsUsed);
    })();
  }, [center?.id, subscription]);

  const currentId = usage?.plan.id || getPlan(subscription?.plan).id;
  const current = getPlan(currentId);

  return (
    <div className="plans-page">
      <div className="plans-page__heading">
        <div>
          <div className="plans-page__eyebrow">Velia pricing</div>
          <h1>{t('plan.title')}</h1>
        </div>
        <Crown size={30} className="plans-page__heading-icon" />
      </div>

      <p className="plans-page__current">
        {t('plan.current')}: <strong>{current.nameUz}</strong>
        {' · '}
        {studentCount}
        {current.maxStudents < 999999 ? ` / ${current.maxStudents}` : ''} {t('plan.studentsUsed').toLowerCase()}
      </p>

      {usage && (
        <div className="card" style={{ padding: 16, marginBottom: 16, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>O‘quvchilar</div>
            <strong>{formatUsage(usage.studentsUsed, usage.plan.maxStudents)}</strong>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>Guruhlar</div>
            <strong>{formatUsage(usage.groupsUsed, usage.plan.maxGroups)}</strong>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>Kurslar</div>
            <strong>{formatUsage(usage.coursesUsed, usage.plan.maxCourses)}</strong>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>Mock / oy</div>
            <strong>{formatUsage(usage.mockUsedMonth, usage.plan.maxMockTestsMonth)}</strong>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>Xabar / kun</div>
            <strong>{formatUsage(usage.messagesUsedDay, usage.plan.maxMessagesDay)}</strong>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>AI Chat / kun</div>
            <strong>
              {usage.plan.featureAiChat
                ? formatUsage(usage.aiUsedDay, usage.plan.maxAiMessagesDay)
                : 'Yopiq'}
            </strong>
          </div>
        </div>
      )}

      <div className="plans-grid">
        {PLANS.map((p) => {
          const isCurrent = p.id === currentId;
          const isFeatured = p.id === 'gold';
          return (
            <div
              key={p.id}
              className={`pricing-card ${isCurrent ? 'pricing-card--current' : ''} ${isFeatured ? 'pricing-card--featured' : ''}`}
            >
              <div className="pricing-card__topline">
                <span className="pricing-card__icon">
                  <Crown size={19} />
                </span>
                {isFeatured && <span className="pricing-card__recommended">Tavsiya etiladi</span>}
                {isCurrent && <span className="badge badge-success">{t('plan.current')}</span>}
              </div>
              <h3 className="pricing-card__title">{p.nameUz}</h3>
              <p className="pricing-card__description">
                O‘quvchi: {p.maxStudents >= 999999 ? 'cheksiz' : p.maxStudents}
                {' · '}Guruh: {p.maxGroups >= 999999 ? '∞' : p.maxGroups}
                {' · '}Mock/oy: {p.maxMockTestsMonth}
              </p>
              <div className="pricing-card__price">
                <span className="pricing-card__amount">{formatMoney(p.priceMonthly)}</span>
                <span className="pricing-card__period">/ oy</span>
              </div>
              {p.priceYearly > 0 && (
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: -4 }}>
                  Yillik: {formatMoney(p.priceYearly)}
                </p>
              )}
              <ul className="pricing-card__features">
                <li>Kurslar: {p.maxCourses >= 999999 ? 'cheksiz' : p.maxCourses}</li>
                <li>Xabar/kun: {p.maxMessagesDay >= 999999 ? 'cheksiz' : p.maxMessagesDay}</li>
                <li>AI Chat: {p.featureAiChat ? (p.maxAiMessagesDay >= 999999 ? 'cheksiz' : `${p.maxAiMessagesDay}/kun`) : 'Yopiq'}</li>
                <li>Biznes tahlil: {p.featureBusinessAnalytics ? 'Ochiq' : 'Yopiq'}</li>
              </ul>
              {p.id !== 'start' && (
                <a className="btn btn-primary pricing-card__button" href={TELEGRAM_PAYMENT_URL} target="_blank" rel="noreferrer">
                  {t('plan.upgrade')}
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
