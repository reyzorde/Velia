import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { navItems } from './Sidebar';

export default function BottomNav() {
  const { t } = useTranslation();

  return (
    <nav className="bottom-nav">
      {navItems.slice(0, 5).map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
        >
          <item.icon size={20} />
          <span>{t(`nav.${item.key}`)}</span>
        </NavLink>
      ))}
    </nav>
  );
}