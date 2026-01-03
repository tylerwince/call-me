/**
 * SQLite Database for User Storage
 *
 * Uses better-sqlite3 for synchronous, simple database operations.
 * Falls back to in-memory if no DB path specified.
 */

import Database from 'better-sqlite3';
import crypto from 'crypto';

export interface User {
  id: string;
  email: string;
  phone_number: string;
  api_key: string;
  stripe_customer_id: string | null;
  balance_cents: number;
  created_at: string;
  enabled: boolean;
}

export interface UsageRecord {
  id: number;
  user_id: string;
  call_id: string;
  duration_seconds: number;
  cost_cents: number;
  created_at: string;
}

let db: Database.Database;

export function initDatabase(dbPath?: string): void {
  db = new Database(dbPath || ':memory:');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      phone_number TEXT NOT NULL,
      api_key TEXT UNIQUE NOT NULL,
      stripe_customer_id TEXT,
      balance_cents INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      enabled INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      call_id TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL,
      cost_cents INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_usage_user_id ON usage(user_id);
  `);

  console.error(`Database initialized: ${dbPath || 'in-memory'}`);
}

export function generateApiKey(): string {
  return `sk_${crypto.randomBytes(24).toString('hex')}`;
}

export function generateUserId(): string {
  return crypto.randomBytes(8).toString('hex');
}

// User operations
export function createUser(email: string, phoneNumber: string, stripeCustomerId?: string): User {
  const id = generateUserId();
  const apiKey = generateApiKey();

  const stmt = db.prepare(`
    INSERT INTO users (id, email, phone_number, api_key, stripe_customer_id)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(id, email, phoneNumber, apiKey, stripeCustomerId || null);
  return getUserById(id)!;
}

export function getUserById(id: string): User | null {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  const row = stmt.get(id) as any;
  return row ? rowToUser(row) : null;
}

export function getUserByApiKey(apiKey: string): User | null {
  const stmt = db.prepare('SELECT * FROM users WHERE api_key = ? AND enabled = 1');
  const row = stmt.get(apiKey) as any;
  return row ? rowToUser(row) : null;
}

export function getUserByEmail(email: string): User | null {
  const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
  const row = stmt.get(email) as any;
  return row ? rowToUser(row) : null;
}

export function getUserByStripeCustomerId(customerId: string): User | null {
  const stmt = db.prepare('SELECT * FROM users WHERE stripe_customer_id = ?');
  const row = stmt.get(customerId) as any;
  return row ? rowToUser(row) : null;
}

export function updateUserBalance(userId: string, balanceCents: number): void {
  const stmt = db.prepare('UPDATE users SET balance_cents = ? WHERE id = ?');
  stmt.run(balanceCents, userId);
}

export function addToUserBalance(userId: string, amountCents: number): number {
  const user = getUserById(userId);
  if (!user) throw new Error('User not found');

  const newBalance = user.balance_cents + amountCents;
  updateUserBalance(userId, newBalance);
  return newBalance;
}

export function deductFromUserBalance(userId: string, amountCents: number): number {
  const user = getUserById(userId);
  if (!user) throw new Error('User not found');

  const newBalance = user.balance_cents - amountCents;
  updateUserBalance(userId, newBalance);
  return newBalance;
}

export function updateUserStripeCustomerId(userId: string, customerId: string): void {
  const stmt = db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?');
  stmt.run(customerId, userId);
}

export function updateUserPhone(userId: string, phoneNumber: string): void {
  const stmt = db.prepare('UPDATE users SET phone_number = ? WHERE id = ?');
  stmt.run(phoneNumber, userId);
}

export function setUserEnabled(userId: string, enabled: boolean): void {
  const stmt = db.prepare('UPDATE users SET enabled = ? WHERE id = ?');
  stmt.run(enabled ? 1 : 0, userId);
}

export function getAllUsers(): User[] {
  const stmt = db.prepare('SELECT * FROM users ORDER BY created_at DESC');
  const rows = stmt.all() as any[];
  return rows.map(rowToUser);
}

// Usage operations
export function recordUsage(userId: string, callId: string, durationSeconds: number, costCents: number): void {
  const stmt = db.prepare(`
    INSERT INTO usage (user_id, call_id, duration_seconds, cost_cents)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(userId, callId, durationSeconds, costCents);

  // Deduct from balance
  deductFromUserBalance(userId, costCents);
}

export function getUserUsage(userId: string): { totalCalls: number; totalMinutes: number; totalCostCents: number } {
  const stmt = db.prepare(`
    SELECT
      COUNT(*) as total_calls,
      COALESCE(SUM(duration_seconds), 0) as total_seconds,
      COALESCE(SUM(cost_cents), 0) as total_cost
    FROM usage WHERE user_id = ?
  `);
  const row = stmt.get(userId) as any;

  return {
    totalCalls: row.total_calls,
    totalMinutes: Math.ceil(row.total_seconds / 60),
    totalCostCents: row.total_cost,
  };
}

export function getRecentUsage(userId: string, limit = 10): UsageRecord[] {
  const stmt = db.prepare(`
    SELECT * FROM usage WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
  `);
  return stmt.all(userId, limit) as UsageRecord[];
}

function rowToUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    phone_number: row.phone_number,
    api_key: row.api_key,
    stripe_customer_id: row.stripe_customer_id,
    balance_cents: row.balance_cents,
    created_at: row.created_at,
    enabled: Boolean(row.enabled),
  };
}

export function closeDatabase(): void {
  if (db) {
    db.close();
  }
}
