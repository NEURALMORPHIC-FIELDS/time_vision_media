# Contributing to Time Vision Media

Thank you for your interest in contributing to Time Vision Media. This project is open-source and community-driven.

## How to Contribute

### 1. Fork and Clone

```bash
git clone https://github.com/YOUR_USERNAME/time_vision_media.git
cd time_vision_media
```

### 2. Setup Development Environment

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:migrate
npm run dev
```

### 3. Create a Branch

```bash
git checkout -b feature/your-feature-name
```

### 4. Make Changes

- Write clean, typed TypeScript
- Follow existing code patterns
- Add tests for new functionality
- Keep changes focused and minimal

### 5. Test

```bash
npm test
npm run lint
```

### 6. Submit a Pull Request

- Clear title describing the change
- Reference any related issues
- Describe what and why (not just how)

## Areas Where We Need Help

| Area | Description | Skill Level |
|------|-------------|-------------|
| **Frontend** | Next.js UI/UX for user dashboard | Intermediate |
| **Mobile** | React Native app (iOS + Android) | Intermediate |
| **Security** | Audit auth, session management, data handling | Advanced |
| **Legal** | EU cooperative law review, SCE formation | Specialist |
| **Financial** | Model validation, settlement auditing | Intermediate |
| **Platform Partnerships** | Outreach, negotiation frameworks | Business |
| **i18n** | Translation to other languages | Beginner |
| **Documentation** | Improve docs, tutorials, guides | Beginner |
| **Testing** | Unit, integration, and E2E tests | Intermediate |

## Code Style

- TypeScript strict mode
- No `any` types unless absolutely necessary
- Prefer `const` over `let`
- Use descriptive variable names
- Keep functions focused (single responsibility)
- Comment the "why", not the "what"

## Commit Messages

Use clear, descriptive commit messages:

```
feat: add settlement preview endpoint
fix: correct heartbeat timeout calculation
docs: update API reference for session routes
test: add unit tests for AnomalyDetector
```

## Architecture Principles

When contributing, keep these principles in mind:

1. **Time Vision Media does NOT stream content** — it only redirects
2. **Zero dependency on platforms** — tracking is 100% client-side countdown
3. **Transparency first** — all costs must be auditable
4. **Neutrality** — no algorithmic favoritism
5. **Simplicity** — the platform is a frontend + lightweight backend

## Questions?

Open a GitHub Issue with the `question` label.

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.
