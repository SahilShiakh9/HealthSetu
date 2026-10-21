import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Phone, ArrowRight, Lock, Eye, EyeOff, User } from 'lucide-react';
import { Header } from '../../components/Header.js';
import { useAuthStore } from './useAuthStore.js';
import { ROLE_HOME_MAP } from '../../components/RequireAuth.js';
import { apiClient } from '../../services/apiClient.js';
import { isPatientProfileComplete } from './authUtils.js';
import type { UserProfile } from '@healthsetu/contracts';

export const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading, setAuth } = useAuthStore();

  const [phone, setPhone] = useState('');
  const [patientPassword, setPatientPassword] = useState('');
  const [showPatientPassword, setShowPatientPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already authenticated, directly redirect to user's authorized role workspace
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

  const handlePatientPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length !== 10) {
      setError('Please enter a valid 10-digit mobile number');
      return;
    }
    if (!/^[6-9]/.test(cleanPhone)) {
      setError('Indian mobile numbers must start with 6, 7, 8, or 9 (e.g. 9876543210)');
      return;
    }
    if (!patientPassword) {
      setError('Please enter your password');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await apiClient<{ accessToken: string; user: UserProfile }>('/auth/patient/login', {
        method: 'POST',
        body: JSON.stringify({ phone: cleanPhone, password: patientPassword }),
      });

      setAuth(res.accessToken, res.user);

      if (isPatientProfileComplete(res.user)) {
        navigate('/home', { replace: true });
      } else {
        navigate('/profile/complete', { replace: true });
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Invalid mobile number or password');
    } finally {
      setLoading(false);
    }
  };

  if (isLoading || (isAuthenticated && user)) {
    return (
      <div className="min-h-screen bg-[#FFF9F5] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-3 border-[#F47738] border-t-transparent animate-spin" />
          <span className="text-xs font-semibold text-[#6B7280]">Redirecting to workspace...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFF9F5] flex flex-col">
      <Header />

      <main className="flex-1 max-w-md w-full mx-auto p-4 flex flex-col justify-center">
        <div className="bg-white rounded-3xl p-6 shadow-xs border border-[#F0E2D8] space-y-5">
          {/* Header */}
          <div className="text-center space-y-1">
            <div className="w-12 h-12 bg-[#FFF0E6] text-[#D95D24] rounded-2xl mx-auto flex items-center justify-center mb-2 shadow-xs">
              <User className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-black text-[#242424]">{t('auth.login_title', 'Login / Register')}</h1>
            <p className="text-xs text-[#6B7280]">
              Sign in with phone number and password
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold"
            >
              {error}
            </div>
          )}

          {/* Patient Login Form */}
          <form onSubmit={handlePatientPasswordLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#242424] block">
                {t('auth.phone_label', 'Mobile Number')}
              </label>
              <div className="relative">
                <Phone className="w-5 h-5 text-[#6B7280] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder={t('auth.phone_placeholder', '10-digit mobile number')}
                  className="w-full min-h-[48px] pl-11 pr-4 py-2 text-sm rounded-xl border border-[#F0E2D8] focus:outline-hidden focus:ring-2 focus:ring-[#F47738] bg-white text-[#242424]"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#242424] block">
                {t('auth.password', 'Password')}
              </label>
              <div className="relative">
                <Lock className="w-5 h-5 text-[#6B7280] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPatientPassword ? 'text' : 'password'}
                  value={patientPassword}
                  onChange={(e) => setPatientPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full min-h-[48px] pl-11 pr-12 py-2 text-sm rounded-xl border border-[#F0E2D8] focus:outline-hidden focus:ring-2 focus:ring-[#F47738] bg-white text-[#242424]"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPatientPassword(!showPatientPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#242424] p-1 cursor-pointer"
                  aria-label={showPatientPassword ? 'Hide password' : 'Show password'}
                >
                  {showPatientPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || phone.length < 10 || !patientPassword}
              className="w-full min-h-[48px] bg-[#F47738] hover:bg-[#D95D24] active:scale-[0.98] disabled:bg-[#F0E2D8] disabled:text-[#6B7280] text-white font-bold rounded-xl flex items-center justify-center gap-2 text-sm shadow-xs transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>{t('auth.login_submit', 'Sign In')}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {/* Link to Register */}
            <div className="pt-2 text-center border-t border-[#F0E2D8] space-y-1">
              <div>
                <span className="text-xs text-[#6B7280]">Don&apos;t have an account? </span>
                <Link
                  to="/register"
                  className="text-xs font-bold text-[#D95D24] hover:text-[#F47738] hover:underline"
                >
                  {t('auth.need_account', 'New patient? Register here')}
                </Link>
              </div>
            </div>
          </form>

          {/* Continue as Citizen / Guest without login */}
          <div className="pt-2 border-t border-[#F0E2D8] text-center">
            <button
              type="button"
              onClick={() => navigate('/home', { replace: true })}
              className="inline-flex items-center gap-1.5 text-xs text-[#6B7280] hover:text-[#D95D24] font-semibold transition-colors py-1.5 px-3 rounded-lg hover:bg-[#FFF0E6] cursor-pointer"
            >
              <span>{t('auth.continue_as_guest', 'Continue as Citizen / Offline Screening')}</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#F47738]" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default LoginPage;
