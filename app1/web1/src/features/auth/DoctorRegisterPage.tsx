import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Stethoscope,
  ArrowRight,
  ArrowLeft,
  Mail,
  Lock,
  Phone,
  User,
  FileBadge,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Header } from '../../components/Header.js';
import { apiClient } from '../../services/apiClient.js';
import { useAuthStore } from './useAuthStore.js';
import { MEDICAL_SPECIALTIES } from '@healthsetu/contracts';

interface FacilityOption {
  _id?: string;
  id?: string;
  facilityId?: string;
  name: string;
  type: string;
  district?: string;
}

export const DoctorRegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Professional Credentials
  const [qualification, setQualification] = useState('MBBS');
  const [additionalQualification, setAdditionalQualification] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [medicalCouncil, setMedicalCouncil] = useState('');
  const [registrationYear, setRegistrationYear] = useState(2018);
  const [experienceYears, setExperienceYears] = useState(5);
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>(['General Physician']);
  const [selectedLanguages, setSelectedLanguages] = useState<('en' | 'hi' | 'mr')[]>(['en', 'hi']);

  // Hospital Affiliation
  const [facilities, setFacilities] = useState<FacilityOption[]>([]);
  const [facilityId, setFacilityId] = useState<string>('');
  const [roleInFacility, setRoleInFacility] = useState<'CONSULTANT' | 'RESIDENT' | 'MEDICAL_OFFICER'>('CONSULTANT');
  const [affiliationNotes, setAffiliationNotes] = useState('');
  const [bio, setBio] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const [facilitiesLoading, setFacilitiesLoading] = useState(false);

  useEffect(() => {
    // Fetch registered healthcare organizations dynamically for affiliation
    setFacilitiesLoading(true);
    apiClient<{ facilities: FacilityOption[] }>('/facilities?registeredOnly=true')
      .then((res) => {
        if (res.facilities && res.facilities.length > 0) {
          setFacilities(res.facilities);
        }
      })
      .catch(() => {
        // Fallback default registered facilities if offline
        setFacilities([
          { id: 'fac-phc-001', name: 'Primary Health Centre (PHC Pabal)', type: 'PHC', district: 'Pune' },
          { id: 'fac-chc-001', name: 'Shirur Rural Hospital & CHC', type: 'CHC', district: 'Pune' },
          { id: 'fac-dh-001', name: 'District Hospital Aundh', type: 'DH', district: 'Pune' },
        ]);
      })
      .finally(() => {
        setFacilitiesLoading(false);
      });
  }, []);

  const toggleSpecialty = (specName: string) => {
    if (selectedSpecialties.includes(specName)) {
      if (selectedSpecialties.length > 1) {
        setSelectedSpecialties(selectedSpecialties.filter((s) => s !== specName));
      }
    } else {
      setSelectedSpecialties([...selectedSpecialties, specName]);
    }
  };

  const toggleLanguage = (lang: 'en' | 'hi' | 'mr') => {
    if (selectedLanguages.includes(lang)) {
      if (selectedLanguages.length > 1) {
        setSelectedLanguages(selectedLanguages.filter((l) => l !== lang));
      }
    } else {
      setSelectedLanguages([...selectedLanguages, lang]);
    }
  };

  const validateStep1 = () => {
    if (!name.trim() || name.trim().length < 2) {
      setError('Please enter your full legal name (at least 2 characters)');
      return false;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address');
      return false;
    }
    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length !== 10) {
      setError('Please enter a 10-digit mobile number');
      return false;
    }
    if (!/^[6-9]/.test(cleanPhone)) {
      setError('Indian mobile numbers must start with 6, 7, 8, or 9');
      return false;
    }
    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters');
      return false;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    setError(null);
    return true;
  };

  const validateStep2 = () => {
    if (!qualification.trim()) {
      setError('Please enter your primary medical qualification (e.g. MBBS)');
      return false;
    }
    if (!registrationNumber.trim() || registrationNumber.trim().length < 3) {
      setError('Please enter a valid medical registration number');
      return false;
    }
    if (!medicalCouncil.trim() || medicalCouncil.trim().length < 2) {
      setError('Please specify the registering medical council or authority');
      return false;
    }
    setError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreedToTerms) {
      setError('You must agree to the statutory professional declaration');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const cleanPhone = phone.replace(/\D/g, '');

      const payload = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: cleanPhone,
        password,
        confirmPassword,
        qualification: qualification.trim(),
        additionalQualification: additionalQualification.trim() || undefined,
        registrationNumber: registrationNumber.trim(),
        medicalCouncil: medicalCouncil.trim(),
        registrationYear: Number(registrationYear),
        experienceYears: Number(experienceYears),
        specialties: selectedSpecialties,
        languages: selectedLanguages,
        consultationModes: ['VIDEO', 'AUDIO'],
        facilityId: facilityId || undefined,
        roleInFacility,
        affiliationNotes: affiliationNotes.trim() || undefined,
        bio: bio.trim() || undefined,
        agreedToTerms: true,
      };

      const res = await apiClient<{ accessToken: string; user: any; doctor: any }>(
        '/auth/doctor/register',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );

      setAuth(res.accessToken, res.user);
      navigate('/doctor/registration-status', { replace: true });
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please check your details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF9F5] flex flex-col">
      <Header />

      <main className="flex-1 max-w-xl w-full mx-auto p-4 flex flex-col justify-center">
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xs border border-[#F0E2D8] space-y-6">
          {/* Header */}
          <div className="text-center space-y-1">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#FFF0E6] text-[#D95D24] mb-1 shadow-xs">
              <Stethoscope className="w-6 h-6 text-[#F47738]" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-[#242424]">
              Doctor Professional Registration
            </h1>
            <p className="text-xs text-[#6B7280]">
              Register as a verified Medical Officer / Teleconsultant on HealthSetu
            </p>
          </div>

          {/* Stepper Tabs */}
          <div className="grid grid-cols-4 gap-1 p-1 bg-[#FFF9F5] border border-[#F0E2D8] rounded-xl text-xs font-bold text-center">
            <button
              type="button"
              onClick={() => setStep(1)}
              className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                step === 1 ? 'bg-[#F47738] text-white shadow-xs' : 'text-[#6B7280] hover:text-[#242424]'
              }`}
            >
              1. Basics
            </button>
            <button
              type="button"
              onClick={() => validateStep1() && setStep(2)}
              className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                step === 2 ? 'bg-[#F47738] text-white shadow-xs' : 'text-[#6B7280] hover:text-[#242424]'
              }`}
            >
              2. License
            </button>
            <button
              type="button"
              onClick={() => validateStep1() && validateStep2() && setStep(3)}
              className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                step === 3 ? 'bg-[#F47738] text-white shadow-xs' : 'text-[#6B7280] hover:text-[#242424]'
              }`}
            >
              3. Specialty
            </button>
            <button
              type="button"
              onClick={() => validateStep1() && validateStep2() && setStep(4)}
              className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                step === 4 ? 'bg-[#F47738] text-white shadow-xs' : 'text-[#6B7280] hover:text-[#242424]'
              }`}
            >
              4. Hospital
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* STEP 1: Basic Information */}
            {step === 1 && (
              <div className="space-y-4 animate-in fade-in">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#242424] block">Full Legal Name</label>
                  <div className="relative">
                    <User className="w-5 h-5 text-[#6B7280] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Dr. Rajesh Kulkarni"
                      className="w-full min-h-[48px] pl-11 pr-4 py-2 text-sm rounded-xl border border-[#F0E2D8] focus:outline-none focus:ring-2 focus:ring-[#F47738] bg-white text-[#242424]"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#242424] block">Work Email</label>
                    <div className="relative">
                      <Mail className="w-5 h-5 text-[#6B7280] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="doctor@healthsetu.org"
                        className="w-full min-h-[48px] pl-11 pr-4 py-2 text-sm rounded-xl border border-[#F0E2D8] focus:outline-none focus:ring-2 focus:ring-[#F47738] bg-white text-[#242424]"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#242424] block">Mobile Number</label>
                    <div className="relative">
                      <Phone className="w-5 h-5 text-[#6B7280] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="10-digit mobile"
                        className="w-full min-h-[48px] pl-11 pr-4 py-2 text-sm rounded-xl border border-[#F0E2D8] focus:outline-none focus:ring-2 focus:ring-[#F47738] bg-white text-[#242424]"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#242424] block">Password</label>
                    <div className="relative">
                      <Lock className="w-5 h-5 text-[#6B7280] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min 8 characters"
                        className="w-full min-h-[48px] pl-11 pr-10 py-2 text-sm rounded-xl border border-[#F0E2D8] focus:outline-none focus:ring-2 focus:ring-[#F47738] bg-white text-[#242424]"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#242424] p-1 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#242424] block">Confirm Password</label>
                    <div className="relative">
                      <Lock className="w-5 h-5 text-[#6B7280] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter password"
                        className="w-full min-h-[48px] pl-11 pr-4 py-2 text-sm rounded-xl border border-[#F0E2D8] focus:outline-none focus:ring-2 focus:ring-[#F47738] bg-white text-[#242424]"
                        required
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => validateStep1() && setStep(2)}
                  className="w-full min-h-[48px] bg-[#F47738] hover:bg-[#D95D24] text-white font-bold rounded-xl flex items-center justify-center gap-2 text-sm shadow-xs transition-all cursor-pointer mt-2"
                >
                  <span>Continue to Medical License</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* STEP 2: Medical Qualifications & Registration */}
            {step === 2 && (
              <div className="space-y-4 animate-in fade-in">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#242424] block">Primary Qualification</label>
                    <select
                      value={qualification}
                      onChange={(e) => setQualification(e.target.value)}
                      className="w-full min-h-[48px] px-3 py-2 text-sm rounded-xl border border-[#F0E2D8] focus:outline-none focus:ring-2 focus:ring-[#F47738] bg-white text-[#242424]"
                    >
                      <option value="MBBS">MBBS</option>
                      <option value="MD">MD (Doctor of Medicine)</option>
                      <option value="MS">MS (Master of Surgery)</option>
                      <option value="DNB">DNB</option>
                      <option value="BAMS">BAMS (Ayurveda)</option>
                      <option value="BHMS">BHMS (Homeopathy)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#242424] block">
                      Additional Qualification (Optional)
                    </label>
                    <input
                      type="text"
                      value={additionalQualification}
                      onChange={(e) => setAdditionalQualification(e.target.value)}
                      placeholder="e.g. DCH, DGO, Fellow"
                      className="w-full min-h-[48px] px-3 py-2 text-sm rounded-xl border border-[#F0E2D8] focus:outline-none focus:ring-2 focus:ring-[#F47738] bg-white text-[#242424]"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#242424] block">
                    Medical Council Registration Number
                  </label>
                  <div className="relative">
                    <FileBadge className="w-5 h-5 text-[#6B7280] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={registrationNumber}
                      onChange={(e) => setRegistrationNumber(e.target.value)}
                      placeholder="e.g. MMC/2018/05/1234 or MCI-84920"
                      className="w-full min-h-[48px] pl-11 pr-4 py-2 text-sm rounded-xl border border-[#F0E2D8] focus:outline-none focus:ring-2 focus:ring-[#F47738] bg-white text-[#242424]"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#242424] block">
                      Registering Medical Council / Authority
                    </label>
                    <input
                      type="text"
                      value={medicalCouncil}
                      onChange={(e) => setMedicalCouncil(e.target.value)}
                      placeholder="e.g. Maharashtra Medical Council"
                      className="w-full min-h-[48px] px-3 py-2 text-sm rounded-xl border border-[#F0E2D8] focus:outline-none focus:ring-2 focus:ring-[#F47738] bg-white text-[#242424]"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-[#242424] block">Year Registered</label>
                      <input
                        type="number"
                        min="1960"
                        max={new Date().getFullYear()}
                        value={registrationYear}
                        onChange={(e) => setRegistrationYear(Number(e.target.value))}
                        className="w-full min-h-[48px] px-3 py-2 text-sm rounded-xl border border-[#F0E2D8] focus:outline-none focus:ring-2 focus:ring-[#F47738] bg-white text-[#242424]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-[#242424] block">Years Experience</label>
                      <input
                        type="number"
                        min="0"
                        max="60"
                        value={experienceYears}
                        onChange={(e) => setExperienceYears(Number(e.target.value))}
                        className="w-full min-h-[48px] px-3 py-2 text-sm rounded-xl border border-[#F0E2D8] focus:outline-none focus:ring-2 focus:ring-[#F47738] bg-white text-[#242424]"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex-1 min-h-[48px] bg-white hover:bg-[#FFF0E6] text-[#242424] border border-[#F0E2D8] font-bold rounded-xl flex items-center justify-center gap-2 text-sm transition-all cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4 text-[#6B7280]" />
                    <span>Back</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => validateStep2() && setStep(3)}
                    className="flex-2 min-h-[48px] bg-[#F47738] hover:bg-[#D95D24] text-white font-bold rounded-xl flex items-center justify-center gap-2 text-sm shadow-xs transition-all cursor-pointer"
                  >
                    <span>Continue to Specialties</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Specialty & Consultation Capabilities */}
            {step === 3 && (
              <div className="space-y-4 animate-in fade-in">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[#242424] block">
                    Clinical Specialties (Select all that apply)
                  </label>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                    {MEDICAL_SPECIALTIES.map((spec) => {
                      const isSelected = selectedSpecialties.includes(spec.id);
                      return (
                        <button
                          key={spec.id}
                          type="button"
                          onClick={() => toggleSpecialty(spec.id)}
                          className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#FFF0E6] border-[#F47738] text-[#D95D24] font-bold shadow-xs'
                              : 'bg-white border-[#F0E2D8] text-[#242424] hover:border-[#F47738]/50'
                          }`}
                        >
                          <div className="truncate">{spec.name}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-[#242424] block">Languages Spoken</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { code: 'en', label: 'English' },
                      { code: 'hi', label: 'हिंदी (Hindi)' },
                      { code: 'mr', label: 'मराठी (Marathi)' },
                    ].map((lang) => {
                      const isSel = selectedLanguages.includes(lang.code as any);
                      return (
                        <button
                          key={lang.code}
                          type="button"
                          onClick={() => toggleLanguage(lang.code as any)}
                          className={`p-2.5 rounded-xl border text-center text-xs font-semibold cursor-pointer transition-all ${
                            isSel
                              ? 'bg-[#FFF0E6] border-[#F47738] text-[#D95D24] font-bold shadow-xs'
                              : 'bg-white border-[#F0E2D8] text-[#242424] hover:border-[#F47738]/50'
                          }`}
                        >
                          {lang.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#242424] block">
                    Professional Biography / Summary (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Brief background about your clinical experience and patient care approach..."
                    className="w-full px-3 py-2 text-sm rounded-xl border border-[#F0E2D8] focus:outline-none focus:ring-2 focus:ring-[#F47738] bg-white text-[#242424]"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="flex-1 min-h-[48px] bg-white hover:bg-[#FFF0E6] text-[#242424] border border-[#F0E2D8] font-bold rounded-xl flex items-center justify-center gap-2 text-sm transition-all cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4 text-[#6B7280]" />
                    <span>Back</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(4)}
                    className="flex-2 min-h-[48px] bg-[#F47738] hover:bg-[#D95D24] text-white font-bold rounded-xl flex items-center justify-center gap-2 text-sm shadow-xs transition-all cursor-pointer"
                  >
                    <span>Continue to Hospital Affiliation</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: Hospital Affiliation & Declaration */}
            {step === 4 && (
              <div className="space-y-4 animate-in fade-in">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-[#242424] block">
                      Affiliated Hospital / Healthcare Facility
                    </label>
                    <span className="text-[11px] font-semibold text-[#D95D24] bg-[#FFF0E6] px-2 py-0.5 rounded-full border border-[#F0E2D8]">
                      {facilitiesLoading ? 'Loading...' : `${facilities.length} registered organizations`}
                    </span>
                  </div>
                  <select
                    value={facilityId}
                    onChange={(e) => setFacilityId(e.target.value)}
                    className="w-full min-h-[48px] px-3 py-2 text-sm rounded-xl border border-[#F0E2D8] focus:outline-none focus:ring-2 focus:ring-[#F47738] bg-white text-[#242424]"
                  >
                    <option value="">-- Private Practice / Independent Teleconsultant --</option>
                    {facilities.map((fac) => {
                      const id = fac.facilityId || fac._id || fac.id || '';
                      return (
                        <option key={id} value={id}>
                          {fac.name} ({fac.type || 'HOSPITAL'} • {fac.district || (fac as any).districtCode || 'Maharashtra'})
                        </option>
                      );
                    })}
                  </select>
                  <p className="text-[11px] text-[#6B7280]">
                    Select your registered hospital to link your profile directly, or choose Private Practice if you practice independently.
                  </p>
                </div>

                {facilityId && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-[#242424] block">Role in Facility</label>
                      <select
                        value={roleInFacility}
                        onChange={(e) => setRoleInFacility(e.target.value as any)}
                        className="w-full min-h-[48px] px-3 py-2 text-sm rounded-xl border border-[#F0E2D8] focus:outline-none focus:ring-2 focus:ring-[#F47738] bg-white text-[#242424]"
                      >
                        <option value="CONSULTANT">Visiting Consultant</option>
                        <option value="MEDICAL_OFFICER">Medical Officer (PHC/CHC)</option>
                        <option value="RESIDENT">Resident Doctor</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-[#242424] block">Affiliation Notes</label>
                      <input
                        type="text"
                        value={affiliationNotes}
                        onChange={(e) => setAffiliationNotes(e.target.value)}
                        placeholder="e.g. Telemedicine panel doctor"
                        className="w-full min-h-[48px] px-3 py-2 text-sm rounded-xl border border-[#F0E2D8] focus:outline-none focus:ring-2 focus:ring-[#F47738] bg-white text-[#242424]"
                      />
                    </div>
                  </div>
                )}

                {/* Professional Statutory Declaration */}
                <div className="p-3.5 bg-[#FFF9F5] rounded-2xl border border-[#F0E2D8] text-xs text-[#6B7280] space-y-2">
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      id="agreedToTerms"
                      checked={agreedToTerms}
                      onChange={(e) => setAgreedToTerms(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded border-[#F0E2D8] text-[#F47738] focus:ring-[#F47738] cursor-pointer"
                      required
                    />
                    <label htmlFor="agreedToTerms" className="cursor-pointer font-medium leading-relaxed text-[#242424]">
                      I declare that all medical credentials and registration details submitted are genuine,
                      current, and subject to statutory verification under the National Medical Commission /
                      State Medical Council guidelines.
                    </label>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="flex-1 min-h-[48px] bg-white hover:bg-[#FFF0E6] text-[#242424] border border-[#F0E2D8] font-bold rounded-xl flex items-center justify-center gap-2 text-sm transition-all cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4 text-[#6B7280]" />
                    <span>Back</span>
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !agreedToTerms}
                    className="flex-2 min-h-[48px] bg-[#F47738] hover:bg-[#D95D24] active:scale-[0.98] disabled:bg-[#F0E2D8] disabled:text-[#6B7280] text-white font-bold rounded-xl flex items-center justify-center gap-2 text-sm shadow-xs transition-all cursor-pointer disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                        <span>Submitting Profile...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Submit Registration</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </form>

          {/* Switchers */}
          <div className="pt-4 border-t border-[#F0E2D8] text-center space-y-2 text-xs">
            <div>
              <span className="text-[#6B7280]">Already have an account? </span>
              <Link to="/staff/login" className="font-bold text-[#D95D24] hover:text-[#F47738] hover:underline">
                Sign in to Doctor Portal
              </Link>
            </div>
            <div>
              <span className="text-[#6B7280]">Registering a clinic or hospital? </span>
              <Link to="/hospital/register" className="font-bold text-[#D95D24] hover:text-[#F47738] hover:underline">
                Register Hospital / Organization
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
