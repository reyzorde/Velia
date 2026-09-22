import { useState, useEffect, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, LogOut, Image as ImageIcon, UserRound, Building2, Palette, Languages, Mail, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';
import { useToast } from '../lib/toast-context';
import { useNavigate } from 'react-router-dom';
import { readFileAsDataUrl } from '../lib/upload';

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { profile, center, signOut, refreshProfile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [centerName, setCenterName] = useState(center?.name || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingCenter, setSavingCenter] = useState(false);

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile || !fullName.trim()) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim(), avatar_url: avatarUrl.trim() || null })
        .eq('id', profile.id);
      if (error) throw error;
      await refreshProfile();
      toast(t('settings.saved'));
    } catch (err) {
      console.error(err);
      toast(t('common.error'), 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveCenter = async (e: FormEvent) => {
    e.preventDefault();
    if (!center || !centerName.trim()) return;
    setSavingCenter(true);
    try {
      const { error } = await supabase
        .from('centers')
        .update({ name: centerName.trim() })
        .eq('id', center.id);
      if (error) throw error;
      await refreshProfile();
      toast(t('settings.saved'));
    } catch (err) {
      console.error(err);
      toast(t('common.error'), 'error');
    } finally {
      setSavingCenter(false);
    }
  };

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('velia_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return (profile?.theme as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    if (profile?.theme === 'light' || profile?.theme === 'dark') {
      setTheme(profile.theme);
    }
  }, [profile?.theme]);

  useEffect(() => {
    setFullName(profile?.full_name || '');
    setAvatarUrl(profile?.avatar_url || '');
  }, [profile?.full_name, profile?.avatar_url]);

  useEffect(() => setCenterName(center?.name || ''), [center?.name]);

  const changeLang = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('velia_lang', lang);
    if (profile) {
      void supabase.from('profiles').update({ preferred_language: lang }).eq('id', profile.id);
    }
  };

  const changeTheme = (next: 'light' | 'dark') => {
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('velia_theme', next);
    if (profile) {
      void supabase.from('profiles').update({ theme: next }).eq('id', profile.id);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="settings-page">
      <div className="settings-page__heading">
        <div><p>Shaxsiy ish maydoni</p><h1>{t('settings.title')}</h1></div>
        <ShieldCheck size={22} />
      </div>

      <div className="settings-layout">
        <aside className="settings-profile-card">
          <div className="settings-avatar settings-avatar--large">{avatarUrl ? <img src={avatarUrl} alt="Profil rasmi" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : <UserRound size={38} />}</div>
          <h2>{fullName || 'Velia foydalanuvchisi'}</h2>
          <p>{profile?.email}</p>
          <div className="settings-profile-card__meta"><span><Building2 size={15} /> {center?.name || 'Markaz'}</span><span><ShieldCheck size={15} /> Himoyalangan hisob</span></div>
        </aside>
        <div className="settings-content">
        {/* Profile */}
        <div className="card settings-card">
          <div className="settings-card__heading"><span><UserRound size={18} /></span><div><h2>{t('settings.profile')}</h2><p>Shaxsiy ma’lumotlaringizni yangilang</p></div></div>
          <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="input-group">
              <label className="input-label">{t('auth.fullName')}</label>
              <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="input-group">
              <label className="input-label"><ImageIcon size={14} /> Profil rasmi (kompyuterdan)</label>
              <input
                className="input"
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    const data = await readFileAsDataUrl(f);
                    setAvatarUrl(data);
                  } catch (err) {
                    toast(err instanceof Error ? err.message : 'Rasm yuklanmadi', 'error');
                  }
                }}
              />
              <small>JPG yoki PNG, max 1.5 MB. URL o‘rniga fayl tanlang.</small>
              {avatarUrl && <img src={avatarUrl} alt="" style={{ maxWidth: 96, marginTop: 8, borderRadius: 12 }} />}
            </div>
            <div className="input-group">
              <label className="input-label"><Mail size={14} /> {t('auth.email')}</label>
              <input className="input" value={profile?.email || ''} disabled />
            </div>
            <button className="btn btn-primary" type="submit" disabled={savingProfile} style={{ alignSelf: 'flex-start' }}>
              {savingProfile ? <><Loader2 size={16} className="animate-spin" />{t('common.loading')}</> : t('common.save')}
            </button>
          </form>
        </div>

        {/* Center */}
        <div className="card settings-card">
          <div className="settings-card__heading"><span><Building2 size={18} /></span><div><h2>{t('settings.center')}</h2><p>Ta’lim markazi ko‘rinishini boshqaring</p></div></div>
          <form onSubmit={handleSaveCenter} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="input-group">
              <label className="input-label">{t('settings.centerName')}</label>
              <input className="input" value={centerName} onChange={(e) => setCenterName(e.target.value)} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={savingCenter} style={{ alignSelf: 'flex-start' }}>
              {savingCenter ? <><Loader2 size={16} className="animate-spin" />{t('common.loading')}</> : t('common.save')}
            </button>
          </form>
        </div>

        {/* Language */}
        <div className="card settings-card">
          <div className="settings-card__heading"><span><Languages size={18} /></span><div><h2>{t('settings.language')}</h2><p>Interfeys tilini tanlang</p></div></div>
          <div className="settings-choice-grid">
            {(['uz', 'ru', 'en'] as const).map((lang) => (
              <button
                key={lang}
                className={`btn ${i18n.language === lang ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => changeLang(lang)}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Theme */}
        <div className="card settings-card">
          <div className="settings-card__heading"><span><Palette size={18} /></span><div><h2>{t('settings.theme')}</h2><p>Ko‘zingizga qulay rang uslubini tanlang</p></div></div>
          <div className="settings-choice-grid">
            <button
              className={`btn ${theme === 'light' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => changeTheme('light')}
            >
              {t('settings.light')}
            </button>
            <button
              className={`btn ${theme === 'dark' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => changeTheme('dark')}
            >
              {t('settings.dark')}
            </button>
          </div>
        </div>

        {/* Account */}
        <div className="card settings-card">
          <div className="settings-card__heading"><span className="settings-card__icon--danger"><LogOut size={18} /></span><div><h2>{t('settings.account')}</h2><p>Bu qurilmadagi sessiyani yakunlash</p></div></div>
          <button className="btn btn-danger" onClick={handleLogout}>
            <LogOut size={18} />
            {t('settings.logout')}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
