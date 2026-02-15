# TimeVision Media — Financial Model

*"Time, made visible."*

## Core Formula

```
User pays:         U = 50€/month
Hub retains:       H = Real Costs + 5% Reserve
Pool distributed:  P = (U × N) - H

Platform i receives:
  P_i = P × (time_on_platform_i / total_time_all_platforms)
```

## Revenue Distribution Example (100,000 users)

```
Total Revenue:    5,000,000€/month
Hub Costs:           91,000€ (1.82%)
Hub Reserve:          4,550€ (0.09%)
─────────────────────────────────────
Pool:             4,904,450€ (98.09%)

Distribution (hypothetical):
  Netflix      48.6%  →  2,383,563€  (87,420 users)
  Disney+      22.2%  →  1,088,788€  (54,200 users)
  MUBI         11.8%  →    578,725€  (34,200 users)
  Crunchyroll   7.6%  →    372,738€  (22,100 users)
  Curiosity     5.6%  →    274,649€  (18,400 users)
  Others        4.2%  →    205,987€  (12,300 users)
```

## Cost Breakdown (Lean Model)

### At 100,000 users

| Category | Monthly Cost | % of Revenue |
|----------|-------------|-------------|
| Personnel (3 core + contractors) | 30,000€ | 0.60% |
| Cloud infrastructure | 3,000€ | 0.06% |
| BaaS payment processing (0.4%) | 20,000€ | 0.40% |
| Legal + audit | 8,000€ | 0.16% |
| Marketing | 30,000€ | 0.60% |
| **Total** | **91,000€** | **1.82%** |

### Hub retains under 2% of total revenue.

## Break-Even Analysis

```
Fixed monthly costs (no marketing):  ~61,000€
Variable cost per user (BaaS):       ~0.20€

Break-even users = 61,000 / (fee_per_user - 0.20)

At 100k users, fee_per_user = 91,000/100,000 = 0.91€
Break-even ≈ 12,000-15,000 users
```

## Scaling Economics

| Users | Revenue | Hub Cost | Hub % | Pool |
|-------|---------|----------|-------|------|
| 15,000 | 750,000€ | 68,000€ | 9.1% | 682,000€ |
| 50,000 | 2,500,000€ | 80,000€ | 3.2% | 2,420,000€ |
| 100,000 | 5,000,000€ | 91,000€ | 1.8% | 4,909,000€ |
| 250,000 | 12,500,000€ | 140,000€ | 1.1% | 12,360,000€ |
| 500,000 | 25,000,000€ | 200,000€ | 0.8% | 24,800,000€ |
| 1,000,000 | 50,000,000€ | 350,000€ | 0.7% | 49,650,000€ |

**As the platform scales, the hub percentage approaches zero.**

## Platform Value Proposition

A user spending 90% of their time on Netflix through TimeVision:

```
Pool per user:  49.05€
Netflix share:  49.05€ × 90% = 44.15€

Netflix standard subscription: 15.99€
Netflix via TimeVision:        44.15€

Increase: +176% per user
```

This is the key selling point for platforms: **they earn significantly more per active user than through direct subscriptions.**

## Cooperative Equity Model

```
Total Shares: 10,000,000

Founding Platforms:     35%  (3,500,000)
  - Allocated by: users brought + consumption generated + early participation
  - Vesting: 2 years

User Members:           30%  (3,000,000)
  - Earned through: 6-month continuous subscription
  - Dividend rights: annual surplus distribution

Operating Team:         15%  (1,500,000)
  - Vesting: 4 years
  - Cliff: 1 year

Development Reserve:    20%  (2,000,000)
  - For future investment rounds
  - For new platform partnerships
  - Lock-up: 24 months
```

## Customer Acquisition

| Segment | CAC | LTV (18mo) | LTV:CAC | Payback |
|---------|-----|------------|---------|---------|
| Referral | 10€ | 38€ | 3.8:1 | 4 months |
| Corporate | 5€ | 30€ | 6.0:1 | 2 months |
| Organic/PR | ~0€ | 35€ | ∞ | Immediate |
| Paid ads | 35€ | 33€ | 0.9:1 | 14 months |
| **Blended** | **~20€** | **~35€** | **1.75:1** | **~7 months** |

## MVP Investment

```
Development (3 months, 3 core team):     90,000€
Subcontractors (mobile, UI/UX, audit):   45,000€
Legal + SCE formation:                    30,000€
Infrastructure (3 months):                 3,000€
BaaS setup:                                5,000€
Pre-launch marketing:                     15,000€
─────────────────────────────────────────────────
Total MVP:                              ~188,000€
```

## Risk Analysis

| Risk | Impact | Mitigation |
|------|--------|------------|
| Platforms refuse to participate | Critical | Start with medium platforms that need distribution |
| Low user adoption | High | Corporate B2B channel reduces dependency on B2C |
| Payment processing issues | Medium | Multiple BaaS providers, fallback options |
| Fraud/gaming | Medium | Anti-fraud engine with daily/session caps |
| Legal challenges | Medium | SCE structure, EU Digital Markets Act alignment |
| Competitor emerges | Low | Open-source + cooperative model = defensible |
