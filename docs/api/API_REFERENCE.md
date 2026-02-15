# Time Vision Media — API Reference

*"Time, made visible."*

Base URL: `http://localhost:3000` (development) | `https://api.timevision.tv` (production)

All endpoints return JSON. Authentication via `Authorization: Bearer <token>` header unless marked as public.

---

## Session (Countdown API)

The core of Time Vision Media. These endpoints control the viewing timer that drives proportional settlement.

### POST /api/session/start

Start a countdown session. Redirects user to the streaming platform and begins tracking time.

**Auth:** Required

**Request:**
```json
{
  "platform_id": 1,
  "content_id": "tt1234567",
  "content_title": "Breaking Bad S01E01"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `platform_id` | integer | yes | ID of the target streaming platform |
| `content_id` | string | no | External content identifier (TMDB ID) |
| `content_title` | string | no | Human-readable content title |

**Response:** `200 OK`
```json
{
  "session_id": "sess_a1b2c3d4e5f6",
  "started_at": 1708012800,
  "redirect_url": "https://netflix.com/watch/80057281"
}
```

**Behavior:**
- If user has an active session on another platform, it is auto-stopped with reason `switch`
- If user has reached the daily cap (16h), returns `403` with error `DAILY_CAP_REACHED`
- Session is stored in Redis with a 6-hour TTL (auto-cleanup)

**Errors:**
| Code | Error | Description |
|------|-------|-------------|
| 403 | `DAILY_CAP_REACHED` | User exceeded 16 hours today |
| 404 | `PLATFORM_NOT_FOUND` | Invalid platform_id |
| 401 | `UNAUTHORIZED` | Missing or invalid token |

---

### POST /api/session/heartbeat

Keep a session alive. The client **must** call this every 60 seconds while the user is on the external platform. If no heartbeat is received for 5 minutes, the session is automatically closed by the HeartbeatWatchdog.

**Auth:** Required

**Request:**
```json
{
  "session_id": "sess_a1b2c3d4e5f6"
}
```

**Response:** `200 OK`
```json
{
  "duration_sec": 3660
}
```

| Field | Type | Description |
|-------|------|-------------|
| `duration_sec` | integer | Total seconds elapsed since session start |

**Behavior:**
- If session has exceeded the session cap (6h), it is auto-stopped with reason `cap`
- Updates `lastHeartbeat` timestamp in Redis
- Refreshes session TTL

**Errors:**
| Code | Error | Description |
|------|-------|-------------|
| 404 | `SESSION_NOT_FOUND` | Session expired, already stopped, or wrong session_id |

---

### POST /api/session/stop

Stop an active session. Called when the user returns to Time Vision Media, switches platform, or closes the app.

**Auth:** Required

**Request:**
```json
{
  "session_id": "sess_a1b2c3d4e5f6",
  "reason": "return"
}
```

| Field | Type | Required | Values |
|-------|------|----------|--------|
| `session_id` | string | yes | The active session ID |
| `reason` | string | yes | `return` \| `switch` \| `close` |

**Response:** `200 OK`
```json
{
  "session_id": "sess_a1b2c3d4e5f6",
  "platform_name": "Netflix",
  "duration_seconds": 5420,
  "end_reason": "return"
}
```

**Behavior:**
- Session is persisted to PostgreSQL (`viewing_sessions` table)
- Daily aggregate updated (`daily_traffic` table)
- Redis state cleaned up (active session removed, platform live counter decremented)
- Duration capped at `maxSessionSeconds` (6h) regardless of actual elapsed time

**Internal stop reasons** (not user-callable):
| Reason | Triggered by |
|--------|-------------|
| `timeout` | HeartbeatWatchdog — no heartbeat for 5 minutes |
| `cap` | Heartbeat detected session exceeded 6 hours |

---

### GET /api/session/active

Get the user's currently active session (if any).

**Auth:** Required

**Response:** `200 OK`
```json
{
  "session": {
    "session_id": "sess_a1b2c3d4e5f6",
    "platform_id": 1,
    "platform_name": "Netflix",
    "content_id": "tt1234567",
    "content_title": "Breaking Bad S01E01",
    "started_at": 1708012800,
    "last_heartbeat": 1708016400,
    "duration_sec": 3600
  }
}
```

Returns `{ "session": null }` if no active session.

---

## Settlement

Monthly proportional revenue distribution.

### GET /api/settlement/current

Preview the current month's settlement calculation (not yet finalized).

**Auth:** Required (admin)

**Response:** `200 OK`
```json
{
  "month": "2026-02",
  "active_users": 87420,
  "total_revenue": 4371000.00,
  "hub_costs": 84200.00,
  "hub_reserve": 4210.00,
  "total_pool": 4282590.00,
  "platforms": [
    {
      "platform_id": 1,
      "platform_name": "Netflix",
      "total_seconds": 892800000,
      "percentage": 48.6,
      "settlement_eur": 2081339.74,
      "unique_users": 76200
    },
    {
      "platform_id": 2,
      "platform_name": "Disney+",
      "total_seconds": 407880000,
      "percentage": 22.2,
      "settlement_eur": 950734.98,
      "unique_users": 47400
    }
  ],
  "calculated_at": "2026-02-15T12:00:00Z",
  "status": "preview"
}
```

### GET /api/settlement/history

List past finalized settlements.

**Auth:** Required (admin)

**Query parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | integer | 12 | Number of months to return |

**Response:** `200 OK`
```json
{
  "settlements": [
    {
      "month": "2026-01",
      "active_users": 82100,
      "total_revenue": 4105000.00,
      "hub_costs": 82300.00,
      "total_pool": 4018585.00,
      "status": "paid",
      "published": true
    }
  ]
}
```

### GET /api/settlement/user/:userId

Per-user monthly breakdown — shows where each euro of their subscription went.

**Auth:** Required (user can only access own data)

**Response:** `200 OK`
```json
{
  "month": "2026-01",
  "user_id": 42,
  "subscription_paid": 50.00,
  "hub_cost_share": 0.95,
  "distributed": 49.05,
  "breakdown": [
    { "platform": "Netflix", "seconds": 108000, "percentage": 72.0, "amount_eur": 35.32 },
    { "platform": "MUBI", "seconds": 28800, "percentage": 19.2, "amount_eur": 9.42 },
    { "platform": "Crunchyroll", "seconds": 13200, "percentage": 8.8, "amount_eur": 4.31 }
  ]
}
```

---

## Discovery

Unified content catalog aggregated from partner platforms.

### GET /api/discover/trending

**Auth:** Optional

**Query parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `country` | string | `US` | ISO country code for availability filtering |
| `limit` | integer | 20 | Max results (capped at 50) |

**Response:** `200 OK`
```json
{
  "trending": [
    {
      "id": 1,
      "title": "Dune: Part Two",
      "content_type": "movie",
      "year": 2024,
      "poster_url": "https://image.tmdb.org/...",
      "rating": 8.2,
      "platforms": [
        { "platformId": 1, "platformName": "Netflix", "deepLink": "https://netflix.com/watch/..." },
        { "platformId": 2, "platformName": "Disney+", "deepLink": "https://disneyplus.com/..." }
      ]
    }
  ],
  "country": "US",
  "count": 20
}
```

### GET /api/discover/top

Top 10 content by actual viewing time across all platforms (last 7 days).

**Auth:** Optional

**Query parameters:**
| Param | Type | Default |
|-------|------|---------|
| `country` | string | `US` |

### GET /api/discover/search

**Auth:** Optional

**Query parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `q` | string | yes | Search query (min 2 characters) |
| `country` | string | no | ISO country code (default: `US`) |

---

## Admin / Transparency

Public endpoints for cooperative transparency.

### GET /api/admin/traffic/live

Real-time platform usage statistics.

**Auth:** Required (admin)

**Response:** `200 OK`
```json
{
  "platforms": [
    { "platform_id": 1, "platform_name": "Netflix", "active_users": 12840 },
    { "platform_id": 2, "platform_name": "Disney+", "active_users": 5920 },
    { "platform_id": 3, "platform_name": "MUBI", "active_users": 3100 }
  ],
  "total_active": 21860,
  "timestamp": "2026-02-15T14:30:00Z"
}
```

### GET /api/admin/costs

Current month's operating costs — full transparency.

**Auth:** Public

**Response:** `200 OK`
```json
{
  "month": "2026-02",
  "costs": [
    { "category": "personnel", "description": "Core team (3 FTE)", "amount": 30000.00 },
    { "category": "infrastructure", "description": "Cloud hosting (Hetzner)", "amount": 3000.00 },
    { "category": "payment_processing", "description": "BaaS fees (Swan.io)", "amount": 18500.00 },
    { "category": "legal", "description": "Legal counsel + audit prep", "amount": 8000.00 },
    { "category": "marketing", "description": "Community + PR", "amount": 25000.00 }
  ],
  "total": 84500.00,
  "reserve_5pct": 4225.00,
  "hub_total": 88725.00
}
```

---

## WebSocket — /ws/traffic

Real-time countdown protocol over WebSocket.

**Connection:** `ws://localhost:3000/ws/traffic`

