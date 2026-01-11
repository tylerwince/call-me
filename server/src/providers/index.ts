/**
 * Provider Factory
 *
 * Creates and configures text providers based on environment variables.
 * Supports iMessage, Telegram, and Slack.
 */

import type { TextProvider, TextProviderConfig } from './types.js';
import { IMessageProvider } from './text-imessage.js';
import { TelegramProvider } from './text-telegram.js';
import { SlackProvider } from './text-slack.js';

export * from './types.js';

export type TextProviderType = 'imessage' | 'telegram' | 'slack';

export interface ProviderConfig {
  // Provider selection
  provider: TextProviderType;

  // iMessage
  imessageRecipient?: string;

  // Telegram
  telegramBotToken?: string;
  telegramChatId?: string;

  // Slack
  slackBotToken?: string;
  slackAppToken?: string;
  slackChannel?: string;

  // Common
  messageTimeoutMs: number;
}

export function loadProviderConfig(): ProviderConfig {
  const messageTimeoutMs = process.env.TEXTME_MESSAGE_TIMEOUT_MS
    ? parseInt(process.env.TEXTME_MESSAGE_TIMEOUT_MS, 10)
    : 300000; // 5 minutes default

  const provider = (process.env.TEXTME_PROVIDER || 'imessage') as TextProviderType;

  return {
    provider,
    imessageRecipient: process.env.TEXTME_IMESSAGE_RECIPIENT,
    telegramBotToken: process.env.TEXTME_TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TEXTME_TELEGRAM_CHAT_ID,
    slackBotToken: process.env.TEXTME_SLACK_BOT_TOKEN,
    slackAppToken: process.env.TEXTME_SLACK_APP_TOKEN,
    slackChannel: process.env.TEXTME_SLACK_CHANNEL,
    messageTimeoutMs,
  };
}

export function createTextProvider(config: ProviderConfig): TextProvider {
  switch (config.provider) {
    case 'imessage':
      return new IMessageProvider();
    case 'telegram':
      return new TelegramProvider();
    case 'slack':
      return new SlackProvider();
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

export function getProviderConfig(config: ProviderConfig): TextProviderConfig {
  return {
    imessageRecipient: config.imessageRecipient,
    telegramBotToken: config.telegramBotToken,
    telegramChatId: config.telegramChatId,
    slackBotToken: config.slackBotToken,
    slackAppToken: config.slackAppToken,
    slackChannel: config.slackChannel,
    messageTimeoutMs: config.messageTimeoutMs,
  };
}

/**
 * Validate that required config is present for the selected provider
 */
export function validateProviderConfig(config: ProviderConfig): string[] {
  const errors: string[] = [];

  switch (config.provider) {
    case 'imessage':
      if (!config.imessageRecipient) {
        errors.push('Missing TEXTME_IMESSAGE_RECIPIENT (phone number or email)');
      }
      break;

    case 'telegram':
      if (!config.telegramBotToken) {
        errors.push('Missing TEXTME_TELEGRAM_BOT_TOKEN');
      }
      if (!config.telegramChatId) {
        errors.push('Missing TEXTME_TELEGRAM_CHAT_ID');
      }
      break;

    case 'slack':
      if (!config.slackBotToken) {
        errors.push('Missing TEXTME_SLACK_BOT_TOKEN (xoxb-...)');
      }
      if (!config.slackAppToken) {
        errors.push('Missing TEXTME_SLACK_APP_TOKEN (xapp-...)');
      }
      if (!config.slackChannel) {
        errors.push('Missing TEXTME_SLACK_CHANNEL (channel ID)');
      }
      break;
  }

  return errors;
}
