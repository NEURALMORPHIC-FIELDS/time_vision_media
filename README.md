<p align="center">
  <img src="docs/assets/timevision-logo.svg" alt="TimeVision" width="200"/>
</p>

<h1 align="center">TimeVision</h1>

<p align="center">
  <strong>Universal Streaming Hub — Cooperative Subscription Infrastructure</strong>
</p>

<p align="center">
  <a href="#architecture">Architecture</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#api-reference">API Reference</a> •
  <a href="#financial-model">Financial Model</a> •
  <a href="#contributing">Contributing</a> •
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License"/>
  <img src="https://img.shields.io/badge/status-MVP%20Development-orange.svg" alt="Status"/>
  <img src="https://img.shields.io/badge/node-%3E%3D20.0.0-green.svg" alt="Node"/>
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome"/>
</p>

---

## What is TimeVision?

TimeVision is an **open-source cooperative subscription infrastructure** that unifies access to multiple streaming platforms through a single premium subscription.

**TimeVision does NOT stream content.** It is a frontend-only universal interface where every click redirects to the original streaming platform. It functions as a digital marketplace — you pay at the entrance, each platform runs its own business inside.

### Core Principles

| Principle | Description |
|-----------|-------------|
| **No Streaming** | Zero content hosting. Zero CDN. Zero DRM. Platforms stream their own content |
| **No Competition** | Never produces original content. Never promotes its own material |
| **Full Transparency** | Real operating costs published monthly. Audited annually |
| **Cooperative Model** | Founding platforms receive equity. Users become members |
| **Time-Based Settlement** | Revenue distributed proportionally to actual viewing time |
| **Neutrality** | Rankings based purely on aggregated metrics. No algorithmic favoritism |

### How It Works

```
┌──────────────────────────────────────────────────────┐
│  USER pays 50€/month → single subscription           │
│                                                      │
│  Opens TimeVision → sees unified catalog              │
│  Trending, Top 10, Search across ALL platforms        │
│                                                      │
│  Clicks "Watch" → REDIRECTED to Netflix/MUBI/etc.    │
│  Streaming happens 100% on their platform             │
│                                                      │
│  TimeVision tracks TIME via countdown API             │
│  No data from platforms needed                        │
│                                                      │
│  End of month → automatic proportional settlement     │
│  Netflix 70% time = 70% of pool                       │
│  Hub retains only: real costs + 5%                    │
└──────────────────────────────────────────────────────┘
```

### The Problem We Solve

- Users pay 60-120€/month across 4-6 separate subscriptions
- 80% of time spent on 1-2 platforms, but paying full price for all
- Mental fatigue from managing multiple accounts, apps, billing
- Content discovery fragmented — no unified view of what's available

### The Solution

- **One subscription** (50€/month) → access to all partner platforms
- **Time-based distribution** → platforms earn proportionally to actual usage
- **Premium segment** → targets users who value convenience over cost
- **Cooperative structure** → platforms are co-owners, not competitors

---

## Architecture

TimeVision is a **frontend-only interface** with a lightweight backend for:
- User authentication
- Payment processing (BaaS)
- Time tracking (countdown API)
- Monthly settlement calculation

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Client    │────▶│  TimeVision API   │────▶│  PostgreSQL     │
│  (Web/App)  │◀────│  (Node.js)       │     │  + Redis        │
└──────┬──────┘     └────────┬─────────┘     └─────────────────┘
       │                     │
       │ WebSocket           │ BaaS API
       │ (countdown)         │ (Swan/Mangopay)
       │                     │
       ▼                     ▼
  ┌──────────┐        ┌──────────────┐
  │ Redirect │        │  Settlement  │
  │ Engine   │        │  Engine      │
  └──────────┘        └──────────────┘
       │
       ▼
  Netflix / MUBI / Disney+ / Crunchyroll / ...
  (streaming happens entirely on their infrastructure)
```

### Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Backend** | Node.js + TypeScript | API server |
| **Database** | PostgreSQL | Persistent storage |
| **Cache/State** | Redis | Active sessions, live counters |
| **Real-time** | WebSocket | Countdown heartbeat |
| **Frontend** | Next.js + React | Web application |
| **Mobile** | React Native | iOS + Android |
| **Payments** | Swan.io / Mangopay | BaaS processing |
| **Auth** | Keycloak / custom | OAuth 2.0 federation |
| **Hosting** | Hetzner Cloud | EU-based, GDPR compliant |
| **CI/CD** | GitHub Actions | Automated pipelines |

> Full architecture documentation: [docs/architecture/](docs/architecture/)

---

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- PostgreSQL >= 15
- Redis >= 7
- Docker + Docker Compose (recommended)

### Quick Start with Docker

```bash
# Clone the repository
git clone https://github.com/NEURALMORPHIC-FIELDS/time_vision_media.git
cd timevision

