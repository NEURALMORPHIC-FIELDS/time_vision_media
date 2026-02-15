import { Router } from 'express';
import { query } from '../config/database.js';
import { SessionManager } from '../core/SessionManager.js';

const router = Router();
const sessionManager = new SessionManager();

// GET /api/admin/traffic/live — Real-time traffic (public transparency)
router.get('/traffic/live', async (_req, res) => {
  const liveStats = await sessionManager.getLivePlatformStats();

  // Enrich with platform names
  const platforms = await query<{ id: number; name: string }>(
    'SELECT id, name FROM platforms WHERE active = true',
  );
  const nameMap = new Map(platforms.rows.map((p) => [p.id, p.name]));

  const totalActive = liveStats.reduce((s, p) => s + p.activeUsers, 0);

  const enriched = liveStats
    .map((s) => ({
      platformId: s.platformId,
      platformName: nameMap.get(s.platformId) || 'Unknown',
      activeUsers: s.activeUsers,
      percentOfTotal: totalActive > 0
        ? Math.round((s.activeUsers / totalActive) * 10000) / 100
        : 0,
    }))
    .sort((a, b) => b.activeUsers - a.activeUsers);

  res.json({
    timestamp: new Date().toISOString(),
    totalActiveUsers: totalActive,
    platforms: enriched,
  });
});

// GET /api/admin/costs — Current month costs (public transparency)
router.get('/costs', async (req, res) => {
  const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
  const monthDate = `${month}-01`;

  const costs = await query(
    `SELECT category, description, amount, created_at
     FROM hub_costs
     WHERE month = $1
     ORDER BY category, created_at`,
    [monthDate],
  );

  const totalCosts = costs.rows.reduce((s, r) => s + parseFloat(r.amount as string), 0);

  // Group by category
  const byCategory: Record<string, { items: typeof costs.rows; total: number }> = {};
  for (const row of costs.rows) {
    const cat = row.category as string;
    if (!byCategory[cat]) byCategory[cat] = { items: [], total: 0 };
    byCategory[cat].items.push(row);
    byCategory[cat].total += parseFloat(row.amount as string);
  }

  res.json({
    month,
    totalCosts: Math.round(totalCosts * 100) / 100,
    reserve: Math.round(totalCosts * 0.05 * 100) / 100,
    totalRetained: Math.round(totalCosts * 1.05 * 100) / 100,
    categories: byCategory,
    principle: 'Real operating costs + 5% development reserve. Audited annually.',
  });
});

// GET /api/admin/audit — Full audit data (public transparency)
router.get('/audit', async (_req, res) => {
  const summaries = await query(
    `SELECT month, active_users, total_revenue, hub_costs, hub_reserve,
            total_pool, total_hours,
            ROUND((hub_costs + hub_reserve) / total_revenue * 100, 2) as retention_pct
     FROM settlement_summary
     WHERE published = true
     ORDER BY month DESC`,
  );

  res.json({
    audit: summaries.rows,
    note: 'All figures in EUR. Hub retains only operating costs + 5%. Full invoices available upon request.',
  });
});

// GET /api/admin/stats — General platform statistics
router.get('/stats', async (_req, res) => {
  const [users, platforms, sessions24h] = await Promise.all([
    query('SELECT COUNT(*) as count FROM users WHERE subscription_status = $1', ['active']),
    query('SELECT COUNT(*) as count FROM platforms WHERE active = true'),
    query(
      `SELECT COUNT(*) as count, COALESCE(SUM(duration_sec), 0) as total_seconds
       FROM viewing_sessions
       WHERE started_at >= NOW() - INTERVAL '24 hours' AND is_valid = true`,
    ),
  ]);

  res.json({
    activeSubscribers: parseInt(users.rows[0].count as string, 10),
    activePlatforms: parseInt(platforms.rows[0].count as string, 10),
    last24h: {
      sessions: parseInt(sessions24h.rows[0].count as string, 10),
      totalHours: Math.round(parseInt(sessions24h.rows[0].total_seconds as string, 10) / 3600),
    },
  });
});

export const adminRoutes = router;
