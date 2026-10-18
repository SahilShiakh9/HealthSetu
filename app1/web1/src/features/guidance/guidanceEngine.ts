import Fuse, { type IFuseOptions } from 'fuse.js';
import type { GuidanceTopic, Language } from '@healthsetu/contracts';
import { GUIDANCE_TOPICS } from './guidanceData';
import { db } from '../../offline/db';

export const GUIDANCE_DISCLAIMER =
  'HealthSetu Health Guidance is educational and intended for rural health literacy and first-aid support. It is NOT an official medical prescription or clinical diagnosis. In case of acute illness or danger signs, dial 108 or visit the nearest Primary Health Centre (PHC) immediately.';

export interface GuidanceSearchResult {
  topic: GuidanceTopic;
  score: number;
}

// Build Fuse index across multilingual titles, keywords, and summaries
const fuseOptions: IFuseOptions<GuidanceTopic> = {
  includeScore: true,
  threshold: 0.45,
  keys: [
    { name: 'keywords', weight: 0.4 },
    { name: 'title.en', weight: 0.2 },
    { name: 'title.hi', weight: 0.2 },
    { name: 'title.mr', weight: 0.2 },
    { name: 'summary.en', weight: 0.1 },
    { name: 'summary.hi', weight: 0.1 },
    { name: 'summary.mr', weight: 0.1 },
  ],
};

const fuseInstance = new Fuse(GUIDANCE_TOPICS, fuseOptions);

/**
 * Search topics by free-text query with fuzzy tolerance across English, Hindi, and Marathi
 */
export function searchGuidance(query: string, language: Language = 'en'): GuidanceTopic[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return GUIDANCE_TOPICS;
  }

  // 1. Direct keyword token match for instantaneous precision
  const exactMatches: GuidanceTopic[] = [];
  const queryTokens = trimmed.split(/\s+/).filter(Boolean);

  for (const topic of GUIDANCE_TOPICS) {
    const topicText = [
      ...topic.keywords,
      topic.title[language] || topic.title.en,
      topic.summary[language] || topic.summary.en,
    ]
      .join(' ')
      .toLowerCase();

    const matchesAll = queryTokens.some((tok) => topicText.includes(tok));
    if (matchesAll) {
      exactMatches.push(topic);
    }
  }

  if (exactMatches.length > 0) {
    return exactMatches;
  }

  // 2. Fuzzy Fuse search for misspellings and partial phrases
  const fuzzyResults = fuseInstance.search(trimmed);
  if (fuzzyResults.length > 0) {
    return fuzzyResults.map((r) => r.item);
  }

  return [];
}

/**
 * Retrieve single guidance topic by ID
 */
export function getGuidanceTopicById(id: string): GuidanceTopic | undefined {
  return GUIDANCE_TOPICS.find((t) => t.id === id);
}

/**
 * Seed guidance cache into Dexie for offline querying
 */
export async function seedGuidanceCache(): Promise<void> {
  try {
    const count = await db.guidanceCache.count();
    if (count < GUIDANCE_TOPICS.length) {
      const records = GUIDANCE_TOPICS.map((topic) => ({
        key: `guidance_${topic.id}`,
        language: 'all',
        pageId: topic.id,
        data: topic,
      }));
      await db.guidanceCache.bulkPut(records);
    }
  } catch (err) {
    console.warn('Failed to cache guidance to Dexie:', err);
  }
}
