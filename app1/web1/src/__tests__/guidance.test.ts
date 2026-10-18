import { describe, it, expect, beforeEach } from 'vitest';
import {
  searchGuidance,
  getGuidanceTopicById,
  seedGuidanceCache,
  GUIDANCE_DISCLAIMER,
} from '../features/guidance/guidanceEngine';
import { GUIDANCE_TOPICS } from '../features/guidance/guidanceData';
import { db } from '../offline/db';
import { speechService, getLocaleTag } from '../services/speechService';

describe('Phase 7 Health Guidance & First Aid Engine', () => {
  beforeEach(async () => {
    await db.guidanceCache.clear();
  });

  it('returns all guidance topics when query is empty', () => {
    const results = searchGuidance('');
    expect(results.length).toBe(GUIDANCE_TOPICS.length);
    expect(results.length).toBeGreaterThanOrEqual(8);
  });

  it('searches topics accurately in English (e.g. snakebite and ORS)', () => {
    const snakebiteResults = searchGuidance('snakebite', 'en');
    expect(snakebiteResults.length).toBeGreaterThan(0);
    expect(snakebiteResults[0].id).toBe('snakebite-first-aid');

    const orsResults = searchGuidance('ORS dehydration', 'en');
    expect(orsResults.length).toBeGreaterThan(0);
    expect(orsResults[0].id).toBe('ors-dehydration');
  });

  it('searches topics accurately in Marathi (उदा. सर्पदंश, जलसंजीवनी, लसीकरण)', () => {
    const snakebiteMr = searchGuidance('सर्पदंश', 'mr');
    expect(snakebiteMr.length).toBeGreaterThan(0);
    expect(snakebiteMr[0].id).toBe('snakebite-first-aid');

    const vaccineMr = searchGuidance('लसीकरण', 'mr');
    expect(vaccineMr.length).toBeGreaterThan(0);
    expect(vaccineMr[0].id).toBe('immunization-schedule');
  });

  it('searches topics accurately in Hindi (जैसे ओआरएस, क्षयरोग, गर्भावस्था)', () => {
    const orsHi = searchGuidance('ओआरएस', 'hi');
    expect(orsHi.length).toBeGreaterThan(0);
    expect(orsHi[0].id).toBe('ors-dehydration');

    const tbHi = searchGuidance('क्षयरोग', 'hi');
    expect(tbHi.length).toBeGreaterThan(0);
    expect(tbHi[0].id).toBe('tb-screening-dots');
  });

  it('tolerates minor typos via fuzzy search (e.g. snakebit)', () => {
    const fuzzySnake = searchGuidance('snakebit', 'en');
    expect(fuzzySnake.length).toBeGreaterThan(0);
    expect(fuzzySnake.some((t) => t.id === 'snakebite-first-aid')).toBe(true);
  });

  it('verifies clinical content integrity and multilingual parity across all topics', () => {
    for (const topic of GUIDANCE_TOPICS) {
      expect(topic.id).toBeTruthy();
      expect(topic.category).toBeTruthy();
      expect(topic.title.en).toBeTruthy();
      expect(topic.title.hi).toBeTruthy();
      expect(topic.title.mr).toBeTruthy();
      expect(topic.summary.en).toBeTruthy();
      expect(topic.summary.hi).toBeTruthy();
      expect(topic.summary.mr).toBeTruthy();
      expect(topic.keySteps.length).toBeGreaterThanOrEqual(3);

      for (const step of topic.keySteps) {
        expect(step.step).toBeGreaterThan(0);
        expect(step.text.en).toBeTruthy();
        expect(step.text.hi).toBeTruthy();
        expect(step.text.mr).toBeTruthy();
      }
    }
  });

  it('seeds guidance cache into Dexie db.guidanceCache for 100% offline querying', async () => {
    await seedGuidanceCache();
    const count = await db.guidanceCache.count();
    expect(count).toBe(GUIDANCE_TOPICS.length);

    const cachedOrs = await db.guidanceCache.get('guidance_ors-dehydration');
    expect(cachedOrs).toBeDefined();
    expect((cachedOrs?.data as any).id).toBe('ors-dehydration');
  });

  it('retrieves single guidance topic by ID', () => {
    const topic = getGuidanceTopicById('maternal-danger-signs');
    expect(topic).toBeDefined();
    expect(topic?.category).toBe('MATERNAL_CHILD');
    expect(topic?.emergencyWarning).toBeDefined();
  });

  it('includes mandatory statutory disclaimer on all responses', () => {
    expect(GUIDANCE_DISCLAIMER).toContain('NOT an official medical prescription');
    expect(GUIDANCE_DISCLAIMER).toContain('108');
  });
});

describe('Phase 7 Speech Service & Fallback', () => {
  it('correctly maps languages to BCP-47 locale tags', () => {
    expect(getLocaleTag('hi')).toBe('hi-IN');
    expect(getLocaleTag('mr')).toBe('mr-IN');
    expect(getLocaleTag('en')).toBe('en-IN');
  });

  it('falls back to mock voice transcription with isMock=true in headless test environment', async () => {
    const result = await new Promise<any>((resolve) => {
      speechService.startListening('mr', {
        onResult: (res) => resolve(res),
      });
    });

    expect(result).toBeDefined();
    expect(result.transcript).toBeTruthy();
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.isMock).toBe(true);
  });
});
