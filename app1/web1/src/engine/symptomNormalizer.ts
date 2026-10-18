import Fuse from 'fuse.js';
import symptomDictData from '../rules/symptomDictionary.json';
import type { Language } from '@healthsetu/contracts';

export interface SymptomMatch {
  symptomId: string;
  matchedTerm: string;
  confidence: number; // 0 to 1
  label: string;
  needsConfirmation: boolean;
}

export class SymptomNormalizer {
  private fuseInstances: Record<Language, Fuse<{ symptomId: string; term: string; label: string }>>;

  constructor() {
    // Build search collections per language
    const itemsByLang: Record<Language, { symptomId: string; term: string; label: string }[]> = {
      en: [],
      hi: [],
      mr: [],
    };

    for (const sym of symptomDictData.symptoms) {
      for (const lang of ['en', 'hi', 'mr'] as Language[]) {
        const label = sym.labels[lang];
        const synonyms = sym.synonyms[lang] || [];

        // Add primary label
        itemsByLang[lang].push({ symptomId: sym.id, term: label, label });

        // Add synonyms
        for (const syn of synonyms) {
          itemsByLang[lang].push({ symptomId: sym.id, term: syn, label });
        }
      }
    }

    this.fuseInstances = {
      en: new Fuse(itemsByLang.en, { keys: ['term'], threshold: 0.5, includeScore: true }),
      hi: new Fuse(itemsByLang.hi, { keys: ['term'], threshold: 0.5, includeScore: true }),
      mr: new Fuse(itemsByLang.mr, { keys: ['term'], threshold: 0.5, includeScore: true }),
    };
  }

  public cleanText(text: string): string {
    return text
      .normalize('NFC')
      .toLowerCase()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'–—]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  public normalizeText(text: string, language: Language = 'en'): SymptomMatch[] {
    const cleaned = this.cleanText(text);
    if (!cleaned) return [];

    const matches: SymptomMatch[] = [];
    const seen = new Set<string>();

    // 1. Direct exact match check against dictionary
    for (const sym of symptomDictData.symptoms) {
      const syns = sym.synonyms[language] || [];
      const label = sym.labels[language];

      if (cleaned === this.cleanText(label) || syns.some((s) => cleaned === this.cleanText(s))) {
        if (!seen.has(sym.id)) {
          seen.add(sym.id);
          matches.push({
            symptomId: sym.id,
            matchedTerm: cleaned,
            confidence: 1.0,
            label,
            needsConfirmation: false,
          });
        }
      }
    }

    if (matches.length > 0) return matches;

    // 2. Fuzzy search with Fuse.js (token and full phrase)
    const fuse = this.fuseInstances[language] || this.fuseInstances.en;
    const results = fuse.search(cleaned);

    for (const res of results) {
      const symId = res.item.symptomId;
      if (!seen.has(symId) && res.score !== undefined) {
        seen.add(symId);
        const confidence = 1 - res.score; // Fuse: lower score is better match

        matches.push({
          symptomId: symId,
          matchedTerm: res.item.term,
          confidence: Math.round(confidence * 100) / 100,
          label: res.item.label,
          // Low confidence (< 0.85) requires confirmation per Section 11.2
          needsConfirmation: confidence < 0.85,
        });
      }
    }

    return matches;
  }
}

export const symptomNormalizer = new SymptomNormalizer();
