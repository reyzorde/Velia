import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, Eye, EyeOff, Loader2, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import VeliaLogo from '../components/brand/VeliaLogo';

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError(t('auth.required'));
      return;
    }
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) {
        setError(t('auth.invalidCredentials'));
        return;
      }
      // Yangi ro‘yxat OTP hali tugallanmagan bo‘lsa — tasdiqlashga qaytar
      if (localStorage.getItem('velia_otp_pending')) {
        navigate('/signup', { replace: true });
        return;
      }
      navigate('/dashboard', { replace: true });
    } catch {
      setError(t('auth.networkError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-shell auth-shell--login">
        <aside className="auth-promo">
          <div className="auth-promo__brand"><VeliaLogo className="auth-promo__logo" /></div>
          <div className="auth-promo__content">
            <div className="auth-promo__eyebrow"><Sparkles size={15} /> Xush kelibsiz</div>
            <h1>Markazingiz boshqaruvi yana bir qadam narida.</h1>
            <p>Velia bilan o‘quv markazingizning bugungi holatini bir qarashda ko‘ring.</p>
            <div className="auth-promo__list">
              <span><Check size={16} /> O‘quvchilar va guruhlar</span>
              <span><Check size={16} /> Davomat va to‘lovlar</span>
              <span><Check size={16} /> Tiniq va tezkor hisobotlar</span>
            </div>
          </div>
          <div className="auth-promo__mini-card">
            <span>Velia workspace</span>
            <strong>Bugun hammasi nazoratda</strong>
          </div>
        </aside>

        <div className="auth-card">
        <div className="auth-logo">
          <VeliaLogo className="auth-velia-logo" />
        </div>
        <h2 className="auth-title">{t('auth.loginTitle')}</h2>
        <p className="auth-subtitle">{t('auth.loginSubtitle')}</p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="input-group">
            <label className="input-label" htmlFor="email">
              {t('auth.email')}
            </label>
            <input
              id="email"
              type="email"
              className={`input ${error ? 'input-error' : ''}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              autoComplete="email"
              disabled={loading}
              required
            />
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="password">
              {t('auth.password')}
            </label>
            <div className="password-wrapper">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className={`input ${error ? 'input-error' : ''}`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={loading}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? t('auth.passwordHide') : t('auth.passwordShow')}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && <p className="input-error-msg" role="alert">{error}</p>}

          <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                {t('common.loading')}
              </>
            ) : (
              t('auth.login')
            )}
          </button>
        </form>

        <p className="auth-footer">
          {t('auth.noAccount')}{' '}
          <Link to="/signup">{t('auth.signup')}</Link>
        </p>
        </div>
      </div>
    </div>
  );
}
