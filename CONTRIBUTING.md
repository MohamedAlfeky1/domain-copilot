# Contributing to Domain Copilot

## Code & Architecture Standards
1. **Clean Architecture Purity**: Domain entities in `src/core/domain` must NEVER import external frameworks or AI SDKs. Run `npm run lint:arch` before committing.
2. **Conventional Commits**: Use atomic commits formatted as `feat(scope): ...`, `fix(scope): ...`, `test(scope): ...`, or `docs(scope): ...`.
3. **Branch Protection & PRs**: All code changes must merge through Pull Requests with What, Why, and How-Tested descriptions.
4. **Secret Scanning**: Do not commit API keys or database passwords. Run gitleaks or pre-commit checks.
