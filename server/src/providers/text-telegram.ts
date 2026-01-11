/**
 * Telegram Text Provider
 *
 * Uses the grammy library to send and receive Telegram messages via bot API.
 */

import { Bot } from 'grammy';
import type { TextProvider, TextProviderConfig, Message } from './types.js';

export class TelegramProvider implements TextProvider {
  readonly name = 'telegram';

  private bot: Bot | null = null;
  private chatId: string = '';
  private messageQueue: string[] = [];
  private messageWaiters: Array<(message: string) => void> = [];
  private conversationHistory: Message[] = [];
  private isRunning = false;

  async initialize(config: TextProviderConfig): Promise<void> {
    if (!config.telegramBotToken) {
      throw new Error('Missing TEXTME_TELEGRAM_BOT_TOKEN');
    }
    if (!config.telegramChatId) {
      throw new Error('Missing TEXTME_TELEGRAM_CHAT_ID');
    }

    this.chatId = config.telegramChatId;
    this.bot = new Bot(config.telegramBotToken);

    // Handle incoming text messages
    this.bot.on('message:text', (ctx) => {
      // Only process messages from the configured chat
      if (String(ctx.chat.id) !== this.chatId) {
        console.error(`[Telegram] Ignoring message from chat ${ctx.chat.id} (expected ${this.chatId})`);
        return;
      }

      const text = ctx.message.text;
      this.handleIncomingMessage(text);
    });

    // Handle errors
    this.bot.catch((err) => {
      console.error('[Telegram] Bot error:', err);
    });

    // Start the bot with long polling
    console.error('[Telegram] Starting bot...');
    this.isRunning = true;
    this.bot.start({
      onStart: (botInfo) => {
        console.error(`[Telegram] Bot started: @${botInfo.username}`);
      },
    });
  }

  private handleIncomingMessage(text: string): void {
    // Add to conversation history
    this.conversationHistory.push({
      text,
      fromUser: true,
      timestamp: new Date(),
    });

    // If someone is waiting for a message, resolve their promise
    const waiter = this.messageWaiters.shift();
    if (waiter) {
      waiter(text);
    } else {
      // Otherwise queue it for later
      this.messageQueue.push(text);
    }
  }

  async sendMessage(message: string): Promise<void> {
    if (!this.bot) {
      throw new Error('Telegram bot not initialized');
    }

    await this.bot.api.sendMessage(this.chatId, message);

    // Add to conversation history
    this.conversationHistory.push({
      text: message,
      fromUser: false,
      timestamp: new Date(),
    });
  }

  async waitForMessage(timeoutMs: number = 300000): Promise<string> {
    // Check if there's a queued message
    const queued = this.messageQueue.shift();
    if (queued) {
      return queued;
    }

    // Wait for the next message
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const idx = this.messageWaiters.indexOf(resolve);
        if (idx !== -1) {
          this.messageWaiters.splice(idx, 1);
        }
        reject(new Error('Timeout waiting for message'));
      }, timeoutMs);

      this.messageWaiters.push((message: string) => {
        clearTimeout(timeout);
        resolve(message);
      });
    });
  }

  async getRecentMessages(limit: number = 10): Promise<Message[]> {
    return this.conversationHistory.slice(-limit);
  }

  shutdown(): void {
    this.isRunning = false;
    if (this.bot) {
      this.bot.stop();
      this.bot = null;
    }
    this.messageWaiters = [];
    this.messageQueue = [];
  }
}
