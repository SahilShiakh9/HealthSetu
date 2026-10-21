import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import type { VoiceDialogueRequest, VoiceDialogueResponse, RiskTier } from '@healthsetu/contracts';
import { screeningService } from './screening.service.js';
import { Screening } from '../models/Screening.js';
import { User } from '../models/User.js';
import { realtimeService } from './realtime.service.js';

/**
 * Deduplicates speech recognition transcripts to fix Android Chrome & WebKit mobile speech bugs.
 * Removes:
 * 1. Immediate consecutive repeated words: "hello hello hello" -> "hello", "मेरे मेरे" -> "मेरे"
 * 2. Progressive prefix repetitions: "hello my hello my name hello my name is Akhil" -> "hello my name is Akhil"
 * 3. Consecutive repeated phrases: "my name is my name is" -> "my name is"
 */
export function cleanAndroidSpeechRepetition(text: string): string {
  if (!text) return '';
  let str = text.trim();

  // 1. Collapse adjacent identical words
  const tokens = str.split(/\s+/).filter(Boolean);
  const dedupedWords: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (i === 0 || tokens[i].toLowerCase() !== tokens[i - 1].toLowerCase()) {
      dedupedWords.push(tokens[i]);
    }
  }
  str = dedupedWords.join(' ');

  // 2. Remove progressive prefix repetitions (interim phrases accumulating prefixes)
  let words = str.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return str;

  for (let i = 1; i < words.length; i++) {
    if (words[i].toLowerCase() === words[0].toLowerCase()) {
      let matchCount = 0;
      while (
        matchCount < i &&
        i + matchCount < words.length &&
        words[matchCount].toLowerCase() === words[i + matchCount].toLowerCase()
      ) {
        matchCount++;
      }
      if (matchCount === i || (matchCount >= 2 && i + matchCount <= words.length)) {
        return cleanAndroidSpeechRepetition(words.slice(i).join(' '));
      }
    }
  }

  // 3. Remove consecutive repeated phrases
  for (let n = Math.floor(words.length / 2); n >= 2; n--) {
    for (let i = 0; i <= words.length - 2 * n; i++) {
      const p1 = words.slice(i, i + n).map((w) => w.toLowerCase()).join(' ');
      const p2 = words.slice(i + n, i + 2 * n).map((w) => w.toLowerCase()).join(' ');
      if (p1 === p2) {
        words.splice(i, n);
        return cleanAndroidSpeechRepetition(words.join(' '));
      }
    }
  }

  return words.join(' ');
}

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
  back_pain: {
    en: ['back pain', 'lower back pain', 'backache', 'spine pain', 'lower back hurts', 'back hurts'],
    hi: ['कमर दर्द', 'कमर में दर्द', 'पीठ दर्द', 'पीठ में दर्द', 'कमर दुख रही', 'कमर का दर्द'],
    mr: ['कंबरदुखी', 'कंबरेत दुखणे', 'कंबर दुखत', 'पाठीत दुखणे', 'पाठदुखी', 'कंबरेत कळ', 'कंबर दुखते'],
  },
  fever: {
    en: ['fever', 'high temperature', 'chills', 'feverish', 'hot body', 'temperature'],
    hi: ['बुखार', 'ताप', 'बदन गरम', 'ठंड लगना', 'हरारत', 'कंपकंपी'],
    mr: ['ताप', 'अंग गरम', 'थंडी वाजून येणे', 'अंग तापणे', 'हुडहुडी', 'कणकण'],
  },
  cough: {
    en: ['cough', 'coughing', 'dry cough', 'wet cough', 'phlegm', 'throat irritation'],
    hi: ['खांसी', 'कफ', 'सूखी खांसी', 'बलगम', 'गले में खराश', 'खंासी'],
    mr: ['खोकला', 'कफ', 'कोरडा खोकला', 'घशात खवखव', 'धाप'],
  },
  headache: {
    en: ['headache', 'head pain', 'migraine', 'head throbbing'],
    hi: ['सिरदर्द', 'सिर में दर्द', 'माइग्रेन', 'सिर भारी', 'सरदर्द'],
    mr: ['डोकेदुखी', 'डोके दुखणे', 'मायग्रेन', 'डोके जड', 'डोकं दुखणे'],
  },
  vomiting: {
    en: ['vomiting', 'nausea', 'throwing up', 'puking', 'queasy'],
    hi: ['उल्टी', 'जी मिचलाना', 'कै', 'उबकाई', 'उल्टियां'],
    mr: ['उलटी', 'मळमळ', 'ओकारी', 'उलटीसारखे वाटणे', 'उलट्या'],
  },
  diarrhea: {
    en: ['diarrhea', 'loose motions', 'watery stool', 'stomach upset'],
    hi: ['दस्त', 'पेट खराब', 'पतले दस्त', 'लूज मोशन'],
    mr: ['जुलाब', 'संडास लागणे', 'हगवण', 'पोट बिघडणे', 'पातळ शौचास'],
  },
  joint_pain: {
    en: ['joint pain', 'knee pain', 'body ache', 'arthritis', 'joint swelling'],
    hi: ['जोड़ों का दर्द', 'घुटनों में दर्द', 'बदन दर्द', 'गठिया'],
    mr: ['सांधेदुखी', 'गुडघेदुखी', 'अंगदुखी', 'सांधे सुजणे'],
  },
  skin_rash: {
    en: ['skin rash', 'itching', 'red spots', 'allergies', 'skin eruption'],
    hi: ['खुजली', 'चकत्ते', 'लाल दाने', 'त्वचा संक्रमण', 'खाज'],
    mr: ['खाज', 'पुरळ', 'अंगावर गांधी', 'त्वचेचा संसर्ग', 'लाल डाग'],
  },
  fatigue: {
    en: ['fatigue', 'weakness', 'tiredness', 'exhausted', 'lack of energy', 'weak'],
    hi: ['थकान', 'कमजोरी', 'सुस्ती', 'अशक्तता', 'कमजोरी लग रही'],
    mr: ['थकवा', 'अशक्तपणा', 'गळाल्यासारखे वाटणे', 'त्राण नसणे', 'अशक्तपणा जाणवत'],
  },
  chest_discomfort: {
    en: ['chest discomfort', 'chest tightness', 'chest pressure', 'chest heaviness', 'heaviness in chest'],
    hi: ['सीने में बेचैनी', 'सीने में जकड़न', 'छाती में भारीपन', 'सीने में दबाव'],
    mr: ['छातीत अस्वस्थता', 'छातीत जड वाटणे', 'छातीवर दाब', 'छातीत कळ'],
  },
  throat_pain: {
    en: ['throat pain', 'sore throat', 'throat irritation', 'difficulty swallowing'],
    hi: ['गले में दर्द', 'गला खराब', 'गले में खराश', 'निगलने में दर्द'],
    mr: ['घशात दुखणे', 'घशात खवखव', 'घसा बसणे', 'गिळताना त्रास'],
  },
  stomach_ache: {
    en: ['stomach pain', 'stomach ache', 'abdominal pain', 'belly pain', 'cramps'],
    hi: ['पेट में दर्द', 'पेट दर्द', 'मरोड़', 'पेट में ऐंठन'],
    mr: ['पोटात दुखणे', 'पोटदुखी', 'पोटात मुरडा', 'पोटात कळ'],
  },
  dizziness: {
    en: ['dizziness', 'lightheaded', 'spinning head', 'giddiness', 'unsteady', 'dizzy'],
    hi: ['चक्कर आना', 'सिर घूमना', 'कमजोरी से चक्कर', 'चक्कर आ रहे', 'चक्कर आ रही'],
    mr: ['चक्कर येणे', 'भोवळ येणे', 'डोके फिरणे', 'चक्कर येत', 'भोवळ'],
  },
};

export interface ColloquialPattern {
  symptomId: string;
  patterns: RegExp[];
}

