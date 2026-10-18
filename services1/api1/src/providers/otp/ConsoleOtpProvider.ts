import type { OtpProvider } from './OtpProvider.js';
import { logger } from '../../utils/logger.js';

export class ConsoleOtpProvider implements OtpProvider {
  async sendOtp(identifier: string, code: string, purpose: string): Promise<void> {
    // In dev mode, console provider prints the code clearly for testing
    logger.info(
      { identifier, code, purpose, isMock: true },
      `[OTP_DEV_CONSOLE] Verification code for ${identifier} (${purpose}): ${code}`,
    );
  }
}
