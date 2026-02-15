import { query, getClient } from '../config/database.js';
import { config } from '../config/app.js';

// ============================================================
// SETTLEMENT ENGINE
// ============================================================
// Runs on the 1st of each month.
// Calculates proportional revenue distribution to platforms
// based on actual viewing time.
//
// Formula:
//   Pool = Total Revenue - Hub Costs - 5% Reserve
//   Platform_i share = Pool × (time_on_i / total_time)
//
// Everything is transparent and auditable.
// ============================================================

export interface SettlementResult {
  month: string;
  totalRevenue: number;
  hubCosts: number;
  hubReserve: number;
  totalPool: number;
  activeUsers: number;
  totalHours: number;
  platforms: PlatformSettlement[];
}

export interface PlatformSettlement {
  platformId: number;
  platformName: string;
  totalSeconds: number;
  totalHours: number;
  totalSessions: number;
  uniqueUsers: number;
  percentOfTotal: number;
  amountEur: number;
  perUserAverage: number;
}

export class SettlementEngine {
  // ──────────────────────────────────────────────
  // CALCULATE MONTHLY SETTLEMENT
  // ──────────────────────────────────────────────
  async calculateSettlement(monthStr: string): Promise<SettlementResult> {
    // monthStr format: "2026-02"
    const monthStart = `${monthStr}-01`;
    const nextMonth = this.getNextMonth(monthStr);
    const nextMonthStart = `${nextMonth}-01`;

    // Step 1: Count active subscribers
    const usersResult = await query<{ count: string }>(
      `SELECT COUNT(DISTINCT id) as count FROM users
       WHERE subscription_status = 'active'
       AND subscription_start <= $1`,
      [monthStart],
    );
    const activeUsers = parseInt(usersResult.rows[0].count, 10);

    // Step 2: Calculate total revenue
    const totalRevenue = activeUsers * config.subscriptionMonthly;

    // Step 3: Get real hub costs (from costs table)
    const costsResult = await query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM hub_costs
       WHERE month = $1`,
      [monthStart],
    );
    const hubCosts = parseFloat(costsResult.rows[0].total);

    // Step 4: Calculate reserve (5% of costs)
    const hubReserve = hubCosts * config.hubCostMargin;

    // Step 5: Calculate distributable pool
    const totalPool = totalRevenue - hubCosts - hubReserve;

    // Step 6: Aggregate viewing time per platform
    const trafficResult = await query<{
      platform_id: number;
      platform_name: string;
      total_seconds: string;
      total_sessions: string;
      unique_users: string;
    }>(
      `SELECT
        vs.platform_id,
        p.name as platform_name,
        SUM(vs.duration_sec) as total_seconds,
        COUNT(*) as total_sessions,
        COUNT(DISTINCT vs.user_id) as unique_users
       FROM viewing_sessions vs
       JOIN platforms p ON p.id = vs.platform_id
       WHERE vs.started_at >= $1
         AND vs.started_at < $2
         AND vs.is_valid = true
       GROUP BY vs.platform_id, p.name
       ORDER BY total_seconds DESC`,
      [monthStart, nextMonthStart],
    );

    // Step 7: Calculate total seconds across all platforms
    const totalSeconds = trafficResult.rows.reduce(
      (sum, row) => sum + parseInt(row.total_seconds, 10),
      0,
    );
    const totalHours = Math.round(totalSeconds / 3600 * 100) / 100;

    // Step 8: Calculate each platform's share
    const platforms: PlatformSettlement[] = trafficResult.rows.map((row) => {
      const platformSeconds = parseInt(row.total_seconds, 10);
      const percentOfTotal = totalSeconds > 0
        ? Math.round((platformSeconds / totalSeconds) * 10000) / 100
        : 0;
      const amountEur = Math.round(totalPool * (platformSeconds / totalSeconds) * 100) / 100;
      const uniqueUsers = parseInt(row.unique_users, 10);

      return {
        platformId: row.platform_id,
        platformName: row.platform_name,
        totalSeconds: platformSeconds,
        totalHours: Math.round(platformSeconds / 3600 * 100) / 100,
        totalSessions: parseInt(row.total_sessions, 10),
        uniqueUsers,
        percentOfTotal,
        amountEur,
        perUserAverage: uniqueUsers > 0
          ? Math.round((amountEur / uniqueUsers) * 100) / 100
          : 0,
      };
    });

    return {
      month: monthStr,
      totalRevenue,
      hubCosts,
      hubReserve,
      totalPool,
      activeUsers,
      totalHours,
      platforms,
    };
  }

  // ──────────────────────────────────────────────
  // PERSIST SETTLEMENT
  // Saves results to database and triggers payments
  // ──────────────────────────────────────────────
  async persistSettlement(settlement: SettlementResult): Promise<void> {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const monthDate = `${settlement.month}-01`;

      // Save platform settlements
      for (const platform of settlement.platforms) {
        await client.query(
          `INSERT INTO monthly_platform_traffic
            (month, platform_id, total_seconds, total_sessions, unique_users,
             pct_of_total, settlement_eur, calculated_at, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), 'pending')
           ON CONFLICT (month, platform_id)
           DO UPDATE SET
             total_seconds = $3, total_sessions = $4, unique_users = $5,
             pct_of_total = $6, settlement_eur = $7, calculated_at = NOW()`,
          [
            monthDate,
            platform.platformId,
            platform.totalSeconds,
            platform.totalSessions,
            platform.uniqueUsers,
            platform.percentOfTotal,
            platform.amountEur,
          ],
        );
      }

      // Save per-user breakdowns
      await client.query(
        `INSERT INTO monthly_user_traffic (month, user_id, platform_id, total_seconds, pct_of_user, amount_eur)
         SELECT
           $1::date as month,
           dt.user_id,
           dt.platform_id,
           SUM(dt.total_seconds),
           CASE WHEN user_total.total > 0
             THEN ROUND((SUM(dt.total_seconds)::numeric / user_total.total) * 100, 2)
             ELSE 0
           END,
           CASE WHEN user_total.total > 0
             THEN ROUND(($2::numeric * (SUM(dt.total_seconds)::numeric / user_total.total)), 2)
             ELSE 0
           END
         FROM daily_traffic dt
         JOIN (
           SELECT user_id, SUM(total_seconds) as total
           FROM daily_traffic
           WHERE date >= $1 AND date < $3
           GROUP BY user_id
         ) user_total ON user_total.user_id = dt.user_id
         WHERE dt.date >= $1 AND dt.date < $3
         GROUP BY dt.user_id, dt.platform_id, user_total.total
         ON CONFLICT (month, user_id, platform_id)
         DO UPDATE SET
           total_seconds = EXCLUDED.total_seconds,
           pct_of_user = EXCLUDED.pct_of_user,
           amount_eur = EXCLUDED.amount_eur`,
        [
          monthDate,
          settlement.totalPool / settlement.activeUsers, // pool per user
          `${this.getNextMonth(settlement.month)}-01`,
        ],
      );

      // Save settlement summary
      await client.query(
        `INSERT INTO settlement_summary
          (month, active_users, total_revenue, hub_costs, hub_reserve,
           total_pool, total_hours, calculated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (month) DO UPDATE SET
           active_users = $2, total_revenue = $3, hub_costs = $4,
           hub_reserve = $5, total_pool = $6, total_hours = $7,
           calculated_at = NOW()`,
        [
          monthDate,
          settlement.activeUsers,
          settlement.totalRevenue,
          settlement.hubCosts,
          settlement.hubReserve,
          settlement.totalPool,
          settlement.totalHours,
        ],
      );

      await client.query('COMMIT');
      console.log(`[Settlement] Persisted for ${settlement.month}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ──────────────────────────────────────────────
  // PREVIEW CURRENT MONTH (real-time estimate)
  // ──────────────────────────────────────────────
  async previewCurrentMonth(): Promise<SettlementResult> {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    return this.calculateSettlement(`${y}-${m}`);
  }

  // ──────────────────────────────────────────────
  // HELPER: Get next month string
  // ──────────────────────────────────────────────
  private getNextMonth(monthStr: string): string {
    const [year, month] = monthStr.split('-').map(Number);
    if (month === 12) return `${year + 1}-01`;
    return `${year}-${String(month + 1).padStart(2, '0')}`;
  }
}