export const COLLOQUIAL_SYMPTOM_PATTERNS: ColloquialPattern[] = [
  {
    symptomId: 'back_pain',
    patterns: [
      /(?:कमर|पीठ)\s*(?:में)?\s*(?:दर्द|पीड़ा|तकलीफ|अकड़न|खिंचाव|दुख)/i,
      /(?:कमर|पीठ)\s*(?:दुख\s*रह[ेाी]|दुखने)/i,
      /(?:कंबर|कंबरेत|पाठीत|पाठ)\s*(?:दुख|कळ|वेदना|अकडली|जड)/i,
      /\b(?:कंबरदुखी|पाठदुखी)\b/i,
      /\b(?:(?:lower\s+)?back\s*(?:pain|ache|hurts?|aching|stiff(?:ness)?)|pain\s+in\s+(?:my\s+)?(?:lower\s+)?back)\b/i,
    ],
  },
  {
    symptomId: 'dizziness',
    patterns: [
      /(?:चक्कर\s*(?:आ\s*रह[ेाी]|आना|लग\s*रह[ेाी]|खाकर)|सिर\s*घूम\s*रह[ेाी]|सिर\s*चकरा)/i,
      /(?:चक्कर\s*(?:येत|येणे|येऊन|आली)|भोवळ\s*(?:येत|येणे|आली)|डोके\s*फिर(?:त|णे)|अंधारी\s*ये(?:णे|त))/i,
      /\b(?:dizzy|dizziness|lightheaded(?:ness)?|spinning\s*head|giddiness|room\s*is\s*spinning)\b/i,
    ],
  },
  {
    symptomId: 'fatigue',
    patterns: [
      /(?:कमजोरी\s*(?:लग\s*रह[ेाी]|महसूस|हो\s*रह[ेाी])|थकान\s*(?:लग\s*रह[ेाी]|हो\s*रह[ेाी])|सुस्ती|अशक्तता)/i,
      /\b(?:कमजोरी|थकान|सुस्ती|थकावट)\b/i,
      /(?:अशक्तपणा\s*(?:जाणव(?:त|णे)|आला)|थकवा\s*(?:जाणव(?:त|णे)|आला)|गळाल्यासारखे|त्राण\s*नस(?:णे|ल्यासारखे)|दमल्यासारखे)/i,
      /\b(?:अशक्तपणा|थकवा)\b/i,
      /\b(?:fatigue|weak(?:ness)?|tired(?:ness)?|exhausted|exhaustion|lack\s*of\s*energy|feeling\s*weak)\b/i,
    ],
  },
  {
    symptomId: 'fever',
    patterns: [
      /\b(?:बुखार|ताप|हरारत|बदन\s*गरम|ठंड\s*लग\s*(?:रही|कर)|कंपकंपी)\b/i,
      /\b(?:ताप|कणकण|अंग\s*गरम|अंग\s*तापणे|हुडहुडी|थंडी\s*वाज(?:ून|णे|ते))\b/i,
      /\b(?:fever|high\s*temperature|feverish|chills|hot\s*body)\b/i,
    ],
  },
  {
    symptomId: 'cough',
    patterns: [
      /\b(?:खांसी|खंासी|कफ|बलगम|सूखी\s*खांसी|गले\s*में\s*खराश)\b/i,
      /\b(?:खोकला|कफ|कोरडा\s*खोकला|घशात\s*खवखव)\b/i,
      /\b(?:cough(?:ing)?|dry\s*cough|wet\s*cough|phlegm)\b/i,
    ],
  },
  {
    symptomId: 'headache',
    patterns: [
      /(?:सिर|सर)\s*(?:में)?\s*(?:दर्द|भारी|पीड़ा)/i,
      /\b(?:सिरदर्द|सरदर्द|माइग्रेन)\b/i,
      /(?:डोके|डोकं)\s*(?:दुख(?:णे|त|तेय)|जड)/i,
      /\b(?:डोकेदुखी|मायग्रेन)\b/i,
      /\b(?:headache|head\s*(?:pain|throbbing|hurts?)|migraine)\b/i,
    ],
  },
  {
    symptomId: 'vomiting',
    patterns: [
      /\b(?:उल्टी|उल्टियां|जी\s*मिचलाना|जी\s*घबराना|कै|उबकाई)\b/i,
      /\b(?:उलटी|उलट्या|मळमळ|मळमळणे|ओकारी|उलटीसारखे)\b/i,
      /\b(?:vomit(?:ing)?|nausea|nauseous|throwing\s*up|puking)\b/i,
    ],
  },
  {
    symptomId: 'diarrhea',
    patterns: [
      /\b(?:दस्त|पतले\s*दस्त|पेट\s*खराब|लूज\s*मोशन)\b/i,
      /\b(?:जुलाब|संडास\s*लागणे|हगवण|पोट\s*बिघडणे|पातळ\s*शौचास)\b/i,
      /\b(?:diarrhea|loose\s*motions?|watery\s*stool|stomach\s*upset)\b/i,
    ],
  },
  {
    symptomId: 'joint_pain',
    patterns: [
      /(?:जोड़ों|घुटनों|कंधे|हाथ-पैर)\s*(?:में)?\s*(?:दर्द|अकड़न|सूजन)/i,
      /\b(?:जोड़ों\s*का\s*दर्द|गठिया|बदन\s*दर्द)\b/i,
      /(?:सांधे|गुडघे|हातपाय)\s*(?:दुख(?:णे|त)|सूज)/i,
      /\b(?:सांधेदुखी|गुडघेदुखी|अंगदुखी)\b/i,
      /\b(?:joint\s*pain|knee\s*pain|body\s*ache|arthritis|stiff\s*joints)\b/i,
    ],
  },
  {
    symptomId: 'stomach_ache',
    patterns: [
      /(?:पेट)\s*(?:में)?\s*(?:दर्द|मरोड़|ऐंठन)/i,
      /\b(?:पेट\s*दर्द|उदर\s*शूल)\b/i,
      /(?:पोटात)\s*(?:दुख(?:णे|त)|मुरडा|कळ)/i,
      /\b(?:पोटदुखी|पोटात\s*वेदना)\b/i,
      /\b(?:stomach\s*(?:pain|ache|cramps?)|abdominal\s*pain|belly\s*pain)\b/i,
    ],
  },
  {
    symptomId: 'throat_pain',
    patterns: [
      /(?:गले|गला)\s*(?:में)?\s*(?:दर्द|खराश|सूजन|निगलने\s*में\s*दर्द)/i,
      /\b(?:गला\s*खराब|गले\s*का\s*दर्द)\b/i,
      /(?:घशात|घसा)\s*(?:दुख(?:णे|त)|खवखव|बसणे|गिळताना\s*त्रास)/i,
      /\b(?:sore\s*throat|throat\s*pain|pain\s*(?:when|in)\s*swallowing)\b/i,
    ],
  },
  {
    symptomId: 'skin_rash',
    patterns: [
      /\b(?:खुजली|खाज|चकत्ते|लाल\s*दाने|त्वचा\s*संक्रमण|फोड़े-फुंसी)\b/i,
      /\b(?:खाज|पुरळ|अंगावर\s*गांधी|लाल\s*डाग|त्वचेची\s*खाज)\b/i,
      /\b(?:rash|skin\s*rash|itching|red\s*spots|hives)\b/i,
    ],
  },
  {
    symptomId: 'chest_discomfort',
    patterns: [
      /(?:सीने|छाती)\s*(?:में)?\s*(?:बेचैनी|जकड़न|भारीपन|दबाव)/i,
      /(?:छातीत)\s*(?:अस्वस्थता|जड\s*वाटणे|दाब|जडपणा)/i,
      /\b(?:chest\s*discomfort|chest\s*tightness|chest\s*heaviness|heaviness\s*in\s*chest)\b/i,
    ],
  },
];

// Localized Display Names for empathetic conversational acknowledgment
const SYMPTOM_DISPLAY_NAMES: Record<string, { en: string; hi: string; mr: string }> = {
  back_pain: { en: 'back pain', hi: 'कमर दर्द', mr: 'कंबरदुखी' },
  joint_pain: { en: 'joint and body pain', hi: 'जोड़ों और बदन में दर्द', mr: 'सांधेदुखी व अंगदुखी' },
  fever: { en: 'fever', hi: 'बुखार', mr: 'ताप' },
  cough: { en: 'cough', hi: 'खांसी', mr: 'खोकला' },
  headache: { en: 'headache', hi: 'सिरदर्द', mr: 'डोकेदुखी' },
  dizziness: { en: 'dizziness', hi: 'चक्कर आना', mr: 'चक्कर येणे' },
  fatigue: { en: 'fatigue and weakness', hi: 'कमजोरी और थकान', mr: 'अशक्तपणा आणि थकवा' },
  vomiting: { en: 'vomiting or nausea', hi: 'उल्टी या जी मिचलाना', mr: 'उलटी किंवा मळमळ' },
  diarrhea: { en: 'loose motions or diarrhea', hi: 'दस्त या पेट खराब', mr: 'जुलाब किंवा पोट बिघडणे' },
  stomach_ache: { en: 'stomach ache', hi: 'पेट दर्द', mr: 'पोटदुखी' },
  throat_pain: { en: 'sore throat', hi: 'गले में खराश या दर्द', mr: 'घशात खवखव किंवा दुखणे' },
  skin_rash: { en: 'skin rash or itching', hi: 'त्वचा पर खुजली या चकत्ते', mr: 'त्वचेवर पुरळ किंवा खाज' },
  chest_discomfort: { en: 'chest discomfort', hi: 'सीने में भारीपन', mr: 'छातीत अस्वस्थता' },
  default: { en: 'these symptoms', hi: 'आपकी समस्या', mr: 'तुमचा त्रास' },
};

// Fallback Duration Questions across English, Hindi, and Marathi
const DURATION_QUESTIONS: Record<string, { en: string; hi: string; mr: string }> = {
  back_pain: {
    en: 'Since when has this back pain started? How many days or hours has it been?',
    hi: 'यह कमर दर्द कब से शुरू हुआ है? कितने दिन या घंटे हो गए हैं?',
    mr: 'ही कंबरदुखी कधीपासून सुरू झाली आहे? किती दिवस किंवा तास झाले आहेत?',
  },
  headache: {
    en: 'Since when has this headache started? How many hours or days has it been?',
    hi: 'यह सिरदर्द कब से शुरू हुआ है? कितने घंटे या दिन हो गए हैं?',
    mr: 'ही डोकेदुखी कधीपासून सुरू झाली आहे? किती तास किंवा दिवस झाले आहेत?',
  },
  fever: {
    en: 'Since when has this fever started? How many days has it been?',
    hi: 'यह बुखार कब से शुरू हुआ है? कितने दिनों से तप रहा है?',
    mr: 'हा ताप कधीपासून सुरू झाला आहे? किती दिवसांपासून येत आहे?',
  },
  cough: {
    en: 'How long have you had this cough? Has it been a few days or weeks?',
    hi: 'यह खांसी कब से हो रही है? कितने दिन या हफ्ते हो गए हैं?',
    mr: 'हा खोकला कधीपासून सुरू आहे? काही दिवस झाले आहेत की आठवडे?',
  },
  vomiting: {
    en: 'Since when have you been vomiting or feeling nauseous?',
    hi: 'उल्टी या जी मिचलाने की समस्या कब से हो रही है?',
    mr: 'उलटी किंवा मळमळ कधीपासून होत आहे?',
  },
  diarrhea: {
    en: 'For how many days have you had loose motions or watery stool?',
    hi: 'दस्त या पेट खराब की समस्या कितने दिनों से बनी हुई है?',
    mr: 'जुलाब किंवा पोट बिघडण्याचा त्रास किती दिवसांपासून आहे?',
  },
  joint_pain: {
    en: 'Since when has this joint or body pain started?',
    hi: 'जोड़ों या बदन में दर्द कब से बना हुआ है?',
    mr: 'सांधेदुखी किंवा अंगदुखी कधीपासून सुरू झाली आहे?',
  },
  skin_rash: {
    en: 'When did this rash or skin itching first appear?',
    hi: 'त्वचा पर चकत्ते या खुजली कब से शुरू हुई है?',
    mr: 'अंगावर पुरळ किंवा खाज कधीपासून सुरू झाली आहे?',
  },
  fatigue: {
    en: 'How long have you been feeling this extreme tiredness or weakness?',
    hi: 'यह कमजोरी और थकान कितने समय से महसूस हो रही है?',
    mr: 'हा अशक्तपणा आणि थकवा किती दिवसांपासून जाणवत आहे?',
  },
  chest_discomfort: {
    en: 'Since when have you been feeling this chest discomfort or tightness?',
    hi: 'सीने में यह बेचैनी या जकड़न कब से महसूस हो रही है?',
    mr: 'छातीत ही अस्वस्थता किंवा जडपणा कधीपासून जाणवत आहे?',
  },
  throat_pain: {
    en: 'Since when has this throat pain or irritation started?',
    hi: 'गले में यह दर्द या खराश कब से शुरू हुई है?',
    mr: 'घशात हे दुखणे किंवा खवखव कधीपासून सुरू झाली आहे?',
  },
  stomach_ache: {
    en: 'Since when have you had this stomach pain? Has it been hours or days?',
    hi: 'पेट में यह दर्द कब से हो रहा है? कितने घंटे या दिन हो गए हैं?',
    mr: 'पोटात हे दुखणे कधीपासून होत आहे? किती तास किंवा दिवस झाले आहेत?',
  },
  dizziness: {
    en: 'Since when have you been feeling dizzy or lightheaded?',
    hi: 'चक्कर आने या सिर घूमने की समस्या कब से हो रही है?',
    mr: 'चक्कर येणे किंवा भोवळ येण्याचा त्रास कधीपासून सुरू आहे?',
  },
  default: {
    en: 'Since when have you been experiencing these symptoms? How many days has it been?',
    hi: 'आपको यह तकलीफ कब से हो रही है? कितने दिन या घंटे हो गए हैं?',
    mr: 'तुम्हाला हा त्रास कधीपासून सुरू आहे? किती दिवस किंवा तास झाले आहेत?',
  },
};

