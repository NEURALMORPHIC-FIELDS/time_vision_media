import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { SessionManager } from '../core/SessionManager.js';

// ============================================================
// SESSION ROUTES — Countdown API (REST fallback)
// ============================================================
// Primary communication is via WebSocket.
// These REST endpoints serve as fallback when WebSocket
// is unavailable (e.g., restricted networks).
// ============================================================

const router = Router();
const sessionManager = new SessionManager();

// POST /api/session/start
router.post('/start', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { platformId, platformName, contentId, contentTitle } = req.body;

    if (!platformId || !platformName) {
      res.status(400).json({ error: 'platformId and platformName are required' });
      return;
    }

    const result = await sessionManager.startSession(
      req.user!.userId,
      platformId,
      platformName,
      contentId || null,
      contentTitle || null,
    );

    res.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === 'DAILY_CAP_REACHED') {
      res.status(429).json({ error: 'Daily viewing cap reached (16 hours)' });
      return;
    }
    res.status(500).json({ error: 'Failed to start session' });
  }
});

// POST /api/session/heartbeat
router.post('/heartbeat', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required' });
      return;
    }

    const result = await sessionManager.heartbeat(req.user!.userId, sessionId);
    res.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === 'SESSION_NOT_FOUND') {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    res.status(500).json({ error: 'Heartbeat failed' });
  }
});

// POST /api/session/stop
router.post('/stop', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { sessionId, reason } = req.body;
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required' });
      return;
    }

    const validReasons = ['return', 'switch', 'timeout', 'close', 'cap'];
    const endReason = validReasons.includes(reason) ? reason : 'return';

    const result = await sessionManager.stopSession(req.user!.userId, sessionId, endReason);
    res.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === 'SESSION_NOT_FOUND') {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.status(500).json({ error: 'Failed to stop session' });
  }
});

// GET /api/session/active
router.get('/active', requireAuth, async (req: AuthenticatedRequest, res) => {
  const session = await sessionManager.getActiveSession(req.user!.userId);
  res.json({ active: !!session, session });
});

export const sessionRoutes = router;
