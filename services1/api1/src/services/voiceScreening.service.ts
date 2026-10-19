import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import type { VoiceDialogueRequest, VoiceDialogueResponse, RiskTier } from '@healthsetu/contracts';
import { screeningService } from './screening.service.js';
import { Screening } from '../models/Screening.js';
import { User } from '../models/User.js';
import { realtimeService } from './realtime.service.js';

interface EmergencyRuleDefinition {
  sign: string;
  en: string[];
  hi: string[];
  mr: string[];
}

const MULTILINGUAL_EMERGENCY_RULES: EmergencyRuleDefinition[] = [
  {
    sign: 'Chest Pain / Angina',
    en: ['chest pain', 'chest tightness', 'heart pain', 'pressure in chest', 'crushing chest'],
    hi: ['सीने में दर्द', 'छाती में दर्द', 'दिल में दर्द', 'सीने में दबाव'],
    mr: ['छातीत दुखणे', 'छातीत कळ', 'हृदयात दुखणे', 'छातीवर दाब', 'छातीत असह्य वेदना'],
  },
  {
    sign: 'Severe Breathing Difficulty',
    en: ['shortness of breath', 'cannot breathe', 'difficulty breathing', 'gasping for air', 'suffocating', 'breathless'],
    hi: ['सांस लेने में तकलीफ', 'सांस फूलना', 'दम घुटना', 'सांस नहीं आ रही'],
    mr: ['श्वास घेण्यास त्रास', 'दम लागणे', 'श्वास गुदमरणे', 'श्वास थांबणे', 'धाप लागणे'],
  },
  {
    sign: 'Loss of Consciousness / Syncope',
    en: ['unconscious', 'passed out', 'fainted', 'loss of consciousness', 'blackout', 'fainting'],
    hi: ['बेहोश', 'बेहोशी', 'चक्कर खाकर गिरना', 'सुधबुध खोना'],
    mr: ['बेशुद्ध', 'चक्कर येऊन पडणे', 'शुद्ध हरपणे', 'भोवळ'],
  },
  {
    sign: 'Stroke / Paralysis Signs',
    en: ['slurred speech', 'face drooping', 'arm weakness', 'sudden paralysis', 'cannot speak'],
    hi: ['लकवा', 'आवाज लड़खड़ाना', 'मुंह टेढ़ा होना', 'हाथ पैर सुन्न'],
    mr: ['पक्षाघात', 'लकवा', 'जीभ जड होणे', 'तोंड वाकडे होणे', 'हातपाय लुळे पडणे'],
  },
  {
    sign: 'Severe Uncontrolled Bleeding',
    en: ['heavy bleeding', 'severe bleeding', 'vomiting blood', 'coughing blood'],
    hi: ['खून की उल्टी', 'खांसी में खून', 'ज्यादा खून बहना'],
    mr: ['रक्ताची उलटी', 'खोकल्यातून रक्त', 'प्रचंड रक्तस्त्राव'],
  },
  {
    sign: 'Active Convulsion / Seizure',
    en: ['seizure', 'convulsion', 'fits', 'shaking violently'],
    hi: ['दौरा', 'मिरगी', 'झटके आना'],
    mr: ['फेफरे', 'झटके येणे', 'मिरगी'],
  },
];

// Symptom vocabulary mapping for Marathi, Hindi, English
const SYMPTOM_LEXICON: Record<string, { en: string[]; hi: string[]; mr: string[] }> = {
  fever: {
    en: ['fever', 'high temperature', 'chills', 'feverish', 'hot body', 'temperature'],
    hi: ['बुखार', 'ताप', 'बदन गरम', 'ठंड लगना', 'हरारत'],
    mr: ['ताप', 'अंग गरम', 'थंडी वाजून येणे', 'अंग तापणे', 'हुडहुडी'],
  },
  cough: {
    en: ['cough', 'coughing', 'dry cough', 'wet cough', 'phlegm', 'throat irritation'],
    hi: ['खांसी', 'कफ', 'सूखी खांसी', 'बलगम', 'गले में खराश'],
    mr: ['खोकला', 'कफ', 'कोरडा खोकला', 'घशात खवखव', 'धाप'],
  },
  headache: {
    en: ['headache', 'head pain', 'migraine', 'head throbbing'],
    hi: ['सिरदर्द', 'सिर में दर्द', 'माइग्रेन', 'सिर भारी'],
    mr: ['डोकेदुखी', 'डोके दुखणे', 'मायग्रेन', 'डोके जड'],
  },
  vomiting: {
    en: ['vomiting', 'nausea', 'throwing up', 'puking', 'queasy'],
    hi: ['उल्टी', 'जी मिचलाना', 'कै', 'उबकाई'],
    mr: ['उलटी', 'मळमळ', 'ओकारी', 'उलटीसारखे वाटणे'],
  },
  diarrhea: {
    en: ['diarrhea', 'loose motions', 'watery stool', 'stomach upset'],
    hi: ['दस्त', 'पेट खराब', 'पतले दस्त', 'लूज मोशन'],
    mr: ['जुलाब', 'संडास लागणे', 'हगवण', 'पोट बिघडणे'],
  },
  joint_pain: {
    en: ['joint pain', 'knee pain', 'body ache', 'arthritis', 'back pain'],
    hi: ['जोड़ों का दर्द', 'घुटनों में दर्द', 'बदन दर्द', 'कमर दर्द'],
    mr: ['सांधेदुखी', 'गुडघेदुखी', 'अंगदुखी', 'कंबरदुखी'],
  },
  skin_rash: {
    en: ['skin rash', 'itching', 'red spots', 'allergies', 'skin eruption'],
    hi: ['खुजली', 'चकत्ते', 'लाल दाने', 'त्वचा संक्रमण', 'खाज'],
    mr: ['खाज', 'पुरळ', 'अंगावर गांधी', 'त्वचेचा संसर्ग', 'लाल डाग'],
  },
  fatigue: {
    en: ['fatigue', 'weakness', 'tiredness', 'exhausted', 'lack of energy'],
    hi: ['थकान', 'कमजोरी', 'सुस्ती', 'अशक्तता'],
    mr: ['थकवा', 'अशक्तपणा', 'गळाल्यासारखे वाटणे', 'त्राण नसणे'],
  },
};