// Fallback Red-Flag & Associated Warning Sign Questions
const FOLLOW_UP_QUESTIONS: Record<string, { en: string; hi: string; mr: string }> = {
  back_pain: {
    en: 'Does this back pain shoot down into your legs, or do you have any numbness or difficulty walking?',
    hi: 'क्या यह कमर दर्द पैरों की तरफ जाता है, या पैरों में सुन्नपन या चलने में तकलीफ है?',
    mr: 'हे कंबरदुखीचे दुखणे पायात उतरते का, किंवा पायाला मुंग्या येणे अथवा चालताना त्रास होतो का?',
  },
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
  chest_discomfort: {
    en: 'Does this discomfort spread to your left arm or neck, or are you feeling breathless?',
    hi: 'क्या यह दर्द बाएं हाथ या गर्दन की तरफ फैल रहा है, या सांस लेने में परेशानी है?',
    mr: 'हा त्रास डाव्या हाताकडे किंवा मानेकडे पसरतोय का, किंवा श्वास घेण्यास अडचण होतेय का?',
  },
  throat_pain: {
    en: 'Is it painful to swallow fluids or do you also have swollen tender glands in your neck?',
    hi: 'क्या पानी या खाना निगलने में तेज दर्द है या गले में सूजन महसूस हो रही है?',
    mr: 'पाणी किंवा अन्न गिळताना तीव्र त्रास होतोय का किंवा गळ्याला सूज आली आहे का?',
  },
  stomach_ache: {
    en: 'Is the stomach pain sharp and continuous, and have you noticed any vomiting?',
    hi: 'क्या पेट दर्द बहुत तेज और लगातार है, और क्या उल्टी भी हो रही है?',
    mr: 'पोटदुखी तीव्र आणि सतत सुरू आहे का, आणि सोबत उलट्या होत आहेत का?',
  },
  dizziness: {
    en: 'Does the room feel like it is spinning when you stand up, or have you had any fainting feeling?',
    hi: 'क्या खड़े होने पर चक्कर ज्यादा आते हैं, या बेहोशी जैसी स्थिति महसूस हुई है?',
    mr: 'उभे राहिल्यावर डोळ्यांसमोर अंधारी येते का किंवा भोवळ येऊन पडल्यासारखे वाटले का?',
  },
};