# Copy environment config
cp .env.example .env

# Start all services
docker compose up -d

# Run database migrations
npm run db:migrate

# Seed with sample data
npm run db:seed

# Start development server
npm run dev
```

The application will be available at `http://localhost:3000`

### Manual Setup

```bash
# Install dependencies
npm install

# Setup PostgreSQL
createdb timevision
npm run db:migrate
npm run db:seed

# Start Redis
redis-server

# Start development
npm run dev
```

### Environment Variables

```env
# Application
NODE_ENV=development
PORT=3000
API_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/timevision

# Redis
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-secret-key
SESSION_SECRET=your-session-secret

# BaaS (Payment Processing)
BAAS_PROVIDER=swan
BAAS_API_KEY=your-api-key
BAAS_WEBHOOK_SECRET=your-webhook-secret

# External APIs
TMDB_API_KEY=your-tmdb-api-key

# Settlement
SETTLEMENT_DAY=1
HUB_COST_MARGIN=0.05
```

---

## Traffic Monitoring — The Core Engine

TimeVision's settlement is based on **real time tracking** via a countdown API. When a user clicks to access a platform, a timer starts. The timer runs until the user returns, switches platforms, or becomes inactive.

### Countdown Flow

```
User clicks "Watch on Netflix"
  → POST /api/session/start { platform_id, content_id }
  → Timer starts (server-side + client heartbeat)
  → User is redirected to Netflix

Every 60 seconds:
  → POST /api/session/heartbeat { session_id }
  → Server confirms session is alive

User returns to TimeVision:
  → POST /api/session/stop { session_id, reason: "return" }
  → Duration calculated and stored
  → Settlement pool updated in real-time
```

### Anti-Fraud Protection

| Rule | Limit | Action |
|------|-------|--------|
| Daily cap | 16 hours/day | Sessions beyond cap are excluded |
| Session cap | 6 hours continuous | Auto-stop after 6h without new heartbeat cycle |
| Heartbeat timeout | 5 minutes | No heartbeat = session closed |
| Anomaly detection | 3x median | Flagged for review |
| Monthly volume | Statistical outlier | Excluded from settlement |

> Full API documentation: [docs/api/](docs/api/)

---

## Financial Model

### Revenue Distribution

```
User pays:              50.00€/month
Hub retains:            ~0.95€ (real costs + 5% reserve)
Distributed to platforms: ~49.05€

Distribution formula:
  P_i = pool × (time_on_platform_i / total_time_all_platforms)
```

### Break-Even Analysis

| Users | Monthly Revenue | Hub Costs | Pool Distributed | Margin |
|-------|----------------|-----------|-----------------|--------|
| 15,000 | 750,000€ | ~91,000€ | ~659,000€ | Break-even |
| 100,000 | 5,000,000€ | ~149,000€ | ~4,851,000€ | Sustainable |
| 250,000 | 12,500,000€ | ~300,000€ | ~12,200,000€ | Strong |
| 1,000,000 | 50,000,000€ | ~800,000€ | ~49,200,000€ | Infrastructure |

### Cooperative Equity Structure

```
Total Shares: 10,000,000 (fixed supply)

Founding Platforms:  35%  (3,500,000 shares)
User Members:        30%  (3,000,000 shares)
Operating Team:      15%  (1,500,000 shares)
Development Reserve: 20%  (2,000,000 shares)
```

> Full financial documentation: [docs/financial/](docs/financial/)

---

## Cooperative Governance

### Statutory Rules (embedded in SCE charter)

1. The cooperative **NEVER** produces original content
2. The cooperative **NEVER** promotes selectively — rankings are pure metrics
3. Operating costs are published **monthly** — external audit **annually**
4. Maximum margin: **real costs + 5%** — no exceptions
5. Surplus distributed **proportionally** to participation
6. No single member may hold **>20%** of voting rights
7. New platforms accepted only with **>100,000 active users**
8. Geo-routing **respects existing territorial rights**

### Legal Structure

- **Entity**: SCE (Societas Cooperativa Europaea)
- **Jurisdiction**: Luxembourg / Netherlands
- **Financial License**: BaaS partnership or EMI license
- **Compliance**: GDPR, AML/KYC (via BaaS provider), PSD2

> Full legal documentation: [docs/legal/](docs/legal/)

---

## API Reference

### Session Management (Countdown)

