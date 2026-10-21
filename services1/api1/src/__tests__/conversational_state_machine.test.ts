import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { voiceScreeningService } from '../services/voiceScreening.service.js';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
}, 180000);

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});

describe('Dynamic Conversational State Machine Regression Suite', () => {
  it('“माझं नाव निरंजन आहे” must not produce a LOW-risk result or finalize screening', async () => {
    const response = await voiceScreeningService.handleDialogue({
      text: 'माझं नाव निरंजन आहे',
      language: 'mr',
      currentSymptoms: [],
      negatedSymptoms: [],
      answeredQuestions: {},
      questionHistory: [],
    });

    // Must NOT finish screening
    expect(response.isFinished).toBe(false);
    expect(response.isEmergency).toBe(false);
    expect(response.intent).toBe('greeting_or_intro');
    expect(response.patientName).toBe('निरंजन');
    expect(response.extractedSymptoms).toHaveLength(0);
    expect(response.followUpQuestion).toBeNull();

    // Must greet warmly by name and ask for symptoms
    expect(response.guidanceText).toContain('निरंजन');
    expect(response.guidanceText).toMatch(/लक्षणे|त्रास/i);
  });

  it('“I have a fever and a headache” collects both symptoms in one turn', async () => {
    const response = await voiceScreeningService.handleDialogue({
      text: 'I have a fever and a headache since yesterday',
      language: 'en',
      currentSymptoms: [],
      negatedSymptoms: [],
      answeredQuestions: {},
      questionHistory: [],
    });

    expect(response.isFinished).toBe(false);
    expect(response.extractedSymptoms).toContain('fever');
    expect(response.extractedSymptoms).toContain('headache');
    expect(response.followUpQuestion).toBeDefined();
    expect(['fever', 'headache']).toContain(response.followUpQuestion?.symptomId);
  });

  it('“I do not have a fever” remains a negative finding and does not add positive symptom', async () => {
    const response = await voiceScreeningService.handleDialogue({
      text: 'I do not have a fever',
      language: 'en',
      currentSymptoms: [],
      negatedSymptoms: [],
      answeredQuestions: {},
      questionHistory: [],
    });

    expect(response.isFinished).toBe(false);
    expect(response.extractedSymptoms).not.toContain('fever');
    expect(response.negatedSymptoms).toContain('fever');
    expect(response.intent).toBe('correction_or_negation');
  });

  it('corrects an earlier symptom if patient clarifies they do not have it', async () => {
    const response = await voiceScreeningService.handleDialogue({
      text: 'Actually I do not have a fever, only cough',
      language: 'en',
      currentSymptoms: ['fever', 'cough'],
      negatedSymptoms: [],
      answeredQuestions: {},
      questionHistory: [],
    });

    // Fever should be removed from positive and added to negated
    expect(response.extractedSymptoms).not.toContain('fever');
    expect(response.extractedSymptoms).toContain('cough');
    expect(response.negatedSymptoms).toContain('fever');
    expect(response.isFinished).toBe(false);
  });

  it('a new emergency warning interrupts normal questioning immediately', async () => {
    const response = await voiceScreeningService.handleDialogue({
      text: 'Now I have severe chest pain and breathless',
      language: 'en',
      currentSymptoms: ['cough'],
      negatedSymptoms: [],
      answeredQuestions: { cough: 'yes' },
      questionHistory: ['cough'],
    });

    expect(response.isEmergency).toBe(true);
    expect(response.riskTier).toBe('HIGH');
    expect(response.recommendedSpecialty).toBe('Emergency Medicine');
    expect(response.followUpQuestion).toBeNull();
    expect(response.isFinished).toBe(true);
  });

  it('a question-count limit must not finalize an incomplete assessment with 0 symptoms', async () => {
    // Simulating multiple turns of greetings or non-symptom queries
    const response = await voiceScreeningService.handleDialogue({
      text: 'Hello assistant',
      language: 'en',
      currentSymptoms: [],
      negatedSymptoms: [],
      answeredQuestions: { q1: 'unknown', q2: 'unknown', q3: 'unknown' },
      questionHistory: ['q1', 'q2', 'q3'],
    });

    // Must NOT finalize without symptoms
    expect(response.isFinished).toBe(false);
    expect(response.extractedSymptoms).toHaveLength(0);
    expect(response.intent).toBe('greeting_or_intro');
  });

  it('handles general health queries cautiously without prematurely finalizing', async () => {
    const response = await voiceScreeningService.handleDialogue({
      text: 'ताप आल्यावर काय खावे किंवा कोणती काळजी घ्यावी?',
      language: 'mr',
      currentSymptoms: [],
      negatedSymptoms: [],
      answeredQuestions: {},
      questionHistory: [],
    });

    expect(response.isFinished).toBe(false);
    expect(response.isEmergency).toBe(false);
    expect(response.intent).toBe('general_query');
    expect(response.guidanceText).toMatch(/विश्रांती|पाणी|डॉक्टर/i);
  });

  it('finalizes assessment when symptoms are confirmed and patient indicates completion', async () => {
    const response = await voiceScreeningService.handleDialogue({
      text: 'That is all, nothing else',
      language: 'en',
      currentSymptoms: ['fever'],
      negatedSymptoms: [],
      answeredQuestions: { fever: 'yes' },
      questionHistory: ['fever'],
    });

    // Should finalize now because symptoms exist and completion was signaled
    expect(response.isFinished).toBe(true);
    expect(response.isEmergency).toBe(false);
    expect(response.extractedSymptoms).toContain('fever');
    expect(response.riskTier).toBeDefined();
    expect(response.recommendedSpecialty).toBeDefined();
  });
});
