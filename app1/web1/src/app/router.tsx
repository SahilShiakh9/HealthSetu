import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { OnboardingPage } from '../features/onboarding/OnboardingPage.js';
import { HomePage } from '../features/home/HomePage.js';
import { LoginPage } from '../features/auth/LoginPage.js';
import { StaffLoginPage } from '../features/auth/StaffLoginPage.js';
import { RegisterPage } from '../features/auth/RegisterPage.js';
import { DoctorRegisterPage } from '../features/auth/DoctorRegisterPage.js';
import { HospitalRegisterPage } from '../features/auth/HospitalRegisterPage.js';
import { DoctorStatusPage } from '../features/auth/DoctorStatusPage.js';
import { PatientOnboardingPage } from '../features/auth/PatientOnboardingPage.js';
import { OfflinePage } from '../features/offline/OfflinePage.js';
import { ScreeningPage } from '../features/screening/ScreeningPage.js';
import { EmergencyPage } from '../features/screening/EmergencyPage.js';
import { ResultPage } from '../features/screening/ResultPage.js';
import { FacilityListPage } from '../features/facilities/FacilityListPage.js';
import { ChooseConsultPage } from '../features/consultation/ChooseConsultPage.js';
import { WaitingRoomPage } from '../features/consultation/WaitingRoomPage.js';
import { ConsultationRoomPage } from '../features/consultation/ConsultationRoomPage.js';
import { DoctorDashboardPage } from '../features/consultation/DoctorDashboardPage.js';
import { ReportsPage } from '../features/reports/ReportsPage.js';
import { ReportDetailPage } from '../features/reports/ReportDetailPage.js';
import { HospitalAdminDashboardPage } from '../features/organization/HospitalAdminDashboardPage.js';
import { SurveillanceDashboardPage } from '../features/surveillance/SurveillanceDashboardPage.js';
import { PhcDashboardPage } from '../features/intelligence/PhcDashboardPage.js';
import { NgoDashboardPage } from '../features/ngo/NgoDashboardPage.js';
import { GuidancePage } from '../features/guidance/GuidancePage.js';
import { RequireAuth, ROLE_HOME_MAP } from '../components/RequireAuth.js';
import { db } from '../offline/db.js';
import { useAuthStore } from '../features/auth/useAuthStore.js';
import { NotFoundPage } from '../features/common/NotFoundPage.js';

const RootRedirect: React.FC = () => {
  const [checking, setChecking] = useState(true);
  const [hasOnboarded, setHasOnboarded] = useState(false);
  const { user, isLoading } = useAuthStore();

  useEffect(() => {
    db.prefs
      .get('onboardingDone')
      .then((pref) => {
        setHasOnboarded(!!pref?.value);
        setChecking(false);
      })
      .catch(() => {
        setHasOnboarded(false);
        setChecking(false);
      });
  }, []);

  if (checking || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-7 h-7 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // If already authenticated or profile exists, directly navigate to user's authorized role workspace
  if (user) {
    const landingRoute = ROLE_HOME_MAP[user.role] || '/home';
    return <Navigate to={landingRoute} replace />;
  }

  return hasOnboarded ? <Navigate to="/login" replace /> : <Navigate to="/onboarding" replace />;
};

/**
 * PublicOnlyRoute ensures logged-in users cannot access guest-only pages like /login or /register.
 * If user presses browser back button, they are redirected immediately to their workspace.
 */
export const PublicOnlyRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="w-7 h-7 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user) {
    const landingRoute = ROLE_HOME_MAP[user.role] || '/home';
    return <Navigate to={landingRoute} replace />;
  }

  return <>{children}</>;
};

export const AppRouter: React.FC = () => {
  const initSession = useAuthStore((s) => s.initSession);

  useEffect(() => {
    initSession();
  }, [initSession]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route
          path="/onboarding"
          element={
            <PublicOnlyRoute>
              <OnboardingPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <LoginPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/staff/login"
          element={
            <PublicOnlyRoute>
              <StaffLoginPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnlyRoute>
              <RegisterPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/doctor/register"
          element={
            <PublicOnlyRoute>
              <DoctorRegisterPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/hospital/register"
          element={
            <PublicOnlyRoute>
              <HospitalRegisterPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/doctor/registration-status"
          element={
            <RequireAuth allowedRoles={['DOCTOR']}>
              <DoctorStatusPage />
            </RequireAuth>
          }
        />
        <Route
          path="/profile/complete"
          element={
            <RequireAuth allowedRoles={['PATIENT', 'ASHA']}>
              <PatientOnboardingPage />
            </RequireAuth>
          }
        />
        <Route path="/home" element={<HomePage />} />
        <Route path="/offline" element={<OfflinePage />} />

        {/* Phase 3 Screening Flow */}
        <Route path="/screening" element={<ScreeningPage />} />
        <Route path="/screening/emergency" element={<EmergencyPage />} />
        <Route path="/screening/result/:localId" element={<ResultPage />} />

        {/* Phase 4 Facilities */}
        <Route path="/facilities" element={<FacilityListPage />} />

        {/* Phase 5 Teleconsultation, Queue & Clinical Outcomes */}
        <Route path="/consult/choose" element={<ChooseConsultPage />} />
        <Route path="/consult/waiting/:consultationId" element={<WaitingRoomPage />} />
        <Route
          path="/consult/room/:consultationId"
          element={
            <RequireAuth>
              <ConsultationRoomPage />
            </RequireAuth>
          }
        />
        <Route
          path="/doctor"
          element={
            <RequireAuth allowedRoles={['DOCTOR']}>
              <DoctorDashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/reports"
          element={
            <RequireAuth>
              <ReportsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/reports/:consultationId"
          element={
            <RequireAuth>
              <ReportDetailPage />
            </RequireAuth>
          }
        />

        {/* Multi-Organization Hospital Admin Portal */}
        <Route
          path="/org/dashboard"
          element={
            <RequireAuth allowedRoles={['HOSPITAL_ADMIN', 'ADMIN']}>
              <HospitalAdminDashboardPage />
            </RequireAuth>
          }
        />

        {/* Public Health & Surveillance Workspace */}
        <Route
          path="/surveillance"
          element={
            <RequireAuth allowedRoles={['PHC_OFFICER', 'GOVT_OFFICER', 'NGO_OBSERVER', 'ADMIN']}>
              <SurveillanceDashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/phc"
          element={
            <RequireAuth allowedRoles={['PHC_OFFICER', 'GOVT_OFFICER', 'NGO_OBSERVER', 'ADMIN']}>
              <PhcDashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/ngo"
          element={
            <RequireAuth allowedRoles={['NGO_OBSERVER', 'ADMIN', 'GOVT_OFFICER', 'PHC_OFFICER']}>
              <NgoDashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/ngo/dashboard"
          element={
            <RequireAuth allowedRoles={['NGO_OBSERVER', 'ADMIN', 'GOVT_OFFICER', 'PHC_OFFICER']}>
              <NgoDashboardPage />
            </RequireAuth>
          }
        />

        {/* Phase 7 Guidance Bot, Voice Fallback, Image Compression */}
        <Route path="/guidance" element={<GuidancePage />} />

        {/* Unknown routes render NotFoundPage rather than blank screen */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
};
