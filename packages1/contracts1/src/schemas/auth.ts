import { z } from 'zod';
import { RoleEnum, LanguageEnum, AgeBandEnum, GenderEnum } from '../enums.js';

export const RequestOtpSchema = z.object({
  identifier: z.string().min(10, 'Valid 10-digit phone number or email required'),
  purpose: z.enum(['LOGIN', 'REGISTER', 'VERIFY']).default('LOGIN'),
});
export type RequestOtpInput = z.infer<typeof RequestOtpSchema>;

export const VerifyOtpSchema = z.object({
  identifier: z.string().min(10),
  code: z.string().length(6, 'OTP must be 6 digits'),
  role: RoleEnum.optional(),
  name: z.string().min(1).max(100).optional(),
  language: LanguageEnum.optional(),
});
export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;

export const RegisterUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2),
  role: z.enum(['DOCTOR', 'PHC_OFFICER', 'ADMIN', 'HOSPITAL_ADMIN', 'GOVT_OFFICER', 'NGO_OBSERVER']),
  phone: z.string().optional(),
  language: LanguageEnum.default('en'),
  facilityId: z.string().optional(),
  // Doctor specific fields
  specialties: z.array(z.string()).optional(),
  registrationNumber: z.string().optional(),
  qualification: z.string().optional(),
  experienceYears: z.number().nonnegative().optional(),
  districtCode: z.string().optional(),
});
export type RegisterUserInput = z.infer<typeof RegisterUserSchema>;

export const LoginUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginUserInput = z.infer<typeof LoginUserSchema>;

export const UserProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().optional(),
  email: z.string().optional(),
  role: RoleEnum,
  language: LanguageEnum,
  ageBand: AgeBandEnum.optional(),
  age: z.number().optional(),
  dateOfBirth: z.string().optional(),
  gender: GenderEnum.optional(),
  villageCode: z.string().optional(),
  districtCode: z.string().optional(),
  isActive: z.boolean(),
  verificationStatus: z.string().optional(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const PatientRegisterSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
    phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Must be a valid 10-digit Indian mobile number'),
    age: z.coerce.number().int().min(0, 'Age must be 0 or greater').max(130, 'Age must be 130 or less').optional(),
    dateOfBirth: z.string().trim().optional(),
    language: LanguageEnum.default('en'),
    password: z.string().min(8, 'Password must be at least 8 characters').max(128),
    confirmPassword: z.string().min(8, 'Password confirmation is required'),
  })
  .refine((data) => data.age !== undefined || (typeof data.dateOfBirth === 'string' && data.dateOfBirth.trim().length > 0), {
    message: 'Either age or date of birth is required',
    path: ['age'],
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type PatientRegisterInput = z.infer<typeof PatientRegisterSchema>;

export const PatientLoginSchema = z.object({
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Must be a valid 10-digit Indian mobile number'),
  password: z.string().min(1, 'Password is required'),
});
export type PatientLoginInput = z.infer<typeof PatientLoginSchema>;

export const PatientProfileUpdateSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100).optional(),
  age: z.coerce.number().int().min(0).max(130).optional(),
  dateOfBirth: z.string().trim().optional(),
  ageBand: AgeBandEnum.optional(),
  language: LanguageEnum.optional(),
  gender: GenderEnum.optional(),
  villageCode: z.string().trim().optional(),
  districtCode: z.string().trim().optional(),
});
export type PatientProfileUpdateInput = z.infer<typeof PatientProfileUpdateSchema>;

