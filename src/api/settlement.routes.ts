import { Router } from 'express';
import { query } from '../config/database.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { SettlementEngine } from '../core/SettlementEngine.js';

const router = Router();
const engine = new SettlementEngine();

// GET /api/settlement/current — Real-time estimate for current month
router.get('/current', requireAuth, async (_req, res) => {
  try {
    const preview = await engine.previewCurrentMonth();
    res.json(preview);
  } catch {
    res.status(500).json({ error: 'Failed to generate settlement preview' });
  }
});

// GET /api/settlement/history — Past settlements
router.get('/history', requireAuth, async (_req, res) => {
  const result = await query(
    `SELECT month, active_users, total_revenue, hub_costs, hub_reserve,
            total_pool, total_hours, published
     FROM settlement_summary
     ORDER BY month DESC
     LIMIT 12`,
  );

  res.json({ settlements: result.rows });
});

// GET /api/settlement/user — User's personal breakdown
router.get('/user', requireAuth, async (req: AuthenticatedRequest, res) => {
  const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
  const monthDate = `${month}-01`;

  const result = await query(
    `SELECT mut.platform_id, p.name as platform_name, p.logo_url,
            mut.total_seconds, mut.pct_of_user, mut.amount_eur
     FROM monthly_user_traffic mut
     JOIN platforms p ON p.id = mut.platform_id
     WHERE mut.user_id = $1 AND mut.month = $2
     ORDER BY mut.total_seconds DESC`,
    [req.user!.userId, monthDate],
  );

  // Get total for this user
  const totalSeconds = result.rows.reduce((s, r) => s + parseInt(r.total_seconds as string, 10), 0);
  const totalAmount = result.rows.reduce((s, r) => s + parseFloat(r.amount_eur as string), 0);

  res.json({
    month,
    userId: req.user!.userId,
    totalHours: Math.round(totalSeconds / 3600 * 100) / 100,
    totalDistributed: Math.round(totalAmount * 100) / 100,
    platforms: result.rows,
  });
});

// GET /api/settlement/platform — Platform's earnings (for partner dashboard)
router.get('/platform/:id', requireAuth, async (req, res) => {
  const platformId = parseInt(req.params.id, 10);

  const result = await query(
    `SELECT month, total_seconds, total_sessions, unique_users,
            pct_of_total, settlement_eur, status
     FROM monthly_platform_traffic
     WHERE platform_id = $1
     ORDER BY month DESC
     LIMIT 12`,
    [platformId],
  );

  res.json({ platformId, settlements: result.rows });
});

export const settlementRoutes = router;
