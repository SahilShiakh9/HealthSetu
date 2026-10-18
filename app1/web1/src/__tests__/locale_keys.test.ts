import { describe, it, expect } from 'vitest';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';
import mr from '../i18n/locales/mr.json';

const getDeepKeys = (obj: Record<string, any>, prefix = ''): string[] => {
  return Object.keys(obj).flatMap((key) => {
    const val = obj[key];
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      return getDeepKeys(val, path);
    }
    return [path];
  });
};

describe('Phase 10 Verification: i18n Locales Key Consistency', () => {
  const enKeys = new Set(getDeepKeys(en));
  const hiKeys = new Set(getDeepKeys(hi));
  const mrKeys = new Set(getDeepKeys(mr));

  it('verifies English, Hindi, and Marathi have identical translation key sets', () => {
    expect(enKeys.size).toBeGreaterThan(0);
    expect(hiKeys.size).toBe(enKeys.size);
    expect(mrKeys.size).toBe(enKeys.size);

    const missingInHi = [...enKeys].filter((k) => !hiKeys.has(k));
    const missingInMr = [...enKeys].filter((k) => !mrKeys.has(k));
    const extraInHi = [...hiKeys].filter((k) => !enKeys.has(k));
    const extraInMr = [...mrKeys].filter((k) => !enKeys.has(k));

    expect(missingInHi).toEqual([]);
    expect(missingInMr).toEqual([]);
    expect(extraInHi).toEqual([]);
    expect(extraInMr).toEqual([]);
  });

  it('verifies non-empty translated string values for all keys', () => {
    for (const key of enKeys) {
      const parts = key.split('.');
      const getVal = (obj: any) => parts.reduce((acc, part) => acc?.[part], obj);

      const enVal = getVal(en);
      const hiVal = getVal(hi);
      const mrVal = getVal(mr);

      expect(typeof enVal).toBe('string');
      expect(enVal.trim().length).toBeGreaterThan(0);

      expect(typeof hiVal).toBe('string');
      expect(hiVal.trim().length).toBeGreaterThan(0);

      expect(typeof mrVal).toBe('string');
      expect(mrVal.trim().length).toBeGreaterThan(0);
    }
  });
});
