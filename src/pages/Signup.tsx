import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import emailjs from '@emailjs/browser';
import { Check, Eye, EyeOff, Loader2, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import VeliaLogo from '../components/brand/VeliaLogo';
import { FREE_STUDENT_LIMIT } from '../lib/pricing';

export default function Signup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [centerName, setCenterName] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [verificationStep, setVerificationStep] = useState(false);
  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    const pending = localStorage.getItem('velia_otp_pending');
    const raw = localStorage.getItem('velia_otp_verification');
    if (pending && raw) {
      try {
        const saved = JSON.parse(raw) as { email?: string };
        if (saved.email) setEmail(saved.email);
        setVerificationStep(true);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const updateOtpCode = (value: string, startIndex = 0) => {
    const digits = value.replace(/\D/g, '').slice(0, 6 - startIndex);
    if (!digits && value) return;
    const next = otpCode.split('');
    if (!value) {
      next[startIndex] = '';
      setOtpCode(next.join(''));
      return;
    }
    for (let index = 0; index < digits.length; index += 1) next[startIndex + index] = digits[index];
    setOtpCode(next.join('').slice(0, 6));
    const focusIndex = Math.min(startIndex + Math.max(digits.length, 1), 5);
    requestAnimationFrame(() => otpInputRefs.current[focusIndex]?.focus());
  };

  const handleOtpKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === 'Backspace' && !otpCode[index] && index > 0) {
      event.preventDefault();
      const next = otpCode.split('');
      next[index - 1] = '';
      setOtpCode(next.join(''));
      otpInputRefs.current[index - 1]?.focus();
    }
    if (event.key === 'ArrowLeft' && index > 0) otpInputRefs.current[index - 1]?.focus();
    if (event.key === 'ArrowRight' && index < 5) otpInputRefs.current[index + 1]?.focus();
  };

  const handleOtpPaste = (event: ClipboardEvent<HTMLInputElement>, index: number) => {
    event.preventDefault();
    updateOtpCode(event.clipboardData.getData('text'), index);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!fullName.trim()) errs.fullName = t('auth.required');
    if (!email.trim()) errs.email = t('auth.required');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Email notoʻgʻri';
    if (!password) errs.password = t('auth.required');
    else if (password.length < 6) errs.password = t('auth.weakPassword');
    if (password !== confirmPassword) errs.confirmPassword = t('auth.passwordMismatch');
    if (!centerName.trim()) errs.centerName = t('auth.required');
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const generateOtpCode = () => Math.floor(100000 + Math.random() * 900000).toString();

  const sendOtpCode = async () => {
    const serviceId = (import.meta.env.VITE_EMAILJS_SERVICE_ID || '').trim();
    const templateId = (import.meta.env.VITE_EMAILJS_TEMPLATE_ID || '').trim();
    const publicKey = (import.meta.env.VITE_EMAILJS_PUBLIC_KEY || '').trim();

    if (!serviceId || !templateId || !publicKey) {
      const missing = [
        !serviceId ? 'VITE_EMAILJS_SERVICE_ID' : '',
        !templateId ? 'VITE_EMAILJS_TEMPLATE_ID' : '',
        !publicKey ? 'VITE_EMAILJS_PUBLIC_KEY' : '',
      ].filter(Boolean).join(', ');
      throw new Error(
        `EmailJS kalitlari yo‘q (${missing}). Loyiha ildizidagi .env faylga yozing va npm run dev ni qayta ishga tushiring.`
      );
    }

    const otp = generateOtpCode();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    // Kodni avval saqlaymiz — email yuborish xato bersa ham qayta yuborish ishlasin
    localStorage.setItem(
      'velia_otp_verification',
      JSON.stringify({
        email: email.trim(),
        otp,
        expiresAt,
      })
    );
    localStorage.setItem('velia_otp_pending', 'true');

    try {
      emailjs.init({ publicKey });
      await emailjs.send(serviceId, templateId, {
        email: email.trim(),
        to_email: email.trim(),
        to_name: fullName.trim() || email.trim(),
        full_name: fullName.trim() || email.trim(),
        user_name: fullName.trim() || email.trim(),
        otp_code: otp,
        passcode: otp,
        code: otp,
        message: `Velia tasdiqlash kodingiz: ${otp}`,
        company_name: 'Velia',
      });
    } catch (err) {
      console.error('EmailJS send failed', err);
      const detail =
        err && typeof err === 'object' && 'text' in err
          ? String((err as { text?: string }).text || '')
          : err instanceof Error
            ? err.message
            : '';
      throw new Error(
        detail
          ? `Email yuborilmadi: ${detail}`
          : 'Email yuborilmadi. EmailJS service/template/public key va template o‘zgaruvchilarini tekshiring ({{otp_code}}, {{to_email}}).'
      );
    }
  };

  const verifyOtpCode = async () => {
    if (!otpCode.trim() || otpCode.trim().length !== 6) {
      setError('6 xonali kodni togʻri kiriting');
      return;
    }

    setVerificationLoading(true);
    setError('');

    try {
      const raw = localStorage.getItem('velia_otp_verification');
      if (!raw) {
        setError('Tasdiqlash kodi topilmadi. Iltimos, yangi kod yuboring.');
        return;
      }

      const saved = JSON.parse(raw) as { email?: string; otp?: string; expiresAt?: number };

      if (saved.email !== email.trim()) {
        setError('Bu kod bu emailga tegishli emas.');
        return;
      }

      if (saved.otp !== otpCode.trim()) {
        setError('Tasdiqlash kodi notoʻgʻri.');
        return;
      }

      if (!saved.expiresAt || Date.now() > saved.expiresAt) {
        setError('Tasdiqlash kodi muddati tugagan. Yangi kod yuboring.');
        return;
      }

      localStorage.removeItem('velia_otp_verification');
      localStorage.removeItem('velia_otp_pending');
      navigate('/dashboard', { replace: true });
    } catch {
      setError('Kodni tasdiqlashda xatolik yuz berdi');
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validate()) return;

    setLoading(true);
    // signUp auth event'i kelishi bilan route dashboard'ga o'tib ketmasligi
    // uchun OTP jarayoni boshlanganini oldindan belgilaymiz.
    localStorage.setItem('velia_otp_pending', 'true');
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (authError) {
        if (authError.message.includes('already registered') || authError.message.includes('already been registered')) {
          setError(t('auth.emailExists'));
        } else {
          setError(authError.message);
        }
        localStorage.removeItem('velia_otp_pending');
        return;
      }

      if (!authData.user) {
        setError(t('common.error'));
        localStorage.removeItem('velia_otp_pending');
        return;
      }

      // Email confirmation Supabase'da yoqilgan bo'lsa signUp user yaratadi,
      // lekin sessiya qaytarmaydi. Sessiyasiz RPC va jadval so'rovlari 400/401
      // bo'ladi; ularni yubormasdan sozlamani aniq ko'rsatamiz.
      if (!authData.session) {
        setError(
          'Supabase Authentication sozlamalarida "Confirm email" yoqilgan. Ushbu maxsus OTP oqimi uchun uni o‘chirib, qayta ro‘yxatdan o‘ting.'
        );
        localStorage.removeItem('velia_otp_pending');
        return;
      }

      const { error: rpcError } = await supabase.rpc('complete_signup', {
        p_full_name: fullName.trim(),
        p_center_name: centerName.trim(),
      });

      if (rpcError) {
        // RPC Supabase'da hali ishga tushirilmagan bo'lsa, faqat faol sessiya
        // bilan xavfsiz fallback ishlatiladi.
        const { error: profileError } = await supabase.from('profiles').upsert({
          id: authData.user.id,
          full_name: fullName.trim(),
          email: email.trim(),
        });
        if (profileError) throw profileError;

        const { data: center } = await supabase
          .from('centers')
          .insert({ owner_id: authData.user.id, name: centerName.trim() })
          .select()
          .single();
        if (!center) throw rpcError;

        const { error: memberError } = await supabase.from('center_members').insert({
          center_id: center.id,
          user_id: authData.user.id,
          role: 'owner',
        });
        if (memberError) throw memberError;

        const { error: subscriptionError } = await supabase.from('center_subscriptions').insert({
          center_id: center.id,
          plan: 'free',
          student_limit: FREE_STUDENT_LIMIT,
        });
        if (subscriptionError) throw subscriptionError;
      }

      try {
        await sendOtpCode();
        setVerificationStep(true);
      } catch (mailErr) {
        console.error(mailErr);
        // Hisob yaratilgan — foydalanuvchini OTP bosqichida ushlab turamiz
        localStorage.setItem('velia_otp_pending', 'true');
        setVerificationStep(true);
        setError(
          mailErr instanceof Error
            ? mailErr.message
            : 'Tasdiqlash kodi yuborilmadi. «Kodni qayta yuborish» ni bosing.'
        );
      }
    } catch (err) {
      console.error(err);
      // Faqat hisob yaratilmagan bo‘lsa pending ni tozalaymiz
      if (!localStorage.getItem('velia_otp_verification')) {
        localStorage.removeItem('velia_otp_pending');
      }
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  if (verificationStep) {
    return (
      <div className="auth-page">
        <div className="auth-shell auth-shell--login">
          <aside className="auth-promo">
            <div className="auth-promo__brand"><VeliaLogo className="auth-promo__logo" /></div>
            <div className="auth-promo__content">
              <div className="auth-promo__eyebrow"><Sparkles size={15} /> Email tasdiqlash</div>
              <h1>{email}</h1>
              <p>Elektron pochtangizga 6 xonali tasdiqlash kodi yuborildi. Iltimos, kodni kiriting.</p>
            </div>
          </aside>

          <div className="auth-card">
            <div className="auth-logo">
              <VeliaLogo className="auth-velia-logo" />
            </div>
            <h2 className="auth-title">Kodni tasdiqlang</h2>
            <p className="auth-subtitle">Emailga kelgan 6 xonali kodni kiriting</p>

            <div className="auth-form">
              <div className="input-group">
                <label className="input-label" id="otpCodeLabel">
                  Tasdiqlash kodi
                </label>
                <div className="otp-inputs" role="group" aria-labelledby="otpCodeLabel">
                  {Array.from({ length: 6 }, (_, index) => (
                    <input
                      key={index}
                      ref={(element) => { otpInputRefs.current[index] = element; }}
                      className="otp-input"
                      value={otpCode[index] || ''}
                      onChange={(e) => updateOtpCode(e.target.value, index)}
                      onKeyDown={(e) => handleOtpKeyDown(e, index)}
                      onPaste={(e) => handleOtpPaste(e, index)}
                      inputMode="numeric"
                      autoComplete={index === 0 ? 'one-time-code' : 'off'}
                      aria-label={`${index + 1}-raqam`}
                      maxLength={1}
                      disabled={verificationLoading}
                    />
                  ))}
                </div>
              </div>

              {error && <p className="input-error-msg" role="alert">{error}</p>}

              <button
                type="button"
                className="btn btn-primary btn-block btn-lg"
                onClick={verifyOtpCode}
                disabled={verificationLoading}
              >
                {verificationLoading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    {t('common.loading')}
                  </>
                ) : (
                  'Tasdiqlash'
                )}
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-block"
                onClick={async () => {
                  setError('');
                  try {
                    await sendOtpCode();
                    setError('Yangi kod qayta yuborildi');
                  } catch {
                    setError('Kod qayta yuborilmadi');
                  }
                }}
                disabled={verificationLoading}
              >
                Kodni qayta yuborish
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <aside className="auth-promo">
          <div className="auth-promo__brand"><VeliaLogo className="auth-promo__logo" /></div>
          <div className="auth-promo__content">
            <div className="auth-promo__eyebrow"><Sparkles size={15} /> Boshqaruv yangi bosqichda</div>
            <h1>Markazingizni ishonch bilan boshqaring.</h1>
            <p>O‘quvchilar, guruhlar, davomat va to‘lovlarni bitta chiroyli tizimda jamlang.</p>
            <div className="auth-promo__list">
              <span><Check size={16} /> Kunlik ishlaringiz tartibli bo‘ladi</span>
              <span><Check size={16} /> Muhim raqamlar doim ko‘z oldingizda</span>
              <span><Check size={16} /> Birinchi qadamlar bepul</span>
            </div>
          </div>
          <div className="auth-promo__mini-card">
            <span>Bugungi umumiy natija</span>
            <strong>Hammasi nazoratda</strong>
          </div>
        </aside>

        <div className="auth-card">
          <div className="auth-logo">
            <VeliaLogo className="auth-velia-logo" />
          </div>
          <h2 className="auth-title">{t('auth.signupTitle')}</h2>
          <p className="auth-subtitle">{t('auth.signupSubtitle')}</p>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <div className="input-group">
              <label className="input-label" htmlFor="fullName">
                {t('auth.fullName')}
              </label>
              <input
                id="fullName"
                className={`input ${fieldErrors.fullName ? 'input-error' : ''}`}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={loading}
                required
              />
              {fieldErrors.fullName && <p className="input-error-msg">{fieldErrors.fullName}</p>}
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="email">
                {t('auth.email')}
              </label>
              <input
                id="email"
                type="email"
                className={`input ${fieldErrors.email ? 'input-error' : ''}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
              />
              {fieldErrors.email && <p className="input-error-msg">{fieldErrors.email}</p>}
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="password">
                {t('auth.password')}
              </label>
              <div className="password-wrapper">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className={`input ${fieldErrors.password ? 'input-error' : ''}`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {fieldErrors.password && <p className="input-error-msg">{fieldErrors.password}</p>}
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="confirmPassword">
                {t('auth.confirmPassword')}
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                className={`input ${fieldErrors.confirmPassword ? 'input-error' : ''}`}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                required
              />
              {fieldErrors.confirmPassword && (
                <p className="input-error-msg">{fieldErrors.confirmPassword}</p>
              )}
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="centerName">
                {t('auth.centerName')}
              </label>
              <input
                id="centerName"
                className={`input ${fieldErrors.centerName ? 'input-error' : ''}`}
                value={centerName}
                onChange={(e) => setCenterName(e.target.value)}
                disabled={loading}
                required
              />
              {fieldErrors.centerName && <p className="input-error-msg">{fieldErrors.centerName}</p>}
            </div>

            {error && <p className="input-error-msg" role="alert">{error}</p>}

            <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  {t('common.loading')}
                </>
              ) : (
                t('auth.signup')
              )}
            </button>
          </form>

          <p className="auth-footer">
            {t('auth.hasAccount')}{' '}
            <Link to="/login">{t('auth.login')}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