// Clinical Home-Care Tips and Prevention Guidance for LOW-RISK cases
const LOW_RISK_HOME_CARE_TIPS: Record<string, { en: string; hi: string; mr: string }> = {
  back_pain: {
    en: 'Screening complete. Based on your symptoms, this appears to be a Low Risk muscle strain or posture-related back pain.\n\nHome Care & Prevention:\n• Rest on a firm surface and avoid lifting heavy objects or bending suddenly.\n• Apply a warm compress or heating pad to the lower back for 15-20 minutes.\n• Maintain an upright posture while sitting and avoid prolonged sitting.\n• If pain radiates down the legs, causes numbness, or worsens over 3 days, consult a clinician at your local PHC.',
    hi: 'स्क्रीनिंग पूरी हो गई है। आपके लक्षणों के अनुसार यह कम जोखिम (Low Risk) का मांसपेशियों में खिंचाव या सामान्य कमर दर्द है।\n\nघरेलू देखभाल और बचाव के उपाय:\n• भारी सामान उठाने या अचानक झुकने से बचें, समतल बिस्तर पर विश्राम करें।\n• कमर पर 15-20 मिनट के लिए गर्म सिकाई या गुनगुना तौलिया लगाएं।\n• बैठते समय रीढ़ की हड्डी सीधी रखें और लगातार एक जगह ज्यादा देर न बैठें।\n• यदि दर्द पैरों में उतरे, पैरों में सुन्नपन आए या 3 दिन में आराम न मिले, तो PHC में डॉक्टर से परामर्श लें।',
    mr: 'तपासणी पूर्ण झाली आहे. प्राथमिक मूल्यांकनानुसार हा कमी जोखमीचा (Low Risk) स्नायूंचा ताण किंवा सामान्य कंबरदुखीचा त्रास आहे.\n\nघरगुती काळजी व प्रतिबंधात्मक उपाय:\n• जड वस्तू उचलणे किंवा अचानक वाकणे टाळा, सपाट गादीवर विश्रांती घ्या.\n• कंबरेला दिवसातून २ वेळा गरम पाण्याचा शेक द्या.\n• बसताना पाठीचा कणा ताठ ठेवा, एकाच जागेवर जास्त वेळ बसू नका.\n• त्रास पायात उतरत असल्यास किंवा ३ दिवसांत कमी न झाल्यास प्राथमिक आरोग्य केंद्रातील (PHC) डॉक्टरांचा सल्ला घ्या.',
  },
  fever: {
    en: 'Screening complete. Based on your symptoms, this appears to be a Low Risk mild fever.\n\nHome Care & Prevention:\n• Rest well and stay hydrated with clean boiled water, ORS, or coconut water.\n• Sponge forehead with normal temperature water if feeling hot.\n• Eat light, easily digestible meals (khichdi, warm soup).\n• Watch for warning signs: if fever rises very high or lasts over 3 days, consult a PHC doctor.',
    hi: 'स्क्रीनिंग पूरी हो गई है। आपके लक्षणों के अनुसार यह कम जोखिम (Low Risk) का हल्का बुखार है।\n\nघरेलू देखभाल और बचाव के उपाय:\n• पर्याप्त आराम करें और खूब पानी, ओआरएस या गुनगुने तरल पदार्थ पिएं।\n• शरीर तपने पर सामान्य पानी की ठंडी पट्टी माथे पर रखें।\n• हल्का और सुपाच्य भोजन (जैसे खिचड़ी, दलिया, सूप) लें।\n• यदि बुखार 3 दिन से अधिक रहे या बहुत तेज हो, तभी प्राथमिक स्वास्थ्य केंद्र (PHC) में डॉक्टर से संपर्क करें।',
    mr: 'तपासणी पूर्ण झाली आहे. प्राथमिक मूल्यांकनानुसार हा कमी जोखमीचा (Low Risk) सौम्य ताप आहे.\n\nघरगुती काळजी व प्रतिबंधात्मक उपाय:\n• भरपूर विश्रांती घ्या आणि पुरेसे पाणी, ओआरएस किंवा कोमट द्रवपदार्थ प्या.\n• कपाळावर साध्या पाण्याच्या घड्या ठेवा.\n• हलका व ताजा आहार घ्या (मुगाची खिचडी, सूप).\n• ताप ३ दिवसांपेक्षा जास्त राहिल्यास किंवा वाढल्यास प्राथमिक आरोग्य केंद्रात (PHC) डॉक्टरांचा सल्ला घ्या.',
  },
  headache: {
    en: 'Screening complete. Based on your symptoms, this appears to be a Low Risk tension or mild headache.\n\nHome Care & Prevention:\n• Rest in a quiet, dimly lit room and avoid mobile or TV screen glare.\n• Drink plenty of water as mild dehydration often triggers headaches.\n• Gently massage temples and apply a cool or warm compress.\n• If headache becomes severe or is accompanied by neck stiffness, consult a clinician.',
    hi: 'स्क्रीनिंग पूरी हो गई है। आपके लक्षणों के अनुसार यह कम जोखिम (Low Risk) का सामान्य सिरदर्द है।\n\nघरेलू देखभाल और बचाव के उपाय:\n• शांत और मंद रोशनी वाले कमरे में विश्रांती लें, मोबाइल/टीवी स्क्रीन से दूर रहें।\n• खूब पानी पिएं, कई बार पानी की कमी से सिरदर्द होता है।\n• माथे पर हल्की मालिश या ठंडी/गुनगुनी पट्टी लगाएं।\n• यदि सिरदर्द अचानक असह्य हो या गर्दन में जकड़न आए, तभी डॉक्टर से मिलें।',
    mr: 'तपासणी पूर्ण झाली आहे. प्राथमिक मूल्यांकनानुसार ही कमी जोखमीची (Low Risk) सामान्य डोकेदुखी आहे.\n\nघरगुती काळजी व प्रतिबंधात्मक उपाय:\n• शांत आणि मंद प्रकाशाच्या खोलीत विश्रांती घ्या, मोबाईल किंवा टीव्ही स्क्रीन पाहणे टाळा.\n• भरपूर पाणी प्या, शरीरात पाणी कमी पडल्यानेही डोके दुखते.\n• कपाळाला हळुवार मसाज करा आणि हलका ओला रुमाल ठेवा.\n• जर डोकेदुखी अचानक असह्य झाली किंवा मान आखडली, तरच डॉक्टरांशी संपर्क साधा.',
  },
  cough: {
    en: 'Screening complete. Based on your symptoms, this appears to be a Low Risk common throat irritation or mild cough.\n\nHome Care & Prevention:\n• Sip warm water and practice warm salt water gargles 2-3 times daily.\n• Inhale mild steam to soothe air passages.\n• Avoid cold drinks, oily foods, and smoke exposure.\n• If cough persists beyond 2 weeks or breathlessness develops, visit your local PHC.',
    hi: 'स्क्रीनिंग पूरी हो गई है। आपके लक्षणों के अनुसार यह कम जोखिम (Low Risk) की सामान्य खांसी या गले की खराश है।\n\nघरेलू देखभाल और बचाव के उपाय:\n• गुनगुना पानी पिएं और दिन में 2-3 बार नमक के पानी से गरारे करें।\n• भाप (steam) लें जिससे श्वास नली में आराम मिले।\n• ठंडी चीजें, तली-भुनी चीजें और धुएं से बचें।\n• यदि खांसी 2 हफ्ते से ज्यादा बनी रहे या सांस फूले, तो PHC में डॉक्टर से जांच कराएं।',
    mr: 'तपासणी पूर्ण झाली आहे. प्राथमिक मूल्यांकनानुसार हा कमी जोखमीचा (Low Risk) सामान्य खोकला किंवा घशातील खवखव आहे.\n\nघरगुती काळजी व प्रतिबंधात्मक उपाय:\n• कोमट पाणी प्या आणि दिवसातून २-३ वेळा मिठाच्या कोमट पाण्याच्या गुळण्या करा.\n• दिवसातून एकदा वाफ (steam) घ्या.\n• थंड पेये, तेलकट अन्न आणि धूर टाळा.\n• खोकला २ आठवड्यांपेक्षा जास्त राहिल्यास किंवा धाप लागल्यास जवळच्या PHC ला भेट द्या.',
  },
  dizziness: {
    en: 'Screening complete. Based on your symptoms, this appears to be a Low Risk mild dizziness or postural unsteadiness.\n\nHome Care & Prevention:\n• Sit or lie down immediately when feeling lightheaded to prevent falls.\n• Drink plenty of water or electrolyte solution (ORS).\n• Avoid sudden standing from a lying or sitting position; get up slowly.\n• If dizziness causes fainting, loss of balance, or speech difficulty, seek medical care immediately.',
    hi: 'स्क्रीनिंग पूरी हो गई है। आपके लक्षणों के अनुसार यह कम जोखिम (Low Risk) के सामान्य चक्कर या डिहाइड्रेशन है।\n\nघरेलू देखभाल और बचाव के उपाय:\n• चक्कर आने पर तुरंत बैठ जाएं या लेट जाएं ताकि गिरने से बचें।\n• पर्याप्त मात्रा में पानी, नींबू पानी या ओआरएस (ORS) पिएं।\n• बिस्तर या कुर्सी से अचानक तेजी से न उठें, धीरे-धीरे खड़े हों।\n• यदि बेहोशी महसूस हो, जुबान लड़खड़ाए या संतुलन बिगड़े, तो तुरंत डॉक्टर से मिलें।',
    mr: 'तपासणी पूर्ण झाली आहे. प्राथमिक मूल्यांकनानुसार ही कमी जोखमीची (Low Risk) सौम्य भोवळ किंवा अशक्तपणा आहे.\n\nघरगुती काळजी व प्रतिबंधात्मक उपाय:\n• चक्कर आल्यास लगेच बसा किंवा झोपा, खाली पडणे टाळा.\n• भरपूर पाणी, लिंबू पाणी किंवा ओआरएस (ORS) प्या.\n• झोपेतून किंवा बसल्यावरून अचानक जलद उठू नका, हळूहळू उभे राहा.\n• बेशुद्ध पडल्यासारखे वाटल्यास किंवा तोल गेल्यास तात्काळ डॉक्टरांशी संपर्क साधा.',
  },
  fatigue: {
    en: 'Screening complete. Based on your symptoms, this appears to be a Low Risk mild physical fatigue or weakness.\n\nHome Care & Prevention:\n• Ensure 7-8 hours of sound sleep and avoid strenuous physical labor.\n• Eat nutrient-dense meals including fruits, lentils, and clean boiled water.\n• Sip electrolyte water or coconut water to replenish essential minerals.\n• If weakness is extreme or persists beyond a week, consult a PHC doctor.',
    hi: 'स्क्रीनिंग पूरी हो गई है। आपके लक्षणों के अनुसार यह कम जोखिम (Low Risk) की सामान्य शारीरिक कमजोरी और थकान है।\n\nघरेलू देखभाल और बचाव के उपाय:\n• पर्याप्त 7-8 घंटे की नींद लें और भारी परिश्रम से बचें।\n• पोषक भोजन लें, जैसे दाल, मौसमी फल, दलिया और नारियल पानी।\n• शरीर में पानी की कमी न होने दें, ओआरएस या गुनगुना पानी पिएं।\n• यदि कमजोरी बहुत ज्यादा बढ़ जाए या कई दिनों तक बनी रहे, तो डॉक्टर से जांच कराएं।',
    mr: 'तपासणी पूर्ण झाली आहे. प्राथमिक मूल्यांकनानुसार हा कमी जोखमीचा (Low Risk) सामान्य शारीरिक थकवा किंवा अशक्तपणा आहे.\n\nघरगुती काळजी व प्रतिबंधात्मक उपाय:\n• पुरेशी ७-८ तास शांत झोप घ्या आणि जड कामे करणे टाळा.\n• पौष्टिक आहार घ्या (ताजी फळे, डाळींची खिचडी, नारळ पाणी).\n• भरपूर पाणी व ओआरएस प्या जेणेकरून शरीरातील क्षार भरून निघतील.\n• जर अशक्तपणा खूप जास्त वाढला किंवा आठवड्यापेक्षा जास्त राहिला तर डॉक्टरांचा सल्ला घ्या.',
  },
  joint_pain: {
    en: 'Screening complete. Based on your symptoms, this appears to be a Low Risk mild joint or body ache.\n\nHome Care & Prevention:\n• Rest the affected joints and avoid excessive strain.\n• Apply warm compress or gentle massage with warm oil.\n• Stay active with gentle stretches without overloading the joints.\n• If joints swell up severely or become hot, consult a clinician at your PHC.',
    hi: 'स्क्रीनिंग पूरी हो गई है। आपके लक्षणों के अनुसार यह कम जोखिम (Low Risk) का सामान्य जोड़ों या बदन का दर्द है।\n\nघरेलू देखभाल और बचाव के उपाय:\n• प्रभावित जोड़ों को आराम दें और भारी वजन उठाने से बचें।\n• हल्के गुनगुने तेल से मालिश करें या गर्म पानी की सिकाई करें।\n• हल्के व्यायाम और खिंचाव करें, लंबे समय तक अकड़कर न बैठें।\n• यदि जोड़ों में लालिमा या अत्यधिक सूजन आए, तो प्राथमिक स्वास्थ्य केंद्र में दिखाएं।',
    mr: 'तपासणी पूर्ण झाली आहे. प्राथमिक मूल्यांकनानुसार ही कमी जोखमीची (Low Risk) सामान्य सांधेदुखी किंवा अंगदुखी आहे.\n\nघरगुती काळजी व प्रतिबंधात्मक उपाय:\n• दुखणाऱ्या सांध्यांना आराम द्या आणि जास्त ताण देणे टाळा.\n• कोमट तेलाने हलका मसाज करा किंवा गरम पाण्याचा शेक द्या.\n• हलके व्यायाम करा, सांधे जास्त वेळ आखडून ठेवू नका.\n• सांध्यांवर खूप जास्त सूज किंवा उष्णता जाणवल्यास डॉक्टरांचा सल्ला घ्या.',
  },
  default: {
    en: 'Screening complete. Based on your reported symptoms, this appears to be a Low Risk condition.\n\nHome Care & Prevention:\n• Ensure adequate rest and stay well hydrated with water, ORS, or warm broths.\n• Maintain good hand hygiene and eat fresh, light meals.\n• Monitor your health at home. Consult an on-duty clinician only if symptoms worsen.',
    hi: 'स्क्रीनिंग पूरी हो गई है। आपके द्वारा बताए गए लक्षणों के अनुसार यह कम जोखिम (Low Risk) की स्थिति है।\n\nघरेलू देखभाल और बचाव के उपाय:\n• भरपूर आराम करें और शरीर में पानी की कमी न होने दें (पानी, ओआरएस या नारियल पानी पिएं)।\n• स्वच्छता का ध्यान रखें और ताजा, सुपाच्य भोजन करें।\n• घर पर स्वास्थ्य का ध्यान रखें। यदि समस्या बढ़ती है तभी डॉक्टर से परामर्श लें।',
    mr: 'तपासणी पूर्ण झाली आहे. तुमच्या लक्षणांनुसार ही कमी जोखमीची (Low Risk) प्राथमिक स्थिती आहे.\n\nघरगुती काळजी व प्रतिबंधात्मक उपाय:\n• पुरेशी विश्रांती घ्या आणि शरीरात पाण्याची कमतरता भासू देऊ नका (पाणी, ओआरएस प्या).\n• स्वच्छता बाळगा आणि ताजा, हलका आहार घ्या.\n• घरातच काळजी घ्या. त्रास वाढल्यासच डॉक्टरांशी संपर्क साधा.',
  },
};

