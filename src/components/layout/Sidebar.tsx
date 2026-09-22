import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Users,
  UsersRound,
  ClipboardCheck,
  CreditCard,
  Crown,
  Settings,
  BookOpen,
  LogOut,
  MessageCircle,
  BarChart3,
  MessageSquare,
  ClipboardList,
  UserPlus,
} from 'lucide-react';
import VeliaLogo from '../brand/VeliaLogo';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, key: 'dashboard' },
  { to: '/students', icon: Users, key: 'students' },
  { to: '/courses', icon: BookOpen, key: 'courses' },
  { to: '/groups', icon: UsersRound, key: 'groups' },
  { to: '/attendance', icon: ClipboardCheck, key: 'attendance' },
  { to: '/payments', icon: CreditCard, key: 'payments' },
  { to: '/messages', icon: MessageSquare, key: 'messages' },
  { to: '/mock-tests', icon: ClipboardList, key: 'mockTests' },
  { to: '/team', icon: UserPlus, key: 'team' },
  { to: '/ai-chat', icon: MessageCircle, key: 'aiChat' },
  { to: '/business-intelligence', icon: BarChart3, key: 'businessIntelligence' },
  { to: '/plan', icon: Crown, key: 'plan' },
  { to: '/settings', icon: Settings, key: 'settings' },
];

export { navItems };

type SidebarProps = {
  open: boolean;
  onClose: () => void;
  onLogout: () => void;
};

export default function Sidebar({ open, onClose, onLogout }: SidebarProps) {
  const { t } = useTranslation();

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-logo">
        <VeliaLogo className="sidebar-velia-logo" />
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            onClick={onClose}
          >
            <item.icon size={20} />
            {t(`nav.${item.key}`)}
          </NavLink>
        ))}
      </nav>
      <div style={{ padding: 'var(--space-4)', borderTop: '1px solid var(--color-border)' }}>
        <button className="nav-item" onClick={onLogout} style={{ width: '100%' }}>
          <LogOut size={20} />
          {t('auth.logout')}
        </button>
      </div>
    </aside>
  );
}