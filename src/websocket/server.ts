import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { SessionManager } from '../core/SessionManager.js';
import { verifyToken } from '../middleware/auth.js';

// ============================================================
// WEBSOCKET SERVER — Real-time Countdown Communication
// ============================================================
// Handles the heartbeat protocol between client and server.
// Each connected user maintains a WebSocket for:
//   - Starting sessions (timer start)
//   - Sending heartbeats (every 60s)
//   - Stopping sessions (timer stop)
//   - Receiving live stats updates
// ============================================================

interface AuthenticatedSocket extends WebSocket {
  userId?: number;
  sessionId?: string;
  heartbeatTimer?: NodeJS.Timeout;
}

const sessionManager = new SessionManager();

export function initWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws/traffic' });

  wss.on('connection', async (ws: AuthenticatedSocket, req) => {
    // Authenticate via token in query string
    const url = new URL(req.url || '', 'http://localhost');
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Authentication required');
      return;
    }

    try {
      const payload = verifyToken(token);
      ws.userId = payload.userId;
    } catch {
      ws.close(4001, 'Invalid token');
      return;
    }

    // Send connection confirmation
    sendMessage(ws, {
      type: 'connected',
      userId: ws.userId,
      timestamp: Date.now(),
    });

    // Check for existing active session
    const existing = await sessionManager.getActiveSession(ws.userId!);
    if (existing) {
      sendMessage(ws, {
        type: 'session_active',
        session: existing,
      });
    }

    // Handle incoming messages
    ws.on('message', async (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        await handleMessage(ws, message);
      } catch (err) {
        sendMessage(ws, {
          type: 'error',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    });

    ws.on('close', async () => {
      // If user disconnects with active session, let watchdog handle timeout
      if (ws.heartbeatTimer) {
        clearInterval(ws.heartbeatTimer);
      }
    });
  });

  console.log('[WebSocket] Server initialized on /ws/traffic');
}

async function handleMessage(ws: AuthenticatedSocket, message: Record<string, unknown>): Promise<void> {
  const userId = ws.userId!;

  switch (message.type) {
    // ──────────────────────────────────────
    // START — User clicked "Watch on [Platform]"
    // ──────────────────────────────────────
    case 'start': {
      const result = await sessionManager.startSession(
        userId,
        message.platformId as number,
        message.platformName as string,
        (message.contentId as string) || null,
        (message.contentTitle as string) || null,
      );

      ws.sessionId = result.sessionId;

      // Start client-side heartbeat reminder
      if (ws.heartbeatTimer) clearInterval(ws.heartbeatTimer);
      ws.heartbeatTimer = setInterval(() => {
        sendMessage(ws, { type: 'heartbeat_request' });
      }, 60000);

      sendMessage(ws, {
        type: 'session_started',
        sessionId: result.sessionId,
        startedAt: result.startedAt,
        redirectUrl: result.redirectUrl,
      });
      break;
    }

    // ──────────────────────────────────────
    // PULSE — Heartbeat (every 60 seconds)
    // ──────────────────────────────────────
    case 'pulse': {
      const sessionId = (message.sessionId as string) || ws.sessionId;
      if (!sessionId) {
        sendMessage(ws, { type: 'error', message: 'No active session' });
        return;
      }

      const result = await sessionManager.heartbeat(userId, sessionId);

      sendMessage(ws, {
        type: 'pulse_ack',
        sessionId,
        durationSec: result.durationSec,
        durationFormatted: formatDuration(result.durationSec),
      });
      break;
    }

    // ──────────────────────────────────────
    // STOP — User returned / switched / closed
    // ──────────────────────────────────────
    case 'stop': {
      const sessionId = (message.sessionId as string) || ws.sessionId;
      if (!sessionId) {
        sendMessage(ws, { type: 'error', message: 'No active session' });
        return;
      }

      const reason = (message.reason as string) || 'return';
      const result = await sessionManager.stopSession(
        userId,
        sessionId,
        reason as 'return' | 'switch' | 'timeout' | 'close' | 'cap',
      );

      if (ws.heartbeatTimer) {
        clearInterval(ws.heartbeatTimer);
        ws.heartbeatTimer = undefined;
      }
      ws.sessionId = undefined;

      sendMessage(ws, {
        type: 'session_ended',
        sessionId: result.sessionId,
        platformName: result.platformName,
        durationSeconds: result.durationSeconds,
        durationFormatted: formatDuration(result.durationSeconds),
        endReason: result.endReason,
      });
      break;
    }

    // ──────────────────────────────────────
    // STATUS — Get current session status
    // ──────────────────────────────────────
    case 'status': {
      const session = await sessionManager.getActiveSession(userId);
      sendMessage(ws, {
        type: 'status',
        active: !!session,
        session,
      });
      break;
    }

    default:
      sendMessage(ws, { type: 'error', message: `Unknown message type: ${message.type}` });
  }
}

function sendMessage(ws: WebSocket, data: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
