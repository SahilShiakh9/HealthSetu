import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { voiceScreeningService } from '../services/voiceScreening.service.js';
import { env } from '../config/env.js';

describe('Selective Grok Dialogue Integration Test Suite', () => {
  const originalGrokKey = env.GROK_API_KEY;
  const originalGroqKey = env.GROQ_API_KEY;
  const originalProvider = env.DIALOGUE_LLM_PROVIDER;
  const originalGrokUrl = env.GROK_API_URL;
  const originalGrokModel = env.GROK_MODEL;

  let fetchSpy: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    // Default to Grok active for these integration tests
    (env as any).GROK_API_KEY = 'xai-test-key-mock-12345';
    (env as any).GROK_API_URL = 'https://api.x.ai/v1';
    (env as any).GROK_MODEL = 'grok-2-mini';
    (env as any).DIALOGUE_LLM_PROVIDER = 'grok';
    (env as any).GROQ_API_KEY = 'groq-test-key-mock-54321';
  });

  afterEach(() => {
    (env as any).GROK_API_KEY = originalGrokKey;
    (env as any).GROQ_API_KEY = originalGroqKey;
    (env as any).DIALOGUE_LLM_PROVIDER = originalProvider;
    (env as any).GROK_API_URL = originalGrokUrl;
    (env as any).GROK_MODEL = originalGrokModel;
    vi.restoreAllMocks();
  });

  it('1. Resolves active dialogue provider correctly based on configuration', () => {
    // Grok explicit
    (env as any).DIALOGUE_LLM_PROVIDER = 'grok';
    let provider = voiceScreeningService.getActiveDialogueProvider();
    expect(provider).not.toBeNull();
    expect(provider?.provider).toBe('grok');
    expect(provider?.baseUrl).toBe('https://api.x.ai/v1');
    expect(provider?.model).toBe('grok-2-mini');

    // Groq explicit
    (env as any).DIALOGUE_LLM_PROVIDER = 'groq';
    provider = voiceScreeningService.getActiveDialogueProvider();
    expect(provider?.provider).toBe('groq');
    expect(provider?.baseUrl).toBe('https://api.groq.com/openai/v1');

    // None explicit
    (env as any).DIALOGUE_LLM_PROVIDER = 'none';
    provider = voiceScreeningService.getActiveDialogueProvider();
    expect(provider).toBeNull();

    // Auto resolution preferring Grok if key present
    (env as any).DIALOGUE_LLM_PROVIDER = 'auto';
    (env as any).GROK_API_KEY = 'xai-key-present';
    provider = voiceScreeningService.getActiveDialogueProvider();
    expect(provider?.provider).toBe('grok');

    // Auto resolution falling back to Groq if only Groq key present
    (env as any).GROK_API_KEY = undefined;
    (env as any).GROQ_API_KEY = 'groq-key-present';
    provider = voiceScreeningService.getActiveDialogueProvider();
    expect(provider?.provider).toBe('groq');

    // Both missing
    (env as any).GROQ_API_KEY = undefined;
    provider = voiceScreeningService.getActiveDialogueProvider();
    expect(provider).toBeNull();
  });

  it('2. Drives natural conversation in Marathi (mr) with mocked Grok response', async () => {
    const mockGrokResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: 'symptom_report',
              patient_name: null,
              conversational_reply: 'काळजी करू नका, आपण योग्य तपासणी करूया. ताप कधीपासून सुरू आहे ते सांगा.',
              follow_up_question: 'हा ताप तुम्हाला किती दिवसांपासून जाणवतो आहे?',
              question_type: 'duration',
              new_positive_symptoms: ['fever'],
              new_negated_symptoms: [],
              duration: null,
              is_ready_for_assessment: false,
            }),
          },
        },
      ],
    };

    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockGrokResponse,
    } as any);

    const response = await voiceScreeningService.handleDialogue({
      text: 'मला कालपासून खूप ताप भरला आहे आणि कणकण वाटतेय',
      language: 'mr',
      currentSymptoms: [],
      negatedSymptoms: [],
      answeredQuestions: {},
      questionHistory: [],
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const fetchArgs = fetchSpy.mock.calls[0];
    expect(fetchArgs[0]).toBe('https://api.x.ai/v1/chat/completions');
    expect(fetchArgs[1].headers.Authorization).toBe('Bearer xai-test-key-mock-12345');

    expect(response.isFinished).toBe(false);
    expect(response.isEmergency).toBe(false);
    expect(response.extractedSymptoms).toContain('fever');
    expect(response.followUpQuestion?.text).toBe('हा ताप तुम्हाला किती दिवसांपासून जाणवतो आहे?');
    expect(response.followUpQuestion?.questionType).toBe('duration');
    expect(response.guidanceText).toBe('काळजी करू नका, आपण योग्य तपासणी करूया. ताप कधीपासून सुरू आहे ते सांगा.');
    expect(response.modelVersion).toBe('grok-grok-2-mini');
  });

  it('3. Drives natural conversation in Hindi (hi) with mocked Grok response', async () => {
    const mockGrokResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: 'symptom_report',
              patient_name: null,
              conversational_reply: 'घबराने की कोई बात नहीं है। हम आपकी पूरी जांच कर रहे हैं।',
              follow_up_question: 'क्या आपको तेज खांसी के साथ सांस लेने में भी दिक्कत हो रही है?',
              question_type: 'yes_no',
              new_positive_symptoms: ['cough'],
              new_negated_symptoms: [],
              duration: null,
              is_ready_for_assessment: false,
            }),
          },
        },
      ],
    };

    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockGrokResponse,
    } as any);

    const response = await voiceScreeningService.handleDialogue({
      text: 'मुझे बहुत तेज खांसी आ रही है गले में खराश है',
      language: 'hi',
      currentSymptoms: [],
      negatedSymptoms: [],
      answeredQuestions: {},
      questionHistory: [],
    });

    expect(response.extractedSymptoms).toContain('cough');
    expect(response.followUpQuestion?.text).toBe('क्या आपको तेज खांसी के साथ सांस लेने में भी दिक्कत हो रही है?');
    expect(response.guidanceText).toBe('घबराने की कोई बात नहीं है। हम आपकी पूरी जांच कर रहे हैं।');
    expect(response.modelVersion).toBe('grok-grok-2-mini');
  });

  it('4. Drives natural conversation in English (en) with mocked Grok response', async () => {
    const mockGrokResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: 'symptom_report',
              patient_name: null,
              conversational_reply: 'I understand you are feeling unwell. Let us take care of this.',
              follow_up_question: 'How long have you had this severe headache?',
              question_type: 'duration',
              new_positive_symptoms: ['headache'],
              new_negated_symptoms: [],
              duration: null,
              is_ready_for_assessment: false,
            }),
          },
        },
      ],
    };

    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockGrokResponse,
    } as any);

    const response = await voiceScreeningService.handleDialogue({
      text: 'I have had a throbbing headache since morning',
      language: 'en',
      currentSymptoms: [],
      negatedSymptoms: [],
      answeredQuestions: {},
      questionHistory: [],
    });

    expect(response.extractedSymptoms).toContain('headache');
    expect(response.followUpQuestion?.text).toBe('How long have you had this severe headache?');
    expect(response.followUpQuestion?.questionType).toBe('duration');
  });

  it('5. Correctly separates positive and explicitly negated symptoms in rural phrasing', async () => {
    const mockGrokResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: 'symptom_report',
              patient_name: null,
              conversational_reply: 'समजले. ताप नाही पण खोकला आहे.',
              follow_up_question: 'खोकल्यासोबत कफ किंवा छातीत दुखणे आहे का?',
              question_type: 'yes_no',
              new_positive_symptoms: ['cough'],
              new_negated_symptoms: ['fever'],
              duration: null,
              is_ready_for_assessment: false,
            }),
          },
        },
      ],
    };

    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockGrokResponse,
    } as any);

    const response = await voiceScreeningService.handleDialogue({
      text: 'मला ताप नाहीये, फक्त कोरडा खोकला येतोय',
      language: 'mr',
      currentSymptoms: [],
      negatedSymptoms: [],
      answeredQuestions: {},
      questionHistory: [],
    });

    expect(response.extractedSymptoms).toContain('cough');
    expect(response.extractedSymptoms).not.toContain('fever');
    expect(response.negatedSymptoms).toContain('fever');
  });

  it('6. Does not wipe out confirmed symptoms when patient answers "No" to a follow-up warning question', async () => {
    const mockGrokResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: 'answering_question',
              patient_name: null,
              conversational_reply: 'चांगली गोष्ट आहे की उलट्या किंवा मळमळ नाही.',
              follow_up_question: 'ताप किती दिवसांपासून आहे?',
              question_type: 'duration',
              new_positive_symptoms: [],
              new_negated_symptoms: ['vomiting'],
              duration: null,
              is_ready_for_assessment: false,
            }),
          },
        },
      ],
    };

    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockGrokResponse,
    } as any);

    const response = await voiceScreeningService.handleDialogue({
      text: 'नाही, उलटी होत नाही',
      language: 'mr',
      currentSymptoms: ['fever'],
      negatedSymptoms: [],
      answeredQuestions: { fever: 'yes' },
      questionHistory: ['fever_redflag'],
    });

    // fever must NOT be removed from confirmed symptoms!
    expect(response.extractedSymptoms).toContain('fever');
    expect(response.negatedSymptoms).toContain('vomiting');
  });

  it('7. Handles markdown-fenced JSON responses from Grok defensively', async () => {
    const fencedContent = `\`\`\`json
{
  "intent": "symptom_report",
  "patient_name": null,
  "conversational_reply": "Got it, evaluating your symptoms carefully.",
  "follow_up_question": "Do you also experience dizziness or blurred vision?",
  "question_type": "yes_no",
  "new_positive_symptoms": ["headache"],
  "new_negated_symptoms": [],
  "duration": null,
  "is_ready_for_assessment": false
}
\`\`\``;

    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: fencedContent } }],
      }),
    } as any);

    const response = await voiceScreeningService.handleDialogue({
      text: 'My head hurts since yesterday evening',
      language: 'en',
      currentSymptoms: [],
      negatedSymptoms: [],
      answeredQuestions: {},
      questionHistory: [],
    });

    expect(response.extractedSymptoms).toContain('headache');
    expect(response.followUpQuestion?.text).toBe('Do you also experience dizziness or blurred vision?');
  });

  it('8. Falls back safely to deterministic state machine on malformed JSON without crashing', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'THIS IS CORRUPT NOT JSON' } }],
      }),
    } as any);

    const response = await voiceScreeningService.handleDialogue({
      text: 'I have fever and chills',
      language: 'en',
      currentSymptoms: [],
      negatedSymptoms: [],
      answeredQuestions: {},
      questionHistory: [],
    });

    // Should gracefully fall back to local rule-based extractor and duration question
    expect(response.isFinished).toBe(false);
    expect(response.extractedSymptoms).toContain('fever');
    expect(response.followUpQuestion).toBeDefined();
    expect(response.followUpQuestion?.questionType).toBe('duration');
  });

  it('9. Falls back safely on HTTP 429 rate limit or HTTP 500 server error', async () => {
    // 1. Rate limit (429)
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    } as any);

    let response = await voiceScreeningService.handleDialogue({
      text: 'I have a cough since Monday',
      language: 'en',
      currentSymptoms: [],
      negatedSymptoms: [],
      answeredQuestions: {},
      questionHistory: [],
    });

    expect(response.isFinished).toBe(false);
    expect(response.extractedSymptoms).toContain('cough');
    expect(response.followUpQuestion).toBeDefined();

    // 2. Server Error (500)
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as any);

    response = await voiceScreeningService.handleDialogue({
      text: 'I have a cough since Monday',
      language: 'en',
      currentSymptoms: [],
      negatedSymptoms: [],
      answeredQuestions: {},
      questionHistory: [],
    });

    expect(response.isFinished).toBe(false);
    expect(response.extractedSymptoms).toContain('cough');
  });

  it('10. Falls back safely on bounded 5000ms timeout / network abortion', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
    );

    const response = await voiceScreeningService.handleDialogue({
      text: 'I have a fever since morning',
      language: 'en',
      currentSymptoms: [],
      negatedSymptoms: [],
      answeredQuestions: {},
      questionHistory: [],
    });

    expect(response.isFinished).toBe(false);
    expect(response.extractedSymptoms).toContain('fever');
    expect(response.followUpQuestion).toBeDefined();
  });

  it('11. Critical Safety: Emergency red flags bypass the LLM completely and immediately escalate', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');

    // Marathi emergency sign: छातीत असह्य वेदना (chest pain)
    const mrEmergency = await voiceScreeningService.handleDialogue({
      text: 'माझ्या छातीत असह्य वेदना होत आहेत आणि श्वास कोंडतोय',
      language: 'mr',
      currentSymptoms: [],
      negatedSymptoms: [],
      answeredQuestions: {},
      questionHistory: [],
    });

    expect(mrEmergency.isEmergency).toBe(true);
    expect(mrEmergency.riskTier).toBe('HIGH');
    expect(mrEmergency.isFinished).toBe(true);
    expect(mrEmergency.recommendedSpecialty).toBe('Emergency Medicine');
    expect(mrEmergency.emergencyFlags.length).toBeGreaterThan(0);
    expect(mrEmergency.guidanceText).toMatch(/तात्काळ|रुग्णालयात/i);

    // Grok fetch MUST NOT be called for emergency situations!
    expect(fetchSpy).not.toHaveBeenCalled();

    // Hindi emergency sign: सीने में तेज दर्द (chest pain)
    const hiEmergency = await voiceScreeningService.handleDialogue({
      text: 'सीने में दर्द हो रहा है और बहुत पसीना आ रहा है',
      language: 'hi',
      currentSymptoms: [],
      negatedSymptoms: [],
      answeredQuestions: {},
      questionHistory: [],
    });

    expect(hiEmergency.isEmergency).toBe(true);
    expect(hiEmergency.riskTier).toBe('HIGH');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('12. Privacy Protection: Strips phone numbers and emails and never transmits patient identifiers', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: 'symptom_report',
                patient_name: null,
                conversational_reply: 'Understood.',
                follow_up_question: 'How long have you had the fever?',
                question_type: 'duration',
                new_positive_symptoms: ['fever'],
                new_negated_symptoms: [],
                duration: null,
                is_ready_for_assessment: false,
              }),
            },
          },
        ],
      }),
    } as any);

    await voiceScreeningService.handleDialogue({
      text: 'My phone number is 9876543210 and my email is test@ruralhealth.org and I have a fever',
      patientName: 'Ramesh Patil',
      language: 'en',
      currentSymptoms: [],
      negatedSymptoms: [],
      answeredQuestions: {},
      questionHistory: [],
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const bodySent = JSON.parse(fetchSpy.mock.calls[0][1].body);
    const userMessage = bodySent.messages.find((m: any) => m.role === 'user').content;

    // Must NOT contain the raw phone number or email
    expect(userMessage).not.toContain('9876543210');
    expect(userMessage).not.toContain('test@ruralhealth.org');
    expect(userMessage).toContain('[PHONE]');
    expect(userMessage).toContain('[EMAIL]');

    // Must NOT transmit the patient name to the LLM
    expect(userMessage).not.toContain('Ramesh Patil');
  });

  it('13. generateLowRiskHomeCareTips uses active Grok provider with reliable fallback', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'तपासणी पूर्ण झाली. हा सौम्य ताप आहे.\n• भरपूर पाणी व ओआरएस प्या.\n• विश्रांती घ्या.',
            },
          },
        ],
      }),
    } as any);

    const tips = await voiceScreeningService.generateLowRiskHomeCareTips(['fever'], 'mr', 'Santosh');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(tips).toContain('सौम्य ताप');

    // On network failure, falls back to localized dictionary
    fetchSpy.mockRejectedValueOnce(new Error('Network down'));
    const fallbackTips = await voiceScreeningService.generateLowRiskHomeCareTips(['fever'], 'mr');
    expect(fallbackTips).toMatch(/कमी जोखमीचा|विश्रांती|पाणी/i);
  });

  it('14. Interprets colloquial Hindi symptom descriptions end-to-end', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('LLM offline'));

    // 14a. Back pain
    const resBackPain = await voiceScreeningService.handleDialogue({
      text: 'मेरी कमर में दर्द हो रहा है।',
      language: 'hi',
      currentSymptoms: [],
      negatedSymptoms: [],
    });
    expect(resBackPain.extractedSymptoms).toContain('back_pain');
    expect(resBackPain.guidanceText).toContain('कमर दर्द');
    expect(resBackPain.followUpQuestion?.text).toContain('कमर दर्द');

    // 14b. Fever with duration ("दो दिन से")
    const resFever = await voiceScreeningService.handleDialogue({
      text: 'मुझे दो दिन से बुखार है।',
      language: 'hi',
      currentSymptoms: [],
      negatedSymptoms: [],
    });
    expect(resFever.extractedSymptoms).toContain('fever');
    // Because duration was already supplied, follow-up must NOT ask duration; it must ask associated warning signs
    expect(resFever.followUpQuestion?.questionType).toBe('yes_no');
    expect(resFever.followUpQuestion?.text).toContain('ठंड, पसीना या कंपकंपी');

    // 14c. Dizziness and fatigue ("चक्कर आ रहे हैं और कमजोरी लग रही है")
    const resDizzy = await voiceScreeningService.handleDialogue({
      text: 'मुझे चक्कर आ रहे हैं और कमजोरी लग रही है।',
      language: 'hi',
      currentSymptoms: [],
      negatedSymptoms: [],
    });
    expect(resDizzy.extractedSymptoms).toContain('dizziness');
    expect(resDizzy.extractedSymptoms).toContain('fatigue');

    // 14d. Contrastive negation ("खांसी है लेकिन बुखार बिल्कुल नहीं है")
    const resCoughNoFever = await voiceScreeningService.handleDialogue({
      text: 'खांसी है लेकिन बुखार बिल्कुल नहीं है।',
      language: 'hi',
      currentSymptoms: [],
      negatedSymptoms: [],
    });
    expect(resCoughNoFever.extractedSymptoms).toContain('cough');
    expect(resCoughNoFever.negatedSymptoms).toContain('fever');
    expect(resCoughNoFever.extractedSymptoms).not.toContain('fever');
  });

  it('15. Interprets colloquial Marathi symptom descriptions end-to-end', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('LLM offline'));

    // 15a. Back pain ("माझ्या कंबरेत दुखत आहे.")
    const resBackPain = await voiceScreeningService.handleDialogue({
      text: 'माझ्या कंबरेत दुखत आहे.',
      language: 'mr',
      currentSymptoms: [],
      negatedSymptoms: [],
    });
    expect(resBackPain.extractedSymptoms).toContain('back_pain');
    expect(resBackPain.guidanceText).toContain('कंबरदुखी');
    expect(resBackPain.followUpQuestion?.text).toContain('कंबरदुखी');

    // 15b. Fever with duration ("मला दोन दिवसांपासून ताप आहे.")
    const resFever = await voiceScreeningService.handleDialogue({
      text: 'मला दोन दिवसांपासून ताप आहे.',
      language: 'mr',
      currentSymptoms: [],
      negatedSymptoms: [],
    });
    expect(resFever.extractedSymptoms).toContain('fever');
    expect(resFever.followUpQuestion?.questionType).toBe('yes_no');
    expect(resFever.followUpQuestion?.text).toContain('थंडी वाजणे');

    // 15c. Dizziness and fatigue ("मला चक्कर येत आहेत आणि अशक्तपणा जाणवत आहे.")
    const resDizzy = await voiceScreeningService.handleDialogue({
      text: 'मला चक्कर येत आहेत आणि अशक्तपणा जाणवत आहे.',
      language: 'mr',
      currentSymptoms: [],
      negatedSymptoms: [],
    });
    expect(resDizzy.extractedSymptoms).toContain('dizziness');
    expect(resDizzy.extractedSymptoms).toContain('fatigue');

    // 15d. Contrastive negation ("खोकला आहे पण ताप अजिबात नाही.")
    const resCoughNoFever = await voiceScreeningService.handleDialogue({
      text: 'खोकला आहे पण ताप अजिबात नाही.',
      language: 'mr',
      currentSymptoms: [],
      negatedSymptoms: [],
    });
    expect(resCoughNoFever.extractedSymptoms).toContain('cough');
    expect(resCoughNoFever.negatedSymptoms).toContain('fever');
    expect(resCoughNoFever.extractedSymptoms).not.toContain('fever');
  });

  it('16. Interprets colloquial English symptom descriptions end-to-end', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('LLM offline'));

    // 16a. Back pain ("My lower back hurts.")
    const resBackPain = await voiceScreeningService.handleDialogue({
      text: 'My lower back hurts.',
      language: 'en',
      currentSymptoms: [],
      negatedSymptoms: [],
    });
    expect(resBackPain.extractedSymptoms).toContain('back_pain');
    expect(resBackPain.guidanceText).toContain('back pain');
    expect(resBackPain.followUpQuestion?.text).toContain('back pain');

    // 16b. Fever with duration ("I have had a fever for two days.")
    const resFever = await voiceScreeningService.handleDialogue({
      text: 'I have had a fever for two days.',
      language: 'en',
      currentSymptoms: [],
      negatedSymptoms: [],
    });
    expect(resFever.extractedSymptoms).toContain('fever');
    expect(resFever.followUpQuestion?.questionType).toBe('yes_no');
    expect(resFever.followUpQuestion?.text).toContain('chills, sweating');

    // 16c. Dizziness and fatigue ("I feel dizzy and weak.")
    const resDizzy = await voiceScreeningService.handleDialogue({
      text: 'I feel dizzy and weak.',
      language: 'en',
      currentSymptoms: [],
      negatedSymptoms: [],
    });
    expect(resDizzy.extractedSymptoms).toContain('dizziness');
    expect(resDizzy.extractedSymptoms).toContain('fatigue');

    // 16d. Contrastive negation ("I have a cough but no fever.")
    const resCoughNoFever = await voiceScreeningService.handleDialogue({
      text: 'I have a cough but no fever.',
      language: 'en',
      currentSymptoms: [],
      negatedSymptoms: [],
    });
    expect(resCoughNoFever.extractedSymptoms).toContain('cough');
    expect(resCoughNoFever.negatedSymptoms).toContain('fever');
    expect(resCoughNoFever.extractedSymptoms).not.toContain('fever');
  });

  it('17. Automatically fails over from Grok credit exhaustion (HTTP 403) to Groq dialogue provider', async () => {
    (env as any).DIALOGUE_LLM_PROVIDER = 'auto';
    (env as any).GROK_API_KEY = 'xai-depleted-credits-key';
    (env as any).GROQ_API_KEY = 'groq-valid-key';

    // First call to Grok returns 403 Forbidden (credit limit reached)
    // Second call to Groq returns 200 OK
    fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: 'credit limit reached' }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  intent: 'symptom_report',
                  patient_name: null,
                  conversational_reply: 'मैंने समझ लिया कि आपको सिरदर्द हो रहा है।',
                  follow_up_question: 'यह सिरदर्द कब से शुरू हुआ है?',
                  question_type: 'duration',
                  new_positive_symptoms: ['headache'],
                  new_negated_symptoms: [],
                  duration: null,
                  is_ready_for_assessment: false,
                }),
              },
            },
          ],
        }),
      } as any);

    const result = await voiceScreeningService.handleDialogue({
      text: 'सिर में बहुत तेज दर्द हो रहा है',
      language: 'hi',
      currentSymptoms: [],
      negatedSymptoms: [],
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // Grok was attempted first
    expect(fetchSpy.mock.calls[0][0]).toContain('api.x.ai');
    // Groq was attempted second on failover
    expect(fetchSpy.mock.calls[1][0]).toContain('api.groq.com');
    expect(result.extractedSymptoms).toContain('headache');
    expect(result.guidanceText).toBe('मैंने समझ लिया कि आपको सिरदर्द हो रहा है।');
    expect(result.followUpQuestion?.text).toBe('यह सिरदर्द कब से शुरू हुआ है?');
  });
});
