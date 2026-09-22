import type { LucideIcon } from 'lucide-react';

type DashboardStatCardProps = {
  className: string;
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  isMoney?: boolean;
};

export default function DashboardStatCard({ className, label, value, icon: Icon, color, isMoney }: DashboardStatCardProps) {
  return (
    <div className={`stat-card dashboard-stat-card ${className}`}>
      <div className="dashboard-stat-card__top">
        <span className="stat-label">{label}</span>
        <span className="dashboard-stat-card__icon" style={{ color }}><Icon size={19} /></span>
      </div>
      <div className="stat-value" style={{ fontSize: isMoney ? 'var(--text-lg)' : 'var(--text-2xl)' }}>
        {value}
      </div>
    </div>
  );
}