```
POST   /api/session/start          Start viewing timer
POST   /api/session/heartbeat      Keep session alive (every 60s)
POST   /api/session/stop           Stop viewing timer
GET    /api/session/active         Get current active session
```

### User

```
POST   /api/auth/register          Create account
POST   /api/auth/login             Authenticate
GET    /api/user/profile           Get profile
GET    /api/user/consumption       Get monthly consumption breakdown
GET    /api/user/settlement        Get settlement history
```

### Discovery

```
GET    /api/discover/trending      Global trending content
GET    /api/discover/top           Top 10 cross-platform
GET    /api/discover/search        Unified search
GET    /api/discover/platform/:id  Platform catalog
```

### Settlement

```
GET    /api/settlement/current     Current month estimate
GET    /api/settlement/history     Historical settlements
GET    /api/settlement/platform    Platform-specific earnings
```

### Admin / Transparency

```
GET    /api/admin/traffic/live     Real-time traffic monitor
GET    /api/admin/costs            Current month costs breakdown
GET    /api/admin/audit            Public audit data
```

> Full API specification: [docs/api/openapi.yaml](docs/api/openapi.yaml)

---

## Project Structure

```
timevision/
├── src/
│   ├── api/                    # REST API routes
│   │   ├── auth.routes.ts
│   │   ├── session.routes.ts
│   │   ├── discover.routes.ts
│   │   ├── settlement.routes.ts
│   │   └── admin.routes.ts
│   ├── core/                   # Business logic
│   │   ├── SessionManager.ts   # Countdown engine
│   │   ├── SettlementEngine.ts # Monthly calculation
│   │   ├── DiscoveryEngine.ts  # Catalog aggregation
│   │   └── AnomalyDetector.ts  # Fraud prevention
│   ├── services/               # External integrations
│   │   ├── redis.service.ts    # Cache + real-time state
│   │   ├── payment.service.ts  # BaaS integration
│   │   ├── tmdb.service.ts     # Movie/TV metadata
│   │   └── platform.service.ts # Partner platform APIs
│   ├── models/                 # Database models
│   │   ├── User.ts
│   │   ├── Platform.ts
│   │   ├── ViewingSession.ts
│   │   ├── Settlement.ts
│   │   └── Anomaly.ts
│   ├── websocket/              # Real-time communication
│   │   ├── server.ts
│   │   └── handlers.ts
│   ├── middleware/              # Express middleware
│   │   ├── auth.ts
│   │   ├── rateLimit.ts
│   │   └── validation.ts
│   ├── config/                 # Configuration
│   │   ├── database.ts
│   │   ├── redis.ts
│   │   └── app.ts
│   ├── utils/                  # Utilities
│   │   ├── time.ts
│   │   └── crypto.ts
│   └── frontend/               # Next.js frontend
│       ├── components/
│       ├── pages/
│       ├── hooks/
│       └── styles/
├── database/
│   ├── migrations/             # SQL migrations
│   └── seeds/                  # Sample data
├── docs/
│   ├── architecture/           # System design docs
│   ├── financial/              # Financial model
│   ├── legal/                  # Legal framework
│   └── api/                    # API specification
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── scripts/                    # Utility scripts
├── .github/workflows/          # CI/CD
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json
├── .env.example
├── LICENSE                     # Apache 2.0
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
└── README.md
```

---

## Contributing

We welcome contributions from everyone. TimeVision is a community-driven project.

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### How to Contribute

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/my-feature`)
3. **Commit** your changes
4. **Push** to your branch
5. **Open** a Pull Request

### Areas Where We Need Help

- Frontend UI/UX development
- Mobile app development (React Native)
- Security auditing
- Legal framework review (EU cooperative law)
- Financial model validation
- Platform partnership outreach
- Translation / internationalization

---

## License

This project is licensed under the **Apache License 2.0** — see the [LICENSE](LICENSE) file for details.

**Attribution Requirement**: If you use this project, its architecture, financial model, or any derivative work, you must provide clear attribution to the original repository:

```
Based on TimeVision — Universal Streaming Hub
https://github.com/NEURALMORPHIC-FIELDS/time_vision_media
Original concept and architecture by the TimeVision community
```

---

## Acknowledgments

This project was born from a simple frustration: paying for too many subscriptions, being bombarded by ads, and dealing with fragmented content discovery. The idea is that **your time should decide where your money goes** — not algorithms, not exclusive deals, not artificial barriers.

TimeVision is not a company. It's an infrastructure proposal. A cooperative model that puts users and platforms on equal footing.

**If you believe the internet should work differently, contribute.**

---

<p align="center">
  <strong>Time Vision — Your time decides where your money goes.</strong>
</p>
