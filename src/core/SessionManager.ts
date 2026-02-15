import { nanoid } from 'nanoid';
import { redis } from '../config/redis.js';
import { query } from '../config/database.js';
import { config } from '../config/app.js';

// ============================================================
// SESSION MANAGER — The Countdown Engine
// ============================================================
// This is the core of TimeVision's traffic monitoring.
//
// When a user clicks to access a streaming platform:
// 1. A session starts (timer begins)
// 2. Client sends heartbeat every 60 seconds
// 3. Session ends when user returns, switches, or times out
// 4. Duration is recorded and used for monthly settlement
//
// Zero dependency on streaming platforms.
// All tracking is client-side countdown + server timestamp.
// ============================================================

export interface Session {
  sessionId: string;
  userId: number;
  platformId: number;
  platformName: string;
  contentId: string | null;
  contentTitle: string | null;
  startedAt: number;       // Unix timestamp (seconds)
  lastHeartbeat: number;   // Unix timestamp (seconds)
  durationSec: number;     // Running duration
}

export interface SessionStartResult {
  sessionId: string;
  startedAt: number;
  redirectUrl: string;
}

export interface SessionStopResult {
  sessionId: string;
  platformName: string;
  durationSeconds: number;
  endReason: string;
}

export class SessionManager {
  // ──────────────────────────────────────────────
  // START SESSION
  // Called when user clicks "Watch on [Platform]"
  // ──────────────────────────────────────────────
  async startSession(
    userId: number,
    platformId: number,
    platformName: string,
    contentId: string | null = null,
    contentTitle: string | null = null,
  ): Promise<SessionStartResult> {
    // Check if user already has an active session → auto-stop it
    const existing = await this.getActiveSession(userId);
    if (existing) {
      await this.stopSession(userId, existing.sessionId, 'switch');
    }

    // Check daily cap
    const dailySeconds = await this.getDailySeconds(userId);
    if (dailySeconds >= config.maxDailySeconds) {
      throw new Error('DAILY_CAP_REACHED');
    }

    // Create new session
    const sessionId = `sess_${nanoid(12)}`;
    const now = Math.floor(Date.now() / 1000);

    const session: Session = {
      sessionId,
      userId,
      platformId,
      platformName,
      contentId,
      contentTitle,
      startedAt: now,
      lastHeartbeat: now,
      durationSec: 0,
    };

    // Store in Redis (real-time state)
    await redis.hSet(`session:active:${userId}`, {
      sessionId: session.sessionId,
      platformId: session.platformId.toString(),
      platformName: session.platformName,
      contentId: session.contentId || '',
      contentTitle: session.contentTitle || '',
      startedAt: session.startedAt.toString(),
      lastHeartbeat: session.lastHeartbeat.toString(),
      durationSec: '0',
    });

    // Set TTL (auto-cleanup if client disappears)
    await redis.expire(`session:active:${userId}`, 6 * 3600); // 6 hours max

    // Add to platform live counter
    await redis.sAdd(`platform:live:${platformId}`, userId.toString());

    // Log event to stream
    await redis.xAdd('traffic:events', '*', {
      type: 'START',
      userId: userId.toString(),
      sessionId,
      platformId: platformId.toString(),
      contentId: contentId || '',
      timestamp: now.toString(),
    });

    // Get platform redirect URL
    const redirectUrl = await this.getPlatformRedirectUrl(platformId, contentId);

    return { sessionId, startedAt: now, redirectUrl };
  }

  // ──────────────────────────────────────────────
  // HEARTBEAT
  // Called every 60 seconds by client
  // Confirms user is still on the platform
  // ──────────────────────────────────────────────
  async heartbeat(userId: number, sessionId: string): Promise<{ durationSec: number }> {
    const sessionKey = `session:active:${userId}`;
    const stored = await redis.hGet(sessionKey, 'sessionId');

    if (!stored || stored !== sessionId) {
      throw new Error('SESSION_NOT_FOUND');
    }

    const now = Math.floor(Date.now() / 1000);
    const startedAt = parseInt(await redis.hGet(sessionKey, 'startedAt') || '0', 10);
    const durationSec = now - startedAt;

    // Check session cap (6 hours)
    if (durationSec >= config.maxSessionSeconds) {
      await this.stopSession(userId, sessionId, 'cap');
      return { durationSec: config.maxSessionSeconds };
    }

    // Update heartbeat timestamp and duration
    await redis.hSet(sessionKey, {
      lastHeartbeat: now.toString(),
      durationSec: durationSec.toString(),
    });

    // Refresh TTL
    await redis.expire(sessionKey, 6 * 3600);

    return { durationSec };
  }