const FOLLOW_UP_QUESTIONS: Record<string, { en: string; hi: string; mr: string }> = {
  fever: {
    en: 'Have you also experienced chills, sweating, or severe shivering with this fever?',
    hi: 'क्या आपको इस बुखार के साथ ठंड, पसीना या कंपकंपी भी महसूस हुई है?',
    mr: 'या तापासोबत तुम्हाला थंडी वाजणे, घाम येणे किंवा हुडहुडी भरल्यासारखे झाले आहे का?',
  },
  cough: {
    en: 'Is the cough accompanied by chest discomfort or difficulty catching your breath when walking?',
    hi: 'क्या खांसी के साथ छाती में जकड़न या चलने पर सांस फूलने की समस्या हो रही है?',
    mr: 'खोकल्यासोबत छातीत जड वाटणे किंवा चालताना धाप लागणे असा त्रास होतोय का?',
  },
  headache: {
    en: 'Do you also have nausea, vomiting, or heightened sensitivity to light and sound?',
    hi: 'क्या सिरदर्द के साथ जी मिचलाना, उल्टी या तेज रोशनी से परेशानी हो रही है?',
    mr: 'डोकेदुखीसोबत मळमळणे, उलट्या किंवा तीव्र प्रकाशाचा त्रास होत आहे का?',
  },
  vomiting: {
    en: 'Are you able to keep liquids down, or have you noticed extreme thirst and dry mouth?',
    hi: 'क्या आप पानी या तरल पदार्थ पी पा रहे हैं, या बहुत ज्यादा प्यास और कमजोरी लग रही है?',
    mr: 'तुम्हाला पाणी किंवा द्रवपदार्थ पचत आहेत का, की खूप तहान आणि कोरडेपणा जाणवतोय?',
  },
  diarrhea: {
    en: 'Has the diarrhea lasted for more than 2 days, and is there any stomach cramping?',
    hi: 'क्या दस्त 2 दिन से ज्यादा समय से है, और पेट में तेज मरोड़ या दर्द है?',
    mr: 'जुलाब २ दिवसांपेक्षा जास्त दिवस आहेत का, आणि पोटात मुरडा किंवा दुखणे आहे का?',
  },
  joint_pain: {
    en: 'Are your joints visibly swollen, warm to the touch, or stiff in the morning?',
    hi: 'क्या जोड़ों में सूजन, गर्माहट या सुबह उठने पर भारी अकड़न रहती है?',
    mr: 'सांध्यांना सूज, उष्णता किंवा सकाळी उठल्यावर जडपणा जाणवतो का?',
  },
  skin_rash: {
    en: 'Is the rash spreading rapidly or accompanied by an intense burning sensation?',
    hi: 'क्या चकत्ते तेजी से फैल रहे हैं या उनमें तेज जलन और खुजली हो रही है?',
    mr: 'पुरळ वेगाने पसरत आहे का किंवा त्यामध्ये तीव्र जळजळ व खाज आहे का?',
  },
  fatigue: {
    en: 'Has this fatigue come on suddenly, and is it preventing you from doing your daily activities?',
    hi: 'क्या यह कमजोरी अचानक आई है और क्या इससे रोजमर्रा के काम करने में दिक्कत हो रही है?',
    mr: 'हा अशक्तपणा अचानक आला आहे का आणि यामुळे दैनंदिन कामे करणे कठीण झाले आहे का?',
  },
};

export class VoiceScreeningService {
  /**
   * Evaluates Multilingual Emergency Warning Signs independently of any LLM.
   */
  public evaluateEmergencySigns(text: string, language: 'en' | 'hi' | 'mr'): { isEmergency: boolean; flags: string[] } {
    const lower = text.toLowerCase().trim();
    const flags: string[] = [];

    for (const rule of MULTILINGUAL_EMERGENCY_RULES) {
      const phrases = [...rule.en, ...rule.hi, ...rule.mr];
      for (const phrase of phrases) {
        if (lower.includes(phrase.toLowerCase())) {
          flags.push(rule.sign);
          break;
        }
      }
    }

    return {
      isEmergency: flags.length > 0,
      flags: Array.from(new Set(flags)),
    };
  }

