import cron from 'node-cron';
import { config } from '../config/app.js';
import { SettlementEngine } from './SettlementEngine.js';

// ============================================================
// SETTLEMENT SCHEDULER
// ============================================================
// Runs automatically on the 1st of each month at 00:05 UTC.
// Calculates and persists the previous month's settlement.
// ============================================================

export class SettlementScheduler {
  private engine: SettlementEngine;

  constructor() {
    this.engine = new SettlementEngine();
  }

  start(): void {
    // Run on the configured settlement day at 00:05 UTC
    const cronExpr = `5 0 ${config.settlementDay} * *`;

    cron.schedule(cronExpr, async () => {
      console.log('[Settlement] Monthly settlement job started');
      try {
        await this.runMonthlySettlement();
      } catch (err) {
        console.error('[Settlement] Job failed:', err);
      }
    });

    console.log(`[Settlement] Scheduler active — runs on day ${config.settlementDay} of each month`);
  }

  async runMonthlySettlement(): Promise<void> {
    // Calculate for previous month
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthStr = prevMonth.toISOString().slice(0, 7);

    console.log(`[Settlement] Calculating for ${monthStr}...`);

    const result = await this.engine.calculateSettlement(monthStr);

    console.log(`[Settlement] Results for ${monthStr}:`);
    console.log(`  Active users:  ${result.activeUsers}`);
    console.log(`  Total revenue: ${result.totalRevenue.toFixed(2)}€`);
    console.log(`  Hub costs:     ${result.hubCosts.toFixed(2)}€`);
    console.log(`  Hub reserve:   ${result.hubReserve.toFixed(2)}€`);
    console.log(`  Pool:          ${result.totalPool.toFixed(2)}€`);
    console.log(`  Total hours:   ${result.totalHours}h`);
    console.log(`  Platforms:`);
    for (const p of result.platforms) {
      console.log(`    ${p.platformName}: ${p.percentOfTotal}% → ${p.amountEur.toFixed(2)}€ (${p.uniqueUsers} users)`);
    }

    await this.engine.persistSettlement(result);
    console.log(`[Settlement] Persisted and ready for payment processing`);

    // TODO: Trigger BaaS payment transfers
    // await paymentService.executeSettlementTransfers(result);
  }
}
