# Time Vision Media — System Design

*"Time, made visible."*

## Overview

Time Vision Media is a **frontend-only universal interface** for streaming platforms. It does not host, process, or distribute any media content. It provides:

1. **Unified Discovery** — aggregated catalog from all partner platforms
2. **One-Click Redirect** — user clicks, gets redirected to the streaming platform
3. **Time Tracking** — client-side countdown measures time spent on each platform
4. **Proportional Settlement** — revenue distributed based on actual viewing time
5. **Full Transparency** — operating costs published monthly, audited annually

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                           │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Web App    │  │  iOS App     │  │ Android App  │       │
│  │  (Next.js)   │  │(React Native)│  │(React Native)│       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                 │                  │               │
│         └─────────────────┼──────────────────┘               │
│                           │                                  │
│                    WebSocket + REST                           │
└───────────────────────────┼──────────────────────────────────┘
                            │
┌───────────────────────────┼──────────────────────────────────┐
│                      API LAYER                                │
│                           │                                  │
│  ┌────────────────────────┴────────────────────────┐         │
│  │              Express.js + TypeScript              │         │
│  │                                                  │         │
│  │  /api/auth        — Authentication               │         │
│  │  /api/session     — Countdown (start/pulse/stop) │         │
│  │  /api/discover    — Catalog + Search + Trending   │         │
│  │  /api/settlement  — Revenue distribution          │         │
│  │  /api/admin       — Transparency + Live traffic   │         │
│  │  /ws/traffic      — WebSocket heartbeat           │         │
│  └──────────┬─────────────────────────┬──────────────┘         │
│             │                         │                      │
│  ┌──────────┴──────────┐  ┌──────────┴──────────┐           │
│  │   CORE ENGINES      │  │   SERVICES           │           │
│  │                     │  │                      │           │
│  │  SessionManager     │  │  Redis Service       │           │
│  │  SettlementEngine   │  │  Payment Service     │           │
│  │  HeartbeatWatchdog  │  │  TMDB Service        │           │
│  │  AnomalyDetector    │  │  Platform Service    │           │
│  │  SettlementScheduler│  │                      │           │
│  └─────────────────────┘  └──────────────────────┘           │
└──────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────┼──────────────────────────────────┐
│                      DATA LAYER                               │
│                           │                                  │
│  ┌────────────────────────┴─────┐  ┌──────────────────────┐  │
│  │        PostgreSQL             │  │      Redis           │  │
│  │                              │  │                      │  │
│  │  users                       │  │  session:active:*    │  │
│  │  platforms                   │  │  platform:live:*     │  │
│  │  content                     │  │  daily:*             │  │
│  │  content_availability        │  │  traffic:events      │  │
│  │  viewing_sessions            │  │                      │  │
│  │  daily_traffic               │  │                      │  │
│  │  monthly_platform_traffic    │  │                      │  │
│  │  monthly_user_traffic        │  │                      │  │
│  │  settlement_summary          │  │                      │  │
│  │  hub_costs                   │  │                      │  │
│  │  traffic_anomalies           │  │                      │  │
│  │  equity_ledger               │  │                      │  │
│  └──────────────────────────────┘  └──────────────────────┘  │
└──────────────────────────────────────────────────────────────┘

                     EXTERNAL INTEGRATIONS
                            │
              ┌─────────────┼─────────────┐
              │             │             │
        ┌─────┴─────┐ ┌────┴────┐ ┌──────┴──────┐
        │   TMDB    │ │  BaaS   │ │  Streaming  │
        │   API     │ │ (Swan)  │ │  Platforms  │
        │           │ │         │ │             │
        │ metadata  │ │ wallets │ │  Netflix    │
        │ posters   │ │ payments│ │  MUBI       │
        │ ratings   │ │ transfer│ │  Crunchyroll│
        └───────────┘ └─────────┘ │  Disney+    │
                                  │  ...        │
                                  └─────────────┘
```

## Countdown Mechanism (Core IP)

The countdown system is the heart of Time Vision Media. It tracks time without any dependency on streaming platforms.

### State Machine

```
            click "Watch"
    IDLE ─────────────────▶ ACTIVE
                              │
                    ┌─────────┼─────────┐
                    │         │         │
                 return    switch   timeout
                 to hub   platform  (5 min)
                    │         │         │
                    ▼         ▼         ▼
                 CLOSED    CLOSED    CLOSED
                              │
                              ▼
                           ACTIVE (new platform)
```

### Precision Guarantees

| Factor | Precision | Notes |
|--------|-----------|-------|
| Start time | ±1 second | Server timestamp at redirect |
| Heartbeat | ±60 seconds | Client sends every 60s |
| End time | ±60 seconds | Next heartbeat miss = timeout |
| Daily total | ±5 minutes | Accumulated rounding |
| Monthly total | ±2 hours | Acceptable for settlement |

### Anti-Fraud Layers

1. **Daily cap**: 16 hours max per user per day
2. **Session cap**: 6 hours continuous max
3. **Heartbeat required**: No pulse for 5 min = session closed
4. **Volume anomaly**: >3x median flagged
5. **Pattern anomaly**: Near-max usage for 3+ consecutive days flagged

## Settlement Process

```
Monthly cycle:
  Day 1-28/30/31: Sessions tracked in real-time
  Day 1 next month 00:05 UTC: Settlement job runs

Settlement calculation:
  1. Aggregate all valid sessions per platform
  2. Calculate total seconds across all platforms
  3. Calculate percentage per platform
  4. Get real hub costs from hub_costs table
  5. Pool = Total Revenue - Hub Costs - 5% Reserve
  6. Each platform receives: Pool × their percentage
  7. Per-user breakdown calculated for transparency
  8. BaaS transfers initiated
  9. Transparency report published
```

## Scaling Strategy

| Users | Infrastructure | Est. Cost |
|-------|---------------|-----------|
| 0-10k | 1 server + managed DB + Redis | ~500€/month |
| 10k-100k | 2 app servers + DB cluster + Redis | ~3,000€/month |
| 100k-500k | 4 app servers + read replicas + Redis cluster | ~8,000€/month |
| 500k-1M | Kubernetes cluster + managed services | ~15,000€/month |

The architecture is intentionally simple because Time Vision Media does not process media. It's API calls, database queries, and WebSocket connections — not video transcoding.
