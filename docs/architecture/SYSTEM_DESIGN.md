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

## Session Degradation & Reconciliation

The countdown is an **estimation system**, not an exact measurement. Time Vision Media cannot observe what happens inside another platform's tab, app, or device. This section documents every degradation scenario and how the system handles it.

### Web (Browser)

| Scenario | What happens | Impact | Mitigation |
|----------|-------------|--------|------------|
| User closes browser tab | Heartbeat stops arriving | Session runs for up to 5 more minutes (timeout window) | HeartbeatWatchdog closes session with reason `timeout`. Max overcount: 300 seconds |
| User puts tab in background | Page Visibility API may pause JS timers | Heartbeat may be delayed or skipped | Client should use `visibilitychange` event to send an immediate heartbeat on tab return. If missed for 5 min → timeout |
| User loses network | Heartbeat requests fail silently | Session stays "alive" in Redis until timeout | Same as above — 5 min grace, then `timeout` |
| Browser crashes / OS kill | No graceful shutdown possible | Session runs until TTL or watchdog catches it | Redis TTL (6h max) is the hard safety net. Watchdog (30s scan) catches it within 5 min |
| User opens new tab to same platform | Two heartbeats for the same session? No — session is per-user, not per-tab | No duplication | `session:active:{userId}` is a single Redis hash. One user = one session |

### Mobile (React Native)

| Scenario | What happens | Impact | Mitigation |
|----------|-------------|--------|------------|
| App goes to background | iOS/Android suspend JS execution after ~30s | Heartbeat stops | App should send `stop` on `AppState.change` to `background`. If not: watchdog timeout (5 min) |
| OS kills backgrounded app | No callback guaranteed | Same as browser crash | Watchdog timeout (5 min) + Redis TTL (6h) |
| Poor connectivity (mobile data) | Heartbeats may fail intermittently | Session may timeout even though user is watching | 5-minute window is generous — typical mobile hiccup is <30s. If it exceeds 5 min, user likely isn't watching |
| Device goes to sleep | App suspended | Heartbeat stops | Same as background — `stop` on sleep event, watchdog as fallback |

### Orphan Session Cleanup

Three layers of defense against stuck sessions:

```
Layer 1 — Client-side:
  App sends POST /api/session/stop on:
  • Tab close (beforeunload event)
  • App background (AppState listener)
  • User explicitly returns to hub

Layer 2 — HeartbeatWatchdog (server-side):
  Runs every 30 seconds
  Scans all session:active:* keys in Redis
  If lastHeartbeat > 5 minutes ago → stopSession(reason: 'timeout')

Layer 3 — Redis TTL (hard safety net):
  Every session key has a 6-hour TTL
  If both client and watchdog fail, Redis auto-deletes the key
  A daily reconciliation job (planned) can detect sessions
  with no matching viewing_sessions row and generate alerts
```

### Accuracy Budget

```
Per session:
  Start:     ±1 second  (server timestamp at redirect)
  Heartbeat: ±60 seconds (heartbeat interval)
  End:       ±300 seconds worst case (5 min timeout)
  Typical:   ±60 seconds (client sends stop)

Per day (10 sessions average):
  Typical:   ±5 minutes
  Worst:     ±50 minutes (all 10 sessions timeout — unlikely)

Per month (30 days):
  Typical:   ±2 hours
  Worst:     ±25 hours (extreme — all sessions timeout every day)

For settlement:
  Monthly pool = millions of euros
  ±2 hours out of ~100 hours/user/month = ~2% variance
  At aggregate level (100k+ users), variance approaches zero
  (overestimates and underestimates cancel out statistically)
```

### What This Means for Implementers

1. **Do not market this as "real-time precision tracking"** — it is a robust estimation
2. **Heartbeat interval (60s) is the fundamental resolution** — anything finer is false precision
3. **The 5-minute timeout window is a design tradeoff**: shorter = more false timeouts from network glitches; longer = more overcount on genuine exits
4. **Mobile is less reliable than web** — plan for higher timeout rates on mobile sessions
5. **Settlement accuracy is acceptable** because it operates on monthly aggregates across thousands of users, where individual variances cancel out

## Timezone Policy

All server-side dates and timestamps use **UTC**.

### Why UTC

- Time Vision Media serves users across multiple timezones
- UTC avoids ambiguity at daylight saving transitions
- PostgreSQL stores `TIMESTAMPTZ` which is always UTC internally
- Settlement runs at `00:05 UTC` on the 1st of each month — one consistent boundary

### Where It Matters

| Context | Boundary | Impact |
|---------|----------|--------|
| **Daily cap (16h)** | UTC midnight | A user in CET (UTC+1) watching at 00:30 local time has their session counted against the previous UTC day. Worst case: ±1-2 hours of headroom shift. Acceptable — the cap prevents abuse, not precise billing |
| **Daily traffic aggregates** | UTC day | `daily_traffic` table groups by UTC date. Cross-timezone users see their daily stats aligned to UTC |
| **Monthly settlement** | UTC month | Settlement aggregates entire UTC months. At this granularity, timezone is irrelevant (±2h out of 720h) |
| **Anomaly detection** | UTC day | Pattern detection (3+ consecutive high-usage days) uses UTC days. No practical impact |

### Implementation

```typescript
// CORRECT — explicit UTC date
function utcDateString(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// WRONG — depends on server locale, breaks in different environments
const today = new Date().toISOString().slice(0, 10); // DON'T USE
```

### User-Facing Dates

The **frontend** should convert UTC timestamps to the user's local timezone for display purposes only. The server never stores or calculates with local times.

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
