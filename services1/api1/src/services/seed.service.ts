import argon2 from 'argon2';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Doctor } from '../models/Doctor.js';
import { Patient } from '../models/Patient.js';
import { FacilityModel } from '../models/Facility.js';
import { DoctorAffiliation } from '../models/DoctorAffiliation.js';
import { Screening } from '../models/Screening.js';
import { logger } from '../utils/logger.js';

export const seedDefaultUsers = async (): Promise<void> => {
  try {
    const phcFacility = await FacilityModel.findOne({ facilityId: 'fac-phc-001' });

    // 1. Doctor Account
    const existingDoctor = await User.findOne({ email: 'doctor@healthsetu.org' });
    if (!existingDoctor) {
      const doctorPassHash = await argon2.hash('Doctor@12345');
      const doctorUser = await User.create({
        email: 'doctor@healthsetu.org',
        phone: '9876543201',
        name: 'Dr. Rahul Sharma, MBBS',
        role: 'DOCTOR',
        language: 'en',
        passwordHash: doctorPassHash,
        facilityId: 'fac-phc-001',
        isActive: true,
      });

      await Doctor.create({
        userId: doctorUser._id,
        specialties: ['General Physician', 'Internal Medicine'],
        languages: ['en', 'hi', 'mr'],
        registrationNumber: 'MMC/2018/48921',
        qualification: 'MBBS, MD (Medicine)',
        experienceYears: 8,
        verificationStatus: 'APPROVED',
        availability: 'AVAILABLE',
        maxQueue: 10,
        facilityId: phcFacility?._id,
        districtCode: 'DIST-PUNE-RURAL',
        weeklyAvailability: [
          { dayOfWeek: 1, start: '09:00', end: '18:00' },
          { dayOfWeek: 2, start: '09:00', end: '18:00' },
          { dayOfWeek: 3, start: '09:00', end: '18:00' },
          { dayOfWeek: 4, start: '09:00', end: '18:00' },
          { dayOfWeek: 5, start: '09:00', end: '18:00' },
        ],
        rollingAvgConsultMinutes: 10,
        isMock: false,
      });
      logger.info('Doctor account seeded.');
    }

    // Ensure Doctor Affiliation exists for fac-phc-001
    const doctorUser = await User.findOne({ email: 'doctor@healthsetu.org' });
    if (doctorUser && phcFacility) {
      const existingAff = await DoctorAffiliation.findOne({
        doctorUserId: doctorUser._id,
        facilityId: phcFacility._id,
      });
      if (!existingAff) {
        await DoctorAffiliation.create({
          doctorUserId: doctorUser._id,
          facilityId: phcFacility._id,
          status: 'ACTIVE',
          roleInFacility: 'CONSULTANT',
          requestedBy: doctorUser._id,
          approvedAt: new Date(),
          notes: 'Seeded default facility affiliation',
        });
        logger.info('Doctor affiliation for fac-phc-001 seeded.');
      }
    }

    // 2. PHC Medical Officer Account
    const existingPhc = await User.findOne({ email: 'phc@healthsetu.org' });
    if (!existingPhc) {
      const phcPassHash = await argon2.hash('Officer@12345');
      await User.create({
        email: 'phc@healthsetu.org',
        phone: '9876543202',
        name: 'Dr. Anjali Patil (PHC Officer)',
        role: 'PHC_OFFICER',
        language: 'en',
        passwordHash: phcPassHash,
        facilityId: 'fac-phc-001',
        isActive: true,
      });
      logger.info('PHC Officer account seeded.');
    }

    // 3. Hospital Admin Account
    const existingHospAdmin = await User.findOne({ email: 'hospital_admin@healthsetu.org' });
    if (!existingHospAdmin) {
      const hospPassHash = await argon2.hash('Hospital@12345');
      const hospAdminUser = await User.create({
        email: 'hospital_admin@healthsetu.org',
        phone: '9876543204',
        name: 'Dr. Vikram Deshmukh (Hospital Admin)',
        role: 'HOSPITAL_ADMIN',
        language: 'en',
        passwordHash: hospPassHash,
        facilityId: 'fac-phc-001',
        facilityIds: ['fac-phc-001'],
        isActive: true,
      });

      if (phcFacility) {
        await FacilityModel.findByIdAndUpdate(phcFacility._id, {
          $addToSet: { adminUserIds: hospAdminUser._id },
        });
      }
      logger.info('Hospital Admin account seeded.');
    }

    // 4. Government Officer Account
    const existingGovt = await User.findOne({ email: 'govt@healthsetu.org' });
    if (!existingGovt) {
      const govtPassHash = await argon2.hash('Govt@12345');
      await User.create({
        email: 'govt@healthsetu.org',
        phone: '9876543205',
        name: 'Smt. Priya Kulkarni (IDSP Officer)',
        role: 'GOVT_OFFICER',
        language: 'en',
        passwordHash: govtPassHash,
        districtCode: 'DIST-PUNE-RURAL',
        isActive: true,
      });
      logger.info('Government Officer account seeded.');
    }

    // 5. NGO Public Health Observer Account
    const existingNgo = await User.findOne({ email: 'ngo@healthsetu.org' });
    if (!existingNgo) {
      const ngoPassHash = await argon2.hash('Ngo@12345');
      await User.create({
        email: 'ngo@healthsetu.org',
        phone: '9876543206',
        name: 'Aarogya Foundation Observer',
        role: 'NGO_OBSERVER',
        language: 'en',
        passwordHash: ngoPassHash,
        districtCode: 'DIST-PUNE-RURAL',
        isActive: true,
      });
      logger.info('NGO Observer account seeded.');
    }

    // 6. District Administrator Account
    const existingAdmin = await User.findOne({ email: 'admin@healthsetu.org' });
    if (!existingAdmin) {
      const adminPassHash = await argon2.hash('Admin@12345');
      await User.create({
        email: 'admin@healthsetu.org',
        phone: '9876543203',
        name: 'District Health Admin',
        role: 'ADMIN',
        language: 'en',
        passwordHash: adminPassHash,
        isActive: true,
      });
      logger.info('Admin account seeded.');
    }

    // 4. Default Patient Account
    const existingPatient = await User.findOne({ phone: '9876543210' });
    if (!existingPatient) {
      const patientUser = await User.create({
        phone: '9876543210',
        name: 'Kisan Ramesh',
        role: 'PATIENT',
        language: 'hi',
        villageCode: 'VIL-412208',
        isActive: true,
      });

      await Patient.create({
        userId: patientUser._id,
        ageBand: '41-50',
        gender: 'M',
        villageCode: 'VIL-412208',
        districtCode: 'DIST-PUNE-RURAL',
        phcId: phcFacility?._id,
        consentRefs: [],
      });
      logger.info('Patient account seeded.');
    }

    // 5. Default ASHA Worker Account
    const existingAsha = await User.findOne({ phone: '9876543211' });
    if (!existingAsha) {
      await User.create({
        phone: '9876543211',
        name: 'Sunita Devi (ASHA)',
        role: 'ASHA',
        language: 'mr',
        facilityId: 'fac-phc-001',
        villageCode: 'VIL-412208',
        isActive: true,
      });
      logger.info('ASHA account seeded.');
    }

    logger.info('All default demo users are up-to-date in MongoDB.');

    // 6. Seed Realistic NGO Surveillance Screenings for DIST-PUNE-RURAL
    await seedNgoDemoScreenings();
  } catch (err) {
    logger.error({ err }, 'Error seeding default demo accounts');
  }
};

