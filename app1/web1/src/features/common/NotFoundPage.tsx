import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/Header.js';
import { FileQuestion, Home, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../auth/useAuthStore.js';
import { ROLE_HOME_MAP } from '../../components/RequireAuth.js';

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();

  const homeRoute = isAuthenticated && user ? (ROLE_HOME_MAP[user.role] || '/home') : '/home';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />
      <main className="flex-1 max-w-md w-full mx-auto p-6 flex flex-col items-center justify-center text-center space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shadow-sm">
          <FileQuestion className="w-8 h-8" />
        </div>

        <div className="space-y-1.5">
          <h1 className="text-xl font-black text-slate-900">Page Not Found</h1>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            The page you requested does not exist or may have moved.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-2.5 w-full max-w-xs">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Go Back</span>
          </button>
          <button
            type="button"
            onClick={() => navigate(homeRoute, { replace: true })}
            className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs"
          >
            <Home className="w-4 h-4" />
            <span>Home</span>
          </button>
        </div>
      </main>
    </div>
  );
};
