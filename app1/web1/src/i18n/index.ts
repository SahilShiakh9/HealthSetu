import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import hi from './locales/hi.json';
import mr from './locales/mr.json';
import { db } from '../offline/db.js';
import type { Language } from '@healthsetu/contracts';

export const SUPPORTED_LANGUAGES: { code: Language; label: string; scriptLabel: string }[] = [
  { code: 'en', label: 'English', scriptLabel: 'English' },
  { code: 'hi', label: 'Hindi', scriptLabel: 'हिंदी' },
  { code: 'mr', label: 'Marathi', scriptLabel: 'मराठी' },
];

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
    mr: { translation: mr },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export const setAppLanguage = async (lng: Language): Promise<void> => {
  await i18n.changeLanguage(lng);
  await db.prefs.put({ key: 'language', value: lng });
};

// Initialize language from Dexie on startup
if (typeof window !== 'undefined') {
  db.prefs.get('language').then((pref) => {
    if (pref?.value && ['en', 'hi', 'mr'].includes(pref.value as string)) {
      i18n.changeLanguage(pref.value as string);
    }
  });
}

export default i18n;
