import dotenv from 'dotenv';
dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiUrl: process.env.API_URL || 'http://localhost:3000',

  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/timevision',

  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // Auth
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  sessionSecret: process.env.SESSION_SECRET || 'dev-session-secret',
  jwtExpiresIn: '7d',

  // BaaS
  baasProvider: process.env.BAAS_PROVIDER || 'swan',
  baasApiKey: process.env.BAAS_API_KEY || '',
  baasWebhookSecret: process.env.BAAS_WEBHOOK_SECRET || '',

  // External APIs
  tmdbApiKey: process.env.TMDB_API_KEY || '',

  // Settlement
  settlementDay: parseInt(process.env.SETTLEMENT_DAY || '1', 10),
  hubCostMargin: parseFloat(process.env.HUB_COST_MARGIN || '0.05'),

  // Subscription
  subscriptionMonthly: 50.0, // EUR
  subscriptionAnnual: 540.0, // EUR (10% discount)
  minContractMonths: 6,

  // Session limits (anti-fraud)
  maxDailySeconds: 57600,       // 16 hours
  maxSessionSeconds: 21600,     // 6 hours
  heartbeatIntervalMs: 60000,   // 60 seconds
  heartbeatTimeoutMs: 300000,   // 5 minutes
  watchdogIntervalMs: 30000,    // 30 seconds

  // CORS
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
} as const;
