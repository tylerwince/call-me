#!/usr/bin/env bun

/**
 * TextMe MCP Server
 *
 * A stdio-based MCP server that lets Claude text you via iMessage, Telegram, or Slack.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ConversationManager, loadServerConfig } from './text-conversation.js';

async function main() {
  // Load server config
  let serverConfig;
  try {
    serverConfig = loadServerConfig();
  } catch (error) {
    console.error('Configuration error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // Create conversation manager
  const conversationManager = new ConversationManager(serverConfig);

  // Initialize the provider (start listening for messages)
  try {
    await conversationManager.initialize();
  } catch (error) {
    console.error('Failed to initialize provider:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // Create stdio MCP server
  const mcpServer = new Server(
    { name: 'textme', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // List available tools
  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'send_message',
          description: 'Send a text message to the user. By default, waits for their reply.',
          inputSchema: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description: 'The message to send to the user.',
              },
              wait_for_reply: {
                type: 'boolean',
                description: 'Whether to wait for the user to reply. Default: true',
                default: true,
              },
            },
            required: ['message'],
          },
        },
        {
          name: 'wait_for_reply',
          description: 'Wait for the user to send a message.',
          inputSchema: {
            type: 'object',
            properties: {
              timeout_seconds: {
                type: 'number',
                description: 'Maximum time to wait in seconds. Default: 300 (5 minutes)',
                default: 300,
              },
            },
          },
        },
        {
          name: 'get_history',
          description: 'Get recent messages from the conversation.',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Maximum number of messages to return. Default: 10',
                default: 10,
              },
            },
          },
        },
      ],
    };
  });

  // Handle tool calls
  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      if (request.params.name === 'send_message') {
        const { message, wait_for_reply = true } = request.params.arguments as {
          message: string;
          wait_for_reply?: boolean;
        };

        const result = await conversationManager.sendMessage(message, wait_for_reply);

        if (wait_for_reply && result.reply) {
          return {
            content: [{
              type: 'text',
              text: `Message sent.\n\nUser's reply:\n${result.reply}`,
            }],
          };
        }

        return {
          content: [{
            type: 'text',
            text: 'Message sent.',
          }],
        };
      }

      if (request.params.name === 'wait_for_reply') {
        const { timeout_seconds = 300 } = request.params.arguments as {
          timeout_seconds?: number;
        };

        const reply = await conversationManager.waitForReply(timeout_seconds * 1000);

        return {
          content: [{
            type: 'text',
            text: `User's message:\n${reply}`,
          }],
        };
      }

      if (request.params.name === 'get_history') {
        const { limit = 10 } = request.params.arguments as { limit?: number };

        const history = await conversationManager.getHistory(limit);

        if (history.length === 0) {
          return {
            content: [{
              type: 'text',
              text: 'No messages in conversation history.',
            }],
          };
        }

        const formatted = history
          .map(msg => `${msg.speaker === 'claude' ? 'Claude' : 'User'}: ${msg.message}`)
          .join('\n\n');

        return {
          content: [{
            type: 'text',
            text: `Conversation history (${history.length} messages):\n\n${formatted}`,
          }],
        };
      }

      throw new Error(`Unknown tool: ${request.params.name}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text', text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  });

  // Connect MCP server via stdio
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);

  console.error('');
  console.error('TextMe MCP server ready');
  console.error(`Provider: ${conversationManager.getProviderName()}`);
  console.error('');

  // Graceful shutdown
  const shutdown = () => {
    console.error('\nShutting down...');
    conversationManager.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