### Client → Server messages

**Start session:**
```json
{ "type": "start", "platformId": 1, "contentId": "tt1234567" }
```

**Heartbeat pulse:**
```json
{ "type": "pulse", "sessionId": "sess_a1b2c3d4e5f6" }
```

**Stop session:**
```json
{ "type": "stop", "sessionId": "sess_a1b2c3d4e5f6", "reason": "return" }
```

**Request status:**
```json
{ "type": "status" }
```

### Server → Client messages

**Session started:**
```json
{ "type": "started", "sessionId": "sess_a1b2c3d4e5f6", "startedAt": 1708012800, "redirectUrl": "https://netflix.com/watch/..." }
```

**Heartbeat acknowledged:**
```json
{ "type": "pulse_ack", "durationSec": 3660 }
```

**Session stopped:**
```json
{ "type": "stopped", "sessionId": "sess_a1b2c3d4e5f6", "durationSeconds": 5420, "reason": "return" }
```

**Error:**
```json
{ "type": "error", "message": "DAILY_CAP_REACHED" }
```

---

## Authentication

### POST /api/auth/register

**Auth:** Public

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "display_name": "John Doe"
}
```

**Response:** `201 Created`
```json
{
  "user": { "id": 1, "email": "user@example.com", "display_name": "John Doe" },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

### POST /api/auth/login

**Auth:** Public

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response:** `200 OK`
```json
{
  "user": { "id": 1, "email": "user@example.com", "display_name": "John Doe" },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

### GET /api/auth/me

**Auth:** Required

**Response:** `200 OK`
```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "display_name": "John Doe",
    "subscription_status": "active",
    "membership_shares": 10,
    "membership_since": "2026-01-15"
  }
}
```

---

## Error Format

All errors follow a consistent format:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable description",
  "status": 400
}
```

## Rate Limiting

| Endpoint group | Limit |
|---------------|-------|
| Auth (register/login) | 10 req/min per IP |
| Session (start/stop) | 30 req/min per user |
| Heartbeat | 2 req/min per session |
| Discovery | 60 req/min per user |
| Admin | 20 req/min per user |
