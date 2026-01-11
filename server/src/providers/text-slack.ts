/**
 * Slack Text Provider
 *
 * Uses @slack/bolt with Socket Mode to send and receive Slack messages.
 */

import { App, type GenericMessageEvent } from '@slack/bolt';
import type { TextProvider, TextProviderConfig, Message } from './types.js';

export class SlackProvider implements TextProvider {
  readonly name = 'slack';

  private app: App | null = null;
  private channel: string = '';
  private botUserId: string = '';
  private messageQueue: string[] = [];
  private messageWaiters: Array<(message: string) => void> = [];
  private conversationHistory: Message[] = [];

  async initialize(config: TextProviderConfig): Promise<void> {
    if (!config.slackBotToken) {
      throw new Error('Missing TEXTME_SLACK_BOT_TOKEN');
    }
    if (!config.slackAppToken) {
      throw new Error('Missing TEXTME_SLACK_APP_TOKEN');
    }
    if (!config.slackChannel) {
      throw new Error('Missing TEXTME_SLACK_CHANNEL');
    }

    this.channel = config.slackChannel;

    this.app = new App({
      token: config.slackBotToken,
      appToken: config.slackAppToken,
      socketMode: true,
    });

    // Get bot user ID to filter out our own messages
    const authResult = await this.app.client.auth.test();
    this.botUserId = authResult.user_id as string;
    console.error(`[Slack] Bot user ID: ${this.botUserId}`);

    // Handle incoming messages
    this.app.message(async ({ message }) => {
      const msg = message as GenericMessageEvent;

      // Only process messages from the configured channel
      if (msg.channel !== this.channel) {
        return;
      }

      // Ignore messages from the bot itself
      if (msg.user === this.botUserId) {
        return;
      }

      // Ignore bot messages and subtypes (edits, deletes, etc.)
      if (msg.subtype) {
        return;
      }

      const text = msg.text || '';
      this.handleIncomingMessage(text);
    });

    // Start the app
    console.error('[Slack] Starting Socket Mode connection...');
    await this.app.start();
    console.error('[Slack] Connected to Slack');
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
    if (!this.app) {
      throw new Error('Slack app not initialized');
    }

    await this.app.client.chat.postMessage({
      channel: this.channel,
      text: message,
    });

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
    if (this.app) {
      this.app.stop();
      this.app = null;
    }
    this.messageWaiters = [];
    this.messageQueue = [];
  }
}
