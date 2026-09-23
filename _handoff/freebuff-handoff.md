# FREEBUFF SESSION HANDOFF — HOUSE HUNTER SECURITY HARDENING

## Project Stack (VERIFIED)
- Frontend: React Native + Expo SDK 57, React 19, TypeScript
- Backend: Firebase Cloud Functions (Node.js) in functions/
- Database: Firestore
- Storage: Firebase Storage
- Auth: Firebase Auth (assumed — verify)
- Error tracking: Sentry
- Maps: react-native-maps + expo-location
- Build: EAS
- CI: .github/ workflows

## Session Context
- Previous session: EXPIRED mid-Phase-12
- Result: Freebuff reported editing files but NOTHING was written to disk
- Verified with git: codebase is in pre-hardening state
- New branch: security-hardening
- Backup branch: backup-pre-hardening

## Critical Rule Learned From Previous Session
VERIFY EVERY EDIT ON DISK BEFORE PROCEEDING.
After each claimed edit, run `git diff <file>` to confirm changes persisted.

## Security Phases for THIS Stack
1. Firestore security rules (firestore.rules) — HIGHEST PRIORITY
2. Storage security rules (storage.rules) — HIGHEST PRIORITY
3. Firebase Auth configuration
4. Cloud Functions security (functions/)
5. API key & secret exposure (app.config.js, .env, firebase.json)
6. Client-side data validation (src/)
7. Client-side auth logic (src/)
8. Cloud Functions input validation (functions/)
9. Dependency audit (package.json)
10. CORS & domain restrictions (cors.json)
11. Consolidated edit plan
12. Controlled editing (one file at a time)
13. Verification

## Critical Constraints
- Do not edit anything without "PERMISSION GRANTED TO EDIT"
- Verify every edit on disk before proceeding
- One file at a time, report after each, wait for "CONTINUE"
- Do not break existing functionality
- Do not add new frameworks or dependencies without permission
- Firestore rules must be tested before deploy (use emulator)

## Rollback Plan
- Snapshot: backup-pre-hardening branch
- Firebase rules can be reverted in console
- functions/ can be redeployed from git

## Immediate Priorities (Why)
- Firestore rules misconfiguration = full database read/write by anyone on the internet
- Storage rules misconfiguration = anyone can upload/delete files, rack up bills
- .env exposure = full Firebase admin compromise