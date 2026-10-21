import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../App.js';
import { db } from '../offline/db.js';
import { useAuthStore } from '../features/auth/useAuthStore.js';
import * as apiClientModule from '../services/apiClient.js';

describe('Government IDSP Surveillance Workspace Redesign', () => {
  beforeEach(async () => {
    await db.prefs.clear();
    useAuthStore.getState().clearAuth();

    vi.spyOn(apiClientModule, 'apiClient').mockImplementation(async () => {
      return {} as any;
    });

    // Mock fetch to simulate district surveillance endpoint
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/v1/district/surveillance')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              jurisdiction: 'DIST-PUNE-RURAL',
              timeRange: 'last7days',
              lastRefreshedAt: new Date().toISOString(),
              dataStatus: 'LIVE',
              kpis: {
                totalScreenings: 42,
                syndromicSignals: 18,
                urgentReferrals: 8,
                activeAlertsCount: 1,
                regionsMonitored: 4,
                pendingResponseActions: 2,
              },
              activeAlerts: [
                {
                  id: 'alt-pune-001',
                  syndrome: 'FEVER_SURGE',
                  syndromeLabel: 'Febrile Illness Surge',
                  severity: 'HIGH',
                  jurisdiction: 'Kendur Village (VIL-412208)',
                  observedCount: 14,
                  baselineCount: 2.2,
                  detectionMethod: 'Moving Average Z-Score (Z=2.8 > 2.0σ)',
                  thresholdCrossed: true,
                  timeWindow: '7 Days',
                  status: 'ACKNOWLEDGED',
                  workflowStage: 'INVESTIGATION',
                  detectedAt: new Date().toISOString(),
                  lastUpdated: new Date().toISOString(),
                  recommendedAction: 'Deploy mobile medical team for blood sampling; verify malaria/dengue serology.',
                  investigationNotes: 'Initial 10 samples collected by Kendur sub-center team.',
                  assignedTo: 'Pune Rural Mobile Health Unit 2',
                  actionPlan: 'Deploy water test kits and larvicidal treatment',
                  dueDate: '2026-10-24',
                },
              ],
              syndromeTrends: [
                {
                  syndrome: 'FEVER_SURGE',
                  label: 'Febrile Illness',
                  currentCases: 14,
                  expectedCases: 2.2,
                  anomalyRatio: 6.36,
                  status: 'SURGE_DETECTED',
                  history: [
                    { day: 'Day -6', count: 2, baseline: 2.2 },
                    { day: 'Day -5', count: 1, baseline: 2.2 },
                    { day: 'Day -4', count: 3, baseline: 2.2 },
                    { day: 'Day -3', count: 2, baseline: 2.2 },
                    { day: 'Day -2', count: 5, baseline: 2.2 },
                    { day: 'Day -1', count: 9, baseline: 2.2 },
                    { day: 'Today', count: 14, baseline: 2.2 },
                  ],
                },
              ],
              regionalBreakdown: [
                {
                  villageCode: 'VIL-412208',
                  villageName: 'Kendur Village',
                  block: 'Shirur',
                  totalCases: 24,
                  febrileCases: 14,
                  respiratoryCases: 6,
                  urgentCases: 4,
                  lastReportedAt: new Date().toISOString(),
                  alertLevel: 'CRITICAL',
                },
                {
                  villageCode: 'VIL-412403',
                  villageName: 'Pabal Village',
                  block: 'Shirur',
                  totalCases: 12,
                  febrileCases: 3,
                  respiratoryCases: '<3',
                  urgentCases: '<3',
                  lastReportedAt: new Date().toISOString(),
                  alertLevel: 'NORMAL',
                },
              ],
              responseActions: [
                {
                  id: 'alt-pune-001',
                  syndromeLabel: 'Febrile Illness Surge',
                  jurisdiction: 'Kendur Village (VIL-412208)',
                  workflowStage: 'INVESTIGATION',
                  assignedTo: 'Pune Rural Mobile Health Unit 2',
                  actionPlan: 'Deploy water test kits and larvicidal treatment',
                  dueDate: '2026-10-24',
                  status: 'ACKNOWLEDGED',
                  lastUpdated: new Date().toISOString(),
                },
              ],
              dataQuality: {
                lastSync: new Date().toISOString(),
                dataSourceStatus: 'OPERATIONAL',
                delayedRegionsCount: 0,
                incompleteReportsCount: 0,
                reportingCoveragePct: 98.4,
                isSimulated: false,
                kAnonymityK: 3,
              },
            },
          }),
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });
  });

  it('renders dedicated Public Health Surveillance workspace with correct title and jurisdiction for GOVT_OFFICER', async () => {
    useAuthStore.getState().setAuth('mock-token', {
      id: 'gov-1',
      name: 'Dr. Suresh Patil (IDSP)',
      role: 'GOVT_OFFICER',
      language: 'en',
    });
    window.history.pushState({}, '', '/surveillance');

    render(<App />);

    // Must show Public Health Surveillance heading
    const title = await screen.findByText(/Public Health Surveillance/i);
    expect(title).toBeInTheDocument();

    // Must NOT show PHC Epidemiological Surveillance as the main title for GOVT_OFFICER
    expect(screen.queryByText(/PHC Epidemiological Surveillance/i)).not.toBeInTheDocument();

    // Must display officer role & jurisdiction
    expect(screen.getByText(/Government IDSP Surveillance Officer/i)).toBeInTheDocument();
    expect(screen.getAllByText(/DIST-PUNE-RURAL/i).length).toBeGreaterThan(0);

    // Must have exactly one logout button in the header
    const logoutButtons = screen.getAllByRole('button', { name: /Logout/i });
    expect(logoutButtons.length).toBe(1);

    // Must enforce k-Anonymity badge
    expect(screen.getByText(/k-Anonymity Enforced \(k ≥ 3\)/i)).toBeInTheDocument();
  });

  it('displays all 6 key surveillance indicators and outbreak detection metrics', async () => {
    useAuthStore.getState().setAuth('mock-token', {
      id: 'gov-1',
      name: 'Dr. Suresh Patil',
      role: 'GOVT_OFFICER',
      language: 'en',
    });
    window.history.pushState({}, '', '/surveillance');

    render(<App />);

    await screen.findByText(/Public Health Surveillance/i);

    // Verify 6 key surveillance indicators
    expect(screen.getByText(/Total Screenings/i)).toBeInTheDocument();
    expect(screen.getByText(/Active Alerts/i)).toBeInTheDocument();
    expect(screen.getByText(/Urgent Referrals/i)).toBeInTheDocument();
    expect(screen.getByText(/Suspected Clusters/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Response Actions/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Reporting Coverage/i)).toBeInTheDocument();

    // Verify Outbreak Alert Banner
    expect(await screen.findByText(/Critical Syndromic Outbreak Alerts/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Kendur Village/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Investigate & Assign/i)).toBeInTheDocument();
  });

  it('masks regional small counts < 3 for DPDP k-anonymity compliance', async () => {
    useAuthStore.getState().setAuth('mock-token', {
      id: 'gov-1',
      name: 'Dr. Suresh Patil',
      role: 'GOVT_OFFICER',
      language: 'en',
    });
    window.history.pushState({}, '', '/surveillance');

    render(<App />);

    await screen.findByText(/Public Health Surveillance/i);

    // Regional table should display masked cells (<3) for Pabal Village
    const maskedCells = screen.getAllByText('<3');
    expect(maskedCells.length).toBeGreaterThanOrEqual(1);
  });

  it('allows navigation between surveillance workspace tabs', async () => {
    useAuthStore.getState().setAuth('mock-token', {
      id: 'gov-1',
      name: 'Dr. Suresh Patil',
      role: 'GOVT_OFFICER',
      language: 'en',
    });
    window.history.pushState({}, '', '/surveillance');

    render(<App />);

    await screen.findByText(/Public Health Surveillance/i);

    // Switch to Regional Trends tab
    const regionalTab = screen.getByRole('button', { name: /Regional Trends/i });
    fireEvent.click(regionalTab);
    expect(screen.getByText(/Detailed Regional Trends & Sub-District Cohorts/i)).toBeInTheDocument();

    // Switch to Response Actions tab
    const actionsTab = screen.getByRole('button', { name: /Response Actions/i });
    fireEvent.click(actionsTab);
    expect(screen.getByText(/Epidemiological Response Actions & Field Follow-Up/i)).toBeInTheDocument();

    // Switch to Data Quality tab
    const qualityTab = screen.getByRole('button', { name: /Data Quality/i });
    fireEvent.click(qualityTab);
    expect(screen.getByText(/Data Quality, Synchronization & Privacy Verification/i)).toBeInTheDocument();
  });

  it('preserves PHC Epidemiological Surveillance at /phc for PHC_OFFICER', async () => {
    useAuthStore.getState().setAuth('mock-token', {
      id: 'phc-1',
      name: 'PHC Medical Officer',
      role: 'PHC_OFFICER',
      language: 'en',
    });
    window.history.pushState({}, '', '/phc');

    render(<App />);

    // Preserved PHC workspace
    const phcHeading = await screen.findByText(/PHC Epidemiological Surveillance/i);
    expect(phcHeading).toBeInTheDocument();
    expect(screen.getByText(/DPDP Act \(Zero PHI\)/i)).toBeInTheDocument();
  });
});
