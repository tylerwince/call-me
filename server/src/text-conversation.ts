/**
 * Conversation Manager
 *
 * Manages text messaging conversations through the configured provider.
 */

import {
  type TextProvider,
  type ProviderConfig,
  createTextProvider,
  getProviderConfig,
  loadProviderConfig,
  validateProviderConfig,
} from './providers/index.js';

export interface ServerConfig {
  provider: TextProvider;
  providerConfig: ProviderConfig;
}

/**
 * Load and validate server configuration
 */
export function loadServerConfig(): ServerConfig {
  const providerConfig = loadProviderConfig();

  // Validate configuration
  const errors = validateProviderConfig(providerConfig);
  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }

  // Create the text provider
  const provider = createTextProvider(providerConfig);

  return {
    provider,
    providerConfig,
  };
}

/**
 * Manages a text messaging conversation
 */
export class ConversationManager {
  private config: ServerConfig;
  private initialized = false;

  constructor(config: ServerConfig) {
    this.config = config;
  }

  /**
   * Initialize the provider (starts listening for messages)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.config.provider.initialize(
      getProviderConfig(this.config.providerConfig)
    );
    this.initialized = true;
  }

  /**
   * Send a message and optionally wait for a reply
   */
  async sendMessage(message: string, waitForReply = true): Promise<{ reply?: string }> {
    if (!this.initialized) {
      await this.initialize();
    }

    await this.config.provider.sendMessage(message);

    if (waitForReply) {
      const reply = await this.config.provider.waitForMessage(
        this.config.providerConfig.messageTimeoutMs
      );
      return { reply };
    }

    return {};
  }

  /**
   * Wait for the next message from the user
   */
  async waitForReply(timeoutMs?: number): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    return this.config.provider.waitForMessage(
      timeoutMs ?? this.config.providerConfig.messageTimeoutMs
    );
  }

  /**
   * Get recent conversation history
   */
  async getHistory(limit = 10): Promise<Array<{ speaker: 'claude' | 'user'; message: string }>> {
    if (!this.initialized) {
      await this.initialize();
    }

    const messages = await this.config.provider.getRecentMessages(limit);
    return messages.map(msg => ({
      speaker: msg.fromUser ? 'user' : 'claude',
      message: msg.text,
    }));
  }

  /**
   * Get the provider name
   */
  getProviderName(): string {
    return this.config.provider.name;
  }

  /**
   * Shutdown the conversation manager
   */
  shutdown(): void {
    if (this.initialized) {
      this.config.provider.shutdown();
      this.initialized = false;
    }
  }
}
