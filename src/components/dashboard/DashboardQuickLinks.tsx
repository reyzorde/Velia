import { ArrowUpRight, Banknote, Users, UsersRound } from 'lucide-react';

type DashboardQuickLinksProps = {
  onGroups: () => void;
  onPayments: () => void;
  onStudents: () => void;
};

export default function DashboardQuickLinks({ onGroups, onPayments, onStudents }: DashboardQuickLinksProps) {
  return (
    <div className="dashboard-quick-links">
      <button onClick={onGroups}><UsersRound size={18} /><span>Guruhlar</span><ArrowUpRight size={15} /></button>
      <button onClick={onPayments}><Banknote size={18} /><span>To‘lovlar</span><ArrowUpRight size={15} /></button>
      <button onClick={onStudents}><Users size={18} /><span>O‘quvchilar</span><ArrowUpRight size={15} /></button>
    </div>
  );
}