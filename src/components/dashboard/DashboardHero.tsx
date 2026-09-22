import { CalendarDays, UserPlus, WalletCards } from 'lucide-react';
import type { ReactNode } from 'react';

type DashboardHeroProps = {
  title: string;
  date: string;
  onAddStudent: () => void;
  onOpenPayments: () => void;
  exportAction?: ReactNode;
};

export default function DashboardHero({ title, date, onAddStudent, onOpenPayments, exportAction }: DashboardHeroProps) {
  return (
    <section className="dashboard-hero">
      <div>
        <div className="dashboard-hero__eyebrow"><CalendarDays size={15} /> {date}</div>
        <h1>{title}</h1>
        <p>Markazingizdagi eng muhim ko‘rsatkichlar bir joyda.</p>
      </div>
      <div className="dashboard-hero__actions">
        <button className="btn btn-primary" onClick={onAddStudent}>
          <UserPlus size={17} /> O‘quvchi qo‘shish
        </button>
        <button className="btn dashboard-hero__secondary" onClick={onOpenPayments}>
          <WalletCards size={17} /> To‘lovlar
        </button>
        {exportAction}
      </div>
    </section>
  );
}