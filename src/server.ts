import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config/app.js';
import { initDatabase } from './config/database.js';
import { initRedis } from './config/redis.js';
import { initWebSocket } from './websocket/server.js';
import { authRoutes } from './api/auth.routes.js';
import { sessionRoutes } from './api/session.routes.js';
import { discoverRoutes } from './api/discover.routes.js';
import { settlementRoutes } from './api/settlement.routes.js';
import { adminRoutes } from './api/admin.routes.js';
import { HeartbeatWatchdog } from './core/HeartbeatWatchdog.js';
import { SettlementScheduler } from './core/SettlementScheduler.js';

async function bootstrap() {
  // Initialize external services
  await initDatabase();
  await initRedis();

  // Create Express app
  const app = express();
  const server = http.createServer(app);

  // Middleware
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(morgan('combined'));
  app.use(express.json());

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/session', sessionRoutes);
  app.use('/api/discover', discoverRoutes);
  app.use('/api/settlement', settlementRoutes);
  app.use('/api/admin', adminRoutes);

  // Transparency endpoint (public, no auth)
  app.get('/api/transparency', async (_req, res) => {
    // Public endpoint showing real hub costs
    res.json({
      month: new Date().toISOString().slice(0, 7),
      message: 'Full transparency report available at /api/admin/costs',
      principle: 'Real operating costs + 5% reserve. Nothing more.',
    });
  });

  // Initialize WebSocket for countdown heartbeat
  initWebSocket(server);

  // Start background services
  const watchdog = new HeartbeatWatchdog();
  watchdog.start();

  const scheduler = new SettlementScheduler();
  scheduler.start();

  // Start server
  server.listen(config.port, () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║                                                  ║
║   ████████╗██╗███╗   ███╗███████╗                ║
║   ╚══██╔══╝██║████╗ ████║██╔════╝                ║
║      ██║   ██║██╔████╔██║█████╗                  ║
║      ██║   ██║██║╚██╔╝██║██╔══╝                  ║
║      ██║   ██║██║ ╚═╝ ██║███████╗                ║
║      ╚═╝   ╚═╝╚═╝     ╚═╝╚══════╝                ║
║                                                  ║
║   ██╗   ██╗██╗███████╗██╗ ██████╗ ███╗   ██╗    ║
║   ██║   ██║██║██╔════╝██║██╔═══██╗████╗  ██║    ║
║   ██║   ██║██║███████╗██║██║   ██║██╔██╗ ██║    ║
║   ╚██╗ ██╔╝██║╚════██║██║██║   ██║██║╚██╗██║    ║
║    ╚████╔╝ ██║███████║██║╚██████╔╝██║ ╚████║    ║
║     ╚═══╝  ╚═╝╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝    ║
║                                                  ║
║   Your time decides where your money goes.       ║
║                                                  ║
║   Server running on port ${config.port}                  ║
║   Environment: ${config.nodeEnv}                      ║
║                                                  ║
╚══════════════════════════════════════════════════╝
    `);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start TimeVision:', err);
  process.exit(1);
});
