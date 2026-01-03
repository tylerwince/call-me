/**
 * Web Pages for Signup and Dashboard
 *
 * Simple server-rendered HTML - no build step needed.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { parse as parseUrl } from 'url';
import { parse as parseQuery } from 'querystring';
import {
  createUser,
  getUserByEmail,
  getUserByApiKey,
  getUserUsage,
  getRecentUsage,
  User,
} from './database.js';
import {
  isStripeEnabled,
  createCheckoutSession,
  getCreditPackages,
  handleWebhook,
} from './stripe.js';
import { getPricePerMin } from './billing.js';

const STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #fafafa; line-height: 1.6; }
  .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
  h1 { font-size: 2.5rem; margin-bottom: 0.5rem; }
  h2 { font-size: 1.5rem; margin-bottom: 1rem; color: #888; font-weight: normal; }
  .card { background: #1a1a1a; border-radius: 12px; padding: 24px; margin: 20px 0; border: 1px solid #333; }
  .form-group { margin-bottom: 16px; }
  label { display: block; margin-bottom: 6px; color: #888; font-size: 14px; }
  input { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #333; background: #0a0a0a; color: #fff; font-size: 16px; }
  input:focus { outline: none; border-color: #4f46e5; }
  button { width: 100%; padding: 14px; border-radius: 8px; border: none; background: #4f46e5; color: white; font-size: 16px; font-weight: 600; cursor: pointer; }
  button:hover { background: #4338ca; }
  .secondary { background: #333; }
  .secondary:hover { background: #444; }
  .api-key { font-family: monospace; background: #0a0a0a; padding: 16px; border-radius: 8px; word-break: break-all; border: 1px solid #333; }
  .balance { font-size: 2rem; font-weight: bold; color: #22c55e; }
  .price { color: #888; font-size: 14px; }
  .error { background: #7f1d1d; border-color: #991b1b; padding: 12px; border-radius: 8px; margin-bottom: 16px; }
  .success { background: #14532d; border-color: #166534; padding: 12px; border-radius: 8px; margin-bottom: 16px; }
  a { color: #4f46e5; }
  .packages { display: grid; gap: 12px; }
  .package { display: flex; justify-content: space-between; align-items: center; padding: 16px; background: #0a0a0a; border-radius: 8px; border: 1px solid #333; }
  .package.popular { border-color: #4f46e5; }
  .usage-table { width: 100%; margin-top: 12px; }
  .usage-table td { padding: 8px 0; border-bottom: 1px solid #333; }
  .nav { display: flex; gap: 16px; margin-bottom: 24px; }
  .nav a { color: #888; text-decoration: none; }
  .nav a:hover, .nav a.active { color: #fff; }
`;

function html(title: string, content: string, user?: User): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Hey Boss</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="container">
    ${user ? `
      <nav class="nav">
        <a href="/dashboard">Dashboard</a>
        <a href="/settings">Settings</a>
        <a href="/logout">Logout</a>
      </nav>
    ` : ''}
    ${content}
  </div>
</body>
</html>`;
}

function homePage(): string {
  return html('Welcome', `
    <h1>Hey Boss</h1>
    <h2>Claude calls you when it needs your input</h2>

    <div class="card">
      <p style="margin-bottom: 16px;">Get phone calls from Claude Code when it finishes tasks, needs decisions, or wants to discuss next steps.</p>
      <p class="price" style="margin-bottom: 24px;">Just ${getPricePerMin()}¢/minute. Pay only for what you use.</p>
      <a href="/signup"><button>Get Started</button></a>
      <a href="/login" style="display: block; text-align: center; margin-top: 12px;">Already have an account? Login</a>
    </div>
  `);
}

function signupPage(error?: string): string {
  return html('Sign Up', `
    <h1>Sign Up</h1>
    <h2>Create your account</h2>

    <div class="card">
      ${error ? `<div class="error">${error}</div>` : ''}
      <form method="POST" action="/signup">
        <div class="form-group">
          <label>Email</label>
          <input type="email" name="email" required placeholder="you@example.com">
        </div>
        <div class="form-group">
          <label>Phone Number</label>
          <input type="tel" name="phone" required placeholder="+1234567890">
        </div>
        <button type="submit">Create Account</button>
      </form>
      <p style="text-align: center; margin-top: 16px; color: #888;">
        Already have an account? <a href="/login">Login</a>
      </p>
    </div>
  `);
}

function loginPage(error?: string): string {
  return html('Login', `
    <h1>Login</h1>
    <h2>Access your account</h2>

    <div class="card">
      ${error ? `<div class="error">${error}</div>` : ''}
      <form method="POST" action="/login">
        <div class="form-group">
          <label>API Key</label>
          <input type="text" name="api_key" required placeholder="sk_...">
        </div>
        <button type="submit">Login</button>
      </form>
      <p style="text-align: center; margin-top: 16px; color: #888;">
        Don't have an account? <a href="/signup">Sign up</a>
      </p>
    </div>
  `);
}

function dashboardPage(user: User, message?: string): string {
  const usage = getUserUsage(user.id);
  const recentCalls = getRecentUsage(user.id, 5);

  return html('Dashboard', `
    <h1>Dashboard</h1>
    <h2>Welcome back</h2>

    ${message ? `<div class="success">${message}</div>` : ''}

    <div class="card">
      <label>Your Balance</label>
      <div class="balance">$${(user.balance_cents / 100).toFixed(2)}</div>
      <p class="price">≈ ${Math.floor(user.balance_cents / getPricePerMin())} minutes of calls</p>
    </div>

    ${isStripeEnabled() ? `
      <div class="card">
        <label>Add Credits</label>
        <div class="packages">
          ${getCreditPackages().map(pkg => `
            <form method="POST" action="/buy" style="margin: 0;">
              <input type="hidden" name="amount" value="${pkg.dollars}">
              <button type="submit" class="package ${pkg.popular ? 'popular' : ''}" style="width: 100%; text-align: left;">
                <span>$${pkg.dollars}</span>
                <span style="color: #888;">${pkg.credits}¢ credits</span>
              </button>
            </form>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <div class="card">
      <label>Your API Key</label>
      <div class="api-key">${user.api_key}</div>
      <p class="price" style="margin-top: 12px;">Set this as HEY_BOSS_API_KEY in your environment</p>
    </div>

    <div class="card">
      <label>Usage Stats</label>
      <table class="usage-table">
        <tr><td>Total Calls</td><td style="text-align: right;">${usage.totalCalls}</td></tr>
        <tr><td>Total Minutes</td><td style="text-align: right;">${usage.totalMinutes}</td></tr>
        <tr><td>Total Spent</td><td style="text-align: right;">$${(usage.totalCostCents / 100).toFixed(2)}</td></tr>
      </table>
    </div>
  `, user);
}

function settingsPage(user: User, message?: string, error?: string): string {
  return html('Settings', `
    <h1>Settings</h1>
    <h2>Manage your account</h2>

    ${message ? `<div class="success">${message}</div>` : ''}
    ${error ? `<div class="error">${error}</div>` : ''}

    <div class="card">
      <label>Email</label>
      <p style="padding: 12px 0;">${user.email}</p>
    </div>

    <div class="card">
      <form method="POST" action="/settings/phone">
        <div class="form-group">
          <label>Phone Number</label>
          <input type="tel" name="phone" value="${user.phone_number}" required>
        </div>
        <button type="submit">Update Phone</button>
      </form>
    </div>

    <div class="card">
      <label>Your API Key</label>
      <div class="api-key">${user.api_key}</div>
    </div>
  `, user);
}

// Simple cookie-based session
function setSession(res: ServerResponse, apiKey: string): void {
  res.setHeader('Set-Cookie', `session=${apiKey}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`);
}

function getSession(req: IncomingMessage): string | null {
  const cookies = req.headers.cookie || '';
  const match = cookies.match(/session=([^;]+)/);
  return match ? match[1] : null;
}

function clearSession(res: ServerResponse): void {
  res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; Max-Age=0');
}

function redirect(res: ServerResponse, url: string): void {
  res.writeHead(302, { Location: url });
  res.end();
}

async function parseBody(req: IncomingMessage): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      resolve(parseQuery(body) as Record<string, string>);
    });
  });
}

export async function handleWebRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = parseUrl(req.url || '/', true);
  const path = url.pathname || '/';

  // Get current user from session
  const sessionKey = getSession(req);
  const currentUser = sessionKey ? getUserByApiKey(sessionKey) : null;

  // Stripe webhook (no auth)
  if (path === '/webhook' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const sig = req.headers['stripe-signature'] as string;
        await handleWebhook(body, sig);
        res.writeHead(200);
        res.end('OK');
      } catch (err) {
        console.error('Webhook error:', err);
        res.writeHead(400);
        res.end('Webhook error');
      }
    });
    return true;
  }

  // Public pages
  if (path === '/' && req.method === 'GET') {
    if (currentUser) {
      redirect(res, '/dashboard');
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(homePage());
    }
    return true;
  }

  if (path === '/signup' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(signupPage());
    return true;
  }

  if (path === '/signup' && req.method === 'POST') {
    const body = await parseBody(req);
    const email = body.email?.trim().toLowerCase();
    const phone = body.phone?.trim();

    if (!email || !phone) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(signupPage('Email and phone number are required'));
      return true;
    }

    if (getUserByEmail(email)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(signupPage('An account with this email already exists'));
      return true;
    }

    try {
      const user = createUser(email, phone);
      setSession(res, user.api_key);
      redirect(res, '/dashboard?welcome=1');
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(signupPage('Failed to create account. Please try again.'));
    }
    return true;
  }

  if (path === '/login' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(loginPage());
    return true;
  }

  if (path === '/login' && req.method === 'POST') {
    const body = await parseBody(req);
    const apiKey = body.api_key?.trim();

    const user = apiKey ? getUserByApiKey(apiKey) : null;
    if (!user) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(loginPage('Invalid API key'));
      return true;
    }

    setSession(res, user.api_key);
    redirect(res, '/dashboard');
    return true;
  }

  if (path === '/logout') {
    clearSession(res);
    redirect(res, '/');
    return true;
  }

  // Protected pages
  if (!currentUser) {
    redirect(res, '/login');
    return true;
  }

  if (path === '/dashboard' && req.method === 'GET') {
    const message = url.query.welcome === '1' ? 'Welcome! Your account has been created.' :
                    url.query.success === '1' ? 'Credits added successfully!' : undefined;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(dashboardPage(currentUser, message));
    return true;
  }

  if (path === '/settings' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(settingsPage(currentUser));
    return true;
  }

  if (path === '/settings/phone' && req.method === 'POST') {
    const body = await parseBody(req);
    const phone = body.phone?.trim();

    if (!phone) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(settingsPage(currentUser, undefined, 'Phone number is required'));
      return true;
    }

    const { updateUserPhone } = await import('./database.js');
    updateUserPhone(currentUser.id, phone);
    redirect(res, '/settings?updated=1');
    return true;
  }

  if (path === '/buy' && req.method === 'POST' && isStripeEnabled()) {
    const body = await parseBody(req);
    const amount = parseInt(body.amount || '0', 10);

    if (amount < 5) {
      redirect(res, '/dashboard');
      return true;
    }

    try {
      const baseUrl = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
      const checkoutUrl = await createCheckoutSession(
        currentUser.id,
        amount,
        `${baseUrl}/dashboard?success=1`,
        `${baseUrl}/dashboard`
      );
      redirect(res, checkoutUrl);
    } catch (err) {
      console.error('Checkout error:', err);
      redirect(res, '/dashboard');
    }
    return true;
  }

  return false; // Not a web request
}
