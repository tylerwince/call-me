/**
 * OpenAI Realtime STT Provider
 *
 * Uses the OpenAI Realtime API for streaming transcription with:
 * - Direct mu-law audio support (no conversion needed)
 * - Built-in server-side VAD for turn detection
 * - Low-latency streaming transcription
 */

import WebSocket from 'ws';
import type { STTProvider, STTConfig } from './types.js';

export class OpenAIRealtimeSTTProvider implements STTProvider {
  readonly name = 'openai-realtime';
  private apiKey: string | null = null;
  private model: string = 'gpt-4o-transcribe';

  initialize(config: STTConfig): void {
    if (!config.apiKey) {
      throw new Error('OpenAI API key required for Realtime STT');
    }
    this.apiKey = config.apiKey;
    this.model = config.model || 'gpt-4o-transcribe';
    console.error(`STT provider: OpenAI Realtime (${this.model})`);
  }

  /**
   * Legacy method - not used for realtime, but required by interface
   */
  async transcribe(audioBuffer: Buffer): Promise<string> {
    throw new Error('Use createRealtimeSession() for streaming transcription');
  }

  /**
   * Create a realtime transcription session
   * Returns a controller object for sending audio and receiving transcripts
   */
  createRealtimeSession(): RealtimeTranscriptionSession {
    if (!this.apiKey) throw new Error('OpenAI Realtime STT not initialized');
    return new RealtimeTranscriptionSession(this.apiKey, this.model);
  }
}

export class RealtimeTranscriptionSession {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private model: string;
  private connected = false;
  private pendingTranscript = '';
  private onTranscriptCallback: ((transcript: string) => void) | null = null;
  private onPartialCallback: ((partial: string) => void) | null = null;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  /**
   * Connect to OpenAI Realtime API
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = 'wss://api.openai.com/v1/realtime?intent=transcription';

      this.ws = new WebSocket(url, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });

      this.ws.on('open', () => {
        console.error('[RealtimeSTT] WebSocket connected');
        this.connected = true;

        // Configure the transcription session
        this.sendEvent({
          type: 'transcription_session.update',
          session: {
            input_audio_format: 'g711_ulaw',
            input_audio_transcription: {
              model: this.model,
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 800, // Slightly shorter for faster response
            },
          },
        });

        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const event = JSON.parse(data.toString());
          this.handleEvent(event);
        } catch (e) {
          console.error('[RealtimeSTT] Failed to parse event:', e);
        }
      });

      this.ws.on('error', (error) => {
        console.error('[RealtimeSTT] WebSocket error:', error);
        if (!this.connected) reject(error);
      });

      this.ws.on('close', () => {
        console.error('[RealtimeSTT] WebSocket closed');
        this.connected = false;
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!this.connected) {
          reject(new Error('Realtime STT connection timeout'));
        }
      }, 10000);
    });
  }

  private handleEvent(event: any): void {
    switch (event.type) {
      case 'transcription_session.created':
        console.error('[RealtimeSTT] Session created');
        break;

      case 'transcription_session.updated':
        console.error('[RealtimeSTT] Session updated');
        break;

      case 'conversation.item.input_audio_transcription.delta':
        // Incremental transcript
        if (event.delta && this.onPartialCallback) {
          this.pendingTranscript += event.delta;
          this.onPartialCallback(this.pendingTranscript);
        }
        break;

      case 'conversation.item.input_audio_transcription.completed':
        // Final transcript for this turn
        console.error(`[RealtimeSTT] Transcript: ${event.transcript}`);
        if (this.onTranscriptCallback && event.transcript) {
          this.onTranscriptCallback(event.transcript);
        }
        this.pendingTranscript = '';
        break;

      case 'input_audio_buffer.speech_started':
        console.error('[RealtimeSTT] Speech started');
        this.pendingTranscript = '';
        break;

      case 'input_audio_buffer.speech_stopped':
        console.error('[RealtimeSTT] Speech stopped');
        break;

      case 'input_audio_buffer.committed':
        console.error('[RealtimeSTT] Audio committed');
        break;

      case 'error':
        console.error('[RealtimeSTT] Error:', event.error);
        break;

      default:
        // Ignore other events
        break;
    }
  }

  private sendEvent(event: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  /**
   * Send mu-law audio data to the transcription session
   * Audio should be 8kHz mono mu-law (g711_ulaw)
   */
  sendAudio(muLawData: Buffer): void {
    if (!this.connected) return;

    this.sendEvent({
      type: 'input_audio_buffer.append',
      audio: muLawData.toString('base64'),
    });
  }

  /**
   * Set callback for completed transcriptions (full turn)
   */
  onTranscript(callback: (transcript: string) => void): void {
    this.onTranscriptCallback = callback;
  }

  /**
   * Set callback for partial transcriptions (streaming)
   */
  onPartial(callback: (partial: string) => void): void {
    this.onPartialCallback = callback;
  }

  /**
   * Wait for the next complete transcript
   */
  async waitForTranscript(timeoutMs: number = 30000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.onTranscriptCallback = null;
        reject(new Error('Transcript timeout'));
      }, timeoutMs);

      this.onTranscriptCallback = (transcript) => {
        clearTimeout(timeout);
        this.onTranscriptCallback = null;
        resolve(transcript);
      };
    });
  }

  /**
   * Close the session
   */
  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
