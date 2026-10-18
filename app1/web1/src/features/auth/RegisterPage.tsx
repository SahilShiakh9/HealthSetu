import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { User, Phone, Lock, Eye, EyeOff, ArrowRight, ShieldCheck, Calendar, Globe, AlertCircle } from 'lucide-react';
import { Header } from '../../components/Header.js';
import { useAuthStore } from './useAuthStore.js';
import { ROLE_HOME_MAP } from '../../components/RequireAuth.js';
import { apiClient } from '../../services/apiClient.js';
import { setAppLanguage, SUPPORTED_LANGUAGES } from '../../i18n/index.js';
import { isPatientProfileComplete } from './authUtils.js';
import type { Language, UserProfile } from '@healthsetu/contracts';

export const RegisterPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, isLoading, setAuth } = useAuthStore();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [ageMode, setAgeMode] = useState<'age' | 'dob'>('age');
  const [age, setAge] = useState<string>('');
  const [dob, setDob] = useState<string>('');
  const [selectedLang, setSelectedLang] = useState<Language>((i18n.language as Language) || 'hi');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already authenticated, redirect to authorized home
  useEffect(() => {
    if (!isLoading && user) {
      const target = ROLE_HOME_MAP[user.role] || '/home';
      navigate(target, { replace: true });
    }
  }, [user, isLoading, navigate]);

  if (!isLoading && user) {
    const target = ROLE_HOME_MAP[user.role] || '/home';
    return <Navigate to={target} replace />;
  }

  const handleLanguageChange = async (lang: Language) => {
    setSelectedLang(lang);
    await setAppLanguage(lang);
  };

  const validateForm = (): string | null => {
    if (!name.trim() || name.trim().length < 2) {
      return 'Please enter your full name (at least 2 letters)';
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      return 'Please enter a valid 10-digit Indian mobile number';
    }

    if (ageMode === 'age') {
      const parsedAge = parseInt(age, 10);
      if (isNaN(parsedAge) || parsedAge < 0 || parsedAge > 125) {
        return 'Please enter a valid age between 0 and 125';
      }
    } else {
      if (!dob) {
        return 'Please select your date of birth';
      }
      const dobDate = new Date(dob);
      if (isNaN(dobDate.getTime()) || dobDate > new Date()) {
        return 'Please enter a valid past date of birth';
      }
    }

    if (password.length < 8) {
      return 'Password must be at least 8 characters long';
    }

    if (password !== confirmPassword) {
      return 'Password confirmation does not match';
    }

    return null;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const payload: Record<string, any> = {
        name: name.trim(),
        phone: phone.replace(/\D/g, ''),
        language: selectedLang,
        password,
        confirmPassword,
      };

      if (ageMode === 'age') {
        payload.age = parseInt(age, 10);
      } else {
        payload.dateOfBirth = dob;
      }

      const res = await apiClient<{ accessToken: string; user: UserProfile }>('/auth/patient/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setAuth(res.accessToken, res.user);

      if (isPatientProfileComplete(res.user)) {
        navigate('/home', { replace: true });
      } else {
        navigate('/profile/complete', { replace: true });
      }
    } catch (err: any) {
      const msg = err?.message || 'Registration failed. Please verify your details.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-3 border-emerald-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />

      <main className="flex-1 max-w-lg w-full mx-auto p-4 flex flex-col justify-center my-4">
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 space-y-6">
          <div className="text-center space-y-1.5">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 mx-auto">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900">
              {t('auth.patient_register_title', 'Patient Registration')}
            </h1>
            <p className="text-xs text-slate-500">
              Create your secure HealthSetu account for digital health consultations
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

          <form onSubmit={handleRegister} className="space-y-4" noValidate>
            {/* Preferred Language Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-slate-400" />
                <span>{t('auth.preferred_language', 'Preferred Language')}</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => handleLanguageChange(lang.code)}
                    className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all text-center ${
                      selectedLang === lang.code
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900 shadow-xs ring-1 ring-emerald-600'
                        : 'border-slate-200 hover:border-slate-300 text-slate-600 bg-white'
                    }`}
                  >
                    <div>{lang.scriptLabel}</div>
                    <div className="text-[10px] font-normal text-slate-400">{lang.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Full Name */}
            <div className="space-y-1.5">
              <label htmlFor="reg-name" className="text-xs font-bold text-slate-700 block">
                {t('auth.full_name', 'Full Name')} <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="reg-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ramesh Patil"
                  className="w-full min-h-[48px] pl-11 pr-4 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  required
                />
              </div>
            </div>

            {/* Age or Date of Birth */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 block">
                  {t('auth.age_or_dob', 'Age or Date of Birth')} <span className="text-rose-500">*</span>
                </label>
                <div className="flex gap-2 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setAgeMode('age')}
                    className={`px-2 py-0.5 rounded-md ${ageMode === 'age' ? 'bg-emerald-100 text-emerald-800' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    Enter Age
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgeMode('dob')}
                    className={`px-2 py-0.5 rounded-md ${ageMode === 'dob' ? 'bg-emerald-100 text-emerald-800' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    Select Birthdate
                  </button>
                </div>
              </div>

              {ageMode === 'age' ? (
                <div className="relative">
                  <Calendar className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="reg-age"
                    type="number"
                    min={0}
                    max={125}
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="e.g. 35"
                    className="w-full min-h-[48px] pl-11 pr-4 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                    required
                  />
                </div>
              ) : (
                <div className="relative">
                  <Calendar className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="reg-dob"
                    type="date"
                    max={new Date().toISOString().split('T')[0]}
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="w-full min-h-[48px] pl-11 pr-4 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                    required
                  />
                </div>
              )}
            </div>

            {/* Mobile Number */}
            <div className="space-y-1.5">
              <label htmlFor="reg-phone" className="text-xs font-bold text-slate-700 block">
                {t('auth.phone_label', 'Mobile Number')} <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Phone className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="reg-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="10-digit mobile number (e.g. 9876543210)"
                  className="w-full min-h-[48px] pl-11 pr-4 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="reg-password" className="text-xs font-bold text-slate-700 block">
                {t('auth.password', 'Password')} <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Lock className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full min-h-[48px] pl-11 pr-12 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <label htmlFor="reg-confirm-password" className="text-xs font-bold text-slate-700 block">
                {t('auth.confirm_password', 'Confirm Password')} <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Lock className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="reg-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  className="w-full min-h-[48px] pl-11 pr-12 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[50px] bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] disabled:bg-slate-300 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-sm shadow-xs transition-all mt-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span>Creating account...</span>
                </>
              ) : (
                <>
                  <span>{t('auth.register_submit', 'Create Patient Account')}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Privacy Note */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 leading-relaxed text-center">
            {t(
              'auth.privacy_note',
              'Your health data is protected under India DPDP Act and ABDM guidelines.',
            )}
          </div>

          {/* Link to Login */}
          <div className="text-center pt-2 border-t border-slate-100 space-y-1.5 text-xs">
            <div>
              <Link
                to="/login"
                className="font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
              >
                {t('auth.have_account', 'Already have an account? Sign In')}
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
