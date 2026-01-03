/**
 * Stripe Integration for Payments
 *
 * Handles:
 * - Customer creation
 * - Checkout sessions for adding credits
 * - Webhook processing for successful payments
 */

import Stripe from 'stripe';
import { getUserByStripeCustomerId, addToUserBalance, updateUserStripeCustomerId, getUserById } from './database.js';

let stripe: Stripe | null = null;

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  pricePerDollar: number; // cents credited per $1 paid (e.g., 100 = no markup on credits)
}

let config: StripeConfig | null = null;

export function initStripe(stripeConfig: StripeConfig): void {
  config = stripeConfig;
  stripe = new Stripe(stripeConfig.secretKey, { apiVersion: '2024-12-18.acacia' });
  console.error('Stripe initialized');
}

export function isStripeEnabled(): boolean {
  return stripe !== null;
}

export function getStripe(): Stripe {
  if (!stripe) {
    throw new Error('Stripe not initialized');
  }
  return stripe;
}

/**
 * Create a Stripe customer for a user
 */
export async function createStripeCustomer(userId: string, email: string): Promise<string> {
  const s = getStripe();

  const customer = await s.customers.create({
    email,
    metadata: { userId },
  });

  updateUserStripeCustomerId(userId, customer.id);
  return customer.id;
}

/**
 * Create a Checkout Session for adding credits
 */
export async function createCheckoutSession(
  userId: string,
  amountDollars: number,
  successUrl: string,
  cancelUrl: string
): Promise<string> {
  const s = getStripe();
  const user = getUserById(userId);

  if (!user) {
    throw new Error('User not found');
  }

  let customerId = user.stripe_customer_id;
  if (!customerId) {
    customerId = await createStripeCustomer(userId, user.email);
  }

  const session = await s.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Hey Boss Credits',
            description: `$${amountDollars} in call credits`,
          },
          unit_amount: amountDollars * 100, // Stripe uses cents
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId,
      creditsCents: (amountDollars * (config?.pricePerDollar || 100)).toString(),
    },
  });

  return session.url!;
}

/**
 * Handle Stripe webhook events
 */
export async function handleWebhook(payload: string, signature: string): Promise<void> {
  const s = getStripe();

  if (!config?.webhookSecret) {
    throw new Error('Webhook secret not configured');
  }

  const event = s.webhooks.constructEvent(payload, signature, config.webhookSecret);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const creditsCents = parseInt(session.metadata?.creditsCents || '0', 10);

      if (userId && creditsCents > 0) {
        const newBalance = addToUserBalance(userId, creditsCents);
        console.error(`Added ${creditsCents}¢ to user ${userId}, new balance: ${newBalance}¢`);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      // Handle subscription cancellation if needed
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const user = getUserByStripeCustomerId(customerId);
      if (user) {
        console.error(`Subscription cancelled for user ${user.id}`);
      }
      break;
    }

    default:
      console.error(`Unhandled webhook event: ${event.type}`);
  }
}

/**
 * Get credit packages available for purchase
 */
export function getCreditPackages(): Array<{ dollars: number; credits: number; popular?: boolean }> {
  const rate = config?.pricePerDollar || 100;
  return [
    { dollars: 5, credits: 5 * rate },
    { dollars: 10, credits: 10 * rate, popular: true },
    { dollars: 25, credits: 25 * rate },
    { dollars: 50, credits: 50 * rate },
  ];
}