export const seedNgoDemoScreenings = async (): Promise<void> => {
  try {
    const existingCount = await Screening.countDocuments({ district: 'DIST-PUNE-RURAL' });
    if (existingCount >= 15) {
      logger.info({ count: existingCount }, 'NGO demo population screenings already seeded in DIST-PUNE-RURAL.');
      return;
    }

    const patient = await User.findOne({ role: 'PATIENT' });
    const asha = await User.findOne({ role: 'ASHA' });
    const defaultPatientId = patient?._id || new mongoose.Types.ObjectId();
    const defaultSubmittedBy = asha?._id || new mongoose.Types.ObjectId();

    logger.info('Seeding realistic population health screenings for DIST-PUNE-RURAL...');

    const now = Date.now();
    const msInDay = 24 * 60 * 60 * 1000;

    const regions = [
      { name: 'Khed (Rajgurunagar)', count: 14 },
      { name: 'Shirur Rural', count: 11 },
      { name: 'Ambegaon Tribal', count: 9 },
      { name: 'Junnar Foothills', count: 6 },
      { name: 'Velhe Remote', count: 2 }, // demonstrates <3 k-anonymity masking!
    ];

    const symptomSets = [
      { sym: ['fever', 'cough'], lang: 'mr', cat: 'Acute Respiratory Infection', risk: 'HIGH', spec: 'Pulmonology', emerg: false, ref: 'pending', input: 'voice' },
      { sym: ['headache', 'joint_pain'], lang: 'mr', cat: 'Viral Arthralgia', risk: 'MEDIUM', spec: 'General Physician', emerg: false, ref: 'none', input: 'voice' },
      { sym: ['vomiting', 'diarrhea'], lang: 'hi', cat: 'Acute Gastroenteritis', risk: 'HIGH', spec: 'Internal Medicine', emerg: false, ref: 'referred', input: 'voice' },
      { sym: ['fever'], lang: 'mr', cat: 'Unspecified Febrile Illness', risk: 'LOW', spec: 'General Physician', emerg: false, ref: 'none', input: 'voice' },
      { sym: ['cough'], lang: 'en', cat: 'Upper Respiratory Tract Infection', risk: 'LOW', spec: 'General Physician', emerg: false, ref: 'none', input: 'text' },
      { sym: ['chest pain', 'breathing difficulty'], lang: 'hi', cat: 'Cardiorespiratory Emergency', risk: 'HIGH', spec: 'Emergency Medicine', emerg: true, ref: 'referred', input: 'voice' },
      { sym: ['skin_rash'], lang: 'mr', cat: 'Contact Dermatitis', risk: 'LOW', spec: 'Dermatology', emerg: false, ref: 'none', input: 'text' },
      { sym: ['fatigue', 'joint_pain'], lang: 'hi', cat: 'Post-Viral Fatigue Syndrome', risk: 'MEDIUM', spec: 'General Physician', emerg: false, ref: 'none', input: 'voice' },
    ];

    const docsToInsert = [];
    let counter = 100;

    for (const reg of regions) {
      for (let i = 0; i < reg.count; i++) {
        counter++;
        const sTemplate = symptomSets[(counter + i) % symptomSets.length];
        let offsetMs = 0;
        if (i % 3 === 0) {
          offsetMs = Math.floor(Math.random() * (10 * 60 * 60 * 1000)); // Today
        } else if (i % 3 === 1) {
          offsetMs = Math.floor((1 + Math.random() * 5) * msInDay); // Last 7 days
        } else {
          offsetMs = Math.floor((7 + Math.random() * 20) * msInDay); // Last 30 days
        }
        const recordDate = new Date(now - offsetMs);

        docsToInsert.push({
          clientId: `scr-pune-seed-${counter}`,
          patientId: defaultPatientId,
          submittedBy: defaultSubmittedBy,
          language: sTemplate.lang,
          symptoms: sTemplate.sym,
          answers: [
            { questionId: 'fever', symptomId: 'fever', value: 'yes', at: recordDate.getTime() },
          ],
          severity: sTemplate.risk === 'HIGH' ? 'severe' : sTemplate.risk === 'MEDIUM' ? 'moderate' : 'mild',
          emergencyFlags: sTemplate.emerg ? ['acute_respiratory_distress'] : [],
          riskTier: sTemplate.risk,
          isEmergency: sTemplate.emerg,
          possibleConditions: [{ name: sTemplate.cat, probability: 0.88 }],
          symptomGroups: ['infectious_and_systemic'],
          recommendedSpecialty: sTemplate.spec,
          source: i % 4 === 0 ? 'web' : 'device',
          modelVersion: 'research-linearsvc-tfidf-clean-grouped-v1',
          triageConfigVersion: '1.0.0',
          imageIds: [],
          inputMethod: sTemplate.input,
          voiceTranscript: `Patient reports ${sTemplate.sym.join(', ')} with duration of several days`,
          candidateCategory: sTemplate.cat,
          referralStatus: sTemplate.ref,
          status: 'completed',
          district: 'DIST-PUNE-RURAL',
          villageCode: reg.name,
          isOfflineSync: i % 5 === 0,
          clientCreatedAt: recordDate.getTime(),
          receivedAt: recordDate.getTime(),
          createdAt: recordDate,
          updatedAt: recordDate,
        });
      }
    }

    await Screening.insertMany(docsToInsert, { ordered: false });
    logger.info({ insertedCount: docsToInsert.length }, 'Successfully seeded population screenings for DIST-PUNE-RURAL.');
  } catch (err) {
    logger.warn({ err }, 'Warning during NGO demo screenings seeding');
  }
};

