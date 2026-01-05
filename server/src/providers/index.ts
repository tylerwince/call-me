/**
 * Provider Factory
 *
 * Creates and configures providers based on environment variables.
 * Uses Telnyx for phone and OpenAI for TTS.
 * STT is handled by OpenAI Realtime API directly in phone-call.ts.
 */

import type { PhoneProvider, TTSProvider } from './types.js';
import { TelnyxPhoneProvider } from './phone-telnyx.js';
import { OpenAITTSProvider } from './tts-openai.js';

export * from './types.js';

export interface ProviderConfig {
  // Phone (Telnyx)
  phoneAccountSid: string;  // Telnyx Connection ID
  phoneAuthToken: string;   // Telnyx API Key
  phoneNumber: string;

  // TTS (OpenAI)
  openaiApiKey: string;
  ttsVoice?: string;
}

export function loadProviderConfig(): ProviderConfig {
  return {
    phoneAccountSid: process.env.CALLME_PHONE_ACCOUNT_SID || '',
    phoneAuthToken: process.env.CALLME_PHONE_AUTH_TOKEN || '',
    phoneNumber: process.env.CALLME_PHONE_NUMBER || '',
    openaiApiKey: process.env.CALLME_OPENAI_API_KEY || '',
    ttsVoice: process.env.CALLME_TTS_VOICE || 'onyx',
  };
}

export function createPhoneProvider(config: ProviderConfig): PhoneProvider {
  const provider = new TelnyxPhoneProvider();
  provider.initialize({
    accountSid: config.phoneAccountSid,
    authToken: config.phoneAuthToken,
    phoneNumber: config.phoneNumber,
  });
  return provider;
}

export function createTTSProvider(config: ProviderConfig): TTSProvider {
  const provider = new OpenAITTSProvider();
  provider.initialize({
    apiKey: config.openaiApiKey,
    voice: config.ttsVoice,
  });
  return provider;
}

export interface ProviderRegistry {
  phone: PhoneProvider;
  tts: TTSProvider;
}

export function createProviders(config: ProviderConfig): ProviderRegistry {
  return {
    phone: createPhoneProvider(config),
    tts: createTTSProvider(config),
  };
}

/**
 * Validate that required config is present
 */
export function validateProviderConfig(config: ProviderConfig): string[] {
  const errors: string[] = [];

  if (!config.phoneAccountSid) {
    errors.push('Missing CALLME_PHONE_ACCOUNT_SID (Telnyx Connection ID)');
  }
  if (!config.phoneAuthToken) {
    errors.push('Missing CALLME_PHONE_AUTH_TOKEN (Telnyx API Key)');
  }
  if (!config.phoneNumber) {
    errors.push('Missing CALLME_PHONE_NUMBER');
  }
  if (!config.openaiApiKey) {
    errors.push('Missing CALLME_OPENAI_API_KEY');
  }

  return errors;
}
