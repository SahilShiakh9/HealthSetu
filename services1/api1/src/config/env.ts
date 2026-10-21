import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

// Load .env from current directory and parent monorepo root
config();
try {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  config({ path: path.resolve(currentDir, '../../../../.env') });
  config({ path: path.resolve(process.cwd(), '../../.env') });
  config({ path: path.resolve(process.cwd(), '.env') });
} catch {}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/healthsetu'),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters')
    .default('dev_default_jwt_access_secret_min_32_characters_long_for_security'),
  REFRESH_TOKEN_PEPPER: z
    .string()
    .min(32, 'REFRESH_TOKEN_PEPPER must be at least 32 characters')
    .default('dev_default_refresh_pepper_min_32_characters_long_for_security'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  COOKIE_DOMAIN: z.string().default('localhost'),
  ML_SERVICE_URL: z.string().default('http://localhost:8000'),
  ML_INTERNAL_KEY: z.string().default('dev_internal_secret_key_between_api_and_ml_service'),
  ZEGO_APP_ID: z.coerce.number().default(123456789),
  ZEGO_SERVER_SECRET: z.string().default('dev_zego_server_secret_for_token_generation_32char'),
  OTP_PROVIDER: z.enum(['console', 'sms_stub', 'fast2sms']).default('console'),
  FILE_STORAGE: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default('./uploads'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  OVERPASS_API_URL: z.string().default('https://overpass-api.de/api/interpreter'),
  OVERPASS_TIMEOUT_MS: z.coerce.number().default(8000),
  GROK_API_KEY: z.string().optional(),
  GROK_API_URL: z.string().default('https://api.x.ai/v1'),
  GROK_MODEL: z.string().default('grok-2-mini'),
  DIALOGUE_LLM_PROVIDER: z.enum(['auto', 'grok', 'groq', 'none']).default('auto'),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('qwen/qwen3.8-27b'),
  GEOAPIFY_API_KEY: z.string().optional(),
  GEOAPIFY_TIMEOUT_MS: z.coerce.number().default(8000),
  FACILITY_DISCOVERY_STRATEGY: z
    .enum(['mongodb', 'geoapify', 'overpass', 'hybrid'])
    .default('hybrid'),
});

const parseEnv = () => {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    throw new Error('Environment configuration validation failed');
  }
  return result.data;
};

export const env = parseEnv();
