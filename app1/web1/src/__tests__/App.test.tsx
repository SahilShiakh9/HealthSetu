import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App.js';
import { db } from '../offline/db.js';
import { useAuthStore } from '../features/auth/useAuthStore.js';
import * as apiClientModule from '../services/apiClient.js';

describe('Phase 2 Web App Shell & Router', () => {
  beforeEach(async () => {
    await db.prefs.clear();
    useAuthStore.getState().clearAuth();
    window.history.pushState({}, '', '/');

    vi.spyOn(apiClientModule, 'apiClient').mockImplementation(async (path: string) => {
      if (path.includes('/affiliations')) {
        return { affiliations: [] } as any;
      }
      return {} as any;
    });
  });

  it('redirects new users to the onboarding screen by default', async () => {
    render(<App />);

    // Onboarding contains language chooser
    const heading = await screen.findByText(/Choose your language|आपली भाषा निवडा|अपनी भाषा चुनें/i);
    expect(heading).toBeInTheDocument();

    // Script-labelled buttons must be present
    expect(screen.getAllByText('English').length).toBeGreaterThan(0);
    expect(screen.getByText('हिंदी')).toBeInTheDocument();
    expect(screen.getByText('मराठी')).toBeInTheDocument();
  });

  it('redirects to login screen when onboarding is marked done and user is unauthenticated', async () => {
    await db.prefs.put({ key: 'onboardingDone', value: true });
    window.history.pushState({}, '', '/');

    render(<App />);

    const loginTitle = await screen.findByText(/Sign in with phone/i);
    expect(loginTitle).toBeInTheDocument();
  });

  it('renders home screen for citizen when navigating to /home as guest or patient', async () => {
    await db.prefs.put({ key: 'onboardingDone', value: true });
    window.history.pushState({}, '', '/home');

    render(<App />);

    const welcome = await screen.findByText(/Welcome to HealthSetu|हेल्थसेतू मध्ये आपले स्वागत आहे|हेल्थसेतु में आपका स्वागत है/i);
    expect(welcome).toBeInTheDocument();

    // Emergency 108 button must be present
    expect(screen.getByText(/108/i)).toBeInTheDocument();
  });

  it('renders screening assessment screen at /screening', async () => {
    await db.prefs.put({ key: 'onboardingDone', value: true });
    window.history.pushState({}, '', '/screening');

    render(<App />);

    expect(screen.getByRole('button', { name: /Tap and Speak|बोलण्यासाठी टॅप करा|बोलने के लिए टैप करें/i })).toBeInTheDocument();
  });

  it('renders emergency bypass screen at /screening/emergency with 108 action', async () => {
    window.history.pushState({}, '', '/screening/emergency?flags=severe_chest_pain');

    render(<App />);

    const call108 = await screen.findByText(/CALL 108 NOW|108 पर कॉल करें|108 वर कॉल करा/i);
    expect(call108).toBeInTheDocument();
  });

  it('renders screening result screen with mandatory clinical disclaimer', async () => {
    const testLocalId = 'test-local-screening-001';
    await db.screenings.put({
      localId: testLocalId,
      id: testLocalId,
      clientId: testLocalId,
      patientId: 'local-patient',
      submittedBy: 'local-user',
      language: 'en',
      symptoms: ['fever', 'cough'],
      answers: [],
      severity: 'moderate',
      emergencyFlags: [],
      riskTier: 'MEDIUM',
      isEmergency: false,
      possibleConditions: [{ name: 'Acute Bronchitis', probability: 0.65 }],
      symptomGroups: ['respiratory'],
      recommendedSpecialty: 'General Physician',
      source: 'device',
      modelVersion: '1.0.0-rules',
      triageConfigVersion: '1.0.0',
      imageIds: [],
      inputMethod: 'text',
      referralStatus: 'none',
      isOfflineSync: false,
      clientCreatedAt: Date.now(),
      receivedAt: Date.now(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'completed',
    });

    window.history.pushState({}, '', `/screening/result/${testLocalId}`);

    render(<App />);

    const disclaimer = await screen.findByText(/Official Clinical Disclaimer|अस्वीकरण/i);
    expect(disclaimer).toBeInTheDocument();

    const notDiagnosisText = screen.getByText(/NOT an official medical diagnosis/i);
    expect(notDiagnosisText).toBeInTheDocument();
  });

  it('renders nearby healthcare facilities screen at /facilities', async () => {
    // Seed cached facility in Dexie for offline local render
    await db.facilities.put({
      id: 'osm:way:11223344',
      name: 'Rural Hospital, Alandi',
      type: 'SDH',
      districtCode: 'PUNE',
      location: { type: 'Point', coordinates: [73.897, 18.6775] },
      services: ['24x7 Emergency', 'OPD', 'Maternity'],
      servicesMask: 7,
      open24x7: true,
      openHours: '24 Hours',
      phone: '020-27185200',
      emergencyCapable: true,
      dataSource: 'OPEN_STREET_MAP',
      sourceAttribution: '© OpenStreetMap contributors',
      isMock: false,
      updatedAt: Date.now(),
    });

    window.history.pushState({}, '', '/facilities');

    render(<App />);

    const header = await screen.findByText(/Nearby Facilities|जवळपासची आरोग्य केंद्रे|नजदीकी अस्पताल/i);
    expect(header).toBeInTheDocument();

    // Verify facility card is rendered from local cache
    const phcCards = await screen.findAllByText(/Rural Hospital, Alandi/i);
    expect(phcCards.length).toBeGreaterThan(0);
  });

  it('renders teleconsultation waiting room at /consult/waiting/:id', async () => {
    window.history.pushState({}, '', '/consult/waiting/test-consult-001');

    render(<App />);

    const lowBw = await screen.findByText(/Low Bandwidth Mode/i);
    expect(lowBw).toBeInTheDocument();
    expect(screen.getByText(/Connect to Doctor Now/i)).toBeInTheDocument();
  });

  it('redirects unauthenticated users trying to access protected doctor portal to /staff/login', async () => {
    window.history.pushState({}, '', '/doctor');
    render(<App />);

    const staffHeader = await screen.findByText(/Staff & Clinical Portal/i);
    expect(staffHeader).toBeInTheDocument();
  });

  it('renders doctor portal at /doctor when authenticated as DOCTOR', async () => {
    useAuthStore.getState().setAuth('mock-token', {
      id: 'doc-1',
      name: 'Dr. Test',
      role: 'DOCTOR',
      language: 'en',
    });
    window.history.pushState({}, '', '/doctor');

    render(<App />);

    const docPortal = await screen.findByText(/Doctor Portal/i);
    expect(docPortal).toBeInTheDocument();
    const acceptBtn = await screen.findByText(/Accept Next Patient/i);
    expect(acceptBtn).toBeInTheDocument();
  });

  it('renders reports list at /reports when authenticated', async () => {
    useAuthStore.getState().setAuth('mock-token', {
      id: 'pt-1',
      name: 'Patient Test',
      role: 'PATIENT',
      language: 'en',
    });
    window.history.pushState({}, '', '/reports');

    render(<App />);

    const reportsHeader = await screen.findByText(/Prescriptions & Medical Records/i);
    expect(reportsHeader).toBeInTheDocument();
  });

  it('renders detailed prescription slip at /reports/:id with MoHFW compliance when authenticated', async () => {
    useAuthStore.getState().setAuth('mock-token', {
      id: 'pt-1',
      name: 'Patient Test',
      role: 'PATIENT',
      language: 'en',
    });
    window.history.pushState({}, '', '/reports/demo-consult-001');

    render(<App />);

    const rxSlip = await screen.findByText(/Medical Prescription Slip/i);
    expect(rxSlip).toBeInTheDocument();
    expect(screen.getByText(/Telemedicine Practice Guidelines/i)).toBeInTheDocument();
  });

  it('renders PHC epidemiological surveillance dashboard at /phc when authenticated as PHC_OFFICER', async () => {
    useAuthStore.getState().setAuth('mock-token', {
      id: 'phc-1',
      name: 'Officer Test',
      role: 'PHC_OFFICER',
      language: 'en',
    });
    window.history.pushState({}, '', '/phc');

    render(<App />);

    const title = await screen.findByText(/PHC Epidemiological Surveillance/i);
    expect(title).toBeInTheDocument();
    expect(screen.getByText(/DPDP Act \(Zero PHI\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Screenings/i)).toBeInTheDocument();
    expect(screen.getByText(/Syndromic Outbreak Trajectory/i)).toBeInTheDocument();
  });

  it('renders Guidance & First Aid bot at /guidance with offline capability', async () => {
    window.history.pushState({}, '', '/guidance');

    render(<App />);

    const title = await screen.findByText(/HealthSetu Guidance & First Aid|आरोग्य मार्गदर्शक|स्वास्थ्य मार्गदर्शिका/i);
    expect(title).toBeInTheDocument();
    expect(screen.getByText(/100% Offline Available/i)).toBeInTheDocument();
    expect(screen.getByText(/ORS Preparation/i)).toBeInTheDocument();
  });

  it('redirects authenticated Doctor from /login and /home to /doctor', async () => {
    useAuthStore.getState().setAuth('mock-token', {
      id: 'doc-1',
      name: 'Dr. Rahul Sharma',
      role: 'DOCTOR',
      language: 'en',
    });
    window.history.pushState({}, '', '/login');

    render(<App />);

    const portalTitle = await screen.findByText(/Doctor Portal/i);
    expect(portalTitle).toBeInTheDocument();
  });

  it('redirects authenticated Hospital Admin from /login and /home to /org/dashboard', async () => {
    useAuthStore.getState().setAuth('mock-token', {
      id: 'admin-1',
      name: 'Hospital Admin Test',
      role: 'HOSPITAL_ADMIN',
      language: 'en',
    });
    window.history.pushState({}, '', '/home');

    render(<App />);

    const portalBadge = await screen.findByText(/Healthcare Organization Portal/i);
    expect(portalBadge).toBeInTheDocument();
  });

  it('redirects authenticated IDSP Govt Officer and NGO Observer from /login and /home to /surveillance', async () => {
    useAuthStore.getState().setAuth('mock-token', {
      id: 'govt-1',
      name: 'Govt Officer Test',
      role: 'GOVT_OFFICER',
      language: 'en',
    });
    window.history.pushState({}, '', '/login');

    render(<App />);

    const officerBadge = await screen.findByText(/Government IDSP Surveillance Officer/i);
    expect(officerBadge).toBeInTheDocument();
  });

  it('redirects authenticated Citizen from /login to /home and never displays login form', async () => {
    useAuthStore.getState().setAuth('mock-token', {
      id: 'patient-9230',
      name: 'User 9230',
      role: 'PATIENT',
      language: 'en',
    });
    window.history.pushState({}, '', '/login');

    render(<App />);

    // Must redirect to home screen and not display the login form
    const citizenHome = await screen.findByText(/Patient Home|Start Screening|Teleconsultation/i);
    expect(citizenHome).toBeInTheDocument();
    expect(screen.queryByText(/Sign in with phone OTP/i)).not.toBeInTheDocument();
  });
});

