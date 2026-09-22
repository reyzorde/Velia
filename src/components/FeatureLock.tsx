import { ReactNode, useEffect, useState } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import {
  loadUsage,
  canUseAIChat,
  canUseBusinessAnalytics,
  TELEGRAM_PAYMENT_URL,
  type UsageSnapshot,
} from '../lib/subscription';

type Feature = 'ai_chat' | 'business';

export default function FeatureLock({ feature, children }: { feature: Feature; children: ReactNode }) {
  const { center, subscription } = useAuth();
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);

  useEffect(() => {
    if (!center?.id) return;
    void loadUsage(center.id, subscription).then(setUsage);
  }, [center?.id, subscription]);

  if (!usage) {
    return (
      <div className="students-page">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  const check = feature === 'ai_chat' ? canUseAIChat(usage) : canUseBusinessAnalytics(usage);
  // For AI chat page itself handles daily limit; here only lock if feature disabled
  const locked =
    feature === 'ai_chat' ? !usage.plan.featureAiChat : !usage.plan.featureBusinessAnalytics;

  if (locked) {
    return (
      <div className="students-page">
        <div className="empty-state">
          <Lock size={40} color="var(--color-text-muted)" />
          <h3>Funksiya yopiq</h3>
          <p>{check.reason}</p>
          <a className="btn btn-primary" href={TELEGRAM_PAYMENT_URL} target="_blank" rel="noreferrer">
            Tarifni yangilash (@velia_adminbot)
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
