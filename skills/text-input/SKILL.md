# Text Messaging Input Skill

## Description
Text the user via iMessage, Telegram, or Slack for asynchronous conversations. Use this when you need input, want to report on completed work, or need to discuss next steps.

## When to Use This Skill

**Use when:**
- You've **completed a significant task** and want to report status and ask what's next
- You need **user input** for decisions
- A question requires **discussion** to fully understand
- You're **blocked** and need clarification to proceed
- You want to **update the user** on progress

**Do NOT use for:**
- Information the user has already provided
- When the user is actively chatting with you in Claude Code

## Tools

### `send_message`
Send a text message to the user and optionally wait for their reply.

**Parameters:**
- `message` (string): The message to send to the user
- `wait_for_reply` (boolean, optional): Whether to wait for a reply. Default: true

**Returns:**
- The user's reply (if wait_for_reply is true)

### `wait_for_reply`
Wait for the user to send a message. Use after send_message with wait_for_reply=false.

**Parameters:**
- `timeout_seconds` (number, optional): Maximum time to wait. Default: 300 (5 minutes)

**Returns:**
- The user's message

### `get_history`
Get recent messages from the conversation.

**Parameters:**
- `limit` (number, optional): Maximum messages to return. Default: 10

**Returns:**
- Conversation history

## Example Usage

**Simple question:**
```
1. send_message: "Hey! I finished the auth system. Should I move on to the API endpoints?"
2. User replies: "Yes, go ahead"
3. Continue working...
```

**Multi-turn conversation:**
```
1. send_message: "I'm working on payments. Should I use Stripe or PayPal?"
2. User: "Use Stripe"
3. send_message: "Got it. Do you want the full checkout flow or just a simple button?"
4. User: "Full checkout flow"
5. Start implementation...
```

**Status update without waiting:**
```
1. send_message with wait_for_reply=false: "Started deploying to production. I'll update you when it's done."
2. [Perform deployment]
3. send_message: "Deployment complete! All services are running. Anything else you need?"
```

## Best Practices

1. **Be clear and concise** - Text messages work best when focused
2. **Provide context** - Explain what you've done before asking questions
3. **Offer clear options** - Make decisions easy with specific choices
4. **Don't spam** - Batch updates when possible instead of sending many messages
5. **State next steps** - Tell the user what you'll do next
