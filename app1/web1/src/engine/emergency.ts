import emergencyRulesData from '../rules/emergencyRules.json';
import type { Language } from '@healthsetu/contracts';

export interface EmergencyRuleResult {
  id: string;
  message: string;
}

export interface EmergencyEvaluation {
  isEmergency: boolean;
  flags: string[];
  rules: EmergencyRuleResult[];
}

export const evaluateEmergencyRules = (
  symptoms: Record<string, 'yes' | 'no' | 'unknown'>,
  severity?: string,
  language: Language = 'en',
): EmergencyEvaluation => {
  const triggered: EmergencyRuleResult[] = [];
  const flags: string[] = [];

  for (const rule of emergencyRulesData.rules) {
    let matches = false;

    // Check 'any' condition
    if (rule.any && rule.any.length > 0) {
      const hasAny = rule.any.some((sym) => symptoms[sym] === 'yes');
      if (hasAny) {
        matches = true;
      }
    }

    // Check 'all' condition
    const r = rule as { all?: string[] };
    if (r.all && r.all.length > 0) {
      const hasAll = r.all.every((sym: string) => symptoms[sym] === 'yes');
      if (hasAll) {
        matches = true;
      }
    }

    // Check minSeverity constraint
    if (matches && rule.minSeverity === 'severe') {
      if (severity !== 'severe') {
        matches = false;
      }
    }

    if (matches) {
      flags.push(rule.id);
      const msg = rule.message[language] || rule.message.en;
      triggered.push({
        id: rule.id,
        message: msg,
      });
    }
  }

  return {
    isEmergency: triggered.length > 0,
    flags,
    rules: triggered,
  };
};