  // ──────────────────────────────────────────────
  // STOP SESSION
  // Called when user returns to hub, switches
  // platform, closes app, or times out
  // ──────────────────────────────────────────────
  async stopSession(
    userId: number,
    sessionId: string,
    reason: 'return' | 'switch' | 'timeout' | 'close' | 'cap',
  ): Promise<SessionStopResult> {
    const sessionKey = `session:active:${userId}`;
    const sessionData = await redis.hGetAll(sessionKey);

    if (!sessionData.sessionId || sessionData.sessionId !== sessionId) {
      throw new Error('SESSION_NOT_FOUND');
    }

    const now = Math.floor(Date.now() / 1000);
    const startedAt = parseInt(sessionData.startedAt, 10);
    const platformId = parseInt(sessionData.platformId, 10);
    let durationSeconds = now - startedAt;

    // Cap duration
    if (durationSeconds > config.maxSessionSeconds) {
      durationSeconds = config.maxSessionSeconds;
    }

    // Persist to PostgreSQL
    await query(
      `INSERT INTO viewing_sessions
        (session_uid, user_id, platform_id, content_id, started_at, ended_at,
         last_heartbeat, duration_sec, end_reason, is_valid)
       VALUES ($1, $2, $3, $4, to_timestamp($5), to_timestamp($6),
         to_timestamp($7), $8, $9, $10)`,
      [
        sessionId,
        userId,
        platformId,
        sessionData.contentId || null,
        startedAt,
        now,
        parseInt(sessionData.lastHeartbeat, 10),
        durationSeconds,
        reason,
        true,
      ],
    );

    // Update daily aggregate
    const today = new Date().toISOString().slice(0, 10);
    await query(
      `INSERT INTO daily_traffic (date, user_id, platform_id, total_seconds, session_count)
       VALUES ($1, $2, $3, $4, 1)
       ON CONFLICT (date, user_id, platform_id)
       DO UPDATE SET
         total_seconds = daily_traffic.total_seconds + $4,
         session_count = daily_traffic.session_count + 1`,
      [today, userId, platformId, durationSeconds],
    );

    // Update daily Redis counter
    const dailyKey = `daily:${userId}:${today}`;
    await redis.hIncrBy(dailyKey, 'total_sec', durationSeconds);
    await redis.hIncrBy(dailyKey, sessionData.platformName, durationSeconds);
    await redis.hIncrBy(dailyKey, 'sessions', 1);
    await redis.expire(dailyKey, 172800); // 48 hours

    // Remove from platform live counter
    await redis.sRem(`platform:live:${platformId}`, userId.toString());

    // Delete active session
    await redis.del(sessionKey);

    // Log event
    await redis.xAdd('traffic:events', '*', {
      type: 'STOP',
      userId: userId.toString(),
      sessionId,
      platformId: platformId.toString(),
      durationSec: durationSeconds.toString(),
      reason,
      timestamp: now.toString(),
    });

    return {
      sessionId,
      platformName: sessionData.platformName,
      durationSeconds,
      endReason: reason,
    };
  }

  // ──────────────────────────────────────────────
  // GET ACTIVE SESSION
  // Returns current session for a user (if any)
  // ──────────────────────────────────────────────
  async getActiveSession(userId: number): Promise<Session | null> {
    const data = await redis.hGetAll(`session:active:${userId}`);
    if (!data.sessionId) return null;

    return {
      sessionId: data.sessionId,
      userId,
      platformId: parseInt(data.platformId, 10),
      platformName: data.platformName,
      contentId: data.contentId || null,
      contentTitle: data.contentTitle || null,
      startedAt: parseInt(data.startedAt, 10),
      lastHeartbeat: parseInt(data.lastHeartbeat, 10),
      durationSec: parseInt(data.durationSec, 10),
    };
  }

  // ──────────────────────────────────────────────
  // GET DAILY SECONDS
  // How many seconds user has consumed today
  // ──────────────────────────────────────────────
  async getDailySeconds(userId: number): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);
    const val = await redis.hGet(`daily:${userId}:${today}`, 'total_sec');
    return val ? parseInt(val, 10) : 0;
  }

  // ──────────────────────────────────────────────
  // GET LIVE PLATFORM STATS
  // How many users are active on each platform NOW
  // ──────────────────────────────────────────────
  async getLivePlatformStats(): Promise<Array<{ platformId: number; activeUsers: number }>> {
    const platforms = await query<{ id: number }>('SELECT id FROM platforms WHERE active = true');
    const stats = [];

    for (const platform of platforms.rows) {
      const count = await redis.sCard(`platform:live:${platform.id}`);
      stats.push({ platformId: platform.id, activeUsers: count });
    }

    return stats;
  }

  // ──────────────────────────────────────────────
  // HELPER: Get redirect URL for platform
  // ──────────────────────────────────────────────
  private async getPlatformRedirectUrl(
    platformId: number,
    contentId: string | null,
  ): Promise<string> {
    const result = await query<{ base_url: string; deep_link_template: string }>(
      'SELECT base_url, deep_link_template FROM platforms WHERE id = $1',
      [platformId],
    );

    if (result.rows.length === 0) throw new Error('PLATFORM_NOT_FOUND');

    const platform = result.rows[0];
    if (contentId && platform.deep_link_template) {
      return platform.deep_link_template.replace('{content_id}', contentId);
    }
    return platform.base_url;
  }
}
