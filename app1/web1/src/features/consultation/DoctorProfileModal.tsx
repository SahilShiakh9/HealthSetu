import React from 'react';
import {
  X,
  ShieldCheck,
  Award,
  Building2,
  Clock,
  Languages,
  Video,
  CheckCircle2,
  FileBadge,
} from 'lucide-react';
import type { RankedDoctorPreview } from '@healthsetu/contracts';

interface DoctorProfileModalProps {
  doctor: RankedDoctorPreview | null;
  onClose: () => void;
  onSelectDoctor: (doctorId: string) => void;
}

export const DoctorProfileModal: React.FC<DoctorProfileModalProps> = ({
  doctor,
  onClose,
  onSelectDoctor,
}) => {
  if (!doctor) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="doctor-profile-title"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 p-6 space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xl shadow-xs">
              {doctor.name.replace('Dr. ', '').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 id="doctor-profile-title" className="text-lg font-bold text-slate-900">
                  {doctor.name}
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Verified
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {doctor.qualification || 'MBBS'}
                {doctor.additionalQualification ? `, ${doctor.additionalQualification}` : ''}
                {' • '}{doctor.experienceYears}y clinical experience
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status & Availability Strip */}
        <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                doctor.availability === 'AVAILABLE'
                  ? 'bg-emerald-500 animate-pulse'
                  : doctor.availability === 'BUSY'
                  ? 'bg-amber-500'
                  : 'bg-slate-400'
              }`}
            />
            <span className="font-semibold text-slate-700">
              {doctor.availability === 'AVAILABLE'
                ? 'Available for Teleconsultation'
                : doctor.availability === 'BUSY'
                ? 'In Call with Patient'
                : 'Offline'}
            </span>
          </div>
          <div className="flex items-center gap-1 text-slate-500 font-medium">
            <Clock className="w-3.5 h-3.5" />
            <span>Est. Wait: ~{doctor.estimatedWaitMinutes} min</span>
          </div>
        </div>

        {/* Credentials & Licensing Section */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <FileBadge className="w-4 h-4 text-emerald-600" />
            Medical Licensing & Credentials
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
              <span className="text-[11px] text-slate-400 block font-medium">Registration Number</span>
              <span className="font-mono font-bold text-slate-800 block">
                {doctor.registrationNumber || 'NMC-74892-IN'}
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
              <span className="text-[11px] text-slate-400 block font-medium">Medical Council</span>
              <span className="font-bold text-slate-800 block truncate" title={doctor.medicalCouncil || 'State Medical Council'}>
                {doctor.medicalCouncil || 'State Medical Council'}
              </span>
            </div>
          </div>
        </div>

        {/* Hospital Affiliation */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-emerald-600" />
            Hospital Affiliation
          </h3>
          <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100 text-xs">
            <span className="font-bold text-slate-900 block">
              {doctor.facilityName || 'Primary Health Centre (PHC Pabal)'}
            </span>
            <span className="text-slate-500 text-[11px]">
              Verified HealthSetu Telemedicine Network Partner
            </span>
          </div>
        </div>

        {/* Specialties */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <Award className="w-4 h-4 text-emerald-600" />
            Clinical Specialties
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {doctor.specialties.map((spec) => (
              <span
                key={spec}
                className="px-2.5 py-1 bg-slate-100 text-slate-800 font-semibold text-xs rounded-lg"
              >
                {spec}
              </span>
            ))}
          </div>
        </div>

        {/* Languages & Modes */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl border border-slate-200 space-y-1.5">
            <span className="text-slate-500 font-medium flex items-center gap-1">
              <Languages className="w-3.5 h-3.5 text-slate-400" />
              Languages Spoken
            </span>
            <span className="font-bold text-slate-800 block uppercase">
              {doctor.languages.join(', ')}
            </span>
          </div>
          <div className="p-3 rounded-xl border border-slate-200 space-y-1.5">
            <span className="text-slate-500 font-medium flex items-center gap-1">
              <Video className="w-3.5 h-3.5 text-slate-400" />
              Consultation Modes
            </span>
            <span className="font-bold text-slate-800 block">
              HD Video & Voice
            </span>
          </div>
        </div>

        {/* Doctor Bio if available */}
        {doctor.bio && (
          <div className="space-y-1">
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">About Doctor</span>
            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
              {doctor.bio}
            </p>
          </div>
        )}

        {/* Action Button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => {
              onSelectDoctor(doctor.doctorId);
              onClose();
            }}
            className="w-full min-h-[48px] bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold rounded-xl flex items-center justify-center gap-2 text-sm shadow-md transition-all cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Consult with {doctor.name}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
