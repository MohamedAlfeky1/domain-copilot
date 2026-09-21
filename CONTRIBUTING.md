# Contributing to Domain Copilot

Thank you for contributing to Domain Copilot.

## Development Workflow

1. Create a focused feature or fix branch from `pr-develop`.
2. Make small, atomic changes related to a single purpose.
3. Run the relevant tests and verification commands locally.
4. Open a Pull Request targeting `pr-develop`.
5. PRs should include:
   - What changed
   - Why it changed
   - How it was tested
6. After the integration work is verified, `pr-develop` is promoted to `main` through a separate Pull Request.
7. Direct pushes to `main` are not allowed.

## Code & Architecture Standards

### Clean Architecture

Domain entities and application business rules under `src/core/` must not depend directly on:

- Next.js or React
- AI provider SDKs
- Database/vector-store SDKs
- Other infrastructure-specific implementations

Run:

```bash
npm run lint:arch
```

before opening a Pull Request.

### Conventional Commits

Use atomic commits following Conventional Commits, for example:

```text
feat(scope): add ...
fix(scope): fix ...
test(scope): add ...
docs(scope): update ...
refactor(scope): change ...
```

Keep commits focused and avoid unrelated changes.

## Testing

Run the relevant project checks before opening a Pull Request.

Common verification commands include:

```bash
npm run lint:arch
npm run test:unit
npm run test:auth
npm run test:security
npm run test:retrieval
npm run test:hitl
npm run test:corpus
```

For Docker changes, also verify:

```bash
docker compose config --quiet
docker compose build
docker compose up -d
```

Then confirm:

```text
http://localhost:3000/healthz
http://localhost:3000/readyz
```

are healthy.

## Pull Requests

Every Pull Request should clearly document:

### What
What was changed?

### Why
Why was the change needed?

### How Tested
Which automated tests, runtime checks, or manual verification were performed?

Keep the PR focused and avoid mixing unrelated changes.

## Security & Secrets

Never commit:

- API keys
- passwords
- private credentials
- production secrets
- local `.env` files containing real credentials

Use `.env.example` for documented configuration.

Run the repository's configured security and secret-scanning checks before submission.

## Repository Hygiene

Do not commit:

- generated runtime state
- local caches
- temporary debug files
- IDE-specific files
- machine-specific configuration

Local runtime state, such as database state files, should remain uncommitted when intentionally excluded from version control.

## Branch Protection

`main` is protected.

All production-bound changes must go through Pull Requests and required CI/review checks.

Do not force-push or bypass branch protection.
