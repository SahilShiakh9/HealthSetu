export interface OtpProvider {
  sendOtp(identifier: string, code: string, purpose: string): Promise<void>;
}
