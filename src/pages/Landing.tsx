import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, BarChart3, Check, ClipboardCheck, CreditCard, GraduationCap, MessageCircle, ShieldCheck, Sparkles, Users } from 'lucide-react';
import VeliaLogo from '../components/brand/VeliaLogo';
import { TELEGRAM_PAYMENT_URL } from '../lib/pricing';

export default function Landing() {
  const { t } = useTranslation();

  return (
    <div className="landing-page">
      <header className="landing-header">
        <VeliaLogo className="landing-logo" />
        <div className="landing-header__actions">
          <Link to="/login" className="btn btn-secondary">
            {t('landing.demo')}
          </Link>
          <Link to="/signup" className="btn btn-primary">
            {t('landing.cta')}
          </Link>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-hero__copy">
            <div className="landing-eyebrow"><Sparkles size={15} /> Ta'lim markazingiz uchun bitta boshqaruv markazi</div>
            <h1>
            {t('landing.hero')}
            </h1>
            <p>
            {t('landing.sub')}
            </p>
            <div className="landing-hero__actions">
              <Link to="/signup" className="btn btn-primary btn-lg">
              {t('landing.cta')}
                <ArrowRight size={18} />
              </Link>
              <Link to="/login" className="btn btn-secondary btn-lg">
              {t('landing.demo')}
              </Link>
            </div>
            <div className="landing-hero__trust"><Check size={15} /> Karta talab qilinmaydi <span /> <Check size={15} /> 20 ta o‘quvchigacha bepul</div>
          </div>
          <div className="landing-hero__visual">
            <div className="landing-hero__glow" />
            <div className="landing-dashboard-preview">
              <div className="landing-dashboard-preview__top"><span /><span /><span /></div>
              <div className="landing-dashboard-preview__brand"><VeliaLogo className="landing-preview-logo" /><span>Bugungi ko'rsatkichlar</span></div>
              <div className="landing-dashboard-preview__stats"><strong><small>Faol o‘quvchilar</small>128</strong><strong><small>Davomat</small>94%</strong><strong><small>Tushum</small>18.4M</strong></div>
              <div className="landing-dashboard-preview__chart"><i /><i /><i /><i /><i /><i /><i /></div>
            </div>
          </div>
        </section>

        <section className="landing-features">
          {[
            { icon: Users, title: t('landing.feature1Title'), desc: t('landing.feature1Desc') },
            { icon: ClipboardCheck, title: t('landing.feature2Title'), desc: t('landing.feature2Desc') },
            { icon: CreditCard, title: t('landing.feature3Title'), desc: t('landing.feature3Desc') },
          ].map((f) => (
            <div key={f.title} className="landing-feature">
              <div className="landing-feature__icon"><f.icon size={24} /></div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
          {[
            { icon: BarChart3, title: 'Tahlil va hisobotlar', desc: 'Muhim ko‘rsatkichlar va markazingiz holatini bir qarashda ko‘ring.' },
            { icon: GraduationCap, title: 'Kurs va guruhlar', desc: 'Kurslar, guruhlar va jadvalni tartibli boshqaring.' },
            { icon: ShieldCheck, title: 'Xavfsiz ish maydoni', desc: 'Markazingiz ma’lumotlari alohida va himoyalangan saqlanadi.' },
          ].map((f) => (
            <div key={f.title} className="landing-feature">
              <div className="landing-feature__icon"><f.icon size={24} /></div>
              <h3>{f.title}</h3><p>{f.desc}</p>
            </div>
          ))}
        </section>

        <section className="landing-pricing">
          <div className="landing-section-heading">
            <span>Oddiy va shaffof</span>
            <h2>
            {t('landing.pricingTitle')}
            </h2>
          </div>
          <div className="landing-pricing__grid">
            {[
              { name: 'Boshlang‘ich', price: '0 so‘m', detail: '20 ta o‘quvchigacha bepul' },
              { name: '21–100 o‘quvchi', price: '100 000 so‘m / oy', detail: '20 tadan keyingi ilk tarif' },
              { name: '101–1 000 o‘quvchi', price: '350 000 so‘m / oy', detail: 'O‘sayotgan markazlar uchun' },
              { name: '1 001–10 000 o‘quvchi', price: '950 000 so‘m / oy', detail: 'Katta markazlar uchun to‘liq tarif' },
              { name: '10 000 dan ko‘p', price: 'Individual', detail: 'Maxsus ehtiyojlar uchun' },
            ].map((p, index) => (
              <div key={p.name} className={`landing-price ${index === 1 ? 'landing-price--featured' : ''}`}>
                <div className="landing-price__name">{p.name}</div>
                <strong>{p.price}</strong><p>{p.detail}</p>
                <div className="landing-price__line"><Check size={16} /> Markazingizni tartibli boshqaring</div>
                <div className="landing-price__line"><Check size={16} /> Hisobotlar har doim yoningizda</div>
                {index > 0 && <a href={TELEGRAM_PAYMENT_URL} target="_blank" rel="noreferrer" className="btn btn-primary btn-block"><MessageCircle size={16} /> Telegram orqali to‘lash</a>}
              </div>
            ))}
          </div>
        </section>
        <section className="landing-cta">
          <div><span>BUGUNOQ BOSHLANG</span><h2>Markazingizdagi ishlarni Velia bilan yengillashtiring.</h2><p>Ro‘yxatdan o‘ting va dastlabki 20 ta o‘quvchini bepul qo‘shing.</p></div>
          <Link to="/signup" className="btn btn-primary btn-lg">Bepul boshlash <ArrowRight size={18} /></Link>
        </section>
      </main>

      <footer
        style={{
          textAlign: 'center',
          padding: 24,
          color: 'var(--color-text-muted)',
          fontSize: 'var(--text-sm)',
          borderTop: '1px solid var(--color-border)',
        }}
      >
        © {new Date().getFullYear()} Velia
      </footer>
    </div>
  );
}
