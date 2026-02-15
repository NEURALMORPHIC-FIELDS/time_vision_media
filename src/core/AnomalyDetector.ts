import { query } from '../config/database.js';
import { config } from '../config/app.js';

// ============================================================
// ANOMALY DETECTOR
// ============================================================
// Detects and flags suspicious viewing patterns.
// Prevents gaming the settlement system.
//
// Rules:
// 1. Daily cap: max 16 hours/day
// 2. Session cap: max 6 hours continuous
// 3. Volume anomaly: >3x median monthly usage
// 4. Pattern anomaly: consistent max usage (bot-like)
// ============================================================

export interface Anomaly {
  userId: number;
  date: string;
  type: 'daily_cap' | 'session_cap' | 'volume' | 'pattern';
  details: Record<string, unknown>;
  action: 'flagged' | 'excluded' | 'reviewed';
}

export class AnomalyDetector {
  // Run daily anomaly check
  async runDailyCheck(date: string): Promise<Anomaly[]> {
    const anomalies: Anomaly[] = [];

    const volumeAnomalies = await this.checkVolumeAnomalies(date);
    anomalies.push(...volumeAnomalies);

    const patternAnomalies = await this.checkPatternAnomalies(date);
    anomalies.push(...patternAnomalies);

    // Persist anomalies
    for (const anomaly of anomalies) {
      await query(
        `INSERT INTO traffic_anomalies (user_id, date, anomaly_type, details, action_taken)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [anomaly.userId, anomaly.date, anomaly.type, JSON.stringify(anomaly.details), anomaly.action],
      );
    }

    return anomalies;
  }

  // Check for users with abnormally high volume
  private async checkVolumeAnomalies(date: string): Promise<Anomaly[]> {
    const anomalies: Anomaly[] = [];

    // Get median daily usage
    const medianResult = await query<{ median_seconds: string }>(
      `SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_seconds) as median_seconds
       FROM (
         SELECT user_id, SUM(total_seconds) as total_seconds
         FROM daily_traffic
         WHERE date = $1
         GROUP BY user_id
       ) daily_totals`,
      [date],
    );

    const medianSeconds = parseFloat(medianResult.rows[0]?.median_seconds || '0');
    if (medianSeconds === 0) return anomalies;

    const threshold = medianSeconds * 3;

    // Find users exceeding 3x median
    const outliers = await query<{ user_id: number; total_seconds: string }>(
      `SELECT user_id, SUM(total_seconds) as total_seconds
       FROM daily_traffic
       WHERE date = $1
       GROUP BY user_id
       HAVING SUM(total_seconds) > $2`,
      [date, threshold],
    );

    for (const row of outliers.rows) {
      anomalies.push({
        userId: row.user_id,
        date,
        type: 'volume',
        details: {
          userSeconds: parseInt(row.total_seconds, 10),
          medianSeconds,
          threshold,
          ratio: parseInt(row.total_seconds, 10) / medianSeconds,
        },
        action: 'flagged',
      });
    }

    return anomalies;
  }

  // Check for bot-like patterns (consistent near-max usage)
  private async checkPatternAnomalies(date: string): Promise<Anomaly[]> {
    const anomalies: Anomaly[] = [];

    // Users who hit >14 hours for 3+ consecutive days
    const patterns = await query<{ user_id: number; high_days: string; avg_seconds: string }>(
      `SELECT user_id, COUNT(*) as high_days, AVG(daily_total) as avg_seconds
       FROM (
         SELECT user_id, date, SUM(total_seconds) as daily_total
         FROM daily_traffic
         WHERE date >= ($1::date - interval '7 days') AND date <= $1
         GROUP BY user_id, date
         HAVING SUM(total_seconds) > $2
       ) high_usage
       GROUP BY user_id
       HAVING COUNT(*) >= 3`,
      [date, config.maxDailySeconds * 0.875], // 87.5% of daily cap = 14 hours
    );

    for (const row of patterns.rows) {
      anomalies.push({
        userId: row.user_id,
        date,
        type: 'pattern',
        details: {
          consecutiveHighDays: parseInt(row.high_days, 10),
          avgDailySeconds: parseFloat(row.avg_seconds),
          avgDailyHours: Math.round(parseFloat(row.avg_seconds) / 3600 * 10) / 10,
        },
        action: 'flagged',
      });
    }

    return anomalies;
  }

  // Mark sessions from flagged users as invalid for settlement
  async excludeUserFromSettlement(userId: number, month: string): Promise<void> {
    await query(
      `UPDATE viewing_sessions SET is_valid = false
       WHERE user_id = $1
       AND started_at >= $2
       AND started_at < ($2::date + interval '1 month')`,
      [userId, `${month}-01`],
    );

    await query(
      `UPDATE traffic_anomalies SET action_taken = 'excluded'
       WHERE user_id = $1 AND date >= $2 AND date < ($2::date + interval '1 month')`,
      [userId, `${month}-01`],
    );
  }
}
