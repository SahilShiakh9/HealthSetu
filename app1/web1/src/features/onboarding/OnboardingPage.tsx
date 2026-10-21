import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Check, ArrowRight, Globe, HeartPulse } from 'lucide-react';
import { SUPPORTED_LANGUAGES, setAppLanguage } from '../../i18n/index.js';
import { db } from '../../offline/db.js';
import { queueOutboxEvent } from '../../offline/outbox.js';
import type { Language } from '@healthsetu/contracts';

export const OnboardingPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [step, setStep] = useState<'language' | 'consent'>('language');
  const [selectedLang, setSelectedLang] = useState<Language>((i18n.language as Language) || 'hi');
  const [agreeStorage, setAgreeStorage] = useState(true);
  const [agreeAnalytics, setAgreeAnalytics] = useState(true);

  const handleSelectLanguage = async (lng: Language) => {
    setSelectedLang(lng);
    await setAppLanguage(lng);
  };

  const handleCompleteOnboarding = async () => {
    // Save onboarding state in Dexie
    await db.prefs.put({ key: 'onboardingDone', value: true });

    // Store local consents
    if (agreeStorage) {
      await db.consentsLocal.put({
        purpose: 'SCREENING_STORAGE',
        granted: true,
        policyVersion: '1.0.0',
        language: selectedLang,
        givenAt: Date.now(),
      });
      await queueOutboxEvent('CONSENT_GIVEN', {
        purpose: 'SCREENING_STORAGE',
        granted: true,
        policyVersion: '1.0.0',
        language: selectedLang,
      });
    }

    if (agreeAnalytics) {
      await db.consentsLocal.put({
        purpose: 'ANONYMISED_ANALYTICS',
        granted: true,
        policyVersion: '1.0.0',
        language: selectedLang,
        givenAt: Date.now(),
      });
      await queueOutboxEvent('CONSENT_GIVEN', {
        purpose: 'ANONYMISED_ANALYTICS',
        granted: true,
        policyVersion: '1.0.0',
        language: selectedLang,
      });
    }

    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#FFF9F5] flex flex-col justify-center px-4 py-8">
      <div className="max-w-md w-full mx-auto bg-white rounded-3xl shadow-xs border border-[#F0E2D8] p-6 space-y-6">
        {/* Brand header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-[#FFF0E6] text-[#D95D24] rounded-2xl mx-auto flex items-center justify-center shadow-xs">
            <HeartPulse className="w-9 h-9" />
          </div>
          <h1 className="text-2xl font-black text-[#242424] tracking-tight">{t('app.name')}</h1>
          <p className="text-xs text-[#6B7280] font-medium">{t('app.subtitle')}</p>
        </div>

        {step === 'language' && (
          <div className="space-y-5 animate-in fade-in">
            <div className="text-center space-y-1">
              <h2 className="text-lg font-bold text-[#242424] flex items-center justify-center gap-1.5">
                <Globe className="w-5 h-5 text-[#F47738]" />
                <span>{t('onboarding.choose_language')}</span>
              </h2>
              <p className="text-xs text-[#6B7280]">{t('onboarding.select_language_sub')}</p>
            </div>

            {/* Language Selection Buttons - Labelled by script */}
            <div className="space-y-3">
              {SUPPORTED_LANGUAGES.map((lang) => {
                const isSelected = selectedLang === lang.code;
                return (
                  <button
                    key={lang.code}
                    onClick={() => handleSelectLanguage(lang.code)}
                    className={`w-full min-h-[56px] px-5 py-3.5 rounded-2xl flex items-center justify-between border-2 transition-all text-left cursor-pointer ${
                      isSelected
                        ? 'border-[#F47738] bg-[#FFF0E6] text-[#D95D24] font-bold shadow-xs'
                        : 'border-[#F0E2D8] hover:border-[#F47738]/50 bg-white text-[#242424]'
                    }`}
                  >
                    <div>
                      <span className="text-lg block leading-snug">{lang.scriptLabel}</span>
                      <span className="text-xs text-[#6B7280] font-normal">{lang.label}</span>
                    </div>
                    {isSelected && (
                      <div className="w-6 h-6 rounded-full bg-[#F47738] text-white flex items-center justify-center">
                        <Check className="w-4 h-4 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setStep('consent')}
              className="w-full min-h-[52px] bg-[#F47738] hover:bg-[#D95D24] active:scale-[0.98] text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
            >
              <span>{t('onboarding.get_started')}</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {step === 'consent' && (
          <div className="space-y-5 animate-in fade-in">
            <div className="text-center space-y-1">
              <h2 className="text-lg font-bold text-[#242424] flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-5 h-5 text-[#F47738]" />
                <span>{t('onboarding.consent_title')}</span>
              </h2>
              <p className="text-xs text-[#6B7280] leading-relaxed text-left p-3.5 bg-[#FFF9F5] rounded-xl border border-[#F0E2D8]">
                {t('onboarding.consent_desc')}
              </p>
            </div>

            {/* Consent Checkboxes */}
            <div className="space-y-3.5 text-xs text-[#242424]">
              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-[#F0E2D8] cursor-pointer bg-white hover:bg-[#FFF9F5] transition-colors">
                <input
                  type="checkbox"
                  checked={agreeStorage}
                  onChange={(e) => setAgreeStorage(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-[#F47738] focus:ring-[#F47738]"
                />
                <span className="leading-snug">{t('onboarding.consent_storage')}</span>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-[#F0E2D8] cursor-pointer bg-white hover:bg-[#FFF9F5] transition-colors">
                <input
                  type="checkbox"
                  checked={agreeAnalytics}
                  onChange={(e) => setAgreeAnalytics(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-[#F47738] focus:ring-[#F47738]"
                />
                <span className="leading-snug">{t('onboarding.consent_analytics')}</span>
              </label>
            </div>

            <button
              disabled={!agreeStorage}
              onClick={handleCompleteOnboarding}
              className={`w-full min-h-[52px] font-bold rounded-2xl flex items-center justify-center gap-2 shadow-xs transition-all ${
                agreeStorage
                  ? 'bg-[#F47738] hover:bg-[#D95D24] active:scale-[0.98] text-white cursor-pointer'
                  : 'bg-[#F0E2D8] text-[#6B7280] cursor-not-allowed'
              }`}
            >
              <span>{t('onboarding.agree_continue')}</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
