import type { UserState } from './useAuthStore.js';

/**
 * Checks whether the required basic profile fields are complete for a patient.
 * Required:
 * - Full name (valid name, not auto-generated User 1234)
 * - Preferred language
 * - Age or Date of Birth (or pre-assigned ageBand)
 */
export const isPatientProfileComplete = (user: UserState | null | undefined): boolean => {
  if (!user) return false;
  if (user.role !== 'PATIENT') return true;

  const trimmedName = user.name?.trim() || '';
  const hasValidName = trimmedName.length >= 2 && !/^User \d+$/i.test(trimmedName);
  const hasLanguage = Boolean(user.language);
  const hasAgeOrDob = Boolean(
    (user.age !== undefined && user.age !== null && user.age >= 0) ||
    (user.dateOfBirth && user.dateOfBirth.trim().length > 0) ||
    Boolean(user.ageBand),
  );

  return Boolean(hasValidName && hasLanguage && hasAgeOrDob);
};
