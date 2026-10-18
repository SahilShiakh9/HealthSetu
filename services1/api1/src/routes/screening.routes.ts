import { Router } from 'express';
import {
  CreateScreeningSchema,
  OnlineAssistRequestSchema,
  VoiceDialogueRequestSchema,
} from '@healthsetu/contracts';
import { requireAuth } from '../middleware/auth.js';
import { screeningService } from '../services/screening.service.js';
import { voiceScreeningService } from '../services/voiceScreening.service.js';
import { authzService } from '../services/authz.service.js';
import { Patient } from '../models/Patient.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

export const screeningRouter = Router();

// POST /api/v1/screenings
screeningRouter.post('/screenings', requireAuth, async (req, res, next) => {
  try {
    const input = CreateScreeningSchema.parse(req.body);
    const userId = req.user!.id;

    // Resolve patientId: either provided in body or resolved from caller profile
    let patientId = req.body.patientId;
    if (!patientId) {
      let patient = await Patient.findOne({ userId });
      if (!patient) {
        // Auto-create patient profile for self-screening if not yet present
        patient = await Patient.create({
          userId,
          consentRefs: [],
        });
      }
      patientId = patient._id.toString();
    }

    const screening = await screeningService.createScreening(
      userId,
      patientId,
      input,
      req.ip
    );

    res.status(201).json({
      status: 'success',
      screening: {
        id: screening._id.toString(),
        clientId: screening.clientId,
        patientId: screening.patientId.toString(),
        submittedBy: screening.submittedBy.toString(),
        language: screening.language,
        symptoms: screening.symptoms,
        answers: screening.answers,
        duration: screening.duration,
        severity: screening.severity,
        emergencyFlags: screening.emergencyFlags,
        riskTier: screening.riskTier,
        isEmergency: screening.isEmergency,
        possibleConditions: screening.possibleConditions,
        symptomGroups: screening.symptomGroups,
        recommendedSpecialty: screening.recommendedSpecialty,
        source: screening.source,
        modelVersion: screening.modelVersion,
        triageConfigVersion: screening.triageConfigVersion,
        imageIds: screening.imageIds,
        location: screening.location,
        villageCode: screening.villageCode,
        clientCreatedAt: screening.clientCreatedAt,
        receivedAt: screening.receivedAt,
        createdAt: screening.createdAt.toISOString(),
        updatedAt: screening.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/screenings
screeningRouter.get('/screenings', requireAuth, async (req, res, next) => {
  try {
    const { riskTier, limit, skip } = req.query;
    let patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined;
    let submittedBy: string | undefined = undefined;

    // For PATIENT or ASHA, restrict listing to their own submitted or patient screenings
    if (req.user!.role === 'PATIENT' || req.user!.role === 'ASHA') {
      submittedBy = req.user!.id;
    }

    const result = await screeningService.listScreenings({
      patientId,
      submittedBy,
      riskTier: typeof riskTier === 'string' ? riskTier : undefined,
      limit: limit ? Number(limit) : undefined,
      skip: skip ? Number(skip) : undefined,
    });

    res.status(200).json({
      status: 'success',
      total: result.total,
      screenings: result.screenings.map((s) => ({
        id: s._id.toString(),
        clientId: s.clientId,
        patientId: s.patientId.toString(),
        submittedBy: s.submittedBy.toString(),
        language: s.language,
        symptoms: s.symptoms,
        riskTier: s.riskTier,
        isEmergency: s.isEmergency,
        possibleConditions: s.possibleConditions,
        recommendedSpecialty: s.recommendedSpecialty,
        source: s.source,
        createdAt: s.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// In-memory cache for synthesized MP3 speech audio buffers
const ttsAudioCache = new Map<string, Buffer>();

export async function synthesizeTtsBuffer(rawText: string, lang: string): Promise<Buffer | null> {
  const targetLang = lang === 'mr' ? 'mr' : lang === 'en' ? 'en' : 'hi';
  const text = rawText.trim().slice(0, 350);
  if (!text) return null;

  const cacheKey = `${targetLang}:${text}`;
  if (ttsAudioCache.has(cacheKey)) {
    return ttsAudioCache.get(cacheKey)!;
  }

  // Splitting on sentence punctuation (।, ., !, ?, \n) ensures every sentence is fully synthesized.
  const rawSentences = text
    .split(/(?<=[.!?।,;\n]+)\s*/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const sentence of rawSentences) {
    if (sentence.length <= 100) {
      chunks.push(sentence);
    } else {
      const words = sentence.split(/\s+/);
      let curr = '';
      for (const w of words) {
        if ((curr + ' ' + w).length <= 90) {
          curr = curr ? `${curr} ${w}` : w;
        } else {
          if (curr) chunks.push(curr);
          curr = w;
        }
      }
      if (curr) chunks.push(curr);
    }
  }

  if (chunks.length === 0) {
    chunks.push(text);
  }

  const buffers: Buffer[] = [];
  for (const chunk of chunks) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${targetLang}&client=tw-ob&q=${encodeURIComponent(chunk)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: 'https://translate.google.com/',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const arrayBuf = await response.arrayBuffer();
        buffers.push(Buffer.from(arrayBuf));
      }
    } catch (chunkErr) {
      clearTimeout(timeoutId);
      logger.warn({ chunkErr }, 'TTS chunk fetch failed');
    }
  }

  if (buffers.length === 0) {
    return null;
  }

  const combinedBuffer = Buffer.concat(buffers);
  if (ttsAudioCache.size > 200) {
    const firstKey = ttsAudioCache.keys().next().value;
    if (firstKey) ttsAudioCache.delete(firstKey);
  }
  ttsAudioCache.set(cacheKey, combinedBuffer);
  return combinedBuffer;
}

// Background prewarm of UI greetings and common dialogue questions for near-instant 0ms audio latency
setTimeout(async () => {
  const commonPhrases = [
    { lang: 'hi', text: 'नमस्ते! मैं आपका स्वास्थ्य सहायक हूँ। कृपया बताएं कि आपको क्या समस्या या तकलीफ हो रही है।' },
    { lang: 'mr', text: 'नमस्कार! मी तुमचा आरोग्य तपासणी सहाय्यक आहे. तुम्हाला काय त्रास होत आहे ते कृपया सांगा किंवा खाली टाईप करा.' },
    { lang: 'en', text: 'Hello! I am your HealthSetu screening assistant. Please describe your health concern by voice or typing below.' },
    { lang: 'hi', text: 'क्या आपको इस बुखार के साथ ठंड, पसीना या कंपकंपी भी महसूस हुई है?' },
    { lang: 'mr', text: 'या तापासोबत तुम्हाला थंडी वाजणे, घाम येणे किंवा हुडहुडी भरल्यासारखे झाले आहे का?' },
    { lang: 'en', text: 'Have you also experienced chills, sweating, or severe shivering with this fever?' },
    { lang: 'hi', text: 'क्या खांसी के साथ छाती में जकड़न या चलने पर सांस फूलने की समस्या हो रही है?' },
    { lang: 'mr', text: 'खोकल्यासोबत छातीत जड वाटणे किंवा चालताना धाप लागणे असा त्रास होतोय का?' },
    { lang: 'en', text: 'Is the cough accompanied by chest discomfort or difficulty catching your breath when walking?' },
  ];
  for (const p of commonPhrases) {
    try {
      await synthesizeTtsBuffer(p.text, p.lang);
    } catch {}
  }
}, 500);

// GET /api/v1/screenings/tts (High-fidelity Hindi, Marathi, and English audio streaming)
screeningRouter.get('/screenings/tts', async (req, res) => {
  try {
    const rawText = typeof req.query.text === 'string' ? req.query.text.trim() : '';
    const lang = typeof req.query.language === 'string' ? req.query.language.toLowerCase() : 'hi';

    if (!rawText) {
      return res.status(400).json({ error: 'Text query parameter is required' });
    }

    const audioBuf = await synthesizeTtsBuffer(rawText, lang);
    if (!audioBuf) {
      return res.status(502).json({ error: 'TTS audio synthesis unavailable' });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(audioBuf);
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Failed to generate TTS audio stream');
    return res.status(500).json({ error: 'TTS streaming failed' });
  }
});

// GET /api/v1/screenings/:id
screeningRouter.get('/screenings/:id', requireAuth, async (req, res, next) => {
  try {
    const rawId = req.params.id;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(rawId);
    const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(rawId);

    if (!isObjectId && !isUuid) {
      throw new AppError({
        statusCode: 400,
        code: 'INVALID_OBJECT_ID',
        message: `Invalid screening ID parameter '${rawId}': must be a 24-character hexadecimal ObjectId or UUID clientId`,
      });
    }

    const screening = await screeningService.getScreeningById(rawId);
    if (!screening) {
      throw new AppError({ statusCode: 404, code: 'NOT_FOUND', message: 'Screening record not found' });
    }

    // Service-layer authorization check
    authzService.assertCanReadScreening(req.user!, screening);

    res.status(200).json({
      status: 'success',
      screening: {
        id: screening._id.toString(),
        clientId: screening.clientId,
        patientId: screening.patientId.toString(),
        submittedBy: screening.submittedBy.toString(),
        language: screening.language,
        symptoms: screening.symptoms,
        answers: screening.answers,
        duration: screening.duration,
        severity: screening.severity,
        emergencyFlags: screening.emergencyFlags,
        riskTier: screening.riskTier,
        isEmergency: screening.isEmergency,
        possibleConditions: screening.possibleConditions,
        symptomGroups: screening.symptomGroups,
        recommendedSpecialty: screening.recommendedSpecialty,
        source: screening.source,
        modelVersion: screening.modelVersion,
        triageConfigVersion: screening.triageConfigVersion,
        imageIds: screening.imageIds,
        location: screening.location,
        villageCode: screening.villageCode,
        clientCreatedAt: screening.clientCreatedAt,
        receivedAt: screening.receivedAt,
        createdAt: screening.createdAt.toISOString(),
        updatedAt: screening.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/screenings/assist (Online triage assist)
screeningRouter.post('/screenings/assist', requireAuth, async (req, res, next) => {
  try {
    const input = OnlineAssistRequestSchema.parse(req.body);
    const result = await screeningService.onlineAssist(input);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/screenings/dialogue (Conversational Voice-First Assistant)
screeningRouter.post('/screenings/dialogue', async (req, res, next) => {
  try {
    const input = VoiceDialogueRequestSchema.parse(req.body);
    const result = await voiceScreeningService.handleDialogue(input);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/screenings/transcribe (Whisper Audio / Text Fallback)
screeningRouter.post('/screenings/transcribe', async (req, res, next) => {
  try {
    const text = req.body.text;
    const language = req.body.language || 'en';

    if (text && typeof text === 'string') {
      return res.status(200).json({
        text: text.trim(),
        language,
        provider: 'client-speech-api',
      });
    }

    res.status(200).json({
      text: '',
      language,
      provider: 'none',
      message: 'No audio stream processed; client fallback speech recognition active',
    });
  } catch (err) {
    next(err);
  }
});




