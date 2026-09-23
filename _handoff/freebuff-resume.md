# FREEBUFF RESUME HANDOFF — HOUSE HUNTER SECURITY HARDENING

## Session Context
- Previous session expired at Phase 12 with ZERO edits applied to disk.
- Verified via git: codebase was unchanged.
- This is a RESUME. Do not redo Phases 0–11.
- A prior audit exists (see below). Treat it as the source of truth.

## Current State
- Branch: security-hardening (already checked out)
- Backup branch: backup-pre-hardening
- Base commit: c4c0a76 "Ignore dist-test/ build artifacts"
- Repo path: C:\Users\jane\Desktop\HouseHunter

## Project Stack (VERIFIED)
- Frontend: React Native + Expo SDK 57, React 19, TypeScript
- Backend: Firebase Cloud Functions v2 (Node 20, TypeScript) in functions/
- Database: Firestore (firestore.rules, firestore.indexes.json)
- Storage: Firebase Storage (storage.rules)
- Auth: Firebase Auth
- Hosting: Firebase Hosting (firebase.json)
- Email: Resend (via Cloud Functions)
- Error tracking: Sentry
- Maps: Google Maps (iOS + Android keys in app.config.js)

## Files That Need Editing (from prior audit)
Priority 1 (Critical):
1. firestore.rules — fix rate-limit minute bypass, lock verified/views/inquiries, enforce userId == auth.uid on create
2. storage.rules — fix orphaned image upload hole, restrict reads to participants, add size/content-type validation
3. functions/src/*.ts — add auth checks, App Check verification, input validation (zod), rate limiting

Priority 2 (High):
4. functions/package.json — pin versions, add zod
5. firebase.json — add COOP/COEP/CORP headers
6. cors.json — separate localhost from production
7. app.config.js — verify (no code change; verify Google Cloud restrictions)

Priority 3 (Medium):
8. .gitignore — verify .env, dist, dist-test, node_modules excluded
9. firestore.indexes.json — no change; awareness only

## CRITICAL AUDIT FINDINGS (Source of Truth)

### VULN 1 — properties match block unknown
The match block for /properties/{propertyId} was not visible in prior audit.
Must inspect before editing firestore.rules.

### VULN 2 — admin_roles must be write-protected
Firestore rule: allow write: if false; (only Admin SDK creates role docs).

### VULN 3 — propertyEditFieldsAreValid allows editing verified, views, inquiries, avgResponseMinutes, conversationCount
Split owner-editable vs admin-only fields.

### VULN 4 — isPropertyOwner() trusts doc userId that client may control
Enforce userId == request.auth.uid on create.

### VULN 5 — withinWriteLimit() minute is client-supplied
Bind minute to server time (request.time).

### VULN 6/7/8 — Storage rules allow orphaned writes and unrestricted reads
- Property images: require property doc to exist before write
- Chat images: read restricted to participants only
- All storage: size limit 5MB, content-type must be image/*

### VULN 9/10 — userDataIsValid and propertyDataIsValid don't validate field contents
Add length, range, and format checks.

### VULN 11 — CSP has 'unsafe-inline' and 'unsafe-eval'
Audit if removable.

### VULN 12 — functions/package.json uses caret ranges
Pin exact versions, add zod for input validation.

### VULN 13 — Cloud Functions unaudited
Every function must:
- Verify request.auth
- Verify request.app (App Check)
- Validate input with zod
- Never trust request.data.userId
- Use HttpsError with generic messages
- Not leak stack traces

### VULN 14-20 — Verification tasks
- Firebase API key restrictions in Google Cloud Console
- Google Maps API key restrictions
- .env never committed to git
- HSTS preload only if all subdomains support HTTPS
- Add COOP, COEP, CORP headers

## EDITING RULES (NON-NEGOTIABLE)
1. Do NOT edit any file until I say "PERMISSION GRANTED TO EDIT"
2. Edit ONE file at a time
3. After each edit, STOP and report: file, changes, concerns, tests
4. Wait for "CONTINUE" before next file
5. Commit each file separately with clear message
6. VERIFY ON DISK: I will run `git diff <file>` after each edit
7. If the diff is empty, you must acknowledge and re-apply
8. If you discover a new issue mid-edit, STOP and ask

## EDIT ORDER (Proposed)
1. firestore.rules (after I paste the missing match blocks)
2. storage.rules
3. functions/package.json (add zod, pin versions)
4. functions/src/*.ts (one file at a time)
5. firebase.json (add headers)
6. cors.json (separate environments)
7. .gitignore (verify)

## WHAT TO DO NEXT
Respond with:
1. Confirmation that you understand the resume context
2. Confirmation that you will NOT edit anything until permission is granted
3. Any clarifying questions
4. A statement that you're waiting for the missing firestore.rules match blocks

Then wait.