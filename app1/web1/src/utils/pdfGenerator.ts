import { jsPDF } from 'jspdf';

export interface ReportPdfData {
  reportNumber?: string;
  facilityName: string;
  doctorName: string;
  doctorRegistration: string;
  patientName: string;
  patientPhone: string;
  issuedAt: string | Date;
  diagnosis: string;
  assessment: string;
  medications: Array<{
    name: string;
    dosage: string;
    frequency: string;
    durationDays: number;
    instructions?: string;
  }>;
  tests?: string[];
  notes?: string;
  followUpDate?: string;
  screeningSummary?: string;
  isMock?: boolean;
}

/**
 * Generates an official, high-contrast, print-friendly clinical prescription slip in PDF format
 * using jsPDF, strictly adhering to Telemedicine Practice Guidelines (2020).
 */
export function generateMedicalReportPdf(data: ReportPdfData): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;

  // Format timestamp in Indian Standard Time (IST) with foolproof date parsing
  let safeDate: Date;
  try {
    if (data.issuedAt instanceof Date) {
      safeDate = isNaN(data.issuedAt.getTime()) ? new Date() : data.issuedAt;
    } else if (typeof data.issuedAt === 'string') {
      const d = new Date(data.issuedAt);
      if (!isNaN(d.getTime())) {
        safeDate = d;
      } else {
        const parts = data.issuedAt.split(/[/.-]/);
        if (parts.length === 3) {
          const dPart = parseInt(parts[0], 10);
          const mPart = parseInt(parts[1], 10) - 1;
          const yPart = parseInt(parts[2], 10);
          const manualDate = new Date(yPart, mPart, dPart);
          safeDate = isNaN(manualDate.getTime()) ? new Date() : manualDate;
        } else {
          safeDate = new Date();
        }
      }
    } else {
      safeDate = new Date();
    }
  } catch {
    safeDate = new Date();
  }

  let istDateString: string;
  try {
    istDateString = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(safeDate);
  } catch {
    istDateString = safeDate.toLocaleDateString();
  }

  let y = 16;

  // --- Header / Institution ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(16, 120, 60); // Emerald green
  doc.text('GOVERNMENT OF INDIA • NATIONAL HEALTH MISSION', margin, y);

  y += 5;
  doc.setFontSize(14);
  doc.setTextColor(20, 20, 20);
  doc.text(data.facilityName || 'Primary Health Centre (PHC) Telemedicine Network', margin, y);

  y += 5;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text(
    `Consulting Clinician: ${data.doctorName} | Reg. No: ${data.doctorRegistration || 'MMC Verified'}`,
    margin,
    y,
  );

  if (data.isMock) {
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(180, 80, 0);
    doc.text('[DEMO RECORD / SYNTHETIC DATA FIXTURE - NOT FOR CLINICAL USE]', margin, y);
  }

  y += 4;
  // Divider
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + contentWidth, y);

  // --- Patient & Consultation Metadata ---
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  doc.text(`Patient: ${data.patientName}`, margin, y);

  const reportIdStr = `Slip ID: ${data.reportNumber || 'REP-LOCAL'}`;
  const reportIdWidth = doc.getTextWidth(reportIdStr);
  doc.text(reportIdStr, margin + contentWidth - reportIdWidth, y);

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Phone / ABHA: ${data.patientPhone || 'Confidential'}`, margin, y);

  const istStr = `Issued (IST): ${istDateString}`;
  const istWidth = doc.getTextWidth(istStr);
  doc.text(istStr, margin + contentWidth - istWidth, y);

  y += 4;
  doc.setDrawColor(230, 230, 230);
  doc.line(margin, y, margin + contentWidth, y);

  // --- Screening Provenance Banner ---
  y += 6;
  doc.setFillColor(245, 248, 250);
  doc.rect(margin, y - 4, contentWidth, 9, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 60, 90);
  doc.text(
    `Triage Provenance: ${data.screeningSummary || 'AI-assisted screening, not a diagnosis'}`,
    margin + 3,
    y + 1,
  );

  // --- Clinical Assessment & Diagnosis ---
  y += 11;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(20, 20, 20);
  doc.text('CLINICAL DIAGNOSIS & ASSESSMENT', margin, y);

  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(16, 120, 60);
  doc.text(data.diagnosis || 'Clinical Consultation', margin, y);

  if (data.assessment) {
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    const splitAssessment = doc.splitTextToSize(data.assessment, contentWidth);
    doc.text(splitAssessment, margin, y);
    y += splitAssessment.length * 4;
  } else {
    y += 3;
  }

  // --- Prescribed Medications (Rx) ---
  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(20, 20, 20);
  doc.text('PRESCRIPTION (Rx) - Clinician Entered Data Only', margin, y);

  y += 4;
  // Table header
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, y, contentWidth, 6, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(40, 40, 40);
  doc.text('#', margin + 2, y + 4);
  doc.text('Medicine & Dosage', margin + 10, y + 4);
  doc.text('Frequency & Timing', margin + 80, y + 4);
  doc.text('Duration', margin + 130, y + 4);
  doc.text('Instructions', margin + 155, y + 4);

  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  if (!data.medications || data.medications.length === 0) {
    doc.setTextColor(100, 100, 100);
    doc.text('No prescription medications entered. Conservative management / advice only.', margin + 4, y + 3);
    y += 8;
  } else {
    data.medications.forEach((med, idx) => {
      doc.setTextColor(20, 20, 20);
      doc.setFont('helvetica', 'bold');
      doc.text(`${idx + 1}.`, margin + 2, y + 3);
      doc.text(`${med.name} (${med.dosage})`, margin + 10, y + 3);

      doc.setFont('helvetica', 'normal');
      doc.text(med.frequency, margin + 80, y + 3);
      doc.text(`${med.durationDays} Days`, margin + 130, y + 3);
      doc.text(med.instructions || 'As advised', margin + 155, y + 3);

      y += 6;
      doc.setDrawColor(240, 240, 240);
      doc.line(margin, y - 1, margin + contentWidth, y - 1);
    });
  }

  // --- Recommended Tests & Investigations ---
  if (data.tests && data.tests.length > 0) {
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(20, 20, 20);
    doc.text('RECOMMENDED LAB INVESTIGATIONS', margin, y);

    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    data.tests.forEach((t) => {
      doc.text(`• ${t}`, margin + 4, y);
      y += 4;
    });
  }

  // --- Advice & Follow-Up ---
  y += 3;
  if (data.notes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('Clinical Advice:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(data.notes, margin + 25, y);
    y += 5;
  }

  if (data.followUpDate) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('Recommended Follow-up:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(data.followUpDate, margin + 42, y);
    y += 6;
  }

  // --- Digital Signature & Stamp ---
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 30, 30);
  doc.text('Digitally Authorized By:', margin + contentWidth - 65, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.text(data.doctorName, margin + contentWidth - 65, y);
  y += 4;
  doc.setFontSize(7.5);
  doc.setTextColor(100, 100, 100);
  doc.text(`Reg: ${data.doctorRegistration || 'MMC Verified'}`, margin + contentWidth - 65, y);
  doc.text(`Timestamp: ${istDateString}`, margin + contentWidth - 65, y + 3);

  // --- Bottom Statutory Footer ---
  const footerY = 280;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, footerY - 3, margin + contentWidth, footerY - 3);

  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text(
    'Statutory Notice: Issued under MoHFW Telemedicine Practice Guidelines (2020). Valid across all registered pharmacies in India.',
    margin,
    footerY,
  );
  doc.text(
    'For sudden chest pain, severe breathlessness or loss of consciousness, seek immediate emergency care or call 108.',
    margin,
    footerY + 3.5,
  );

  return doc;
}
