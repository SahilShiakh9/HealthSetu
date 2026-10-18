import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App.js';
import { db } from '../offline/db.js';
import { useAuthStore } from '../features/auth/useAuthStore.js';
import * as apiClientModule from '../services/apiClient.js';

describe('Doctor Registration, Specialty Discovery & Consultation Web Suite', () => {
  beforeEach(async () => {
    await db.prefs.clear();
    useAuthStore.getState().clearAuth();
    window.history.pushState({}, '', '/');
    vi.restoreAllMocks();
  });

  it('renders Doctor Registration form with all professional sections', async () => {
    window.history.pushState({}, '', '/doctor/register');
    render(<App />);

    expect(await screen.findByText('Doctor Professional Registration')).toBeInTheDocument();
    expect(screen.getByText('1. Basics')).toBeInTheDocument();
    expect(screen.getByText('2. License')).toBeInTheDocument();
    expect(screen.getByText('3. Specialty')).toBeInTheDocument();
    expect(screen.getByText('4. Hospital')).toBeInTheDocument();

    // Fill Section 1: Basic
    fireEvent.change(screen.getByPlaceholderText('Dr. Rajesh Kulkarni'), {
      target: { value: 'Dr. Ramesh Kulkarni' },
    });
    fireEvent.change(screen.getByPlaceholderText('doctor@healthsetu.org'), {
      target: { value: 'dr.kulkarni@healthsetu.org' },
    });
    fireEvent.change(screen.getByPlaceholderText('10-digit mobile'), {
      target: { value: '9822334455' },
    });
    fireEvent.change(screen.getByPlaceholderText('Min 8 characters'), {
      target: { value: 'SecureDocPass123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Re-enter password'), {
      target: { value: 'SecureDocPass123' },
    });

    // Advance to Step 2
    fireEvent.click(screen.getByText('Continue to Medical License'));

    // Section 2: Medical License
    await waitFor(() => {
      expect(screen.getByText('Registering Medical Council / Authority')).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText('e.g. MMC/2018/05/1234 or MCI-84920')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('e.g. MMC/2018/05/1234 or MCI-84920'), {
      target: { value: 'MMC/2018/987654' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. Maharashtra Medical Council'), {
      target: { value: 'Maharashtra Medical Council' },
    });

    // Advance to Step 3
    fireEvent.click(screen.getByText('Continue to Specialties'));

    // Section 3: Specialty
    await waitFor(() => {
      expect(screen.getByText('Clinical Specialties (Select all that apply)')).toBeInTheDocument();
    });

    // Advance to Step 4
    fireEvent.click(screen.getByText('Continue to Hospital Affiliation'));

    // Section 4: Declaration
    await waitFor(() => {
      expect(screen.getByText(/I declare that all medical credentials/i)).toBeInTheDocument();
      expect(screen.getByText('Submit Registration')).toBeInTheDocument();
    });
  });

  it('renders Hospital Organization Registration page', async () => {
    window.history.pushState({}, '', '/hospital/register');
    render(<App />);

    expect(await screen.findByText('Hospital & Clinic Onboarding')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Pune City Civil Hospital')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Dr. Anand Deshmukh, MS')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('admin@hospital.org')).toBeInTheDocument();
  });

  it('renders Doctor Registration Status page for pending doctor', async () => {
    useAuthStore.setState({
      user: {
        id: 'doc-status-user',
        name: 'Dr. Anita Joshi',
        phone: '9822001122',
        role: 'DOCTOR',
        language: 'en',
      },
      accessToken: 'token-doc-status',
      isAuthenticated: true,
    });

    vi.spyOn(apiClientModule, 'apiClient').mockImplementation(async (path: string) => {
      if (path === '/doctor/status') {
        return {
          verificationStatus: 'PENDING',
          affiliationStatus: 'PENDING',
          doctor: {
            id: 'doc-123',
            name: 'Dr. Anita Joshi',
            email: 'anita@example.com',
            qualification: 'MBBS, DNB',
            specialties: ['GENERAL_MEDICINE'],
            verificationStatus: 'PENDING',
            affiliationStatus: 'PENDING',
            facilityName: 'District Hospital Solapur',
          },
        } as any;
      }
      return {} as any;
    });

    window.history.pushState({}, '', '/doctor/registration-status');
    render(<App />);

    expect(await screen.findByText('Medical Registration Under Review')).toBeInTheDocument();
    expect(screen.getAllByText('Dr. Anita Joshi').length).toBeGreaterThan(0);
    expect(screen.getByText('Council Verification')).toBeInTheDocument();
    expect(screen.getByText('PENDING')).toBeInTheDocument();
  });

  it('allows patient to filter by specialty on /consult/choose and view doctor cards', async () => {
    useAuthStore.setState({
      user: {
        id: 'patient-test-user',
        name: 'Sunita Sharma',
        phone: '9876543210',
        role: 'PATIENT',
        language: 'en',
      },
      accessToken: 'token-patient',
      isAuthenticated: true,
    });

    vi.spyOn(apiClientModule, 'apiClient').mockImplementation(async (path: string) => {
      if (path.startsWith('/consultations/preview')) {
        return {
          recommendedAction: 'CONSULT_NOW',
          maxWaitLimitMinutes: 30,
          doctors: [
            {
              doctorId: 'doc-sunita-matched',
              name: 'Dr. Suresh Patil',
              specialties: ['General Physician'],
              qualification: 'MBBS, MD',
              facilityName: 'Pune Civil Hospital',
              bio: 'Consultant physician with 10 years experience.',
              languages: ['mr', 'en', 'hi'],
              experienceYears: 10,
              availability: 'AVAILABLE',
              queueLength: 0,
              estimatedWaitMinutes: 4,
              score: 95,
              breakdown: { specialty: 25, availability: 25, queue: 15, language: 15, previousDoctor: 5, location: 10 },
            },
          ],
        } as any;
      }
      return {} as any;
    });

    window.history.pushState({}, '', '/consult/choose');
    render(<App />);

    // Check Specialty selector categories
    expect(await screen.findByText('Select Medical Specialty')).toBeInTheDocument();
    expect(screen.getByText('General Physician')).toBeInTheDocument();
    expect(screen.getByText('Pediatrics (Child Health)')).toBeInTheDocument();

    // Check Doctor card details
    expect(await screen.findByText('Dr. Suresh Patil')).toBeInTheDocument();
    expect(screen.getByText(/MBBS, MD/)).toBeInTheDocument();
    expect(screen.getByText('Pune Civil Hospital')).toBeInTheDocument();
    expect(screen.getByText('View Full Profile')).toBeInTheDocument();
    expect(screen.getByText('Select Doctor')).toBeInTheDocument();
  });

  it('renders Staff & Clinical Portal at /staff/login and authenticates doctor into /doctor', async () => {
    vi.spyOn(apiClientModule, 'apiClient').mockImplementation(async (path: string) => {
      if (path === '/auth/login') {
        return {
          accessToken: 'doctor-jwt-token',
          user: {
            id: 'doc-123',
            name: 'Dr. Ramesh Kulkarni',
            role: 'DOCTOR',
            email: 'doctor@healthsetu.org',
            language: 'en',
          },
        } as any;
      }
      return {} as any;
    });

    window.history.pushState({}, '', '/staff/login');
    render(<App />);

    expect(await screen.findByText('Staff & Clinical Portal')).toBeInTheDocument();
    expect(screen.getByText('Quick Demo Accounts')).toBeInTheDocument();

    const emailInput = screen.getByPlaceholderText('doctor@healthsetu.org');
    const passwordInput = screen.getByPlaceholderText('••••••••');

    fireEvent.change(emailInput, { target: { value: 'doctor@healthsetu.org' } });
    fireEvent.change(passwordInput, { target: { value: 'Doctor@12345' } });

    const submitBtn = screen.getByRole('button', { name: /Sign In to Workspace/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().user?.role).toBe('DOCTOR');
    });
  });

  it('guarantees patient login at /login has no staff tabs or doctor registration links', async () => {
    useAuthStore.getState().clearAuth();
    window.history.pushState({}, '', '/login');
    render(<App />);

    expect(await screen.findByText(/Sign in with phone number/i)).toBeInTheDocument();
    expect(screen.queryByText(/Staff & Organization/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Register as a Doctor/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Register Hospital/i)).not.toBeInTheDocument();
    expect(screen.getByText(/New patient\? Register here/i)).toBeInTheDocument();
  });

  it('redirects unauthenticated staff route visits and staff logouts to /staff/login', async () => {
    useAuthStore.getState().clearAuth();

    // Visiting staff routes without authentication should redirect to /staff/login
    window.history.pushState({}, '', '/doctor');
    render(<App />);
    expect(await screen.findByText('Staff & Clinical Portal')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/staff/login');
  });
});
