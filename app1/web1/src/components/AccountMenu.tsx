import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogOut, Building, Phone, Mail, ChevronDown, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '../features/auth/useAuthStore.js';
import { checkUnsentRecords } from '../offline/db.js';

export const AccountMenu: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout, logoutNotice } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [unsentCount, setUnsentCount] = useState<number>(0);
  const [showUnsentWarning, setShowUnsentWarning] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside or escape key
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleLogoutClick = async () => {
    if (!user) return;
    const count = await checkUnsentRecords(user.id);
    if (count > 0) {
      setUnsentCount(count);
      setShowUnsentWarning(true);
    } else {
      await performLogout();
    }
  };

  const performLogout = async (deleteUnsent = false) => {
    setIsLoggingOut(true);
    const isStaff = user && user.role !== 'PATIENT' && user.role !== 'ASHA';
    const target = isStaff ? '/staff/login' : '/login';
    try {
      setShowUnsentWarning(false);
      setOpen(false);
      await logout({ deleteUnsent });
      navigate(target, { replace: true });
    } catch {
      navigate(target, { replace: true });
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => navigate('/login')}
        className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F47738] hover:bg-[#D95D24] active:scale-95 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
      >
        <span>{t('nav.login', 'Login')}</span>
      </button>
    );
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'DOCTOR':
        return { label: 'Doctor', color: 'bg-blue-100 text-blue-800 border-blue-200' };
      case 'HOSPITAL_ADMIN':
        return { label: 'Hospital Admin', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
      case 'PHC_OFFICER':
        return { label: 'PHC Officer', color: 'bg-purple-100 text-purple-800 border-purple-200' };
      case 'GOVT_OFFICER':
        return { label: 'IDSP Officer', color: 'bg-sky-100 text-sky-800 border-sky-200' };
      case 'NGO_OBSERVER':
        return { label: 'NGO Observer', color: 'bg-teal-100 text-teal-800 border-teal-200' };
      case 'ASHA':
        return { label: 'ASHA Worker', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
      case 'ADMIN':
        return { label: 'Admin', color: 'bg-rose-100 text-rose-800 border-rose-200' };
      default:
        return { label: 'Citizen', color: 'bg-[#FFF0E6] text-[#D95D24] border-[#F0E2D8]' };
    }
  };

  const badge = getRoleBadge(user.role);

  return (
    <div className="relative" ref={menuRef}>
      {/* Account trigger button (accessible 44px+ touch target) */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="User Account Menu"
        className="flex items-center gap-1.5 p-1 sm:px-2.5 sm:py-1 rounded-full bg-[#FFF9F5] hover:bg-[#FFF0E6] border border-[#F0E2D8] transition-colors focus:outline-none focus:ring-2 focus:ring-[#F47738] min-h-[36px] cursor-pointer"
      >
        <div className="w-6 h-6 rounded-full bg-[#F47738] text-white flex items-center justify-center text-[11px] font-bold shrink-0">
          {user.name ? user.name[0].toUpperCase() : 'U'}
        </div>
        <span className="hidden sm:inline text-xs font-semibold text-[#242424] max-w-[100px] truncate">
          {user.name || 'User'}
        </span>
        <ChevronDown className="w-3 h-3 text-[#6B7280] shrink-0" />
      </button>

      {/* Account Dropdown Modal */}
      {open && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-24px)] bg-white rounded-2xl shadow-xl border border-[#F0E2D8] py-2.5 px-3 z-50 animate-in fade-in zoom-in-95"
        >
          {/* Identity Header */}
          <div className="border-b border-[#F0E2D8] pb-2.5 mb-2 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-sm text-slate-900 truncate block">
                {user.name}
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${badge.color}`}
              >
                {badge.label}
              </span>
            </div>

            {user.facilityName && (
              <div className="flex items-center gap-1 text-[11px] text-slate-500 truncate">
                <Building className="w-3 h-3 shrink-0 text-slate-400" />
                <span className="truncate">{user.facilityName}</span>
              </div>
            )}

            {user.phone && (
              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                <Phone className="w-3 h-3 shrink-0 text-slate-400" />
                <span>{user.phone}</span>
              </div>
            )}

            {user.email && (
              <div className="flex items-center gap-1 text-[11px] text-slate-500 truncate">
                <Mail className="w-3 h-3 shrink-0 text-slate-400" />
                <span className="truncate">{user.email}</span>
              </div>
            )}
          </div>

          {/* Workspace Shortcut */}
          <div className="mb-2 pt-1 border-t border-slate-100">
            {user.role === 'DOCTOR' && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate('/doctor');
                }}
                className="w-full text-left px-2.5 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 rounded-lg flex items-center justify-between"
              >
                <span>Doctor Workspace</span>
                <span>→</span>
              </button>
            )}
            {(user.role === 'HOSPITAL_ADMIN' || user.role === 'ADMIN') && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate('/org/dashboard');
                }}
                className="w-full text-left px-2.5 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 rounded-lg flex items-center justify-between"
              >
                <span>Hospital Workspace</span>
                <span>→</span>
              </button>
            )}
            {(user.role === 'PHC_OFFICER' || user.role === 'GOVT_OFFICER' || user.role === 'NGO_OBSERVER') && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate('/surveillance');
                }}
                className="w-full text-left px-2.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 rounded-lg flex items-center justify-between"
              >
                <span>Surveillance Portal</span>
                <span>→</span>
              </button>
            )}
            {(user.role === 'PATIENT' || user.role === 'ASHA') && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate('/home');
                }}
                className="w-full text-left px-2.5 py-1.5 text-xs font-bold text-[#D95D24] hover:bg-[#FFF0E6] rounded-lg flex items-center justify-between cursor-pointer"
              >
                <span>Patient Home</span>
                <span>→</span>
              </button>
            )}
          </div>

          {/* Offline Pending Notice (if any) */}
          {logoutNotice && (
            <div className="mb-2 p-2 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 leading-tight">
              {logoutNotice}
            </div>
          )}

          {/* Unsent Records Warning Dialog (Section 9.3) */}
          {showUnsentWarning ? (
            <div className="space-y-2 p-2 bg-amber-50 border border-amber-200 rounded-xl text-[11px]">
              <div className="flex items-start gap-1.5 text-amber-900 font-bold">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  You have {unsentCount} unsent record{unsentCount === 1 ? '' : 's'}. Log in again with the same account to send them, or delete them now.
                </span>
              </div>

              <div className="space-y-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => performLogout(false)}
                  disabled={isLoggingOut}
                  className="w-full py-1.5 px-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs"
                >
                  Log out (keep unsent records)
                </button>
                <button
                  type="button"
                  onClick={() => performLogout(true)}
                  disabled={isLoggingOut}
                  className="w-full py-1.5 px-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs"
                >
                  Delete unsent data
                </button>
                <button
                  type="button"
                  onClick={() => setShowUnsentWarning(false)}
                  className="w-full py-1 text-slate-500 hover:underline text-[11px]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* Standard Log out action button */
            <button
              type="button"
              role="menuitem"
              onClick={handleLogoutClick}
              disabled={isLoggingOut}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500 min-h-[44px]"
            >
              <LogOut className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{isLoggingOut ? 'Signing out...' : t('app.logout', 'Log out')}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
