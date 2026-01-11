/**
 * Text Provider Interfaces
 *
 * Abstractions for text messaging services (iMessage, Telegram, Slack).
 */

/**
 * A message in a conversation
 */
export interface Message {
  text: string;
  fromUser: boolean;
  timestamp: Date;
}

/**
 * Configuration for text providers
 */
export interface TextProviderConfig {
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
  messageTimeoutMs?: number;
}

/**
 * Text Provider - handles sending and receiving text messages
 */
export interface TextProvider {
  readonly name: string;

  /**
   * Initialize the provider
   */
  initialize(config: TextProviderConfig): Promise<void>;

  /**
   * Send a message to the configured recipient
   */
  sendMessage(message: string): Promise<void>;

  /**
   * Wait for the next message from the user
   * @param timeoutMs Maximum time to wait (default: 5 minutes)
   */
  waitForMessage(timeoutMs?: number): Promise<string>;

  /**
   * Get recent messages from the conversation
   * @param limit Maximum number of messages to return
   */
  getRecentMessages(limit?: number): Promise<Message[]>;

  /**
   * Shutdown the provider and clean up resources
   */
  shutdown(): void;
}
