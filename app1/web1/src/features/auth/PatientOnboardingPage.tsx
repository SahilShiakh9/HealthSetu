import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { User, Calendar, Globe, CheckCircle2, AlertCircle, ArrowRight, PhoneCall } from 'lucide-react';
import { Header } from '../../components/Header.js';
import { useAuthStore } from './useAuthStore.js';
import { apiClient } from '../../services/apiClient.js';
import { setAppLanguage, SUPPORTED_LANGUAGES } from '../../i18n/index.js';
import { isPatientProfileComplete } from './authUtils.js';
import type { Language, Gender } from '@healthsetu/contracts';

export const PatientOnboardingPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, updateUser, isLoading } = useAuthStore();

  const [name, setName] = useState('');
  const [ageMode, setAgeMode] = useState<'age' | 'dob'>('age');
  const [age, setAge] = useState<string>('');
  const [dob, setDob] = useState<string>('');
  const [selectedLang, setSelectedLang] = useState<Language>((i18n.language as Language) || 'hi');
  const [gender, setGender] = useState<Gender | ''>('');
  const [villageCode, setVillageCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill user data
  useEffect(() => {
    if (user) {
      if (user.name && !user.name.startsWith('User ')) {
        setName(user.name);
      }
      if (user.language) {
        setSelectedLang(user.language);
      }
      if (user.age !== undefined && user.age !== null) {
        setAge(user.age.toString());
      }
      if (user.dateOfBirth) {
        setDob(user.dateOfBirth.split('T')[0]);
        setAgeMode('dob');
      }
    }
  }, [user]);

  // If already complete, skip directly to /home
  useEffect(() => {
    if (!isLoading && user && isPatientProfileComplete(user)) {
      navigate('/home', { replace: true });
    }
  }, [user, isLoading, navigate]);

  if (!isLoading && user && isPatientProfileComplete(user)) {
    return <Navigate to="/home" replace />;
  }

  const handleLanguageChange = async (lang: Language) => {
    setSelectedLang(lang);
    await setAppLanguage(lang);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || name.trim().length < 2) {
      setError('Please provide your full name (at least 2 letters)');
      return;
    }

    if (ageMode === 'age') {
      const parsedAge = parseInt(age, 10);
      if (isNaN(parsedAge) || parsedAge < 0 || parsedAge > 125) {
        setError('Please enter a valid age between 0 and 125');
        return;
      }
    } else {
      if (!dob) {
        setError('Please select your date of birth');
        return;
      }
      const dobDate = new Date(dob);
      if (isNaN(dobDate.getTime()) || dobDate > new Date()) {
        setError('Please enter a valid past date of birth');
        return;
      }
    }

    try {
      setSaving(true);
      setError(null);

      const payload: Record<string, any> = {
        name: name.trim(),
        language: selectedLang,
      };

      if (ageMode === 'age') {
        payload.age = parseInt(age, 10);
      } else {
        payload.dateOfBirth = dob;
      }

      if (gender) payload.gender = gender;
      if (villageCode.trim()) payload.villageCode = villageCode.trim();

      const res = await apiClient<{
        message: string;
        profile: {
          id: string;
          name: string;
          language: Language;
          age?: number;
          dateOfBirth?: string;
          ageBand?: string;
          gender?: Gender;
          villageCode?: string;
          districtCode?: string;
        };
      }>('/me/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      // Update store state with refreshed profile data
      updateUser({
        name: res.profile.name,
        language: res.profile.language,
        age: res.profile.age,
        dateOfBirth: res.profile.dateOfBirth,
        ageBand: res.profile.ageBand,
      });

      navigate('/home', { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF9F5] flex flex-col">
      <Header />

      <main className="flex-1 max-w-lg w-full mx-auto p-4 flex flex-col justify-center my-4">
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-[#F0E2D8] space-y-6">
          <div className="text-center space-y-1.5">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#FFF0E6] text-[#F47738] mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h1 className="text-xl md:text-2xl font-black text-[#242424]">
              {t('auth.profile_completion_title', 'Complete Your Profile')}
            </h1>
            <p className="text-xs text-[#6B7280]">
              {t(
                'auth.profile_completion_sub',
                'Please confirm your basic details to proceed to Patient Home',
              )}
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSaveProfile} className="space-y-4">
            {/* Preferred Language */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#242424] flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-[#6B7280]" />
                <span>{t('auth.preferred_language', 'Preferred Language')}</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => handleLanguageChange(lang.code)}
                    className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all text-center cursor-pointer ${
                      selectedLang === lang.code
                        ? 'border-[#F47738] bg-[#FFF0E6] text-[#242424] shadow-xs ring-1 ring-[#F47738]'
                        : 'border-[#F0E2D8] hover:border-[#F47738]/40 text-[#6B7280] bg-white'
                    }`}
                  >
                    <div>{lang.scriptLabel}</div>
                    <div className="text-[10px] font-normal text-[#6B7280]">{lang.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Full Name */}
            <div className="space-y-1.5">
              <label htmlFor="ob-name" className="text-xs font-bold text-[#242424] block">
                {t('auth.full_name', 'Full Name')} <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="w-5 h-5 text-[#6B7280] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="ob-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ramesh Patil"
                  className="w-full min-h-[48px] pl-11 pr-4 py-2 text-sm rounded-xl border border-[#F0E2D8] focus:outline-none focus:border-[#F47738] focus:ring-2 focus:ring-[#F47738]/20 bg-white"
                  required
                />
              </div>
            </div>

            {/* Age or Date of Birth */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#242424] block">
                  {t('auth.age_or_dob', 'Age or Date of Birth')} <span className="text-rose-500">*</span>
                </label>
                <div className="flex gap-2 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setAgeMode('age')}
                    className={`px-2 py-0.5 rounded-md cursor-pointer transition-colors ${ageMode === 'age' ? 'bg-[#FFF0E6] text-[#F47738]' : 'text-[#6B7280] hover:text-[#242424]'}`}
                  >
                    Enter Age
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgeMode('dob')}
                    className={`px-2 py-0.5 rounded-md cursor-pointer transition-colors ${ageMode === 'dob' ? 'bg-[#FFF0E6] text-[#F47738]' : 'text-[#6B7280] hover:text-[#242424]'}`}
                  >
                    Select Birthdate
                  </button>
                </div>
              </div>

              {ageMode === 'age' ? (
                <div className="relative">
                  <Calendar className="w-5 h-5 text-[#6B7280] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="ob-age"
                    type="number"
                    min={0}
                    max={125}
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="e.g. 35"
                    className="w-full min-h-[48px] pl-11 pr-4 py-2 text-sm rounded-xl border border-[#F0E2D8] focus:outline-none focus:border-[#F47738] focus:ring-2 focus:ring-[#F47738]/20 bg-white"
                    required
                  />
                </div>
              ) : (
                <div className="relative">
                  <Calendar className="w-5 h-5 text-[#6B7280] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="ob-dob"
                    type="date"
                    max={new Date().toISOString().split('T')[0]}
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="w-full min-h-[48px] pl-11 pr-4 py-2 text-sm rounded-xl border border-[#F0E2D8] focus:outline-none focus:border-[#F47738] focus:ring-2 focus:ring-[#F47738]/20 bg-white"
                    required
                  />
                </div>
              )}
            </div>

            {/* Optional Gender & Location Fields */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#6B7280] block">Gender (Optional)</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as Gender)}
                  className="w-full min-h-[42px] px-3 py-2 text-xs rounded-xl border border-[#F0E2D8] bg-white focus:outline-none focus:border-[#F47738] focus:ring-2 focus:ring-[#F47738]/20"
                >
                  <option value="">Select Gender</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                  <option value="O">Other</option>
                  <option value="U">Prefer not to say</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#6B7280] block">Village/Town (Optional)</label>
                <input
                  type="text"
                  value={villageCode}
                  onChange={(e) => setVillageCode(e.target.value)}
                  placeholder="e.g. Pabal"
                  className="w-full min-h-[42px] px-3 py-2 text-xs rounded-xl border border-[#F0E2D8] bg-white focus:outline-none focus:border-[#F47738] focus:ring-2 focus:ring-[#F47738]/20"
                />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={saving}
              className="w-full min-h-[50px] bg-[#F47738] hover:bg-[#D95D24] active:scale-[0.98] disabled:bg-slate-300 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-sm shadow-xs transition-all mt-4 cursor-pointer disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span>Saving profile...</span>
                </>
              ) : (
                <>
                  <span>{t('auth.save_profile', 'Save & Go to Patient Home')}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Emergency Bypass Notice - Patients are never blocked from emergency help */}
          <div className="pt-3 border-t border-[#F0E2D8] flex items-center justify-between text-xs">
            <span className="text-[#6B7280]">Need urgent medical care?</span>
            <button
              type="button"
              onClick={() => navigate('/screening/emergency')}
              className="inline-flex items-center gap-1.5 text-rose-600 hover:text-rose-700 font-bold hover:underline cursor-pointer"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Emergency 108</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};
