import WebSocket, { WebSocketServer } from 'ws';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import {
  loadProviderConfig,
  createProviders,
  validateProviderConfig,
  type ProviderRegistry,
} from './providers/index.js';
import { TelnyxPhoneProvider } from './providers/phone-telnyx.js';

interface CallState {
  callId: string;
  callControlId: string | null;
  userPhoneNumber: string;
  ws: WebSocket | null;
  conversationHistory: Array<{ speaker: 'claude' | 'user'; message: string }>;
  startTime: number;
  hungUp: boolean;
  // Audio buffer - always collecting incoming audio
  audioBuffer: Buffer[];
}

export interface ServerConfig {
  publicUrl: string;
  port: number;
  phoneNumber: string;
  userPhoneNumber: string;
  providers: ProviderRegistry;
}

export function loadServerConfig(publicUrl: string): ServerConfig {
  const providerConfig = loadProviderConfig();
  const errors = validateProviderConfig(providerConfig);

  if (!process.env.CALLME_USER_PHONE_NUMBER) {
    errors.push('Missing CALLME_USER_PHONE_NUMBER (where to call you)');
  }

  if (errors.length > 0) {
    throw new Error(`Missing required configuration:\n  - ${errors.join('\n  - ')}`);
  }

  const providers = createProviders(providerConfig);

  return {
    publicUrl,
    port: parseInt(process.env.CALLME_PORT || '3333', 10),
    phoneNumber: providerConfig.phoneNumber,
    userPhoneNumber: process.env.CALLME_USER_PHONE_NUMBER!,
    providers,
  };
}

export class CallManager {
  private activeCalls = new Map<string, CallState>();
  private callControlIdToCallId = new Map<string, string>();
  private httpServer: ReturnType<typeof createServer> | null = null;
  private wss: WebSocket.Server | null = null;
  private config: ServerConfig;
  private currentCallId = 0;

  constructor(config: ServerConfig) {
    this.config = config;
  }

  startServer(): void {
    this.httpServer = createServer((req, res) => {
      const url = new URL(req.url!, `http://${req.headers.host}`);

      if (url.pathname === '/twiml') {
        this.handlePhoneWebhook(req, res);
        return;
      }

      if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', activeCalls: this.activeCalls.size }));
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    });

    this.wss = new WebSocket.Server({ noServer: true });

    this.httpServer.on('upgrade', (request: IncomingMessage, socket: any, head: Buffer) => {
      const url = new URL(request.url!, `http://${request.headers.host}`);
      if (url.pathname === '/media-stream') {
        this.wss!.handleUpgrade(request, socket, head, (ws) => {
          this.wss!.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    this.wss.on('connection', (ws) => {
      console.error('Media stream WebSocket connected');
      let associatedCallId: string | null = null;

      ws.on('message', (message: Buffer | string) => {
        const msgBuffer = Buffer.isBuffer(message) ? message : Buffer.from(message);

        // Try to associate with a call if not already
        if (!associatedCallId) {
          for (const [callId, state] of this.activeCalls.entries()) {
            if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
              state.ws = ws;
              associatedCallId = callId;
              console.error(`Associated WebSocket with call ${callId}`);
              break;
            }
          }
        }

        // Extract and buffer audio
        if (associatedCallId) {
          const state = this.activeCalls.get(associatedCallId);
          if (state) {
            const audioData = this.extractAudio(msgBuffer);
            if (audioData) {
              state.audioBuffer.push(audioData);
            }
          }
        }
      });

      ws.on('close', () => {
        console.error('Media stream WebSocket closed');
      });
    });

    this.httpServer.listen(this.config.port, () => {
      console.error(`HTTP server listening on port ${this.config.port}`);
    });
  }

  /**
   * Extract INBOUND audio data from WebSocket message (filters out outbound/TTS audio)
   */
  private extractAudio(msgBuffer: Buffer): Buffer | null {
    if (msgBuffer.length === 0) return null;

    // Binary audio (doesn't start with '{') - can't determine track, skip
    if (msgBuffer[0] !== 0x7b) {
      return null;
    }

    // JSON format - only extract inbound track (user's voice)
    try {
      const msg = JSON.parse(msgBuffer.toString());
      if (msg.event === 'media' && msg.media?.payload) {
        // Only capture inbound audio (user's voice), not outbound (our TTS)
        const track = msg.media?.track;
        if (track === 'inbound' || track === 'inbound_track') {
          return Buffer.from(msg.media.payload, 'base64');
        }
      }
    } catch {}

    return null;
  }

  private handlePhoneWebhook(req: IncomingMessage, res: ServerResponse): void {
    const contentType = req.headers['content-type'] || '';

    if (contentType.includes('application/json')) {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const event = JSON.parse(body);
          await this.handleTelnyxWebhook(event, res);
        } catch (error) {
          console.error('Error parsing Telnyx webhook:', error);
          res.writeHead(400);
          res.end('Invalid JSON');
        }
      });
      return;
    }

    // Twilio TwiML response
    const streamUrl = `wss://${new URL(this.config.publicUrl).host}/media-stream`;
    const xml = this.config.providers.phone.getStreamConnectXml(streamUrl);
    res.writeHead(200, { 'Content-Type': 'application/xml' });
    res.end(xml);
  }

  private async handleTelnyxWebhook(event: any, res: ServerResponse): Promise<void> {
    const eventType = event.data?.event_type;
    const callControlId = event.data?.payload?.call_control_id;

    console.error(`Telnyx webhook: ${eventType}`);

    // Always respond 200 OK immediately
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));

