# STYRKA: instructions for Codex

Purpose: maintain the mobile-first training app with correct training rules, safe data handling, accessible UX, and proportionate development effort.

## Scope and context
- Start with the requested change and `git status --short`. Inspect the affected implementation and nearby tests first.
- Read `README.md`, `spec/`, and `docs/` selectively when relevant. Do not routinely scan all specifications, historic delivery reports, or `docs/evidence/` screenshots.
- Make the smallest coherent change. Avoid unrelated refactors, new documentation, and screenshot generation unless required for the task.
- Preserve existing work in the working tree. If a task is complete, stop instead of expanding verification or redesigning adjacent features.

## Risk-based verification
- Documentation-only edits: check the changed content; no build, Docker, database, or browser suite.
- Copy and small CSS adjustments: use focused checks appropriate to the change. Run TypeScript checks when TS/TSX changes. Check accessibility when layout, focus, contrast, or semantics may be affected.
- UI interaction and workout flow: run typecheck, affected UI tests, and focused Playwright scenarios. Start with one relevant browser project; broaden to other devices when behavior warrants it.
- Training domain, planning, progression, recovery, and load calculations: run focused unit tests and `npm run test:reference` where reference compatibility is implicated.
- Authentication, offline state, synchronization, persistence, RLS, or database schema: run affected unit, database, and end-to-end checks; start local Supabase only when needed.
- Cross-cutting or high-risk changes: broaden validation appropriately. Never omit safety, data integrity, accessibility, or regression checks needed to establish correctness.
- On a failing test, diagnose and rerun that specific test first. Do not repeatedly rerun the entire Playwright or database suite to chase a localized failure. Compare failures with the baseline when possible.
- The full GitHub CI remains the required integration gate for merge and release. Do not disable checks or lower test expectations to save time.

## Boundaries
- Do not deploy, approve release gate G5, use real user data, expose secrets, or modify production resources without explicit authorization.
- Keep the existing reference engine, security boundaries, migrations, and release gates intact unless the requested feature requires a deliberate, verified change.

## Report
- Respond in Swedish. Briefly state the changes, checks performed, checks not performed and why, and any remaining risks or CI failures.
