-- ============================================================
-- TimeVision — Initial Database Schema
-- ============================================================
-- This is the complete database schema for the TimeVision
-- cooperative subscription infrastructure.
--
-- Core tables:
--   users            — Registered members
--   platforms         — Partner streaming platforms
--   viewing_sessions  — Raw countdown sessions (time tracking)
--   daily_traffic     — Daily aggregates per user per platform
--   monthly_*         — Settlement tables
--   hub_costs         — Transparent operating costs
-- ============================================================

BEGIN;

-- ═══════════════════════════════════════════
-- USERS
-- ═══════════════════════════════════════════
CREATE TABLE users (
    id                  SERIAL PRIMARY KEY,
    email               VARCHAR(255) NOT NULL UNIQUE,
    password_hash       VARCHAR(255) NOT NULL,
    display_name        VARCHAR(100),

    -- Subscription
    subscription_status VARCHAR(20) DEFAULT 'inactive',  -- inactive | active | paused | cancelled
    subscription_plan   VARCHAR(20) DEFAULT 'monthly',   -- monthly | annual
    subscription_start  DATE,
    subscription_end    DATE,
    contract_months     INT DEFAULT 6,

    -- Membership (cooperative)
    membership_shares   INT DEFAULT 0,
    membership_since    DATE,

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_subscription ON users (subscription_status);

-- ═══════════════════════════════════════════
-- PLATFORMS (Partner streaming services)
-- ═══════════════════════════════════════════
CREATE TABLE platforms (
    id                  SERIAL PRIMARY KEY,
    name                VARCHAR(100) NOT NULL UNIQUE,
    slug                VARCHAR(50) NOT NULL UNIQUE,
    description         TEXT,
    logo_url            VARCHAR(500),

    -- Integration
    base_url            VARCHAR(500) NOT NULL,           -- https://netflix.com
    deep_link_template  VARCHAR(500),                    -- https://netflix.com/watch/{content_id}
    catalog_feed_url    VARCHAR(500),                    -- API endpoint for catalog sync

    -- Status
    active              BOOLEAN DEFAULT true,
    founder             BOOLEAN DEFAULT false,            -- Is founding platform (has equity)
    min_users           INT DEFAULT 100000,               -- Minimum users requirement met

    -- Equity (cooperative)
    equity_shares       INT DEFAULT 0,
    equity_percentage   DECIMAL(5,2) DEFAULT 0,

    -- Financial
    payment_account_id  VARCHAR(255),                     -- BaaS account for settlement
    total_earned_eur    DECIMAL(14,2) DEFAULT 0,

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════
-- CONTENT CATALOG (aggregated from TMDB + partners)
-- ═══════════════════════════════════════════
CREATE TABLE content (
    id                  SERIAL PRIMARY KEY,
    tmdb_id             VARCHAR(20),                      -- TMDB external ID
    title               VARCHAR(500) NOT NULL,
    original_title      VARCHAR(500),
    content_type        VARCHAR(20) NOT NULL,              -- movie | series | documentary
    year                INT,
    poster_url          VARCHAR(500),
    backdrop_url        VARCHAR(500),
    overview            TEXT,
    genres              TEXT[],                            -- Array of genres
    rating              DECIMAL(3,1),
    popularity          DECIMAL(10,2),

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_content_tmdb ON content (tmdb_id);
CREATE INDEX idx_content_type ON content (content_type);
CREATE INDEX idx_content_popularity ON content (popularity DESC);

-- ═══════════════════════════════════════════
-- CONTENT AVAILABILITY (what's on which platform)
-- ═══════════════════════════════════════════
CREATE TABLE content_availability (
    id                  SERIAL PRIMARY KEY,
    content_id          INT NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    platform_id         INT NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    country_code        VARCHAR(2) NOT NULL,               -- ISO country code
    available_since     DATE,
    available_until     DATE,                               -- NULL = indefinite
    deep_link           VARCHAR(500),                       -- Direct link to content on platform

    UNIQUE(content_id, platform_id, country_code)
);

CREATE INDEX idx_availability_platform ON content_availability (platform_id);
CREATE INDEX idx_availability_country ON content_availability (country_code);

-- ═══════════════════════════════════════════
-- VIEWING SESSIONS (countdown tracking — CORE)
-- ═══════════════════════════════════════════
CREATE TABLE viewing_sessions (
    id                  BIGSERIAL PRIMARY KEY,
    session_uid         VARCHAR(20) NOT NULL UNIQUE,
    user_id             INT NOT NULL REFERENCES users(id),
    platform_id         INT NOT NULL REFERENCES platforms(id),
    content_id          VARCHAR(255),                      -- External content ID

    started_at          TIMESTAMPTZ NOT NULL,
    ended_at            TIMESTAMPTZ,
    last_heartbeat      TIMESTAMPTZ,

    duration_sec        INT DEFAULT 0,
    end_reason          VARCHAR(10),                       -- return | switch | timeout | close | cap
    is_valid            BOOLEAN DEFAULT TRUE,              -- FALSE if anomaly detected

    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_month ON viewing_sessions (user_id, started_at);
CREATE INDEX idx_sessions_platform_month ON viewing_sessions (platform_id, started_at);
CREATE INDEX idx_sessions_valid ON viewing_sessions (is_valid, started_at);

-- ═══════════════════════════════════════════
-- DAILY TRAFFIC AGGREGATES
-- ═══════════════════════════════════════════
CREATE TABLE daily_traffic (
    id                  BIGSERIAL PRIMARY KEY,
    date                DATE NOT NULL,
    user_id             INT NOT NULL REFERENCES users(id),
    platform_id         INT NOT NULL REFERENCES platforms(id),

    total_seconds       INT NOT NULL DEFAULT 0,
    session_count       INT NOT NULL DEFAULT 0,

    UNIQUE(date, user_id, platform_id)
);

CREATE INDEX idx_daily_date ON daily_traffic (date);
CREATE INDEX idx_daily_platform_date ON daily_traffic (platform_id, date);
CREATE INDEX idx_daily_user_date ON daily_traffic (user_id, date);

-- ═══════════════════════════════════════════
-- MONTHLY PLATFORM SETTLEMENT
-- ═══════════════════════════════════════════
CREATE TABLE monthly_platform_traffic (
    id                  BIGSERIAL PRIMARY KEY,
    month               DATE NOT NULL,
    platform_id         INT NOT NULL REFERENCES platforms(id),

    total_seconds       BIGINT NOT NULL,
    total_sessions      INT NOT NULL,
    unique_users        INT NOT NULL,

    pct_of_total        DECIMAL(6,3),
    settlement_eur      DECIMAL(12,2),

    calculated_at       TIMESTAMPTZ,
    status              VARCHAR(10) DEFAULT 'pending',     -- pending | confirmed | paid

    UNIQUE(month, platform_id)
);

-- ═══════════════════════════════════════════
-- MONTHLY USER BREAKDOWN (transparency)
-- ═══════════════════════════════════════════
CREATE TABLE monthly_user_traffic (
    id                  BIGSERIAL PRIMARY KEY,
    month               DATE NOT NULL,
    user_id             INT NOT NULL REFERENCES users(id),
    platform_id         INT NOT NULL REFERENCES platforms(id),

    total_seconds       BIGINT NOT NULL,
    pct_of_user         DECIMAL(5,2),
    amount_eur          DECIMAL(10,2),

    UNIQUE(month, user_id, platform_id)
);

-- ═══════════════════════════════════════════
-- SETTLEMENT SUMMARY (per month)
-- ═══════════════════════════════════════════
CREATE TABLE settlement_summary (
    id                  SERIAL PRIMARY KEY,
    month               DATE NOT NULL UNIQUE,

    active_users        INT NOT NULL,
    total_revenue       DECIMAL(14,2) NOT NULL,
    hub_costs           DECIMAL(12,2) NOT NULL,
    hub_reserve         DECIMAL(12,2) NOT NULL,
    total_pool          DECIMAL(14,2) NOT NULL,
    total_hours         DECIMAL(12,2) NOT NULL,

    calculated_at       TIMESTAMPTZ,
    published           BOOLEAN DEFAULT FALSE              -- Public transparency
);

-- ═══════════════════════════════════════════
-- HUB OPERATING COSTS (full transparency)
-- ═══════════════════════════════════════════
CREATE TABLE hub_costs (
    id                  SERIAL PRIMARY KEY,
    month               DATE NOT NULL,
    category            VARCHAR(50) NOT NULL,               -- infrastructure | personnel | legal | payment_processing | marketing
    description         VARCHAR(255),
    amount              DECIMAL(12,2) NOT NULL,
    receipt_url         VARCHAR(500),                       -- Link to receipt/invoice (audit)

    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_costs_month ON hub_costs (month);

-- ═══════════════════════════════════════════
-- TRAFFIC ANOMALIES (fraud detection)
-- ═══════════════════════════════════════════
CREATE TABLE traffic_anomalies (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             INT NOT NULL REFERENCES users(id),
    date                DATE NOT NULL,
    anomaly_type        VARCHAR(30) NOT NULL,               -- daily_cap | session_cap | volume | pattern
    details             JSONB,
    action_taken        VARCHAR(20) DEFAULT 'flagged',      -- flagged | excluded | reviewed

    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_anomalies_user ON traffic_anomalies (user_id);
CREATE INDEX idx_anomalies_date ON traffic_anomalies (date);

-- ═══════════════════════════════════════════
-- EQUITY LEDGER (cooperative shares tracking)
-- ═══════════════════════════════════════════
CREATE TABLE equity_ledger (
    id                  SERIAL PRIMARY KEY,
    holder_type         VARCHAR(10) NOT NULL,               -- platform | user | team | reserve
    holder_id           INT,                                -- References platforms.id or users.id
    shares              INT NOT NULL,
    reason              VARCHAR(100),                       -- founding | membership | vesting | contribution
    granted_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_equity_holder ON equity_ledger (holder_type, holder_id);

COMMIT;
