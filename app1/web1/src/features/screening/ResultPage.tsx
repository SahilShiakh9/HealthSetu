import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Home,
  MapPin,
  RotateCcw,
  ShieldAlert,
  Stethoscope,
  Info,
} from 'lucide-react';
import { db } from '../../offline/db.js';
import type { ScreeningResponse, RiskTier } from '@healthsetu/contracts';

export const ResultPage: React.FC = () => {
  const { localId } = useParams<{ localId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [screening, setScreening] = useState<(ScreeningResponse & { localId: string }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!localId) return;

    db.screenings
      .get(localId)
      .then((record) => {
        if (record) {
          setScreening(record as any);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [localId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (!screening) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 text-center">
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          {t('result.notFound', 'Screening assessment record not found.')}
        </p>
        <button
          onClick={() => navigate('/home')}
          className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold"
        >
          {t('common.returnHome', 'Return to Home')}
        </button>
      </div>
    );
  }

  const riskTier: RiskTier = screening.riskTier || 'LOW';

  const riskTierConfig = {
    HIGH: {
      badgeBg: 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border-rose-300 dark:border-rose-800',
      title: t('result.riskHighTitle', 'High Risk Assessment'),
      desc: t(
        'result.riskHighDesc',
        'Clinical signs require prompt medical evaluation by a certified doctor or healthcare center.',
      ),
      icon: ShieldAlert,
      barColor: 'bg-rose-600',
    },
    MEDIUM: {
      badgeBg: 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border-amber-300 dark:border-amber-800',
      title: t('result.riskMediumTitle', 'Moderate Risk Assessment'),
      desc: t(
        'result.riskMediumDesc',
        'Consultation with a teleconsultation doctor or visit to your local PHC is strongly advised.',
      ),
      icon: AlertCircle,
      barColor: 'bg-amber-500',
    },
    LOW: {
      badgeBg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
      title: t('result.riskLowTitle', 'Low Risk Assessment'),
      desc: t(
        'result.riskLowDesc',
        'Symptoms appear mild. Follow home care, maintain hydration, and monitor for changes.',
      ),
      icon: CheckCircle2,
      barColor: 'bg-emerald-600',
    },
  }[riskTier];

  const RiskIcon = riskTierConfig.icon;

  return (
    <div className="min-h-screen bg-[#FFF9F5] text-[#242424] pb-20 font-sans">
      {/* Top Header */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-[#F0E2D8] px-4 py-3 shadow-xs">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <h1 className="text-base font-semibold text-[#242424]">
            {t('result.header', 'Screening Assessment Result')}
          </h1>
          <button
            onClick={() => navigate('/screening')}
            className="text-xs text-[#D95D24] font-semibold hover:underline flex items-center gap-1 min-h-[36px] px-2.5 py-1 rounded-lg hover:bg-[#FFF0E6] transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t('result.retake', 'New')}</span>
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-6">
        {/* Top Section: Risk Tier Badge Card & Statutory Disclaimer */}
        <div className="space-y-4">
          {/* Risk Tier Badge Card */}
          <div className="bg-white border border-[#F0E2D8] rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-2xl border ${riskTierConfig.badgeBg}`}>
                <RiskIcon className="w-6 h-6" />
              </div>
              <div>
                <span
                  className={`inline-block text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border mb-1 ${riskTierConfig.badgeBg}`}
                >
                  {riskTier} RISK
                </span>
                <h2 className="text-lg font-bold text-[#242424]">
                  {riskTierConfig.title}
                </h2>
              </div>
            </div>
            <p className="text-xs text-[#6B7280] leading-relaxed">
              {riskTierConfig.desc}
            </p>
          </div>

          {/* Mandatory Statutory Disclaimer per Section 11.6 */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-amber-900">
                {t('result.disclaimerTitle', 'Official Clinical Disclaimer')}
              </p>
              <p className="text-xs text-amber-800/90 leading-relaxed">
                {t(
                  'result.disclaimerBody',
                  'This assessment is an AI and rule-assisted screening tool for decision support. It is NOT an official medical diagnosis. Please consult a qualified doctor or healthcare worker for professional medical evaluation.',
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Responsive Grid on Tablet / Desktop */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
          {/* Left Column: Conditions & Symptoms */}
          <div className="space-y-5">
            {/* Condition Probabilities */}
            {screening.possibleConditions && screening.possibleConditions.length > 0 && (
              <div className="bg-white border border-[#F0E2D8] rounded-3xl p-5 space-y-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#242424]">
                    {t('result.possibleConditions', 'Condition Likelihood Estimates')}
                  </h3>
                  <span className="text-[10px] font-semibold text-[#D95D24] bg-[#FFF0E6] px-2.5 py-0.5 rounded-full border border-[#F0E2D8]">
                    {screening.engine?.type === 'rules'
                      ? `Rule-based Screening v${screening.engine?.version || '1.0.0'}`
                      : screening.engine?.type === 'ml'
                      ? `Server ML Assist v${screening.engine?.version || '1.0.0'}`
                      : `On-device Naive Bayes v${screening.engine?.version || '1.0.0'}`}
                  </span>
                </div>

                <div className="space-y-3">
                  {screening.possibleConditions.map((cond, idx) => {
                    const percent = Math.round(cond.probability * 100);
                    return (
                      <div key={idx} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-[#242424]">
                            {cond.name}
                          </span>
                          <span className="font-bold text-[#6B7280]">
                            {percent}%
                          </span>
                        </div>
                        <div className="h-2 w-full bg-[#FFF9F5] border border-[#F0E2D8] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              idx === 0 ? riskTierConfig.barColor : 'bg-slate-300'
                            }`}
                            style={{ width: `${Math.max(percent, 4)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-[#F0E2D8] flex items-center justify-between text-xs text-[#6B7280]">
                  <span>{t('result.specialty', 'Recommended Care:')}</span>
                  <span className="font-semibold text-[#242424]">
                    {screening.recommendedSpecialty || 'General Physician'}
                  </span>
                </div>
              </div>
            )}

            {/* Symptoms Breakdown ("Why this result?") */}
            <div className="bg-white border border-[#F0E2D8] rounded-3xl p-5 space-y-3 shadow-xs">
              <h3 className="text-sm font-bold text-[#242424]">
                {t('result.symptomsReported', 'Reported Symptoms & Indicators')}
              </h3>
              <div className="flex flex-wrap gap-2">
                {screening.symptoms && screening.symptoms.length > 0 ? (
                  screening.symptoms.map((s, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1 bg-[#FFF0E6] text-[#D95D24] border border-[#F0E2D8] text-xs font-medium rounded-full"
                    >
                      {s.replace(/_/g, ' ')}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-[#6B7280]">
                    {t('result.noSpecificSymptoms', 'No specific symptoms logged.')}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Primary Action Buttons */}
          <div className="space-y-4">
            <div className="bg-white border border-[#F0E2D8] rounded-3xl p-5 sm:p-6 space-y-4 shadow-xs">
              <h3 className="text-sm font-bold text-[#242424]">
                Recommended Next Steps
              </h3>
              <p className="text-xs text-[#6B7280] leading-relaxed">
                Connect with an empanelled doctor via teleconsultation or discover nearest public health facilities.
              </p>

              <div className="space-y-3 pt-1">
                {/* Consult Doctor */}
                <button
                  type="button"
                  onClick={() => navigate('/consult')}
                  className="w-full min-h-[56px] bg-[#F47738] hover:bg-[#D95D24] active:scale-[0.98] text-white font-semibold text-sm sm:text-base rounded-2xl shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Stethoscope className="w-5 h-5 text-white" />
                  <span>{t('result.consultDoctor', 'Consult a Doctor (Teleconsult)')}</span>
                  <ArrowRight className="w-5 h-5 ml-1" />
                </button>

                {/* Find Facility */}
                <button
                  type="button"
                  onClick={() => navigate('/facilities')}
                  className="w-full min-h-[52px] bg-white hover:bg-[#FFF0E6] text-[#242424] font-semibold text-sm rounded-2xl border border-[#F0E2D8] flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
                >
                  <MapPin className="w-4 h-4 text-[#F47738]" />
                  <span>{t('result.findFacility', 'Find Nearest PHC / CHC')}</span>
                </button>

                {/* Return Home */}
                <button
                  type="button"
                  onClick={() => navigate('/home')}
                  className="w-full min-h-[44px] text-[#6B7280] hover:text-[#242424] font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Home className="w-3.5 h-3.5" />
                  <span>{t('common.returnHome', 'Return to Home')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
