import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ArrowRight, ShieldCheck, HeartPulse } from 'lucide-react';
import { Header } from '../../components/Header.js';
import { useAuthStore } from './useAuthStore.js';
import { ROLE_HOME_MAP } from '../../components/RequireAuth.js';
import { apiClient } from '../../services/apiClient.js';
import type { UserProfile } from '@healthsetu/contracts';

export const StaffLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading, setAuth } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

  const handleStaffPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Please enter your email and password');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await apiClient<{ accessToken: string; user: UserProfile }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      });

      setAuth(res.accessToken, res.user);
      const target = ROLE_HOME_MAP[res.user.role] || '/home';
      navigate(target, { replace: true });
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Invalid email or password');
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
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-black text-[#242424] tracking-tight">Staff & Clinical Portal</h1>
            <p className="text-xs text-[#6B7280]">
              Authorized Doctors, Hospital Administrators, Public Health & NGO Users
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

          {/* Staff Login Form */}
          <form onSubmit={handleStaffPasswordLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#242424] block">Staff Email</label>
              <div className="relative">
                <Mail className="w-5 h-5 text-[#6B7280] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="doctor@healthsetu.org"
                  className="w-full min-h-[48px] pl-11 pr-4 py-2 text-sm rounded-xl border border-[#F0E2D8] focus:outline-hidden focus:ring-2 focus:ring-[#F47738] bg-white text-[#242424]"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#242424] block">Password</label>
              <div className="relative">
                <Lock className="w-5 h-5 text-[#6B7280] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full min-h-[48px] pl-11 pr-12 py-2 text-sm rounded-xl border border-[#F0E2D8] focus:outline-hidden focus:ring-2 focus:ring-[#F47738] bg-white text-[#242424]"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#242424] p-1 cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="w-full min-h-[48px] bg-[#F47738] hover:bg-[#D95D24] active:scale-[0.98] disabled:bg-[#F0E2D8] disabled:text-[#6B7280] text-white font-bold rounded-xl flex items-center justify-center gap-2 text-sm shadow-xs transition-all cursor-pointer"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {/* Quick Demo Role Autofill */}
            <div className="pt-2 border-t border-[#F0E2D8] space-y-2">
              <span className="text-[11px] font-bold text-[#6B7280] block text-center uppercase tracking-wider">
                Quick Demo Accounts
              </span>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    setEmail('doctor@healthsetu.org');
                    setPassword('Doctor@12345');
                  }}
                  className="p-2 rounded-xl border border-[#F0E2D8] hover:border-[#F47738] bg-[#FFF9F5] hover:bg-[#FFF0E6] text-[#242424] font-semibold text-left truncate cursor-pointer active:scale-95 transition-all"
                >
                  👨‍⚕️ Doctor (PHC)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmail('hospital_admin@healthsetu.org');
                    setPassword('Hospital@12345');
                  }}
                  className="p-2 rounded-xl border border-[#F0E2D8] hover:border-[#F47738] bg-[#FFF9F5] hover:bg-[#FFF0E6] text-[#242424] font-semibold text-left truncate cursor-pointer active:scale-95 transition-all"
                >
                  🏥 Hospital Admin
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmail('govt@healthsetu.org');
                    setPassword('Govt@12345');
                  }}
                  className="p-2 rounded-xl border border-[#F0E2D8] hover:border-[#F47738] bg-[#FFF9F5] hover:bg-[#FFF0E6] text-[#242424] font-semibold text-left truncate cursor-pointer active:scale-95 transition-all"
                >
                  🏛️ IDSP Govt Officer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmail('ngo@healthsetu.org');
                    setPassword('Ngo@12345');
                  }}
                  className="p-2 rounded-xl border border-[#F0E2D8] hover:border-[#F47738] bg-[#FFF9F5] hover:bg-[#FFF0E6] text-[#242424] font-semibold text-left truncate cursor-pointer active:scale-95 transition-all"
                >
                  🌐 NGO Observer
                </button>
              </div>
            </div>

            {/* Clinical & Hospital Onboarding */}
            <div className="pt-2 text-center border-t border-[#F0E2D8] space-y-1 text-xs">
              <div>
                <span className="text-[#6B7280]">Need to onboard as a physician? </span>
                <Link to="/doctor/register" className="font-bold text-[#D95D24] hover:text-[#F47738] hover:underline">
                  Register as Doctor
                </Link>
              </div>
              <div>
                <span className="text-[#6B7280]">New healthcare facility? </span>
                <Link to="/hospital/register" className="font-bold text-[#D95D24] hover:text-[#F47738] hover:underline">
                  Register Hospital / Organization
                </Link>
              </div>
            </div>
          </form>

          {/* Return to patient portal link */}
          <div className="pt-2 border-t border-[#F0E2D8] text-center">
            <Link
              to="/home"
              className="inline-flex items-center gap-1.5 text-xs text-[#6B7280] hover:text-[#D95D24] font-semibold transition-colors py-1.5 px-3 rounded-lg hover:bg-[#FFF0E6] cursor-pointer"
            >
              <HeartPulse className="w-3.5 h-3.5 text-[#F47738]" />
              <span>Looking for Patient Screening? Go to Patient App</span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
};

export default StaffLoginPage;
