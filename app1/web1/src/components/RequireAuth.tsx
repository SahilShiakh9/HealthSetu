import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../features/auth/useAuthStore.js';
import type { Role } from '@healthsetu/contracts';

interface RequireAuthProps {
  children: React.ReactNode;
  allowedRoles?: Role[];
}

export const ROLE_HOME_MAP: Record<string, string> = {
  PATIENT: '/home',
  ASHA: '/home',
  DOCTOR: '/doctor',
  HOSPITAL_ADMIN: '/org/dashboard',
  PHC_OFFICER: '/phc',
  GOVT_OFFICER: '/surveillance',
  NGO_OBSERVER: '/ngo/dashboard',
  ADMIN: '/org/dashboard',
};

export const RequireAuth: React.FC<RequireAuthProps> = ({
  children,
  allowedRoles,
}) => {
  const location = useLocation();
  const { isAuthenticated, isLoading, user, refreshSession } = useAuthStore();

  // Handle bfcache: if user navigated back after logging out in another tab or state,
  // re-verify authentication immediately
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        refreshSession().catch(() => {});
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    return () => {
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [refreshSession]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-3 border-emerald-500 border-t-transparent animate-spin" />
          <span className="text-xs font-semibold text-slate-500">Verifying session...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    const isStaffRoute =
      location.pathname.startsWith('/doctor') ||
      location.pathname.startsWith('/org') ||
      location.pathname.startsWith('/surveillance') ||
      location.pathname.startsWith('/phc') ||
      location.pathname.startsWith('/ngo') ||
      Boolean(allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes('PATIENT') && !allowedRoles.includes('ASHA'));

    const redirectTarget = isStaffRoute ? '/staff/login' : '/login';
    return <Navigate to={redirectTarget} state={{ from: location }} replace />;
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    const landingRoute = ROLE_HOME_MAP[user.role] || '/home';
    return <Navigate to={landingRoute} replace />;
  }

  return <>{children}</>;
};
