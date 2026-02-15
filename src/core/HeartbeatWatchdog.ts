import { redis } from '../config/redis.js';
import { config } from '../config/app.js';
import { SessionManager } from './SessionManager.js';

// ============================================================
// HEARTBEAT WATCHDOG
// ============================================================
// Background process that runs every 30 seconds.
// Cleans up dead sessions (no heartbeat for 5+ minutes).
//
// This ensures that if a user closes their browser/app
// without properly stopping the session, the timer doesn't
// run forever.
// ============================================================

export class HeartbeatWatchdog {
  private intervalId: NodeJS.Timeout | null = null;
  private sessionManager: SessionManager;

  constructor() {
    this.sessionManager = new SessionManager();
  }

  start(): void {
    console.log('[Watchdog] Started — checking every', config.watchdogIntervalMs / 1000, 'seconds');

    this.intervalId = setInterval(async () => {
      try {
        await this.checkSessions();
      } catch (err) {
        console.error('[Watchdog] Error during check:', err);
      }
    }, config.watchdogIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[Watchdog] Stopped');
    }
  }

  private async checkSessions(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const timeoutThreshold = now - (config.heartbeatTimeoutMs / 1000); // 5 minutes ago

    // Scan all active session keys
    let cursor = 0;
    let timedOut = 0;

    do {
      const result = await redis.scan(cursor, {
        MATCH: 'session:active:*',
        COUNT: 100,
      });

      cursor = result.cursor;

      for (const key of result.keys) {
        const sessionData = await redis.hGetAll(key);
        if (!sessionData.sessionId) continue;

        const lastHeartbeat = parseInt(sessionData.lastHeartbeat, 10);
        const userId = parseInt(key.split(':').pop() || '0', 10);

        // Check if heartbeat has timed out
        if (lastHeartbeat < timeoutThreshold) {
          try {
            await this.sessionManager.stopSession(
              userId,
              sessionData.sessionId,
              'timeout',
            );
            timedOut++;
          } catch {
            // Session might have been stopped between scan and stop
            await redis.del(key);
          }
        }
      }
    } while (cursor !== 0);

    if (timedOut > 0) {
      console.log(`[Watchdog] Cleaned up ${timedOut} timed-out sessions`);
    }
  }
}
