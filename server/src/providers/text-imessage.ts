/**
 * iMessage Text Provider
 *
 * Uses the imsg CLI tool to send and receive iMessages/SMS.
 */

import { spawn, type ChildProcess } from 'child_process';
import type { TextProvider, TextProviderConfig, Message } from './types.js';

interface ImsgMessage {
  rowid: number;
  guid: string;
  text: string;
  date: string;
  is_from_me: boolean;
  handle_id: number;
  chat_id: number;
  service: string;
  attachments?: Array<{
    filename: string;
    mime_type: string;
    transfer_name: string;
  }>;
}

export class IMessageProvider implements TextProvider {
  readonly name = 'imessage';

  private recipient: string = '';
  private watchProcess: ChildProcess | null = null;
  private messageQueue: string[] = [];
  private messageWaiters: Array<(message: string) => void> = [];
  private conversationHistory: Message[] = [];
  private lastSeenRowId: number = 0;

  async initialize(config: TextProviderConfig): Promise<void> {
    if (!config.imessageRecipient) {
      throw new Error('Missing TEXTME_IMESSAGE_RECIPIENT');
    }
    this.recipient = config.imessageRecipient;

    // Get the latest rowid to avoid processing old messages
    await this.initializeLastRowId();

    // Start watching for incoming messages
    this.startWatching();
  }

  private async initializeLastRowId(): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('imsg', [
        'history',
        '--participants', this.recipient,
        '--limit', '1',
        '--json',
      ]);

      let output = '';
      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0 && output.trim()) {
          try {
            const lines = output.trim().split('\n');
            for (const line of lines) {
              if (line.trim()) {
                const msg = JSON.parse(line) as ImsgMessage;
                this.lastSeenRowId = msg.rowid;
                break;
              }
            }
          } catch {
            // No messages yet, start from 0
          }
        }
        resolve();
      });

      proc.on('error', reject);
    });
  }

  private startWatching(): void {
    const args = [
      'watch',
      '--participants', this.recipient,
      '--json',
      '--since-rowid', String(this.lastSeenRowId),
    ];

    console.error(`[iMessage] Starting watch: imsg ${args.join(' ')}`);
    this.watchProcess = spawn('imsg', args);

    this.watchProcess.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line) as ImsgMessage;
          // Only process messages from the user (not from me)
          if (!msg.is_from_me && msg.rowid > this.lastSeenRowId) {
            this.lastSeenRowId = msg.rowid;
            this.handleIncomingMessage(msg.text);
          }
        } catch (err) {
          console.error('[iMessage] Failed to parse message:', err);
        }
      }
    });

    this.watchProcess.stderr?.on('data', (data) => {
      console.error('[iMessage] Watch stderr:', data.toString());
    });

    this.watchProcess.on('close', (code) => {
      console.error(`[iMessage] Watch process exited with code ${code}`);
      // Restart watching if it wasn't intentionally stopped
      if (this.watchProcess !== null) {
        setTimeout(() => this.startWatching(), 1000);
      }
    });

    this.watchProcess.on('error', (err) => {
      console.error('[iMessage] Watch process error:', err);
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
    return new Promise((resolve, reject) => {
      const proc = spawn('imsg', [
        'send',
        '--to', this.recipient,
        '--text', message,
        '--json',
      ]);

      let stderr = '';
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          // Add to conversation history
          this.conversationHistory.push({
            text: message,
            fromUser: false,
            timestamp: new Date(),
          });
          resolve();
        } else {
          reject(new Error(`imsg send failed with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', reject);
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
    if (this.watchProcess) {
      const proc = this.watchProcess;
      this.watchProcess = null;
      proc.kill();
    }
    this.messageWaiters = [];
    this.messageQueue = [];
  }
}
