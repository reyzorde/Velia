import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Menu, Moon, Sun, X } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';
import NotificationsBell from './NotificationsBell';
import GlobalSearch from './GlobalSearch';

type HeaderProps = {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
};

export default function Header({ sidebarOpen, onToggleSidebar }: HeaderProps) {
  const { t, i18n } = useTranslation();
  const { profile, center } = useAuth();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document !== 'undefined') {
      const attr = document.documentElement.getAttribute('data-theme');
      if (attr === 'dark' || attr === 'light') return attr;
    }
    const saved = localStorage.getItem('velia_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return (profile?.theme as 'light' | 'dark') || 'light';
  });

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('velia_theme', next);
    if (profile) {
      void supabase.from('profiles').update({ theme: next }).eq('id', profile.id);
    }
  };

  const changeLang = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('velia_lang', lang);
    if (profile) {
      void supabase.from('profiles').update({ preferred_language: lang }).eq('id', profile.id);
    }
  };

  return (
    <header className="header">
      <div className="header__left" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <button className="btn btn-ghost menu-toggle" onClick={onToggleSidebar} aria-label="Menu">
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <span className="header__center-name" style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
          {center?.name || 'Velia'}
        </span>
      </div>
      <div className="header__actions" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <GlobalSearch />
        <select
          className="input header__language"
          style={{ width: 'auto', padding: '0.35rem 0.5rem', fontSize: 'var(--text-xs)' }}
          value={i18n.language}
          onChange={(e) => changeLang(e.target.value)}
        >
          <option value="uz">UZ</option>
          <option value="ru">RU</option>
          <option value="en">EN</option>
        </select>
        <NotificationsBell />
        <button className="btn btn-ghost btn-sm header__theme" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        <span className="header__profile" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          {profile?.full_name}
        </span>
      </div>
    </header>
  );
}