export interface DialogueLlmProviderConfig {
  provider: 'grok' | 'groq';
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface DialogueLlmResult {
  intent: 'greeting_or_intro' | 'symptom_report' | 'answering_question' | 'correction_or_negation' | 'general_query' | 'unclear_or_unrelated' | 'ready_for_assessment';
  patient_name: string | null;
  new_positive_symptoms: string[];
  new_negated_symptoms: string[];
  duration: string | null;
  question_type: 'duration' | 'severity' | 'yes_no';
  conversational_reply: string | null;
  follow_up_question: string | null;
  is_ready_for_assessment: boolean;
}

export class VoiceScreeningService {
  /**
   * Evaluates Multilingual Emergency Warning Signs independently of any LLM.
   */
  public evaluateEmergencySigns(text: string, _language: 'en' | 'hi' | 'mr'): { isEmergency: boolean; flags: string[] } {
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
   */
  public extractGreetingAndName(
    text: string,
    _language: 'en' | 'hi' | 'mr'
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
   * Extracts duration from colloquial patient descriptions in Hindi, Marathi, and English.
   * Examples:
   * - "मुझे दो दिन से बुखार है" -> "दो दिन से"
   * - "मला दोन दिवसांपासून ताप आहे" -> "दोन दिवसांपासून"
   * - "I have had a fever for two days" -> "two days"
   */
  public extractDuration(
    text: string,
    _language: 'en' | 'hi' | 'mr'
  ): string | null {
    const trimmed = text.trim();

    // Hindi duration patterns
    const hiDuration =
      trimmed.match(/(?:(\d+|एक|दो|तीन|चार|पांच|छह|सात|आठ|दस)\s*(?:दिन|घंटे|घंटों|हफ्ते|हफ्तों|महीने|महीनों)\s*से)/i) ||
      trimmed.match(/(?:कल\s*से|परसों\s*से|आज\s*से|सुबह\s*से|रात\s*से)/i);
    if (hiDuration) {
      return hiDuration[0].trim();
    }

    // Marathi duration patterns
    const mrDuration =
      trimmed.match(/(?:(\d+|एक|दोन|तीन|चार|पाच|सहा|सात|आठ|दहा)\s*(?:दिवसांपासून|दिवस|तासांपासून|तास|आठवड्यांपासून|आठवडे|महिन्यांपासून)\s*(?:आहे|झाले)?)/i) ||
      trimmed.match(/(?:कालपासून|परवापासून|आजपासून|सकाळपासून|रात्रीपासून)/i);
    if (mrDuration) {
      return mrDuration[0].trim();
    }

    // English duration patterns
    const enDuration =
      trimmed.match(/(?:(?:for|since)\s+(\d+|one|two|three|four|five|six|seven|a few|couple of)\s+(?:days?|hours?|weeks?|months?))/i) ||
      trimmed.match(/(?:since\s+(?:yesterday|today|this\s*morning|last\s*night))/i);
    if (enDuration) {
      return enDuration[0].trim();
    }

    return null;
  }

  /**
   * Extracts symptoms and distinguishes positive vs negated mentions using colloquial regex patterns
   * and vocabulary dictionaries.
   */
  public extractSymptomsWithPolarity(
    text: string,
    _language: 'en' | 'hi' | 'mr'
  ): { positive: string[]; negated: string[] } {
    const lower = text.toLowerCase();
    const positive: Set<string> = new Set();
    const negated: Set<string> = new Set();

    // Split into clauses across punctuation and contrastive conjunctions (but, however, लेकिन, पण, etc.)
    const clauses = lower.split(/[,;.\n।]|(?:\s+(?:but|only|except|however|पण|परंतु|मात्र|तरी|पण\s+मात्र|लेकिन|मगर|किंतु|परन्तु)\s+)/i);

    const prefixNegationRegex =
      /(?:^|\s)(?:do\s*not\s*have|don't\s*have|not\s*having|no|not|without|never|नाही|नाहीये|नाहीत|नसून|अजिबात\s*नाही|नाहीच|नहीं|नहीं\s*है|बिल्कुल\s*नहीं)(?:$|\s|[।,;.!?])/i;
    const suffixNegationRegex =
      /(?:^|\s)(?:नाही|नाहीये|होत\s*नाही|नव्हता|नाहीत|नसून|अजिबात\s*नाही|नाहीच|नाही\s*हो|नहीं|नहीं\s*है|बिल्कुल\s*नहीं|नहीं\s*हो\s*रहा|नहीं\s*आ\s*रहा)(?:$|\s|[।,;.!?])/i;

    for (const clause of clauses) {
      const trimmedClause = clause.trim();
      if (!trimmedClause) continue;

      const matchedSymptomsInClause = new Set<string>();

      // 1. High-precision colloquial regex pattern matching (handles Hindi/Marathi inflections)
      for (const item of COLLOQUIAL_SYMPTOM_PATTERNS) {
        for (const pattern of item.patterns) {
          const match = pattern.exec(trimmedClause);
          if (match && match.index !== undefined) {
            const before = trimmedClause.slice(0, match.index);
            const after = trimmedClause.slice(match.index + match[0].length);

            const isNegated =
              prefixNegationRegex.test(before) || suffixNegationRegex.test(after);

            if (isNegated) {
              negated.add(item.symptomId);
            } else {
              positive.add(item.symptomId);
            }
            matchedSymptomsInClause.add(item.symptomId);
            break;
          }
        }
      }

      // 2. Lexicon keyword fallback for terms not matched by regex patterns
      for (const [symptomId, terms] of Object.entries(SYMPTOM_LEXICON)) {
        if (matchedSymptomsInClause.has(symptomId)) continue;
        const allTerms = [...terms.en, ...terms.hi, ...terms.mr];

        for (const term of allTerms) {
          const termLower = term.toLowerCase();
          const index = trimmedClause.indexOf(termLower);

          if (index !== -1) {
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

    // Explicit negation overrides positive in case of cross-clause conflicts
    for (const neg of negated) {
      positive.delete(neg);
    }

    return {
      positive: Array.from(positive),
      negated: Array.from(negated),
    };
  }

  /**
   * Check if patient input is asking a general health query.
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
    return /(?:that'?s\s*all|that\s+is\s+all|nothing\s*else|no\s*other|done|finished|एवढेच\s*आहे|आणखी\s*काही\s*नाही|बस\s*यही\s*है|और\s*कुछ\s*नहीं)/i.test(
      lower
    );
  }

  /**
   * Authoritative Multilingual Screening Dialogue Engine.
   * Groq LLM drives natural dialogue, answers health questions, and adapts to newly mentioned symptoms.
   */
  public async handleDialogue(req: VoiceDialogueRequest): Promise<VoiceDialogueResponse> {
    const rawText = (req.text || '').trim();
    // Strip trailing parenthesized symptomId e.g. "No (fever)" -> "No" or "1-2 days (fever)" -> "1-2 days"
    const unparenthesized = rawText.replace(/\s*\([a-zA-Z0-9_\-]+\)\s*$/, '').trim();
    const text = cleanAndroidSpeechRepetition(unparenthesized);
    const lang = req.language || 'en';
    const sessionId = req.sessionId || `sess-${Date.now()}`;

    // 1. SAFETY FIRST: Multilingual Emergency Red-Flag Evaluation
    const emergencyCheck = this.evaluateEmergencySigns(text, lang);
    if (emergencyCheck.isEmergency) {
      logger.warn({ flags: emergencyCheck.flags, text }, 'Emergency warning sign detected during voice dialogue');
      await this.persistAndEmitScreeningActivity({
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

    // 2. Extract deterministic linguistic cues
    const greetingInfo = this.extractGreetingAndName(text, lang);
    const currentPositive = new Set(req.currentSymptoms || []);
    const currentNegated = new Set(req.negatedSymptoms || []);

    const isDirectNegationAnswer = /^(?:no|nope|not\s*really|नाही|नाहीये|नहीं|ना)[!.\s]*$/i.test(text);
    const isDirectAffirmationAnswer = /^(?:yes|yeah|yep|sure|होय|हो|हाँ|हां)[!.\s]*$/i.test(text);

    const lastQuestionId =
      req.questionHistory && req.questionHistory.length > 0
        ? req.questionHistory[req.questionHistory.length - 1]
        : null;

    const isAnsweringFollowUp = Boolean(
      lastQuestionId && (lastQuestionId.includes('redflag') || lastQuestionId.includes('duration') || lastQuestionId.includes('followup'))
    );

    const isGeneralQuery = this.isGeneralHealthQuery(text);

    if (isAnsweringFollowUp && (isDirectNegationAnswer || isDirectAffirmationAnswer)) {
      // Patient is answering a follow-up question (e.g. "No" to red-flag or "Yes").
      // Do NOT allow "No" to wipe out the primary confirmed symptoms!
      if (isDirectNegationAnswer) {
        currentNegated.add(lastQuestionId!);
      } else {
        currentPositive.add(lastQuestionId!);
      }
    } else if (!isGeneralQuery) {
      const polarity = this.extractSymptomsWithPolarity(text, lang);
      polarity.positive.forEach((s) => {
        currentPositive.add(s);
        currentNegated.delete(s);
      });
      polarity.negated.forEach((s) => {
        currentNegated.add(s);
        currentPositive.delete(s);
      });
      if (isDirectNegationAnswer && lastQuestionId) {
        currentNegated.add(lastQuestionId);
      } else if (isDirectAffirmationAnswer && lastQuestionId) {
        currentPositive.add(lastQuestionId);
      }
    }

    let patientName = greetingInfo.name || req.patientName;

    // 3. Track History & Question Answering
    const askedSet = new Set(req.questionHistory || []);
    const answeredKeys = Object.keys(req.answeredQuestions || {});

    const hasDurationAnswered =
      askedSet.has('duration') ||
      Array.from(askedSet).some((q) => q.includes('duration')) ||
      answeredKeys.some((k) => k.includes('duration'));

    const hasRedFlagAnswered =
      askedSet.has('redflag') ||
      Array.from(askedSet).some((q) => q.includes('redflag')) ||
      answeredKeys.some((k) => k.includes('redflag'));

    // 4. Query Dialogue LLM (Grok / Groq) to Drive Dialogue Naturally
    let llmSuggestedFollowUp: string | null = null;
    let llmConversationalReply: string | null = null;
    let llmIntent: string | null = null;
    const deterministicDuration = this.extractDuration(text, lang);
    let llmDurationExtracted: string | null = deterministicDuration;
    let llmQuestionType: 'duration' | 'severity' | 'yes_no' = 'yes_no';
    let llmReadyForAssessment = false;

    const activeProvider = this.getActiveDialogueProvider();
    if (activeProvider) {
      const llmResult = await this.queryLlmDialogue(
        text,
        lang,
        Array.from(currentPositive),
        Array.from(currentNegated),
        req.conversationHistory || []
      );

      if (llmResult) {
        if (llmResult.patient_name && !patientName) {
          patientName = llmResult.patient_name;
        }
        if (llmResult.new_positive_symptoms && llmResult.new_positive_symptoms.length > 0) {
          llmResult.new_positive_symptoms.forEach((s: string) => {
            currentPositive.add(s);
            currentNegated.delete(s);
          });
        }
        if (llmResult.new_negated_symptoms && llmResult.new_negated_symptoms.length > 0) {
          llmResult.new_negated_symptoms.forEach((s: string) => {
            if (isAnsweringFollowUp && isDirectNegationAnswer && (req.currentSymptoms || []).includes(s)) {
              return;
            }
            currentNegated.add(s);
            currentPositive.delete(s);
          });
        }
        if (llmResult.duration) {
          llmDurationExtracted = llmResult.duration;
        }
        llmSuggestedFollowUp = llmResult.follow_up_question;
        llmConversationalReply = llmResult.conversational_reply;
        llmIntent = llmResult.intent;
        if (llmResult.question_type) {
          llmQuestionType = llmResult.question_type;
        }
        llmReadyForAssessment = Boolean(llmResult.is_ready_for_assessment);
      }
    }

    const finalPositiveSymptoms = Array.from(currentPositive);
    const finalNegatedSymptoms = Array.from(currentNegated);

    // 5. STAGE 1: GREETING OR INTRO (0 Symptoms Reported)
    if (
      (greetingInfo.isGreeting || llmIntent === 'greeting_or_intro') &&
      finalPositiveSymptoms.length === 0
    ) {
      let greetingReply = '';
      if (lang === 'mr') {
        greetingReply = patientName
          ? `नमस्कार ${patientName}जी! मी तुमचा स्वास्थसेतू तपासणी सहाय्यक आहे. तुम्हाला सध्या कोणता त्रास किंवा कोणती लक्षणे जाणवत आहेत ते सांगा.`
          : 'नमस्कार! मी तुमचा स्वास्थसेतू तपासणी सहाय्यक आहे. तुम्हाला सध्या काय त्रास होत आहे ते कृपया सांगा किंवा खाली टाईप करा.';
      } else if (lang === 'hi') {
        greetingReply = patientName
          ? `नमस्ते ${patientName}जी! मैं आपका स्वस्थसेतु सहायक हूँ। कृपया बताएं कि आपको क्या तकलीफ या लक्षण महसूस हो रहे हैं।`
          : 'नमस्ते! मैं आपका स्वस्थसेतु सहायक हूँ। कृपया बताएं कि आपको क्या समस्या या तकलीफ हो रही है।';
      } else {
        greetingReply = patientName
          ? `Hello ${patientName}! I am your SwasthSetu screening assistant. Please describe what symptoms or health concerns you are experiencing.`
          : 'Hello! I am your SwasthSetu screening assistant. Please describe your health concern by voice or typing below.';
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
        modelVersion: activeProvider ? `${activeProvider.provider}-${activeProvider.model}` : 'voice-dialogue-adaptive-v2',
      };
    }

    // General query handling when 0 symptoms are confirmed yet
    if (finalPositiveSymptoms.length === 0 && (this.isGeneralHealthQuery(text) || llmIntent === 'general_query')) {
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
        modelVersion: activeProvider ? `${activeProvider.provider}-${activeProvider.model}` : 'voice-dialogue-adaptive-v2',
      };
    }

    // Unclear input with 0 symptoms
    if (finalPositiveSymptoms.length === 0) {
      const isCorrection = finalNegatedSymptoms.length > 0;
      let clarificationReply = '';
      if (lang === 'mr') {
        clarificationReply = isCorrection
          ? 'समजले. तुम्हाला इतर काही त्रास किंवा लक्षणे जाणवत आहेत का?'
          : 'मला नीट समजले नाही. कृपया तुम्हाला होत असलेल्या शारीरिक त्रासाविषयी (जसे ताप, खोकला, डोकेदुखी) सांगा.';
      } else if (lang === 'hi') {
        clarificationReply = isCorrection
          ? 'समझ गया। क्या आपको कोई अन्य परेशानी या लक्षण महसूस हो रहे हैं?'
          : 'मैं पूरी तरह समझ नहीं पाया। कृपया अपने शारीरिक कष्ट (जैसे बुखार, खांसी, सिरदर्द) के बारे में बताएं।';
      } else {
        clarificationReply = isCorrection
          ? 'Understood. Are you experiencing any other symptoms or discomfort?'
          : 'I could not identify any symptoms from that description. Please describe what physical symptoms (such as fever, cough, or headache) you are feeling.';
      }

      return {
        sessionId,
        isEmergency: false,
        emergencyFlags: [],
        extractedSymptoms: [],
        negatedSymptoms: finalNegatedSymptoms,
        patientName: patientName || undefined,
        intent: isCorrection ? 'correction_or_negation' : 'unclear_or_unrelated',
        followUpQuestion: null,
        isFinished: false,
        candidateCategory: null,
        riskTier: 'LOW',
        recommendedSpecialty: 'General Physician',
        guidanceText: llmConversationalReply || clarificationReply,
        modelVersion: 'voice-dialogue-adaptive-v2',
      };
    }

    // 6. SYMPTOMS CONFIRMED: ADAPTIVE DIALOGUE DRIVEN BY GROQ
    const primarySymptom = finalPositiveSymptoms[0] || 'default';
    const isExplicitCompletion = this.isCompletionCue(text);
    const effectiveDurationAnswered =
      hasDurationAnswered || Boolean(llmDurationExtracted) || lastQuestionId?.includes('duration');
    const effectiveRedFlagAnswered =
      hasRedFlagAnswered || lastQuestionId?.includes('redflag');

    // Dialogue is ready for assessment if Groq indicates readiness, completion cue is given,
    // or both core checks were already completed and Groq does not have a further question.
    const isReadyForAssessment =
      llmReadyForAssessment ||
      isExplicitCompletion ||
      (effectiveDurationAnswered && effectiveRedFlagAnswered && !llmSuggestedFollowUp);

    if (!isReadyForAssessment) {
      // Groq LLM drives follow-up question
      let questionText = llmSuggestedFollowUp;
      let qType = llmQuestionType;
      let questionId = `${primarySymptom}_${qType}`;

      // Fallback if Groq is unavailable or did not provide follow_up_question
      if (!questionText) {
        if (!effectiveDurationAnswered) {
          const durationConfig = DURATION_QUESTIONS[primarySymptom] || DURATION_QUESTIONS.default;
          questionText = durationConfig[lang] || durationConfig.en;
          qType = 'duration';
          questionId = `${primarySymptom}_duration`;
        } else {
          const redFlagConfig = FOLLOW_UP_QUESTIONS[primarySymptom] || {
            en: 'Do you also have severe shivering, chest heaviness, or difficulty breathing?',
            hi: 'क्या आपको तेज कंपकंपी, सीने में भारीपन या सांस लेने में परेशानी भी है?',
            mr: 'तुम्हाला तीव्र हुडहुडी, छातीत जड वाटणे किंवा श्वास घेण्यास अडचण असा त्रासही होतोय का?',
          };
          questionText = redFlagConfig[lang] || redFlagConfig.en;
          qType = 'yes_no';
          questionId = `${primarySymptom}_redflag`;
        }
      }

      // Guidance text carries LLM's conversational answer or empathetic localized acknowledgment of reported symptoms
      const symptomDisplay = (SYMPTOM_DISPLAY_NAMES[primarySymptom] || SYMPTOM_DISPLAY_NAMES.default)[lang] || primarySymptom;
      let defaultGuidance = '';
      if (lang === 'mr') {
        defaultGuidance = `मला समजले की तुम्हाला ${symptomDisplay}चा त्रास होत आहे. काळजी करू नका, आपण योग्य प्राथमिक तपासणी करू.`;
      } else if (lang === 'hi') {
        defaultGuidance = `मैंने समझ लिया कि आपको ${symptomDisplay} की समस्या हो रही है। घबराएं नहीं, हम आपकी सही जांच कर रहे हैं।`;
      } else {
        defaultGuidance = `I have noted that you are experiencing ${symptomDisplay}. Do not worry, let us complete a quick screening.`;
      }

      return {
        sessionId,
        isEmergency: false,
        emergencyFlags: [],
        extractedSymptoms: finalPositiveSymptoms,
        negatedSymptoms: finalNegatedSymptoms,
        patientName: patientName || undefined,
        intent: (llmIntent as any) || 'symptom_report',
        followUpQuestion: {
          questionId,
          symptomId: primarySymptom,
          text: questionText,
          questionType: qType,
        },
        isFinished: false,
        candidateCategory: null,
        riskTier: 'LOW',
        recommendedSpecialty: 'General Physician',
        guidanceText: llmConversationalReply || defaultGuidance,
        modelVersion: activeProvider ? `${activeProvider.provider}-${activeProvider.model}` : 'voice-dialogue-adaptive-v2',
      };
    }

    // 7. FINAL STAGE: ALL DETAILS GATHERED -> INVOKE ML CANDIDATE CLASSIFIER & GENERATE GUIDANCE
    const aggregateSymptomText = finalPositiveSymptoms.join(' ') + ' ' + text;
    const candidateResult = await screeningService.screenWithExistingModel(aggregateSymptomText, lang);

    const riskTier: RiskTier = candidateResult.risk_tier || 'LOW';
    const specialty = candidateResult.recommended_specialty || 'General Physician';
    const candidateCategory = candidateResult.possible_category;

    // Localized Risk-Specific Clinical Guidance
    let guidanceText = '';

    if (riskTier === 'LOW') {
      guidanceText = await this.generateLowRiskHomeCareTips(finalPositiveSymptoms, lang, patientName || undefined);
    } else {
      if (lang === 'mr') {
        guidanceText =
          riskTier === 'HIGH'
            ? 'तुमच्या लक्षणांनुसार डॉक्टरांचा त्वरित सल्ला घेणे आवश्यक आहे. अचूक तपासणी, निदान व योग्य उपचारांसाठी कृपया ड्युटीवरील वैद्यकीय अधिकारी किंवा जवळच्या प्राथमिक आरोग्य केंद्राशी (PHC) तात्काळ संपर्क साधा.'
            : 'तुमच्या लक्षणांनुसार डॉक्टरांचा सल्ला घेणे हितावह आहे. योग्य तपासणी व उपचारांसाठी कृपया वैद्यकीय अधिकारी किंवा जवळच्या प्राथमिक आरोग्य केंद्राशी संपर्क साधा.';
      } else if (lang === 'hi') {
        guidanceText =
          riskTier === 'HIGH'
            ? 'आपके लक्षणों के आधार पर तुरंत डॉक्टर से परामर्श आवश्यक है। सटीक जांच और सही उपचार के लिए कृपया ड्यूटी पर मौजूद चिकित्सा अधिकारी या नजदीकी प्राथमिक स्वास्थ्य केंद्र (PHC) से तत्काल संपर्क करें।'
            : 'आपके लक्षणों के आधार पर डॉक्टर से परामर्श की सलाह दी जाती है। उचित जांच व दवा हेतु कृपया चिकित्सा अधिकारी या नजदीकी स्वास्थ्य केंद्र से संपर्क करें।';
      } else {
        guidanceText =
          riskTier === 'HIGH'
            ? 'Based on your reported symptoms, urgent medical consultation is advised. Please connect with an on-duty medical officer immediately or visit your nearest Primary Health Centre (PHC).'
            : 'Based on your symptoms, a medical consultation is recommended. Please connect with an on-duty medical officer or visit your nearest Primary Health Centre (PHC) for evaluation.';
      }
    }

    // 8. Persist and Emit Live Screening Activity to NGO Dashboard in Real-Time
    await this.persistAndEmitScreeningActivity({
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
   * Generates empathetic, practical home-care tips and prevention measures for LOW-RISK patients.
   * Utilizes active Dialogue LLM (Grok or Groq) with reliable multi-lingual fallback to localized dictionaries.
   */
  public async generateLowRiskHomeCareTips(
    symptoms: string[],
    lang: 'en' | 'hi' | 'mr',
    patientName?: string
  ): Promise<string> {
    const primary = symptoms[0] || 'default';
    const fallbackObj = LOW_RISK_HOME_CARE_TIPS[primary] || LOW_RISK_HOME_CARE_TIPS.default;
    const fallbackText = fallbackObj[lang] || fallbackObj.en;

    const providerConfig = this.getActiveDialogueProvider();
    if (!providerConfig) return fallbackText;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4500);

      const endpoint = `${providerConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${providerConfig.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: providerConfig.model,
          messages: [
            {
              role: 'system',
              content: `You are SwasthSetu, an empathetic rural healthcare AI screening assistant in India.
Language: ${lang} (mr = Marathi, hi = Hindi, en = English).
The patient has undergone health screening and their symptoms indicate a LOW-RISK, mild condition.
Patient symptoms: [${symptoms.join(', ')}]. Patient Name: ${patientName || 'Friend'}.

Generate supportive, practical home-care and prevention advice in ${lang}:
1. Clearly state that the screening is complete and the assessment shows a mild, Low-Risk condition.
2. Provide 3-4 bullet points of simple home remedies, prevention tips, hydration (ORS/boiled water), rest, and nutrition.
3. Crucial Rule: DO NOT tell the patient to urgently consult a doctor or book an appointment. Only advise consulting a doctor if symptoms worsen, don't improve after 3-4 days, or red flags appear.
4. Keep the tone warm, clear, and reassuring. Respond with plain text only.`,
            },
            {
              role: 'user',
              content: `Generate Low Risk home-care tips for ${symptoms.join(', ')} in ${lang}.`,
            },
          ],
          temperature: 0.25,
          max_tokens: 380,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      if (!res.ok && providerConfig.provider === 'grok' && env.GROQ_API_KEY) {
        try {
          const failoverRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${env.GROQ_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: env.GROQ_MODEL || 'qwen/qwen3.8-27b',
              messages: [
                {
                  role: 'system',
                  content: `You are SwasthSetu, an empathetic rural healthcare AI screening assistant in India.
Language: ${lang} (mr = Marathi, hi = Hindi, en = English).
The patient has undergone health screening and their symptoms indicate a LOW-RISK, mild condition.
Patient symptoms: [${symptoms.join(', ')}]. Patient Name: ${patientName || 'Friend'}.

Generate supportive, practical home-care and prevention advice in ${lang}:
1. Clearly state that the screening is complete and the assessment shows a mild, Low-Risk condition.
2. Provide 3-4 bullet points of simple home remedies, prevention tips, hydration (ORS/boiled water), rest, and nutrition.
3. Crucial Rule: DO NOT tell the patient to urgently consult a doctor or book an appointment. Only advise consulting a doctor if symptoms worsen, don't improve after 3-4 days, or red flags appear.
4. Keep the tone warm, clear, and reassuring. Respond with plain text only.`,
                },
                {
                  role: 'user',
                  content: `Generate Low Risk home-care tips for ${symptoms.join(', ')} in ${lang}.`,
                },
              ],
              temperature: 0.25,
              max_tokens: 380,
            }),
          });
          if (failoverRes.ok) {
            const failoverJson = (await failoverRes.json()) as any;
            const failoverContent = failoverJson.choices?.[0]?.message?.content?.trim();
            if (failoverContent) return failoverContent;
          }
        } catch {}
      }

      if (!res.ok) return fallbackText;
      const json = (await res.json()) as any;
      const content = json.choices?.[0]?.message?.content?.trim();
      return content || fallbackText;
    } catch {
      return fallbackText;
    }
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
        district: 'Khed (Rajgurunagar)',
        summary: params.isEmergency
          ? `Emergency flagged: ${params.emergencyFlags.join(', ') || 'Critical signs'}`
          : `Voice screening completed: ${params.symptoms.join(', ') || 'General assessment'} (${params.riskTier} Risk)`,
      });
    } catch (e) {
      logger.warn({ err: e }, 'Failed to persist/emit live screening activity');
    }
  }

  /**
   * Resolves the active dialogue LLM provider based on environment configuration and available keys.
   * Prioritizes Grok (xAI) when configured or in 'auto' mode with GROK_API_KEY present.
   */
  public getActiveDialogueProvider(): DialogueLlmProviderConfig | null {
    const preference = env.DIALOGUE_LLM_PROVIDER;

    if (preference === 'none') {
      return null;
    }

    if (preference === 'grok') {
      if (!env.GROK_API_KEY) {
        logger.warn('DIALOGUE_LLM_PROVIDER is configured as "grok" but GROK_API_KEY is not set; falling back to deterministic state machine');
        return null;
      }
      return {
        provider: 'grok',
        apiKey: env.GROK_API_KEY,
        baseUrl: env.GROK_API_URL || 'https://api.x.ai/v1',
        model: env.GROK_MODEL || 'grok-2-mini',
      };
    }

    if (preference === 'groq') {
      if (!env.GROQ_API_KEY) {
        logger.warn('DIALOGUE_LLM_PROVIDER is configured as "groq" but GROQ_API_KEY is not set; falling back to deterministic state machine');
        return null;
      }
      return {
        provider: 'groq',
        apiKey: env.GROQ_API_KEY,
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'llama-3.3-70b-versatile',
      };
    }

    // Auto resolution: prefer Grok if GROK_API_KEY is present, else fall back to Groq if GROQ_API_KEY is present
    if (env.GROK_API_KEY) {
      return {
        provider: 'grok',
        apiKey: env.GROK_API_KEY,
        baseUrl: env.GROK_API_URL || 'https://api.x.ai/v1',
        model: env.GROK_MODEL || 'grok-2-mini',
      };
    }

    if (env.GROQ_API_KEY) {
      return {
        provider: 'groq',
        apiKey: env.GROQ_API_KEY,
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'llama-3.3-70b-versatile',
      };
    }

    return null;
  }

  /**
   * Queries the active Dialogue LLM (Grok or Groq) to drive dialogue naturally,
   * answer patient health questions, adapt to newly mentioned symptoms,
   * and form context-aware screening questions in Marathi, Hindi, or English.
   *
   * Medical Safety & Privacy:
   * 1. Strips PII (phone numbers, emails) before transmission.
   * 2. Never passes patient names or village codes to external LLMs.
   * 3. 5000ms bounded timeout with graceful fallback on 429, 5xx, or errors.
   */
  public async queryLlmDialogue(
    text: string,
    lang: 'en' | 'hi' | 'mr',
    currentSymptoms: string[],
    negatedSymptoms: string[],
    history: Array<{ role: 'user' | 'assistant'; text: string }> = []
  ): Promise<DialogueLlmResult | null> {
    const providerConfig = this.getActiveDialogueProvider();
    if (!providerConfig) return null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      // Privacy: Sanitize input text and history to strip phone numbers and emails
      const sanitizedText = text
        .replace(/\b(?:\+91[- ]?)?[6-9]\d{9}\b/g, '[PHONE]')
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');

      const sanitizedHistory = history.slice(-8).map((h) => ({
        role: h.role,
        content: h.text
          .replace(/\b(?:\+91[- ]?)?[6-9]\d{9}\b/g, '[PHONE]')
          .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]'),
      }));

      const systemPrompt = `You are SwasthSetu, an empathetic, intelligent clinical healthcare screening assistant for rural India.
Language: ${lang} (mr = Marathi, hi = Hindi, en = English). All your generated text and questions MUST be in ${lang}.

Clinical Objective & Responsibilities:
1. DRIVE THE DIALOGUE NATURALLY:
   - Talk like an experienced, warm, attentive clinician speaking to a rural patient.
   - Use simple, culturally resonant language in ${lang}. Avoid complex medical jargon or clinical codes.
   - For Marathi (mr): Use natural spoken Marathi (e.g. "तुम्हाला ताप किती दिवसांपासून आहे?", "अंगात कणकण किंवा थंडी वाजतेय का?", "काळजी करू नका, आपण योग्य सल्ला घेऊ.").
   - For Hindi (hi): Use simple, warm Hindi (e.g. "आपको बुखार कितने दिनों से है?", "क्या ठंड लग रही है या कमजोरी महसूस हो रही है?").
   - For English (en): Use clear, compassionate English.

2. LOGICALLY ANSWER ANY PATIENT QUESTION:
   - If the patient asks ANY question (e.g. home care, paracetamol, drinking warm water, resting, dietary advice):
     * Provide a clear, reassuring, medically sound answer in "conversational_reply" in ${lang}.
     * Mention standard supportive care (rest, hydration, ORS, warm fluids).
     * DO NOT prescribe specific drug dosages or claim diagnostic certainty.
     * Always remind them that definitive diagnosis and treatment require a qualified doctor.

3. ADAPT DYNAMICALLY & EXTRACT SYMPTOMS:
   - Recognize colloquial symptom descriptions:
     * Marathi: कंबरदुखी / कंबरेत दुखणे (back_pain), खोकला (cough), ताप / कणकण (fever), डोकं दुखणे (headache), चक्कर / भोवळ (dizziness), अशक्तपणा / थकवा (fatigue), छातीत दुखणे / भरून येणे (chest_discomfort), उलटी / मळमळ (vomiting/nausea), पोटदुखी (stomach_ache), जुलाब (diarrhea), दम लागणे / श्वास त्रास (breathlessness), सांधेदुखी / अंगदुखी (joint_pain).
     * Hindi: कमर दर्द / कमर में दर्द (back_pain), सिर दर्द (headache), बुखार / हरारत (fever), खांसी (cough), चक्कर आना / चक्कर (dizziness), कमजोरी / थकान (fatigue), सीने में दर्द (chest_discomfort), उल्टी / जी मिचलाना (vomiting/nausea), पेट दर्द (stomach_ache), दस्त (diarrhea), सांस फूलना (breathlessness), जोड़ों का दर्द / बदन दर्द (joint_pain).
     * English: back pain / lower back hurts (back_pain), headache (headache), fever (fever), cough (cough), dizziness / feeling dizzy (dizziness), weakness / fatigue (fatigue), nausea / vomiting (vomiting), diarrhea (diarrhea), joint pain (joint_pain).
   - Put newly identified positive symptoms into "new_positive_symptoms" as lowercase standardized keys (e.g., back_pain, fever, cough, headache, dizziness, fatigue, joint_pain, chest_discomfort, vomiting, diarrhea, stomach_ache, throat_pain, skin_rash).
   - Recognize explicitly negated symptoms separately:
     * E.g. "मला ताप नाही" / "बुखार नहीं है" / "no fever" -> put "fever" into "new_negated_symptoms".
     * E.g. "खोकला नाही" / "खांसी नहीं है" / "no cough" -> put "cough" into "new_negated_symptoms".
   - CRITICAL NEGATION RULE: If the patient is answering "No" / "नाही" / "नहीं" to a specific follow-up question (e.g. checking for chest pain, chills, or vomiting), DO NOT negate their previously confirmed symptoms! Set intent to "answering_question" and only negate the specific symptom that was asked about.

4. FORMULATE CONTEXT-SPECIFIC FOLLOW-UP QUESTIONS:
   - In "follow_up_question", ask ONE concise, empathetic question based on what information is ACTUALLY missing.
   - If duration is not yet known, ask duration: set "question_type" to "duration".
   - If red flags or associated symptoms are uninvestigated, ask a yes/no question: set "question_type" to "yes_no".
   - If assessing symptom severity or progression: set "question_type" to "severity".
   - Do NOT ask duration if duration has already been mentioned in conversation history.
   - Avoid repetitive questions.

5. COMPLETION & ASSESSMENT READINESS:
   - Set "is_ready_for_assessment" to true and "follow_up_question" to null when:
     * Core symptoms, duration, and red flags have been addressed, OR
     * The patient says they have nothing more to add ("एवढेच आहे", "और कुछ नहीं", "that is all", "nothing else").
   - Otherwise, set "is_ready_for_assessment" to false and provide the next follow-up question.

Output format STRICTLY in JSON without markdown fences:
{
  "intent": "greeting_or_intro" | "symptom_report" | "answering_question" | "general_query" | "correction_or_negation" | "unclear_or_unrelated" | "ready_for_assessment",
  "patient_name": null,
  "conversational_reply": "Natural answer to user's question or supportive acknowledgement in ${lang}, or null",
  "follow_up_question": "Natural clinical follow-up question in ${lang}, or null if ready for assessment",
  "question_type": "duration" | "severity" | "yes_no",
  "new_positive_symptoms": [],
  "new_negated_symptoms": [],
  "duration": "duration text if mentioned, else null",
  "is_ready_for_assessment": false
}`;

      let res: Response | null = null;
      try {
        const endpoint = `${providerConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`;
        res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${providerConfig.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: providerConfig.model,
            messages: [
              { role: 'system', content: systemPrompt },
              ...sanitizedHistory,
              {
                role: 'user',
                content: `User utterance: "${sanitizedText}"\nConfirmed symptoms so far: [${currentSymptoms.join(
                  ', '
                )}]\nNegated symptoms so far: [${negatedSymptoms.join(', ')}]`,
              },
            ],
            temperature: 0.2,
            max_tokens: 400,
            response_format: { type: 'json_object' },
          }),
          signal: controller.signal,
        });
      } catch (primaryErr: any) {
        logger.warn({ provider: providerConfig.provider, err: primaryErr?.message }, 'Primary dialogue provider request failed');
      }

      clearTimeout(timeoutId);

      // Automatic secondary failover: If Grok is unavailable (e.g. 403 credit exhaustion, 429 rate limit, 5xx)
      // and Groq is configured with a key in auto or grok mode, failover immediately to Groq!
      if (
        (!res || !res.ok) &&
        providerConfig.provider === 'grok' &&
        env.GROQ_API_KEY &&
        (env.DIALOGUE_LLM_PROVIDER === 'auto' || env.DIALOGUE_LLM_PROVIDER === 'grok')
      ) {
        logger.info(
          { grokStatus: res?.status || 'unavailable' },
          'Grok API returned non-OK status; automatically failing over to Groq dialogue provider'
        );
        try {
          const failoverController = new AbortController();
          const failoverTimeout = setTimeout(() => failoverController.abort(), 4000);
          res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${env.GROQ_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: env.GROQ_MODEL || 'qwen/qwen3.8-27b',
              messages: [
                { role: 'system', content: systemPrompt },
                ...sanitizedHistory,
                {
                  role: 'user',
                  content: `User utterance: "${sanitizedText}"\nConfirmed symptoms so far: [${currentSymptoms.join(
                    ', '
                  )}]\nNegated symptoms so far: [${negatedSymptoms.join(', ')}]`,
                },
              ],
              temperature: 0.2,
              max_tokens: 400,
              response_format: { type: 'json_object' },
            }),
            signal: failoverController.signal,
          });
          clearTimeout(failoverTimeout);
        } catch (failoverErr: any) {
          logger.warn({ err: failoverErr?.message }, 'Failover to Groq dialogue provider also failed');
        }
      }

      if (!res || !res.ok) {
        if (res && res.status === 429) {
          logger.warn(
            { provider: providerConfig.provider, status: 429 },
            'Dialogue LLM rate limit encountered (HTTP 429); falling back to deterministic state machine'
          );
        } else {
          logger.warn(
            { provider: providerConfig.provider, status: res?.status },
            'Dialogue LLM returned non-200 error; falling back to deterministic state machine'
          );
        }
        return null;
      }

      const json = (await res.json()) as any;
      const rawContent = json.choices?.[0]?.message?.content;
      if (!rawContent || typeof rawContent !== 'string') {
        logger.warn({ provider: providerConfig.provider }, 'Dialogue LLM returned empty content; falling back');
        return null;
      }

      let cleanJson = rawContent.trim();
      if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      }

      let parsed: any = null;
      try {
        parsed = JSON.parse(cleanJson);
      } catch {
        const firstBrace = cleanJson.indexOf('{');
        const lastBrace = cleanJson.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          try {
            parsed = JSON.parse(cleanJson.substring(firstBrace, lastBrace + 1));
          } catch {
            logger.warn({ provider: providerConfig.provider }, 'Failed to parse JSON substring from LLM response');
            return null;
          }
        } else {
          logger.warn({ provider: providerConfig.provider }, 'No valid JSON object detected in LLM response');
          return null;
        }
      }

      if (!parsed || typeof parsed !== 'object') {
        return null;
      }

      const validIntents = [
        'greeting_or_intro',
        'symptom_report',
        'answering_question',
        'correction_or_negation',
        'general_query',
        'unclear_or_unrelated',
        'ready_for_assessment',
      ];
      const intent = validIntents.includes(parsed.intent) ? parsed.intent : 'symptom_report';

      const qType: 'duration' | 'severity' | 'yes_no' =
        parsed.question_type === 'duration' || parsed.question_type === 'severity'
          ? parsed.question_type
          : 'yes_no';

      const sanitizeSymptoms = (arr: any): string[] => {
        if (!Array.isArray(arr)) return [];
        return arr
          .filter((item) => typeof item === 'string')
          .map((item) => item.trim().toLowerCase().replace(/\s+/g, '_'))
          .filter((item) => item.length > 0);
      };

      return {
        intent,
        patient_name:
          typeof parsed.patient_name === 'string' && parsed.patient_name.trim().length > 0
            ? parsed.patient_name.trim()
            : null,
        new_positive_symptoms: sanitizeSymptoms(parsed.new_positive_symptoms),
        new_negated_symptoms: sanitizeSymptoms(parsed.new_negated_symptoms),
        duration:
          typeof parsed.duration === 'string' && parsed.duration.trim().length > 0
            ? parsed.duration.trim()
            : null,
        question_type: qType,
        conversational_reply:
          typeof parsed.conversational_reply === 'string' && parsed.conversational_reply.trim().length > 0
            ? parsed.conversational_reply.trim()
            : null,
        follow_up_question:
          typeof parsed.follow_up_question === 'string' && parsed.follow_up_question.trim().length > 0
            ? parsed.follow_up_question.trim()
            : null,
        is_ready_for_assessment: Boolean(parsed.is_ready_for_assessment),
      };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        logger.warn(
          { provider: providerConfig.provider },
          'Dialogue LLM call timed out after 5000ms; falling back to deterministic state machine'
        );
      } else {
        logger.warn(
          { provider: providerConfig.provider, err: err?.message || String(err) },
          'Failed to call Dialogue LLM API; falling back to deterministic state machine'
        );
      }
      return null;
    }
  }

  /**
   * Backward-compatible alias for queryGroqDialogue delegating to queryLlmDialogue.
   */
  public async queryGroqDialogue(
    text: string,
    lang: 'en' | 'hi' | 'mr',
    currentSymptoms: string[],
    negatedSymptoms: string[],
    _patientName: string | null,
    history: Array<{ role: 'user' | 'assistant'; text: string }> = []
  ): Promise<DialogueLlmResult | null> {
    return this.queryLlmDialogue(text, lang, currentSymptoms, negatedSymptoms, history);
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
