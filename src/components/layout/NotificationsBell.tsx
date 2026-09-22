import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth-context';
import { getCenterDebtors } from '../../lib/debt';
import { FREE_STUDENT_LIMIT } from '../../lib/pricing';
import { buildDirectorContext } from '../../services/director';

interface Notif {
  id: string;
  text: string;
  type: string;
}

export default function NotificationsBell() {
  const { t } = useTranslation();
  const { center, subscription } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!center?.id) return;
    let cancelled = false;

    async function build() {
      const list: Notif[] = [];
      const limit = FREE_STUDENT_LIMIT;
      const isFree = !subscription || subscription.plan === 'free';

      const { count } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('center_id', center!.id)
        .eq('status', 'active');

      const active = count || 0;

      if (active === 0) {
        list.push({ id: 'no-students', text: t('notifications.noStudents'), type: 'info' });
      }
      if (isFree && active >= limit) {
        list.push({ id: 'limit', text: t('notifications.limitReached'), type: 'warning' });
      } else if (isFree && active >= limit - 2 && active > 0) {
        list.push({ id: 'limit-near', text: t('notifications.limitNear'), type: 'warning' });
      }

      try {
        const debtors = await getCenterDebtors(center!.id);
        if (debtors.length > 0) {
          list.push({
            id: 'debtors',
            text: `${t('notifications.hasDebtors')} (${debtors.length})`,
            type: 'danger',
          });
        }
      } catch {
        /* ignore */
      }

      try {
        const context = await buildDirectorContext(center!.id);
        if (context.riskSummary.high > 0) list.push({ id: 'risk', text: `${context.riskSummary.high} ta o‘quvchi yuqori xavfda`, type: 'danger' });
        if (context.lowCapacityGroups > 0) list.push({ id: 'groups', text: `${context.lowCapacityGroups} ta guruhda o‘quvchi yo‘q`, type: 'warning' });
      } catch { /* analytics is optional */ }

      if (!cancelled) setItems(list);
    }

    build();
    return () => {
      cancelled = true;
    };
  }, [center?.id, subscription, t]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={ref} className="header__notifications" style={{ position: 'relative' }}>
      <button
        className="btn btn-ghost btn-sm notification-button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('notifications.title')}
        style={{ position: 'relative' }}
      >
        <Bell size={18} />
        {items.length > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--color-danger)',
            }}
          />
        )}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            marginTop: 8,
            width: 280,
            maxWidth: '90vw',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 200,
            padding: 8,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', padding: '8px 10px' }}>
            {t('notifications.title')}
          </div>
          {items.length === 0 ? (
            <p style={{ padding: 12, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
              {t('notifications.empty')}
            </p>
          ) : (
            items.map((n) => (
              <div
                key={n.id}
                style={{
                  padding: '10px 12px',
                  fontSize: 'var(--text-sm)',
                  borderRadius: 8,
                  marginBottom: 4,
                  background: 'var(--color-surface-2)',
                  color: 'var(--color-text)',
                }}
              >
                {n.text}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