export const AuthResponseSchema = z.object({
  accessToken: z.string(),
  user: UserProfileSchema,
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

export const MEDICAL_SPECIALTIES = [
  { id: 'General Physician', name: 'General Physician', description: 'Primary care, fevers, infections, cough, general health' },
  { id: 'Pediatrics', name: 'Pediatrics (Child Health)', description: 'Infant and child wellness, vaccinations, growth' },
  { id: 'Gynecology & Obstetrics', name: 'Gynecology & Obstetrics', description: 'Women health, maternal care, antenatal screening' },
  { id: 'Dermatology', name: 'Dermatology (Skin)', description: 'Skin rashes, allergies, infections, acne, eczema' },
  { id: 'Orthopedics', name: 'Orthopedics (Bones & Joints)', description: 'Joint pain, arthritis, fractures, spine, injuries' },
  { id: 'Cardiology', name: 'Cardiology (Heart Health)', description: 'Hypertension, chest discomfort, cardiovascular checkup' },
  { id: 'ENT', name: 'ENT (Ear, Nose, Throat)', description: 'Hearing, ear discharge, sinusitis, tonsillitis, throat' },
  { id: 'Psychiatry & Mental Health', name: 'Psychiatry & Mental Health', description: 'Depression, anxiety, stress, sleep disorders' },
  { id: 'Pulmonology', name: 'Pulmonology (Respiratory)', description: 'Asthma, chronic bronchitis, breathing difficulties' },
  { id: 'Ophthalmology', name: 'Ophthalmology (Eye Care)', description: 'Vision check, conjunctivitis, cataract screening' },
] as const;

export const DoctorRegisterSchema = z
  .object({
    name: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100),
    email: z.string().trim().email('Valid email address required'),
    phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Must be a valid 10-digit Indian mobile number'),
    password: z.string().min(8, 'Password must be at least 8 characters').max(128),
    confirmPassword: z.string().min(8, 'Password confirmation is required'),
    // Professional credentials
    qualification: z.string().trim().min(2, 'Primary medical qualification is required (e.g. MBBS, MD, MS)'),
    additionalQualification: z.string().trim().optional(),
    registrationNumber: z.string().trim().min(3, 'Valid medical council registration number is required'),
    medicalCouncil: z.string().trim().min(2, 'Registering medical council name is required'),
    registrationYear: z.coerce.number().int().min(1950).max(new Date().getFullYear()),
    experienceYears: z.coerce.number().int().min(0, 'Experience years must be 0 or greater').max(70),
    languages: z.array(LanguageEnum).min(1, 'Select at least one language'),
    specialties: z.array(z.string()).min(1, 'Select at least one clinical specialty'),
    consultationModes: z.array(z.enum(['VIDEO', 'AUDIO', 'CHAT'])).default(['VIDEO', 'AUDIO']),
    // Hospital affiliation
    facilityId: z.string().trim().optional(),
    roleInFacility: z.enum(['CONSULTANT', 'RESIDENT', 'MEDICAL_OFFICER']).default('CONSULTANT'),
    affiliationNotes: z.string().max(500).optional(),
    // Bio
    bio: z.string().max(1000).optional(),
    agreedToTerms: z.boolean().refine((val) => val === true, 'You must agree to statutory registration declarations'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type DoctorRegisterInput = z.infer<typeof DoctorRegisterSchema>;

export const HospitalRegisterSchema = z
  .object({
    facilityName: z.string().trim().min(3, 'Facility name must be at least 3 characters').max(150),
    facilityType: z.enum(['SC', 'PHC', 'CHC', 'SDH', 'DH', 'PRIVATE', 'CLINIC', 'PHARMACY']).default('DH'),
    address: z.string().trim().min(5, 'Full address is required'),
    district: z.string().trim().min(2, 'District is required'),
    state: z.string().trim().min(2, 'State is required'),
    pincode: z.string().trim().regex(/^\d{6}$/, 'Must be a valid 6-digit Indian pincode'),
    phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Valid 10-digit phone number required'),
    lat: z.coerce.number().optional(),
    lng: z.coerce.number().optional(),
    // Admin user credentials
    adminName: z.string().trim().min(2, 'Administrator name is required').max(100),
    adminEmail: z.string().trim().email('Valid official email address is required'),
    adminPassword: z.string().min(8, 'Password must be at least 8 characters').max(128),
    confirmPassword: z.string().min(8, 'Password confirmation is required'),
  })
  .refine((data) => data.adminPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type HospitalRegisterInput = z.infer<typeof HospitalRegisterSchema>;

export const DoctorPublicProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  qualification: z.string(),
  additionalQualification: z.string().optional(),
  registrationNumber: z.string(),
  medicalCouncil: z.string().optional(),
  registrationYear: z.number().optional(),
  specialties: z.array(z.string()),
  languages: z.array(z.string()),
  experienceYears: z.number(),
  verificationStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']),
  availability: z.enum(['AVAILABLE', 'BUSY', 'BREAK', 'OFFLINE']),
  consultationModes: z.array(z.enum(['VIDEO', 'AUDIO', 'CHAT'])).default(['VIDEO', 'AUDIO']),
  facilityId: z.string().optional(),
  facilityName: z.string().optional(),
  facilityType: z.string().optional(),
  districtCode: z.string().optional(),
  bio: z.string().optional(),
  estimatedWaitMinutes: z.number().optional(),
  queueLength: z.number().optional(),
});
export type DoctorPublicProfile = z.infer<typeof DoctorPublicProfileSchema>;

export const DoctorVerificationUpdateSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']),
  reviewerNotes: z.string().max(500).optional(),
});
export type DoctorVerificationUpdateInput = z.infer<typeof DoctorVerificationUpdateSchema>;

