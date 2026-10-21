import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App.js';
import { db } from '../offline/db.js';
import { useAuthStore } from '../features/auth/useAuthStore.js';
import * as apiClientModule from '../services/apiClient.js';
import { isPatientProfileComplete } from '../features/auth/authUtils.js';

describe('Production Patient Authentication & Onboarding Suite', () => {
  beforeEach(async () => {
    await db.prefs.clear();
    useAuthStore.getState().clearAuth();
    window.history.pushState({}, '', '/');

    vi.spyOn(apiClientModule, 'apiClient').mockImplementation(async (path: string, options?: any) => {
      if (path === '/auth/patient/register') {
        return {
          accessToken: 'test-patient-jwt-token',
          user: {
            id: 'patient-test-id-1',
            name: 'Sunita Sharma',
            phone: '9876543210',
            role: 'PATIENT',
            language: 'mr',
            age: 32,
            ageBand: '31-40',
            isActive: true,
          },
        } as any;
      }
      if (path === '/auth/patient/login') {
        return {
          accessToken: 'test-patient-jwt-token',
          user: {
            id: 'patient-test-id-1',
            name: 'Sunita Sharma',
            phone: '9876543210',
            role: 'PATIENT',
            language: 'mr',
            age: 32,
            ageBand: '31-40',
            isActive: true,
          },
        } as any;
      }
      if (path === '/me/profile') {
        const body = options?.body ? JSON.parse(options.body) : {};
        return {
          message: 'Profile updated successfully',
          profile: {
            id: 'patient-test-id-1',
            name: body.name || 'Sunita Sharma',
            language: body.language || 'mr',
            age: body.age || 32,
            ageBand: '31-40',
            role: 'PATIENT',
          },
        } as any;
      }
      return {} as any;
    });
  });

  describe('1. Profile Completion Utility', () => {
    it('returns false for unauthenticated users', () => {
      expect(isPatientProfileComplete(null)).toBe(false);
      expect(isPatientProfileComplete(undefined)).toBe(false);
    });

    it('returns true for staff and organizational roles', () => {
      expect(
        isPatientProfileComplete({
          id: 'doc-1',
          name: 'Dr. Deshmukh',
          role: 'DOCTOR',
          language: 'en',
        }),
      ).toBe(true);
      expect(
        isPatientProfileComplete({
          id: 'admin-1',
          name: 'Admin',
          role: 'ADMIN',
          language: 'en',
        }),
      ).toBe(true);
    });

    it('detects incomplete patient profile when age/dob or real name is missing', () => {
      expect(
        isPatientProfileComplete({
          id: 'p-1',
          name: 'User 3210', // Auto-generated fallback name
          role: 'PATIENT',
          language: 'hi',
        }),
      ).toBe(false);

      expect(
        isPatientProfileComplete({
          id: 'p-2',
          name: 'Pooja Verma',
          role: 'PATIENT',
          language: 'hi',
          // age and dateOfBirth missing
        }),
      ).toBe(false);
    });

    it('detects complete patient profile when name, language, and age or dateOfBirth exist', () => {
      expect(
        isPatientProfileComplete({
          id: 'p-3',
          name: 'Pooja Verma',
          role: 'PATIENT',
          language: 'hi',
          age: 26,
        }),
      ).toBe(true);

      expect(
        isPatientProfileComplete({
          id: 'p-4',
          name: 'Pooja Verma',
          role: 'PATIENT',
          language: 'mr',
          dateOfBirth: '1998-05-12',
        }),
      ).toBe(true);
    });
  });

  describe('2. Patient Registration Form & Validation', () => {
    it('renders the dedicated registration page at /register', async () => {
      window.history.pushState({}, '', '/register');
      render(<App />);

      const title = await screen.findByText(/Patient Registration|रोगी पंजीकरण|रुग्ण नोंदणी/i);
      expect(title).toBeInTheDocument();

      // Check for required input fields
      expect(screen.getByPlaceholderText(/Ramesh Patil/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/10-digit mobile number/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/At least 8 characters/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Re-enter your password/i)).toBeInTheDocument();

      // Ensure NO forbidden medical fields exist on registration
      expect(screen.queryByText(/Medical conditions/i)).toBeNull();
      expect(screen.queryByText(/Allergies/i)).toBeNull();
      expect(screen.queryByText(/Current medicines/i)).toBeNull();
      expect(screen.queryByText(/Medical history/i)).toBeNull();
    });

    it('displays client-side validation error when submitting with mismatched passwords', async () => {
      window.history.pushState({}, '', '/register');
      render(<App />);

      await screen.findByText(/Patient Registration|रोगी पंजीकरण|रुग्ण नोंदणी/i);

      fireEvent.change(screen.getByPlaceholderText(/Ramesh Patil/i), {
        target: { value: 'Sunita Sharma' },
      });
      fireEvent.change(screen.getByPlaceholderText(/10-digit mobile number/i), {
        target: { value: '9876543210' },
      });
      fireEvent.change(screen.getByPlaceholderText(/e\.g\. 35/i), {
        target: { value: '32' },
      });
      fireEvent.change(screen.getByPlaceholderText(/At least 8 characters/i), {
        target: { value: 'Password123' },
      });
      fireEvent.change(screen.getByPlaceholderText(/Re-enter your password/i), {
        target: { value: 'DifferentPassword123' },
      });

      const submitBtn = screen.getByRole('button', {
        name: /Create Patient Account|रोगी खाता बनाएं|रुग्ण खाते तयार करा/i,
      });
      fireEvent.click(submitBtn);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/Password confirmation does not match|match/i);
    });

    it('submits registration successfully and establishes patient session', async () => {
      window.history.pushState({}, '', '/register');
      render(<App />);

      await screen.findByText(/Patient Registration|रोगी पंजीकरण|रुग्ण नोंदणी/i);

      fireEvent.change(screen.getByPlaceholderText(/Ramesh Patil/i), {
        target: { value: 'Sunita Sharma' },
      });
      fireEvent.change(screen.getByPlaceholderText(/10-digit mobile number/i), {
        target: { value: '9876543210' },
      });
      fireEvent.change(screen.getByPlaceholderText(/e\.g\. 35/i), {
        target: { value: '32' },
      });
      fireEvent.change(screen.getByPlaceholderText(/At least 8 characters/i), {
        target: { value: 'Password123' },
      });
      fireEvent.change(screen.getByPlaceholderText(/Re-enter your password/i), {
        target: { value: 'Password123' },
      });

      const submitBtn = screen.getByRole('button', {
        name: /Create Patient Account|रोगी खाता बनाएं|रुग्ण खाते तयार करा/i,
      });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(useAuthStore.getState().isAuthenticated).toBe(true);
        expect(useAuthStore.getState().user?.role).toBe('PATIENT');
        expect(useAuthStore.getState().user?.name).toBe('Sunita Sharma');
      });
    });
  });

  describe('3. Patient Login & Session Navigation', () => {
    it('allows patient login with mobile number and password', async () => {
      useAuthStore.getState().clearAuth();
      window.history.pushState({}, '', '/login');
      render(<App />);

      await screen.findByText(/Sign in with phone number/i);

      // Select Patient tab if present
      const patientTab = screen.queryByRole('button', { name: /📱 Patient/i });
      if (patientTab) {
        fireEvent.click(patientTab);
      }

      const phoneInput = screen.getByPlaceholderText(/10-digit mobile number/i);
      const passwordInput = screen.getByPlaceholderText(/Enter your password/i);

      fireEvent.change(phoneInput, { target: { value: '9876543210' } });
      fireEvent.change(passwordInput, { target: { value: 'Password123' } });

      const submitBtn = screen.getByRole('button', { name: /Sign In|साइन इन|लॉगिन करा/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(useAuthStore.getState().isAuthenticated).toBe(true);
        expect(useAuthStore.getState().user?.role).toBe('PATIENT');
      });
    });

    it('prevents authenticated patient from viewing /login or /register (PublicOnlyRoute)', async () => {
      useAuthStore.getState().setAuth('dummy-token', {
        id: 'patient-123',
        name: 'Sunita Sharma',
        role: 'PATIENT',
        language: 'mr',
        age: 32,
      });

      window.history.pushState({}, '', '/login');
      render(<App />);

      // Should redirect to home and display welcome banner
      const welcome = await screen.findByText(/Welcome to SwasthSetu|स्वास्थसेतू मध्ये आपले स्वागत आहे|स्वस्थसेतु में आपका स्वागत है|Welcome to HealthSetu/i);
      expect(welcome).toBeInTheDocument();
    });

    it('allows patient with incomplete basic profile to complete profile and navigate to /home', async () => {
      useAuthStore.getState().setAuth('dummy-token', {
        id: 'patient-incomplete',
        name: 'User 9999',
        role: 'PATIENT',
        language: 'en',
      });

      window.history.pushState({}, '', '/profile/complete');
      render(<App />);

      const completionTitle = await screen.findByText(/Complete Your Profile|अपनी प्रोफ़ाइल पूरी करें|आपली प्रोफाइल पूर्ण करा/i);
      expect(completionTitle).toBeInTheDocument();

      fireEvent.change(screen.getByPlaceholderText(/Ramesh Patil/i), {
        target: { value: 'Pooja Verma' },
      });
      fireEvent.change(screen.getByPlaceholderText(/e\.g\. 35/i), {
        target: { value: '28' },
      });

      const saveBtn = screen.getByRole('button', { name: /Save & Go to Patient Home|सहेजें/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(useAuthStore.getState().user?.name).toBe('Pooja Verma');
        expect(useAuthStore.getState().user?.age).toBe(28);
      });

      const welcome = await screen.findByText(/Welcome to SwasthSetu|स्वास्थसेतू मध्ये आपले स्वागत आहे|स्वस्थसेतु में आपका स्वागत है|Welcome to HealthSetu/i);
      expect(welcome).toBeInTheDocument();
    });
  });
});