    if (!callControlId) return;

    const provider = this.config.providers.phone;
    if (!(provider instanceof TelnyxPhoneProvider)) return;

    try {
      switch (eventType) {
        case 'call.initiated':
          break;

        case 'call.answered':
          const streamUrl = `wss://${new URL(this.config.publicUrl).host}/media-stream`;
          await provider.startStreaming(callControlId, streamUrl);
          console.error(`Started streaming for call ${callControlId}`);
          break;

        case 'call.hangup':
          const callId = this.callControlIdToCallId.get(callControlId);
          if (callId) {
            this.callControlIdToCallId.delete(callControlId);
            const state = this.activeCalls.get(callId);
            if (state) {
              state.hungUp = true;
              state.ws?.close();
            }
          }
          break;

        case 'call.machine.detection.ended':
          // AMD completed - log the result
          const result = event.data?.payload?.result;
          console.error(`AMD result: ${result}`);
          break;

        case 'streaming.started':
        case 'streaming.stopped':
          break;
      }
    } catch (error) {
      console.error(`Error handling Telnyx webhook ${eventType}:`, error);
    }
  }

  async initiateCall(message: string): Promise<{ callId: string; response: string }> {
    const callId = `call-${++this.currentCallId}-${Date.now()}`;

    const state: CallState = {
      callId,
      callControlId: null,
      userPhoneNumber: this.config.userPhoneNumber,
      ws: null,
      conversationHistory: [],
      startTime: Date.now(),
      hungUp: false,
      audioBuffer: [],
    };

    this.activeCalls.set(callId, state);

    try {
      const callControlId = await this.config.providers.phone.initiateCall(
        this.config.userPhoneNumber,
        this.config.phoneNumber,
        `${this.config.publicUrl}/twiml`
      );

      state.callControlId = callControlId;
      this.callControlIdToCallId.set(callControlId, callId);

      console.error(`Call initiated: ${callControlId} -> ${this.config.userPhoneNumber}`);

      await this.waitForConnection(callId, 15000);

      const response = await this.speakAndListen(state, message);
      state.conversationHistory.push({ speaker: 'claude', message });
      state.conversationHistory.push({ speaker: 'user', message: response });

      return { callId, response };
    } catch (error) {
      this.activeCalls.delete(callId);
      throw error;
    }
  }

  async continueCall(callId: string, message: string): Promise<string> {
    const state = this.activeCalls.get(callId);
    if (!state) throw new Error(`No active call: ${callId}`);

    const response = await this.speakAndListen(state, message);
    state.conversationHistory.push({ speaker: 'claude', message });
    state.conversationHistory.push({ speaker: 'user', message: response });

    return response;
  }

  async endCall(callId: string, message: string): Promise<{ durationSeconds: number }> {
    const state = this.activeCalls.get(callId);
    if (!state) throw new Error(`No active call: ${callId}`);

    await this.speak(state, message);

    // Actually hang up the call via Telnyx API
    if (state.callControlId) {
      const provider = this.config.providers.phone;
      if (provider instanceof TelnyxPhoneProvider) {
        await provider.hangup(state.callControlId);
      }
    }

    state.ws?.close();
    state.hungUp = true;

    const durationSeconds = Math.round((Date.now() - state.startTime) / 1000);
    this.activeCalls.delete(callId);

    return { durationSeconds };
  }

  private async waitForConnection(callId: string, timeout: number): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const state = this.activeCalls.get(callId);
      if (state?.ws && state.ws.readyState === WebSocket.OPEN) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('WebSocket connection timeout');
  }

  private async speakAndListen(state: CallState, text: string): Promise<string> {
    // Clear audio buffer before speaking
    state.audioBuffer = [];

    // Speak
    await this.speak(state, text);

    // Now listen - audio is already being buffered by WebSocket handler
    return await this.listen(state);
  }

  private async speak(state: CallState, text: string): Promise<void> {
    console.error(`[${state.callId}] Speaking: ${text.substring(0, 50)}...`);

    const ttsProvider = this.config.providers.tts as any;

    // Use streaming if available for lower latency
    if (typeof ttsProvider.synthesizeStream === 'function') {
      await this.speakStreaming(state, text, ttsProvider);
    } else {
      // Fallback to non-streaming
      const pcmData = await this.config.providers.tts.synthesize(text);
      await this.sendAudio(state, pcmData);
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
    console.error(`[${state.callId}] Speaking done`);
  }

  private async speakStreaming(state: CallState, text: string, ttsProvider: any): Promise<void> {
    let pendingPcm = Buffer.alloc(0);
    let pendingMuLaw = Buffer.alloc(0);
    const OUTPUT_CHUNK_SIZE = 160; // 20ms at 8kHz
    const SAMPLES_PER_RESAMPLE = 6; // Need 6 bytes (3 samples) of 24kHz to get 1 sample at 8kHz

    for await (const chunk of ttsProvider.synthesizeStream(text)) {
      // Accumulate PCM data
      pendingPcm = Buffer.concat([pendingPcm, chunk]);

      // Process complete resample units (6 bytes = 3 samples at 24kHz -> 1 sample at 8kHz)
      const completeUnits = Math.floor(pendingPcm.length / SAMPLES_PER_RESAMPLE);
      if (completeUnits > 0) {
        const bytesToProcess = completeUnits * SAMPLES_PER_RESAMPLE;
        const toProcess = pendingPcm.subarray(0, bytesToProcess);
        pendingPcm = pendingPcm.subarray(bytesToProcess);

        // Resample and convert to mu-law
        const resampled = this.resample24kTo8k(toProcess);
        const muLaw = this.pcmToMuLaw(resampled);
        pendingMuLaw = Buffer.concat([pendingMuLaw, muLaw]);

        // Send complete chunks
        while (pendingMuLaw.length >= OUTPUT_CHUNK_SIZE) {
          const chunk = pendingMuLaw.subarray(0, OUTPUT_CHUNK_SIZE);
          pendingMuLaw = pendingMuLaw.subarray(OUTPUT_CHUNK_SIZE);

          if (state.ws?.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify({
              event: 'media',
              media: { payload: chunk.toString('base64') },
            }));
          }
          await new Promise((resolve) => setTimeout(resolve, 18)); // Slightly faster than 20ms
        }
      }
    }

    // Send any remaining audio
    if (pendingMuLaw.length > 0 && state.ws?.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({
        event: 'media',
        media: { payload: pendingMuLaw.toString('base64') },
      }));
    }
  }

  private async sendAudio(state: CallState, pcmData: Buffer): Promise<void> {
    const resampledPcm = this.resample24kTo8k(pcmData);
    const muLawData = this.pcmToMuLaw(resampledPcm);

    const chunkSize = 160;
    for (let i = 0; i < muLawData.length; i += chunkSize) {
      const chunk = muLawData.subarray(i, i + chunkSize);
      if (state.ws?.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({
          event: 'media',
          media: { payload: chunk.toString('base64') },
        }));
      }
      await new Promise((resolve) => setTimeout(resolve, 18));
    }
  }

  /**
   * Calculate RMS energy of mu-law audio data
   * Returns a value between 0 and 1 representing audio energy
   */
  private calculateEnergy(muLawData: Buffer): number {
    if (muLawData.length === 0) return 0;

    let sumSquares = 0;
    for (let i = 0; i < muLawData.length; i++) {
      // Convert mu-law to linear PCM for energy calculation
      const pcm = this.muLawToPcm(muLawData[i]);
      // Normalize to -1 to 1 range
      const normalized = pcm / 32768;
      sumSquares += normalized * normalized;
    }

    return Math.sqrt(sumSquares / muLawData.length);
  }

  private async listen(state: CallState): Promise<string> {
    console.error(`[${state.callId}] Listening...`);

    const SILENCE_THRESHOLD_MS = 1500; // 1.5 seconds of silence to end
    const VOICE_ENERGY_THRESHOLD = 0.02; // RMS threshold for voice activity
    const MIN_VOICE_DURATION_MS = 300; // Minimum voice duration before we start silence timer

    let voiceDetected = false;
    let voiceStartTime = 0;
    let silenceStartTime = Date.now();
    let lastProcessedChunk = 0;

    while (!state.hungUp) {
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Process new audio chunks
      const chunks = state.audioBuffer.slice(lastProcessedChunk);
      lastProcessedChunk = state.audioBuffer.length;

      if (chunks.length > 0) {
        // Calculate energy of new chunks combined
        const combined = Buffer.concat(chunks);
        const energy = this.calculateEnergy(combined);

        if (energy > VOICE_ENERGY_THRESHOLD) {
          // Voice detected
          if (!voiceDetected) {
            voiceDetected = true;
            voiceStartTime = Date.now();
            console.error(`[${state.callId}] Voice activity started (energy: ${energy.toFixed(4)})`);
          }
          silenceStartTime = Date.now();
        } else if (voiceDetected) {
          // Silence after voice
          const voiceDuration = Date.now() - voiceStartTime;
          const silenceDuration = Date.now() - silenceStartTime;

          if (voiceDuration >= MIN_VOICE_DURATION_MS && silenceDuration >= SILENCE_THRESHOLD_MS) {
            // Enough voice followed by enough silence - transcribe
            console.error(`[${state.callId}] Voice ended after ${voiceDuration}ms, transcribing ${state.audioBuffer.length} chunks...`);
            const transcript = await this.transcribeAudio(state.audioBuffer);
            console.error(`[${state.callId}] User said: ${transcript}`);
            return transcript;
          }
        }
      }

      // Timeout after 30 seconds of no voice activity
      if (!voiceDetected && Date.now() - silenceStartTime > 30000) {
        throw new Error('Response timeout - no voice detected');
      }

      // Timeout after 60 seconds total
      if (voiceDetected && Date.now() - voiceStartTime > 60000) {
        // Force transcription after 60 seconds of voice
        console.error(`[${state.callId}] Max duration reached, transcribing...`);
        const transcript = await this.transcribeAudio(state.audioBuffer);
        return transcript;
      }
    }

    throw new Error('Call was hung up by user');
  }

  private async transcribeAudio(audioChunks: Buffer[]): Promise<string> {
    if (audioChunks.length === 0) return '';

    const fullAudio = Buffer.concat(audioChunks);
    const wavBuffer = this.muLawToWav(fullAudio);

    return await this.config.providers.stt.transcribe(wavBuffer);
  }

  private resample24kTo8k(pcmData: Buffer): Buffer {
    const inputSamples = pcmData.length / 2;
    const outputSamples = Math.floor(inputSamples / 3);
    const output = Buffer.alloc(outputSamples * 2);

    for (let i = 0; i < outputSamples; i++) {
      const sample = pcmData.readInt16LE(i * 3 * 2);
      output.writeInt16LE(sample, i * 2);
    }

    return output;
  }

  private pcmToMuLaw(pcmData: Buffer): Buffer {
    const muLawData = Buffer.alloc(Math.floor(pcmData.length / 2));
    for (let i = 0; i < muLawData.length; i++) {
      const pcm = pcmData.readInt16LE(i * 2);
      muLawData[i] = this.pcmToMuLawSample(pcm);
    }
    return muLawData;
  }

  private pcmToMuLawSample(pcm: number): number {
    const BIAS = 0x84;
    const CLIP = 32635;
    let sign = (pcm >> 8) & 0x80;
    if (sign) pcm = -pcm;
    if (pcm > CLIP) pcm = CLIP;
    pcm += BIAS;
    let exponent = 7;
    for (let expMask = 0x4000; (pcm & expMask) === 0 && exponent > 0; exponent--) {
      expMask >>= 1;
    }
    const mantissa = (pcm >> (exponent + 3)) & 0x0f;
    return (~(sign | (exponent << 4) | mantissa)) & 0xff;
  }

  private muLawToWav(muLawData: Buffer): Buffer {
    const pcmData = Buffer.alloc(muLawData.length * 2);
    for (let i = 0; i < muLawData.length; i++) {
      pcmData.writeInt16LE(this.muLawToPcm(muLawData[i]), i * 2);
    }
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcmData.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(8000, 24);
    header.writeUInt32LE(16000, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcmData.length, 40);
    return Buffer.concat([header, pcmData]);
  }

  private muLawToPcm(muLaw: number): number {
    muLaw = ~muLaw & 0xff;
    const sign = muLaw & 0x80;
    const exponent = (muLaw >> 4) & 0x07;
    const mantissa = muLaw & 0x0f;
    let sample = ((mantissa << 3) + 0x84) << exponent;
    return sign ? -sample : sample;
  }

  getHttpServer() {
    return this.httpServer;
  }

  shutdown(): void {
    for (const callId of this.activeCalls.keys()) {
      this.endCall(callId, 'Goodbye!').catch(console.error);
    }
    this.wss?.close();
    this.httpServer?.close();
  }
}
