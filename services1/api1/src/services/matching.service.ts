import { Types } from 'mongoose';

export interface PatientMatchContext {
  requiredSpecialty: string;
  preferredLanguage: string;
  villageCode?: string;
  districtCode?: string;
  previousDoctorId?: string;
}

export interface DoctorCandidate {
  _id: Types.ObjectId | string;
  name: string;
  specialties: string[];
  languages: string[];
  availability: 'AVAILABLE' | 'BUSY' | 'BREAK' | 'OFFLINE';
  districtCode?: string;
  experienceYears: number;
  maxQueue?: number;
  rollingAvgConsultMinutes?: number;
}

export interface LiveDoctorState {
  currentQueueLength: number;
}

export interface DoctorScoreResult {
  total: number;
  breakdown: {
    specialty: number;
    availability: number;
    queue: number;
    language: number;
    previousDoctor: number;
    location: number;
  };
  explanation: string;
}

/**
 * Builds canonical pool key from specialty and language group.
 * e.g. "general_physician:hi", "pediatrics:en"
 */
export const buildPoolKey = (specialty = 'General Physician', language = 'hi'): string => {
  const normSpecialty = specialty.trim().toLowerCase().replace(/\s+/g, '_');
  const normLang = language.trim().toLowerCase();
  return `${normSpecialty}:${normLang}`;
};

/**
 * Pure function: Computes deterministic doctor match score based on live data and documented weights:
 * 0.30 specialty + 0.25 availability + 0.20 queue + 0.15 language + 0.05 previous doctor + 0.05 location.
 */
export const scoreDoctor = (
  patientContext: PatientMatchContext,
  doctor: DoctorCandidate,
  liveState: LiveDoctorState,
): DoctorScoreResult => {
  // 1. Specialty Term (Weight 0.30 -> max 30 pts)
  let normSpecialty = 0.0;
  const docSpecialties = doctor.specialties.map((s) => s.toLowerCase());
  const reqSpecialty = patientContext.requiredSpecialty.toLowerCase();
  if (docSpecialties.includes(reqSpecialty)) {
    normSpecialty = 1.0;
  } else if (docSpecialties.includes('general physician') || reqSpecialty.includes('general')) {
    normSpecialty = 0.5;
  }

  // 2. Availability Term (Weight 0.25 -> max 25 pts)
  let normAvailability = 0.0;
  if (doctor.availability === 'AVAILABLE') {
    normAvailability = 1.0;
  } else if (doctor.availability === 'BUSY') {
    normAvailability = 0.5;
  } else if (doctor.availability === 'BREAK') {
    normAvailability = 0.2;
  } else {
    normAvailability = 0.0; // OFFLINE
  }

  // 3. Queue Load Term (Weight 0.20 -> max 20 pts)
  const maxQ = Math.max(5, doctor.maxQueue || 10);
  const qLen = Math.max(0, liveState.currentQueueLength);
  const normQueue = Math.max(0.0, Math.min(1.0, 1.0 - qLen / maxQ));

  // 4. Language Term (Weight 0.15 -> max 15 pts)
  const docLanguages = doctor.languages.map((l) => l.toLowerCase());
  const prefLang = patientContext.preferredLanguage.toLowerCase();
  const normLanguage = docLanguages.includes(prefLang) ? 1.0 : 0.0;

  // 5. Previous Doctor Term (Weight 0.05 -> max 5 pts)
  const doctorIdStr = doctor._id.toString();
  const normPreviousDoctor =
    patientContext.previousDoctorId && patientContext.previousDoctorId === doctorIdStr
      ? 1.0
      : 0.0;

  // 6. Location / District Fit (Weight 0.05 -> max 5 pts)
  let normLocation = 0.0;
  if (
    doctor.districtCode &&
    patientContext.districtCode &&
    doctor.districtCode.toLowerCase() === patientContext.districtCode.toLowerCase()
  ) {
    normLocation = 1.0;
  }

  // Calculate integer score breakdown
  const breakdown = {
    specialty: Math.round(normSpecialty * 30),
    availability: Math.round(normAvailability * 25),
    queue: Math.round(normQueue * 20),
    language: Math.round(normLanguage * 15),
    previousDoctor: Math.round(normPreviousDoctor * 5),
    location: Math.round(normLocation * 5),
  };

  const total =
    breakdown.specialty +
    breakdown.availability +
    breakdown.queue +
    breakdown.language +
    breakdown.previousDoctor +
    breakdown.location;

  const explanation =
    'Match score is a ranking aid based on specialty, availability, language and wait. It is not a measure of medical quality.';

  return {
    total,
    breakdown,
    explanation,
  };
};

/**
 * Calculates honest wait estimate in minutes:
 * (entries ahead ÷ number of currently AVAILABLE or BUSY doctors in the pool) × rolling average consultation minutes
 */
export const calculateEstimatedWait = (
  entriesAhead: number,
  activeDoctorsCount: number,
  rollingAvgConsultMinutes = 10,
): number => {
  if (entriesAhead <= 0) return 0;
  const effectiveDoctors = Math.max(1, activeDoctorsCount);
  const minutes = Math.round((entriesAhead / effectiveDoctors) * rollingAvgConsultMinutes);
  return Math.max(1, minutes);
};
