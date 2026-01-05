/**
 * ngrok tunnel management for exposing local webhooks to phone providers
 */

import ngrok from '@ngrok/ngrok';

let listener: ngrok.Listener | null = null;

/**
 * Start ngrok tunnel to expose local port
 * @param port Local port to expose
 * @returns Public ngrok URL
 */
export async function startNgrok(port: number): Promise<string> {
  const authtoken = process.env.CALLME_NGROK_AUTHTOKEN;

  if (!authtoken) {
    throw new Error(
      'CALLME_NGROK_AUTHTOKEN is required.\n' +
      'Get a free auth token at https://dashboard.ngrok.com/get-started/your-authtoken'
    );
  }

  listener = await ngrok.forward({
    addr: port,
    authtoken,
    // Use custom domain if configured (paid ngrok feature)
    domain: process.env.CALLME_NGROK_DOMAIN || undefined,
  });

  const url = listener.url();
  if (!url) {
    throw new Error('Failed to get ngrok URL');
  }

  return url;
}

/**
 * Stop ngrok tunnel
 */
export async function stopNgrok(): Promise<void> {
  if (listener) {
    await listener.close();
    listener = null;
  }
}
