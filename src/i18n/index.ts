import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import uz from './uz';
import ru from './ru';
import en from './en';

const resources = {
  uz: { translation: uz },
  ru: { translation: ru },
  en: { translation: en },
};

i18n.use(initReactI18next).init({
  resources,
  lng: localStorage.getItem('velia_lang') || 'uz',
  fallbackLng: 'uz',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