  /**
   * Extracts name and identifies greeting / self-introduction intent.
   * e.g. "माझं नाव निरंजन आहे", "Hello, my name is Priya", "नमस्ते मैं राहुल हूँ"
   */
  public extractGreetingAndName(
    text: string,
    language: 'en' | 'hi' | 'mr'
  ): { isGreeting: boolean; name: string | null } {
    const trimmed = text.trim();
    let name: string | null = null;
    let isGreeting = false;

    // Marathi patterns
    const mrNameMatch =
      trimmed.match(/(?:माझं|माझे|माझा)\s+नाव\s+([A-Za-z\u0900-\u097F]+)/i) ||
      trimmed.match(/(?:मी)\s+([A-Za-z\u0900-\u097F]+)\s+(?:आहे|बोलतोय|बोलतेय)/i);
    if (mrNameMatch && mrNameMatch[1]) {
      name = mrNameMatch[1].trim();
      isGreeting = true;
    }

    // Hindi patterns
    const hiNameMatch =
      trimmed.match(/(?:मेरा)\s+नाम\s+([A-Za-z\u0900-\u097F]+)/i) ||
      trimmed.match(/(?:मैं)\s+([A-Za-z\u0900-\u097F]+)\s+(?:हूँ|बोल\s*रहा|बोल\s*रही)/i);
    if (hiNameMatch && hiNameMatch[1]) {
      name = hiNameMatch[1].trim();
      isGreeting = true;
    }

    // English patterns
    const enNameMatch =
      trimmed.match(/(?:my\s+name\s+is|i\s+am|i'm)\s+([A-Za-z]+)/i);
    if (enNameMatch && enNameMatch[1]) {
      name = enNameMatch[1].trim();
      isGreeting = true;
    }

    // Common salutations
    if (
      /\b(नमस्कार|नमस्ते|हॅलो|हाय|सुप्रभात|प्रणाम|hello|hi|hey|good\s+morning|good\s+afternoon|good\s+evening)\b/i.test(
        trimmed
      )
    ) {
      isGreeting = true;
    }

    return { isGreeting, name };
  }

  /**
   * Extracts symptoms and distinguishes positive vs negated mentions with clause-level boundaries.
   * e.g., "I have cough but do not have fever" -> positive: ['cough'], negated: ['fever']
   * "मला ताप नाहीये" -> positive: [], negated: ['fever']
   */
  public extractSymptomsWithPolarity(
    text: string,
    language: 'en' | 'hi' | 'mr'
  ): { positive: string[]; negated: string[] } {
    const lower = text.toLowerCase();
    const positive: Set<string> = new Set();
    const negated: Set<string> = new Set();

    // Split text into clauses by punctuation and contrastive conjunctions
    const clauses = lower.split(/[,;.\n]|(?:\b(?:but|only|except|however|पण|परंतु|मात्र|लेकिन|मगर|किंतु)\b)/i);

    const prefixNegationRegex = /\b(?:do\s*not\s*have|don't\s*have|not\s*having|no|not|without|never|नाही|नाहीये|नहीं|नहीं\s*है)\b/i;
    const suffixNegationRegex = /\b(?:नाही|नाहीये|होत\s*नाही|नव्हता|नाहीत|नसून|नहीं|नहीं\s*है)\b/i;

    for (const clause of clauses) {
      const trimmedClause = clause.trim();
      if (!trimmedClause) continue;

      for (const [symptomId, terms] of Object.entries(SYMPTOM_LEXICON)) {
        const allTerms = [...terms.en, ...terms.hi, ...terms.mr];

        for (const term of allTerms) {
          const termLower = term.toLowerCase();
          const index = trimmedClause.indexOf(termLower);

          if (index !== -1) {
            // Check before and after the term within this specific clause
            const before = trimmedClause.slice(0, index);
            const after = trimmedClause.slice(index + termLower.length);

            const isNegated =
              prefixNegationRegex.test(before) || suffixNegationRegex.test(after);

            if (isNegated) {
              negated.add(symptomId);
            } else {
              positive.add(symptomId);
            }
            break;
          }
        }
      }
    }

    // Explicitly negated symptoms cannot be in positive
    for (const neg of negated) {
      positive.delete(neg);
    }

    // If a symptom is explicitly negated, remove it from positive
    for (const neg of negated) {
      positive.delete(neg);
    }

    return {
      positive: Array.from(positive),
      negated: Array.from(negated),
    };
  }

  /**
   * Check if patient input is asking a general health question or seeking advice.
   */
  public isGeneralHealthQuery(text: string): boolean {
    const lower = text.toLowerCase();
    return (
      /(?:what\s+should\s+i|can\s+i\s+take|is\s+it\s+safe|how\s+to\s+cure|home\s+remedy|काय\s+खावे|गोळी\s+घ्यावी|उपाय|क्या\s+खाना|दवा\s+लेनी)/i.test(
        lower
      ) && !/(?:i\s+have|मला\s+आहे|मुझे\s+है)/i.test(lower)
    );
  }

  /**
   * Check if user explicitly signals completion of symptoms.
   */
  public isCompletionCue(text: string): boolean {
    const lower = text.toLowerCase().trim();
    return /^(?:that's\s*all|nothing\s*else|no\s*other|done|finished|एवढेच\s*आहे|आणखी\s*काही\s*नाही|बस\s*यही\s*है|और\s*कुछ\s*नहीं)[!.\s]*$/i.test(
      lower
    );
  }

  /**
   * Dynamic Conversational State Machine Handler.
   */
  public async handleDialogue(req: VoiceDialogueRequest): Promise<VoiceDialogueResponse> {
    const text = req.text.trim();
    const lang = req.language || 'en';
    const sessionId = req.sessionId || `sess-${Date.now()}`;

    // 1. SAFETY CONTROLLER: Emergency check FIRST and INDEPENDENT of LLM
    const emergencyCheck = this.evaluateEmergencySigns(text, lang);
    if (emergencyCheck.isEmergency) {
      logger.warn({ flags: emergencyCheck.flags, text }, 'Emergency warning sign detected during voice dialogue');
      void this.persistAndEmitScreeningActivity({
        sessionId,
        isEmergency: true,
        riskTier: 'HIGH',
        language: lang,
        symptoms: [],
        emergencyFlags: emergencyCheck.flags,
        specialty: 'Emergency Medicine',
        rawText: text,
      });
      return {
        sessionId,
        isEmergency: true,
        emergencyFlags: emergencyCheck.flags,
        extractedSymptoms: [],
        negatedSymptoms: req.negatedSymptoms || [],
        patientName: req.patientName,
        intent: 'emergency',
        followUpQuestion: null,
        isFinished: true,
        candidateCategory: null,
        riskTier: 'HIGH',
        recommendedSpecialty: 'Emergency Medicine',
        guidanceText:
          lang === 'mr'
            ? 'तात्काळ वैद्यकीय लक्ष आवश्यक आहे! छातीत तीव्र वेदना किंवा श्वास घेण्यास अडथळा ही तातडीची चिन्हे असू शकतात. जवळच्या रुग्णालयात किंवा प्राथमिक आरोग्य केंद्रात (PHC) त्वरित संपर्क साधा.'
            : lang === 'hi'
            ? 'तत्काल चिकित्सा सहायता आवश्यक है! सीने में दर्द या सांस लेने में कठिनाई आपातकालीन लक्षण हो सकते हैं। तुरंत नजदीकी अस्पताल या प्राथमिक स्वास्थ्य केंद्र (PHC) से संपर्क करें।'
            : 'Immediate emergency medical care required! Chest pain, severe breathlessness or syncope are red-flag warnings. Please contact the nearest hospital or PHC immediately.',
        modelVersion: 'multilingual-emergency-rules-v1',
      };
    }

    // 2. Extract deterministic cues: greeting, polarity, completion
    const greetingInfo = this.extractGreetingAndName(text, lang);
    const polarity = this.extractSymptomsWithPolarity(text, lang);
    const currentPositive = new Set(req.currentSymptoms || []);
    const currentNegated = new Set(req.negatedSymptoms || []);

    // Merge newly identified positive and negated symptoms
    polarity.positive.forEach((s) => {
      currentPositive.add(s);
      currentNegated.delete(s); // If previously negated but now reported, update polarity
    });

    polarity.negated.forEach((s) => {
      currentNegated.add(s);
      currentPositive.delete(s); // Negation removes symptom from active positive list
    });

    const isDirectNegationAnswer = /^(?:no|nope|नाही|नाहीये|नहीं)[!.\s]*$/i.test(text);
    const isDirectAffirmationAnswer = /^(?:yes|yeah|होय|हो|हाँ|हां)[!.\s]*$/i.test(text);

    // If answering the previous question directly with "No"
    const lastQuestionId = (req.questionHistory && req.questionHistory.length > 0)
      ? req.questionHistory[req.questionHistory.length - 1]
      : null;

    if (isDirectNegationAnswer && lastQuestionId) {
      currentNegated.add(lastQuestionId);
    } else if (isDirectAffirmationAnswer && lastQuestionId) {
      currentPositive.add(lastQuestionId);
    }

    let patientName = greetingInfo.name || req.patientName;

    // 3. Check for Groq LLM assistance for context-aware interpretation
    let llmSuggestedFollowUp: string | null = null;
    let llmConversationalReply: string | null = null;
    let llmIntent: string | null = null;
    let llmIsReady = false;

    if (env.GROQ_API_KEY) {
      const groqResult = await this.queryGroqDialogue(
        text,
        lang,
        Array.from(currentPositive),
        Array.from(currentNegated),
        patientName || null,
        req.conversationHistory || []
      );

      if (groqResult) {
        if (groqResult.patient_name && !patientName) {
          patientName = groqResult.patient_name;
        }
        if (groqResult.new_positive_symptoms && groqResult.new_positive_symptoms.length > 0) {
          groqResult.new_positive_symptoms.forEach((s) => {
            currentPositive.add(s);
            currentNegated.delete(s);
          });
        }
        if (groqResult.new_negated_symptoms && groqResult.new_negated_symptoms.length > 0) {
          groqResult.new_negated_symptoms.forEach((s) => {
            currentNegated.add(s);
            currentPositive.delete(s);
          });
        }
        llmSuggestedFollowUp = groqResult.follow_up_question;
        llmConversationalReply = groqResult.conversational_reply;
        llmIntent = groqResult.intent;
        llmIsReady = Boolean(groqResult.is_ready_for_assessment);
      }
    }

    const finalPositiveSymptoms = Array.from(currentPositive);
    const finalNegatedSymptoms = Array.from(currentNegated);

    // 4. Intent Classification & Adaptive Branching
    // CASE A: Greeting or Introduction without any symptoms
    if (
      (greetingInfo.isGreeting || llmIntent === 'greeting_or_intro') &&
      finalPositiveSymptoms.length === 0
    ) {
      let greetingReply = '';
      if (lang === 'mr') {
        greetingReply = patientName
          ? `नमस्कार ${patientName}जी! मी तुमचा हेल्थसेतू तपासणी सहाय्यक आहे. तुम्हाला सध्या कोणता त्रास किंवा कोणती लक्षणे जाणवत आहेत ते कृपया सांगा.`
          : 'नमस्कार! मी तुमचा हेल्थसेतू तपासणी सहाय्यक आहे. तुम्हाला सध्या काय त्रास होत आहे ते कृपया सांगा किंवा खाली टाईप करा.';
      } else if (lang === 'hi') {
        greetingReply = patientName
          ? `नमस्ते ${patientName}जी! मैं आपका हेल्थसेतु सहायक हूँ। कृपया बताएं कि आपको क्या तकलीफ या लक्षण महसूस हो रहे हैं।`
          : 'नमस्ते! मैं आपका हेल्थसेतु सहायक हूँ। कृपया बताएं कि आपको क्या समस्या या तकलीफ हो रही है।';
      } else {
        greetingReply = patientName
          ? `Hello ${patientName}! I am your HealthSetu screening assistant. Please describe what symptoms or health concerns you are experiencing.`
          : 'Hello! I am your HealthSetu screening assistant. Please describe your health concern by voice or typing below.';
      }

      return {
        sessionId,
        isEmergency: false,
        emergencyFlags: [],
        extractedSymptoms: [],
        negatedSymptoms: finalNegatedSymptoms,
        patientName: patientName || undefined,
        intent: 'greeting_or_intro',
        followUpQuestion: null,
        isFinished: false,
        candidateCategory: null,
        riskTier: 'LOW',
        recommendedSpecialty: 'General Physician',
        guidanceText: llmConversationalReply || greetingReply,
        modelVersion: 'voice-dialogue-adaptive-v2',
      };
    }

    // CASE B: General Health Query
    if (this.isGeneralHealthQuery(text) || llmIntent === 'general_query') {
      let generalReply = '';
      if (lang === 'mr') {
        generalReply =
          'सामान्य माहिती: ताप किंवा अंगदुखीत विश्रांती आणि भरपूर पाणी घेणे आवश्यक असते. औषधांसाठी नेहमी डॉक्टरांचा सल्ला घ्या. आता तुमची तपासणी सुरू ठेवण्यासाठी, तुम्हाला सध्या काय त्रास होत आहे ते सांगा.';
      } else if (lang === 'hi') {
        generalReply =
          'सामान्य सलाह: बुखार या कमजोरी में आराम और पर्याप्त पानी पीना आवश्यक है। किसी भी दवा के लिए डॉक्टर से सलाह लें। अपनी स्क्रीनिंग जारी रखने के लिए, कृपया बताएं कि आपको क्या लक्षण हैं।';
      } else {
        generalReply =
          'General Guidance: For fever or body ache, adequate rest and hydration are advised. Always consult a clinician before taking medication. To continue your screening, please describe any symptoms you are currently experiencing.';
      }

      return {
        sessionId,
        isEmergency: false,
        emergencyFlags: [],
        extractedSymptoms: finalPositiveSymptoms,
        negatedSymptoms: finalNegatedSymptoms,
        patientName: patientName || undefined,
        intent: 'general_query',
        followUpQuestion: null,
        isFinished: false,
        candidateCategory: null,
        riskTier: 'LOW',
        recommendedSpecialty: 'General Physician',
        guidanceText: llmConversationalReply || generalReply,
        modelVersion: 'voice-dialogue-adaptive-v2',
      };
    }

    // CASE C: Pure Negation or Correction with No Remaining Symptoms
    if (
      (isDirectNegationAnswer || polarity.negated.length > 0) &&
      finalPositiveSymptoms.length === 0
    ) {
      let negationReply = '';
      if (lang === 'mr') {
        negationReply = 'समजले, नमूद केलेले लक्षण नाही हे नोंदवले आहे. तुम्हाला शरीरात इतर कोणताही त्रास किंवा लक्षण जाणवत आहे का?';
      } else if (lang === 'hi') {
        negationReply = 'समझ गया, यह लक्षण नहीं है। क्या आपको शरीर में कोई अन्य तकलीफ या लक्षण महसूस हो रहा है?';
      } else {
        negationReply = 'Understood, noted that this symptom is absent. Are you experiencing any other symptoms or discomfort?';
      }

      return {
        sessionId,
        isEmergency: false,
        emergencyFlags: [],
        extractedSymptoms: [],
        negatedSymptoms: finalNegatedSymptoms,
        patientName: patientName || undefined,
        intent: 'correction_or_negation',
        followUpQuestion: null,
        isFinished: false,
        candidateCategory: null,
        riskTier: 'LOW',
        recommendedSpecialty: 'General Physician',
        guidanceText: llmConversationalReply || negationReply,
        modelVersion: 'voice-dialogue-adaptive-v2',
      };
    }

    // CASE D: Unclear or Unrelated Input with 0 Symptoms
    if (finalPositiveSymptoms.length === 0) {
      let clarificationReply = '';
      if (lang === 'mr') {
        clarificationReply = 'मला नीट समजले नाही. कृपया तुम्हाला होत असलेल्या शारीरिक त्रासाविषयी (जसे ताप, खोकला, अंगदुखी) सांगा.';
      } else if (lang === 'hi') {
        clarificationReply = 'मैं पूरी तरह समझ नहीं पाया। कृपया अपने शारीरिक कष्ट (जैसे बुखार, खांसी, दर्द) के बारे में बताएं।';
      } else {
        clarificationReply = 'I could not identify any symptoms from that description. Please describe what physical symptoms (such as fever, cough, or pain) you are feeling.';
      }

      return {
        sessionId,
        isEmergency: false,
        emergencyFlags: [],
        extractedSymptoms: [],
        negatedSymptoms: finalNegatedSymptoms,
        patientName: patientName || undefined,
        intent: 'unclear_or_unrelated',
        followUpQuestion: null,
        isFinished: false,
        candidateCategory: null,
        riskTier: 'LOW',
        recommendedSpecialty: 'General Physician',
        guidanceText: llmConversationalReply || clarificationReply,
        modelVersion: 'voice-dialogue-adaptive-v2',
      };
    }

    // 5. COMPLETION CONTROLLER: Has Symptoms Identified
    // Find unasked follow-up questions for identified positive symptoms
    const askedSet = new Set(req.questionHistory || []);
    const availableFollowUps = finalPositiveSymptoms.filter(
      (s) => !askedSet.has(s) && FOLLOW_UP_QUESTIONS[s]
    );

    const isExplicitlyDone = this.isCompletionCue(text) || llmIsReady;
    const questionsAnsweredCount = Object.keys(req.answeredQuestions || {}).length;

    // We finalize ONLY when:
    // (a) User explicitly says they are done, OR
    // (b) At least one relevant follow-up question has been answered and no more critical questions remain, OR
    // (c) LLM assessment eligibility confirms all required information is gathered.
    const isEligibleToFinalize =
      finalPositiveSymptoms.length > 0 &&
      (isExplicitlyDone || (questionsAnsweredCount >= 1 && availableFollowUps.length === 0));

    if (!isEligibleToFinalize && availableFollowUps.length > 0) {
      // Pick next symptom to investigate
      const nextSymptom = availableFollowUps[0];
      const qItem = FOLLOW_UP_QUESTIONS[nextSymptom];
      const qText =
        llmSuggestedFollowUp ||
        (qItem ? qItem[lang] || qItem.en : 'Do you experience any other severe discomfort?');

      return {
        sessionId,
        isEmergency: false,
        emergencyFlags: [],
        extractedSymptoms: finalPositiveSymptoms,
        negatedSymptoms: finalNegatedSymptoms,
        patientName: patientName || undefined,
        intent: 'symptom_report',
        followUpQuestion: {
          questionId: nextSymptom,
          symptomId: nextSymptom,
          text: qText,
        },
        isFinished: false,
        candidateCategory: null,
        riskTier: 'LOW',
        recommendedSpecialty: 'General Physician',
        guidanceText:
          lang === 'mr'
            ? 'कृपया या प्रश्नाचे उत्तर होय किंवा नाही असे द्या.'
            : lang === 'hi'
            ? 'कृपया इस प्रश्न का उत्तर हां या ना में दें।'
            : 'Please answer yes, no, or describe any additional details.',
        modelVersion: env.GROQ_API_KEY ? 'groq-qwen3.8-27b' : 'voice-dialogue-adaptive-v2',
      };
    }

    // 6. Screening Complete -> Invoke Research ML Candidate Classifier
    const aggregateSymptomText = finalPositiveSymptoms.join(' ') + ' ' + text;
    const candidateResult = await screeningService.screenWithExistingModel(aggregateSymptomText, lang);

    const riskTier: RiskTier = candidateResult.risk_tier || 'LOW';
    const specialty = candidateResult.recommended_specialty || 'General Physician';
    const candidateCategory = candidateResult.possible_category;

    // Conservative localized clinical guidance message
    let guidanceText = '';
    if (lang === 'mr') {
      guidanceText =
        riskTier === 'HIGH'
          ? 'तुमच्या लक्षणांनुसार डॉक्टरांचा त्वरित सल्ला घेणे आवश्यक आहे. तुम्ही खालील बटणावरून तात्काळ डॉक्टरांशी व्हिडिओ किंवा फोन सल्लामसलत सुरू करू शकता.'
          : 'तपासणी पूर्ण झाली आहे. ही लक्षणे सामान्य प्राथमिक तपासणीवर आधारित आहेत. अचूक उपचारांसाठी डॉक्टरांशी संपर्क साधा.';
    } else if (lang === 'hi') {
      guidanceText =
        riskTier === 'HIGH'
          ? 'आपके लक्षणों के आधार पर तत्काल डॉक्टर की सलाह आवश्यक है। आप नीचे दिए गए बटन से तुरंत डॉक्टर से टेलीकंसल्टेशन शुरू कर सकते हैं।'
          : 'स्क्रीनिंग पूरी हो गई है। यह प्रारंभिक स्वास्थ्य आकलन है। सटीक निदान व उपचार हेतु डॉक्टर से परामर्श करें।';
    } else {
      guidanceText =
        riskTier === 'HIGH'
          ? 'Based on your reported symptoms, urgent medical consultation is advised. You may connect with an on-duty doctor immediately or visit your nearest primary healthcare facility.'
          : 'Screening complete. This is an early health guidance screening and not a confirmed clinical diagnosis. Please proceed to consult a doctor.';
    }

    void this.persistAndEmitScreeningActivity({
      sessionId,
      isEmergency: false,
      riskTier,
      language: lang,
      symptoms: finalPositiveSymptoms,
      emergencyFlags: candidateResult.matched_signs || [],
      specialty,
      candidateCategory,
      rawText: text,
    });

    return {
      sessionId,
      isEmergency: false,
      emergencyFlags: candidateResult.matched_signs || [],
      extractedSymptoms: finalPositiveSymptoms,
      negatedSymptoms: finalNegatedSymptoms,
      patientName: patientName || undefined,
      intent: 'ready_for_assessment',
      followUpQuestion: null,
      isFinished: true,
      candidateCategory,
      riskTier,
      recommendedSpecialty: specialty,
      guidanceText,
      modelVersion: candidateResult.model_version || 'research-linearsvc-tfidf-clean-grouped-v1',
    };
  }

  /**
   * Persists completed screening to MongoDB with jurisdiction scope and emits real-time event to NGO observers.
   */
  private async persistAndEmitScreeningActivity(params: {
    sessionId: string;
    isEmergency: boolean;
    riskTier: RiskTier;
    language: 'en' | 'hi' | 'mr';
    symptoms: string[];
    emergencyFlags: string[];
    specialty: string;
    candidateCategory?: string | null;
    rawText: string;
  }): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    try {
      const patient = await User.findOne({ role: 'PATIENT' });
      const asha = await User.findOne({ role: 'ASHA' });
      const patientId = patient?._id || new mongoose.Types.ObjectId();
      const submittedBy = asha?._id || new mongoose.Types.ObjectId();

      const clientId = `scr-live-${params.sessionId.replace(/[^a-zA-Z0-9]/g, '').slice(-8) || Date.now()}`;
      const now = new Date();

      await Screening.findOneAndUpdate(
        { clientId },
        {
          clientId,
          patientId,
          submittedBy,
          language: params.language,
          symptoms: params.symptoms.length > 0 ? params.symptoms : ['general_discomfort'],
          answers: [],
          severity: params.riskTier === 'HIGH' ? 'severe' : params.riskTier === 'MEDIUM' ? 'moderate' : 'mild',
          emergencyFlags: params.emergencyFlags,
          riskTier: params.riskTier,
          isEmergency: params.isEmergency,
          possibleConditions: params.candidateCategory ? [{ name: params.candidateCategory, probability: 0.88 }] : [],
          symptomGroups: ['infectious_and_systemic'],
          recommendedSpecialty: params.specialty,
          source: 'device',
          modelVersion: 'voice-dialogue-adaptive-v2',
          triageConfigVersion: '1.0.0',
          imageIds: [],
          inputMethod: 'voice',
          voiceTranscript: params.rawText,
          candidateCategory: params.candidateCategory || undefined,
          referralStatus: params.isEmergency || params.riskTier === 'HIGH' ? 'pending' : 'none',
          status: 'completed',
          district: 'DIST-PUNE-RURAL',
          villageCode: 'Khed (Rajgurunagar)',
          isOfflineSync: false,
          clientCreatedAt: now.getTime(),
          receivedAt: now.getTime(),
          createdAt: now,
          updatedAt: now,
        },
        { upsert: true, returnDocument: 'after' }
      );

      const suffix = (params.sessionId.replace(/[^a-zA-Z0-9]/g, '').slice(-4) || 'LIVE').toUpperCase();
      const sessionRef = `SCR-${suffix.padStart(4, '0')}`;

      realtimeService.emitNgoActivity({
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: params.isEmergency ? 'screening.urgent_flagged' : 'screening.completed',
        sessionRef,
        timestamp: Date.now(),
        riskTier: params.riskTier,
        language: params.language,
        inputMethod: 'voice',
        district: 'DIST-PUNE-RURAL',
        summary: params.isEmergency
          ? `Emergency flagged: ${params.emergencyFlags.join(', ') || 'Critical signs'}`
          : `Voice screening completed: ${params.symptoms.join(', ') || 'General assessment'} (${params.riskTier} Risk)`,
      });
    } catch (e) {
      logger.warn({ err: e }, 'Failed to persist/emit live screening activity');
    }
  }

  /**
   * Queries Groq LLM (qwen/qwen3.8-27b) for context-aware interpretation and localized question formulation.
   */
  private async queryGroqDialogue(
    text: string,
    lang: 'en' | 'hi' | 'mr',
    currentSymptoms: string[],
    negatedSymptoms: string[],
    patientName: string | null,
    history: Array<{ role: 'user' | 'assistant'; text: string }>
  ): Promise<{
    intent: 'greeting_or_intro' | 'symptom_report' | 'answering_question' | 'correction_or_negation' | 'general_query' | 'unclear_or_unrelated' | 'ready_for_assessment';
    patient_name: string | null;
    new_positive_symptoms: string[];
    new_negated_symptoms: string[];
    duration: string | null;
    conversational_reply: string | null;
    follow_up_question: string | null;
    is_ready_for_assessment: boolean;
  } | null> {
    if (!env.GROQ_API_KEY) return null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const systemPrompt = `You are HealthSetu, an empathetic rural healthcare screening assistant in India.
Language: ${lang} (mr = Marathi, hi = Hindi, en = English).
Recognized clinical symptom tokens: [fever, cough, headache, vomiting, diarrhea, joint_pain, skin_rash, fatigue].

Analyze the patient statement in context of conversation history:
1. Determine intent: "greeting_or_intro" | "symptom_report" | "answering_question" | "correction_or_negation" | "general_query" | "unclear_or_unrelated" | "ready_for_assessment".
2. If patient gives their name, extract it into "patient_name".
3. Extract any newly confirmed symptoms into "new_positive_symptoms".
4. Extract any explicitly negated or absent symptoms into "new_negated_symptoms".
5. Formulate a polite, natural conversational reply in the patient's language (${lang}).
   - If they only greeted or introduced themselves (e.g. "My name is X" / "माझं नाव X"), greet them warmly by name and ask what health trouble they are facing.
   - Do NOT mark is_ready_for_assessment as true if no symptoms have been described!
6. Formulate ONE simple follow-up question if symptoms are present.

Respond STRICTLY in JSON format:
{
  "intent": "greeting_or_intro",
  "patient_name": "Niranjan",
  "new_positive_symptoms": [],
  "new_negated_symptoms": [],
  "duration": null,
  "conversational_reply": "response in ${lang}",
  "follow_up_question": null,
  "is_ready_for_assessment": false
}`;

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'qwen/qwen3.8-27b',
          messages: [
            { role: 'system', content: systemPrompt },
            ...history.slice(-4).map((h) => ({ role: h.role, content: h.text })),
            {
              role: 'user',
              content: `Patient says: "${text}"\nCurrent confirmed symptoms: [${currentSymptoms.join(
                ', '
              )}]\nNegated symptoms: [${negatedSymptoms.join(', ')}]\nKnown Patient Name: ${
                patientName || 'None'
              }`,
            },
          ],
          temperature: 0.15,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        logger.warn({ status: res.status }, 'Groq LLM returned non-200; falling back to local state machine');
        return null;
      }

      const json = (await res.json()) as any;
      const content = json.choices?.[0]?.message?.content;
      if (!content) return null;

      const parsed = JSON.parse(content);
      return {
        intent: parsed.intent || 'symptom_report',
        patient_name: parsed.patient_name || null,
        new_positive_symptoms: Array.isArray(parsed.new_positive_symptoms) ? parsed.new_positive_symptoms : [],
        new_negated_symptoms: Array.isArray(parsed.new_negated_symptoms) ? parsed.new_negated_symptoms : [],
        duration: parsed.duration || null,
        conversational_reply: typeof parsed.conversational_reply === 'string' ? parsed.conversational_reply : null,
        follow_up_question: typeof parsed.follow_up_question === 'string' ? parsed.follow_up_question : null,
        is_ready_for_assessment: Boolean(parsed.is_ready_for_assessment),
      };
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Failed to call Groq chat API; falling back to local state machine');
      return null;
    }
  }

  /**
   * Transcribe audio using free-tier Groq Whisper if configured.
   */
  public async transcribeAudio(
    audioBuffer: Buffer,
    filename: string,
    language?: string
  ): Promise<{ text: string; language: string; provider: string } | null> {
    if (!env.GROQ_API_KEY) {
      logger.info('GROQ_API_KEY not configured; client will use native browser Web Speech API');
      return null;
    }

    try {
      const formData = new FormData();
      const uint8 = new Uint8Array(audioBuffer);
      const blob = new Blob([uint8], { type: 'audio/webm' });
      formData.append('file', blob, filename || 'recording.webm');
      formData.append('model', 'whisper-large-v3-turbo');
      if (language) {
        formData.append('language', language);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.GROQ_API_KEY}`,
        },
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        logger.warn({ status: res.status }, 'Groq Whisper API returned non-200; falling back to client recognition');
        return null;
      }

      const json = (await res.json()) as any;
      return {
        text: json.text || '',
        language: language || 'en',
        provider: 'groq-whisper-large-v3-turbo',
      };
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Failed to transcribe via Groq Whisper; falling back');
      return null;
    }
  }
}

export const voiceScreeningService = new VoiceScreeningService();
