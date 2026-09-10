# 🏗️ House Hunter — Feature Inventory

A complete inventory of everything this codebase entails. Built with **React
Native (Expo SDK 57) + TypeScript** on one codebase targeting **iOS, Android,
and Web** (React Native Web), backed by **Firebase** (Auth, Firestore,
Storage, Hosting, Cloud Functions) and **Google Maps**.

> This file is a living map of the product. When a feature is added, removed,
> or renamed, update it in the same change. The README keeps the shorter
> user-facing tour; this file is the exhaustive reference.

---

## 1. Authentication & Accounts

| Feature | Where | Notes |
|---|---|---|
| Email/password sign-up & sign-in | `src/screens/auth/LoginScreen.tsx`, `RegisterScreen.tsx`, `src/services/authService.ts` | Firebase Auth; maps Firebase v12 error codes (`invalid-login-credentials`, `operation-not-allowed`, …) to clear messages |
| Google sign-in | `src/hooks/useGoogleSignIn.ts`, `src/services/authService.ts` | Native: idToken exchange; Web: Firebase popup flow |
| Password reset | `src/screens/auth/ForgotPasswordScreen.tsx` | |
| Change password (re-authentication required) | `src/screens/settings/ChangePasswordScreen.tsx` | |
| Account deletion (full data erasure) | `src/screens/settings/DeleteAccountScreen.tsx`, `src/services/accountService.ts` | Wipes user doc, listings, chats/messages, favorites, notifications; sends a confirmation email via a Cloud Functions callable (`sendAccountDeletionConfirmation`) |
| User roles | `src/types`, registration flow | Buyer / Seller / Agent (agent badge) |
| Profile management | `src/screens/settings/EditProfileScreen.tsx` | Name, phone, bio, photo (uploaded to Storage) |
| Post-login Terms consent gate | `src/screens/legal/TermsGate.tsx` | Accounts without a recorded `termsAcceptedVersion` must accept the current Terms before entering the app; failure surfaces inline on web |
| Auth reliability | `src/utils/network/circuitBreaker.ts` | Auth/storage/Firestore calls wrapped in circuit breakers that trip only on transient failures |

## 2. Property Listings

| Feature | Where |
|---|---|
| Create / edit / delete listings (Seller & Agent roles) | `AddPropertyScreen.tsx`, `EditPropertyScreen.tsx`, `MyListingsScreen.tsx`, `src/services/propertyService.ts` |
| Up to 10 images per property, picker + resize | `expo-image-picker`, `expo-image-manipulator`, `src/services/storageService.ts` |
| 6 property types: House, Apartment, Condo, Townhouse, Land, Commercial | `src/utils/constants.ts` |
| Listing types: Buy / Rent | |
| 20 amenities/features (parking, pool, gym, pet-friendly, AC, …) | |
| View counts & inquiry tracking per listing | `src/services/propertyService.ts` |
| Current-location capture when adding a listing | `expo-location` in `AddPropertyScreen.tsx` |
| Optimistic concurrency control | Firestore rules enforce a `version` bump on every owner edit |
| Write rate limiting | Firestore rules budget writes per user/minute via `counters/{uid}`; client increments in the same batch (`src/services/propertyService.ts`) |

## 3. Explore & Search

| Feature | Where |
|---|---|
| Browse listings in list or grid view, pull-to-refresh | `src/screens/main/ExploreScreen.tsx` |
| Filters: price range, bedrooms, bathrooms, property type, city, features, listing type | `src/components/property/FilterModal.tsx` |
| Sort: newest, oldest, price asc/desc, popularity | |
| Full-text search across title, address, city, state, description | `src/screens/search/SearchScreen.tsx` |
| Server-side pagination ("Load more") | `src/services/propertyService.ts` |
| Loading skeletons | `PropertyCardSkeleton.tsx`, `PropertyDetailSkeleton.tsx`, `src/components/common/Skeleton.tsx` |

## 4. Map View

| Feature | Where | Notes |
|---|---|---|
| Interactive map with property price markers | `src/screens/main/MapScreen.tsx` | Native: `react-native-maps` (Google provider) |
| Web-compatible map | `MapScreen.web.tsx`, `src/components/common/PropertyMap.web.tsx` | Google Maps embed, `referrerPolicy="no-referrer"` |
| Tap marker → property preview card → detail page | |
| Auto fit-to-bounds for visible listings | |

## 5. Recently Viewed

| Feature | Where |
|---|---|
| Local history of viewed properties (max 20, FIFO eviction, re-view moves to front) | `src/services/recentlyViewedService.ts` (AsyncStorage) |
| Tracking hook with debounced writes + per-item removal | `src/hooks/useRecentlyViewed.ts` |
| Home screen horizontal section (empty state, See All, focus refresh) | `src/components/home/RecentlyViewedSection.tsx` |
| Full grid screen: pull-to-refresh, Clear All with confirmation | `src/screens/main/RecentlyViewedScreen.tsx` |
| Tracked on detail-page load; deleted properties auto-removed from history | `src/screens/property/PropertyDetailScreen.tsx` |
| Works offline and on web (AsyncStorage localStorage backend); zero Firebase writes | |

## 6. Favorites

| Feature | Where |
|---|---|
| One-tap heart on any property card (dynamic add/remove label) | `src/components/property/PropertyCard.tsx` |
| Dedicated **Saved** tab | `src/screens/main/FavoritesScreen.tsx` |
| Persisted to the user's Firestore profile (`favorites` array) | `src/services/propertyService.ts` |

## 7. Real-Time Chat & Messaging

| Feature | Where |
|---|---|
| Conversations per property between buyers, sellers, agents | `src/screens/chat/ConversationsScreen.tsx`, `ConversationItem.tsx` |
| Live messaging via Firestore `onSnapshot` | `src/screens/chat/ChatScreen.tsx`, `src/services/chatService.ts` |
| Image sharing in chat | `ChatInput.tsx`, Storage upload |
| Unread counts & read receipts | `src/services/chatService.ts` |
| Data erasure: users can delete their own messages | Firestore rules |
| Back navigation on both Messages and Chat screens | header back buttons |

## 8. Property Status

| Feature | Where |
|---|---|
| Lifecycle states: Active / Pending / Sold / Rented / Inactive, with `soldDate`/`pendingDate` timestamps | `src/types/index.ts` |
| New listings always start Active (client + Firestore rules) | `AddPropertyScreen.tsx`, `firestore.rules` |
| Color-coded status badge (green/yellow/red/gray) on every card + detail screen | `src/components/common/StatusBadge.tsx` |
| Unavailable listings dimmed on cards; detail shows "under offer"/"no longer available" with a disabled contact button | `PropertyCard.tsx`, `PropertyDetailScreen.tsx` |
| Status selector with Sold confirmation in the edit flow | `EditPropertyScreen.tsx` |
| My Listings: status tabs with counts, inline quick-status change with optimistic updates + revert | `MyListingsScreen.tsx` |
| Status filter (Any/Active/Pending/Sold) in the browse filters; default browse excludes Inactive | `FilterModal.tsx`, `propertyService.ts` |
| Search excludes Inactive by default | `searchProperties()` in `propertyService.ts` |
| One-time backfill migration for pre-status documents | `scripts/migrate-add-status.mjs` |

## 9. Saved Searches

| Feature | Where |
|---|---|
| Save filter criteria with a custom name + notification frequency | `src/components/search/SaveSearchModal.tsx`, `FilterModal.tsx` |
| Saved-search CRUD (Firestore `users/{uid}/savedSearches`, 50 max, owner-only rules) | `src/services/savedSearchService.ts`, `src/hooks/useSavedSearches.ts`, `firestore.rules` |
| Saved Searches screen — run / edit / delete / toggle notifications, match counts, pull-to-refresh | `src/screens/main/SavedSearchesScreen.tsx`, `SavedSearchCard.tsx` |
| One-tap "Run" applies the saved filters to Explore | `ExploreScreen.tsx` (route param) |
| Quick-search chips (top 3 active searches) on Home | `src/components/search/SavedSearchChips.tsx`, `HomeScreen.tsx` |
| Scheduled match notifications (daily at 03:00 UTC, weekly cadence) | `functions/src/savedSearchNotifications.ts`, `functions/src/savedSearchFilters.ts` |

## 10. Contact Seller via Email

| Feature | Where |
|---|---|
| Email inquiry modal: property summary, message (20–1000 chars), Terms-of-Service consent, email-verified gate | `src/components/contact/ContactSellerModal.tsx` |
| Confirmation phase with message preview after a successful send | `ContactSellerModal.tsx` |
| Email button alongside Chat on the detail action bar (seller opt-out respected) | `PropertyDetailScreen.tsx` |
| Server-side send via `sendSellerInquiry` callable — validates Active status, verified buyer email, seller opt-in; seller email never reaches the client | `functions/src/index.ts`, `functions/src/email.ts` |
| Daily rate limit (5 inquiries/user) enforced with a transactional counter | counter docs under `users/{uid}/inquiryCounters` |
| Seller in-app notification + property inquiry-counter bump after a send | `functions/src/index.ts` |
| Seller opt-out (`contactEnabled`, default on) editable in the listing form | `Property`, `EditPropertyScreen.tsx`, `firestore.rules` |

## 11. Sold/Pending Archives

| Feature | Where |
|---|---|
| Soft-hide archiving: `archived` flag + status → inactive (hidden from default browse with zero new query logic) | `src/services/archiveService.ts`, `propertyService.ts` |
| Archive / Restore from My Listings; Archived tab with faded cards and countdowns | `MyListingsScreen.tsx` |
| Auto-archive countdown ("Archives in X days") on closing listings | `src/components/property/ExpirationCountdown.tsx` |
| Archived badge | `src/components/property/ArchiveBadge.tsx` |
| Daily 02:00 scheduled job — sold/rented 30d, pending 60d, inactive 90d; batch updates + seller notifications | `functions/src/archive.ts` |

## 12. Admin Dashboard & Moderation

| Feature | Where |
|---|---|
| Role-gated admin suite (`admin/roles` provisioned by operators; client writes denied) | `src/hooks/useAdmin.ts`, `src/components/admin/AdminGuard.tsx`, `firestore.rules` |
| Dashboard with live metrics (users, listings, active, pending reports) | `src/screens/admin/AdminDashboardScreen.tsx`, `src/services/adminService.ts` |
| User management — search, suspend (reason + 3d/14d/permanent), unsuspend | `src/screens/admin/UsersManagementScreen.tsx` |
| Reports triage — dismiss / resolve / delete listing (admins may delete listings via rules) | `src/screens/admin/ReportsManagementScreen.tsx`, `firestore.rules` |
| Announcements editor — publish / activate / pause; the latest active one renders in NoticeBanner | `src/screens/admin/SystemSettingsScreen.tsx`, `NoticeBanner.tsx` |
| Analytics — count metrics + listings/reports status distributions (no chart dependency) | `src/screens/admin/AnalyticsScreen.tsx` |
| Report a listing from the detail screen (inappropriate / scam / duplicate / other, anonymous to the seller) | `src/components/moderation/ReportListingModal.tsx`, `PropertyDetailScreen.tsx` |
| Audit log appended for every admin action | `admin/auditLog` + `adminService.logAudit()` |
| Suspended users blocked from creating listings/messages/inquiries while their data stays readable (GDPR) | `firestore.rules` |

## 13. Share & Deep Links

| Feature | Where |
|---|---|
| Cross-platform share: native share sheet (iOS/Android), Web Share API with clipboard fallback + toast | `src/utils/share.ts`, `src/components/common/ToastHost.tsx` |
| Formatted share message (emoji summary + deep link, truncated titles) | `buildShareMessage()` in `share.ts` |
| Share button on every property card and the detail header | `PropertyCard.tsx`, `PropertyDetailScreen.tsx` |
| Deep links: `househunter://property/{id}` (native) and `{origin}/property/{id}` (web) open the property | `src/utils/deepLinking.ts`, `src/navigation/AppNavigator.tsx`, `app.json` (scheme) |
| Deep-link handling on cold start and warm links; malformed ids fall back to the "Property not found" screen | |

## 14. Notifications

| Feature | Where |
|---|---|
| In-app notification records (message, inquiry, price_drop, new_listing, favorite, system) | `src/services/notificationService.ts` |
| Push notification integration | `expo-notifications` |
| `new_listing` notifications — generated by the scheduled saved-search job when a saved search finds new matching listings | `functions/src/savedSearchNotifications.ts` |

## 15. Settings & Account Management

| Feature | Where |
|---|---|
| Settings hub | `src/screens/settings/SettingsScreen.tsx` |
| Edit profile, change password, delete account | see §1 |
| Privacy Policy & Terms of Service screens | `src/screens/legal/LegalScreens.tsx` (reachable from Register & Settings) |

## 16. Legal, Privacy & Compliance

| Feature | Where |
|---|---|
| Terms of Service (v2) — includes Refunds, Local law, Governing law sections | `LegalScreens.tsx`, `src/utils/constants.ts` (`TERMS_VERSION`) |
| Privacy Policy — rights (GDPR/CCPA/CPRA), data storage location, cookies, third parties (Google Maps, Sentry, Resend) | `LegalScreens.tsx`, `docs/PRIVACY_AND_DATA.md` |
| Cookie consent banner (essential vs. non-essential, choice stored) | `src/components/common/CookieConsentBanner.tsx` |
| In-app notice banner (operator-controlled via `config/app_notice`, plus admin announcements) | `src/components/common/NoticeBanner.tsx` |
| Purchase consent modal (gates any future paid feature) | `src/components/common/PurchaseConsentModal.tsx`, `docs/PAYMENT_CONSENT.md` |
| Data minimization & deletion guarantees | `docs/PRIVACY_AND_DATA.md`, `accountService.ts` |
| Accessibility: WCAG-AA contrast tokens, labeled icon buttons, keyboard-friendly forms, roles/states | `src/config/theme.ts`, shared components |
| No third-party image hot-linking (local placeholder/initials fallbacks) | `src/utils/constants.ts`, `Avatar.tsx`, `PropertyCard.tsx` |

## 17. Responsive Web Experience

| Feature | Where |
|---|---|
| Centered 480px phone-frame container with gray backdrop on desktop | `src/components/common/WebFrame.tsx`, `App.tsx` |
| Responsive property grids (1 col mobile / 2 tablet / 2 desktop) | `src/hooks/useResponsive.ts` |
| Tab bar pinned below-icon labels, centered within the frame | `src/navigation/MainTabNavigator.tsx` |
| Search bar capped at 400px, centered | `SearchScreen.tsx`, `HomeScreen.tsx` |
| Category chips wrap + center on web | `HomeScreen.tsx` |
| Web alert dialogs (react-native-web has no `Alert`) | `src/utils/ui/dialogs.ts` |

## 18. Reliability, Performance & Observability

| Feature | Where |
|---|---|
| Circuit breakers per service (auth, Firestore, Storage, Functions) | `src/utils/network/circuitBreaker.ts` |
| Retries with exponential backoff + timeouts on all writes/uploads | `src/utils/network/retry.ts`, `timeout.ts` |
| Network health check with caching | `src/utils/network/healthCheck.ts` |
| Cache layer with invalidation on mutations | `src/utils/cache/cacheService.ts`, `cacheInvalidation.ts` |
| Performance metrics (Sentry breadcrumbs, dev console) | `src/utils/monitoring/metrics.ts`, `performance/` |
| Sentry error reporting (DSN-gated, off by default) | `src/utils/monitoring/sentry.ts` |
| Error boundaries with themed retry fallbacks per screen | `src/utils/errors/ErrorBoundary.tsx`, `AppNavigator.tsx` |
| Debounce/throttle helpers | `src/utils/performance/debounce.ts`, `throttle.ts` |
| Build-time feature flags via `.env` | `src/utils/featureFlags.ts` |
| Theme system (tokens, light/dark, spacing, radii, shadows) | `src/context/ThemeContext.tsx`, `src/config/theme.ts` |

## 19. Backend (Firebase)

| Service | What the app uses |
|---|---|
| **Auth** | Email/password + Google (native idToken / web popup) |
| **Firestore** | Collections: `users` (+ `savedSearches`, `inquiryCounters` subcollections), `properties`, `conversations`/`messages`, `notifications`, `counters` (rate limiting), `config` (public notices), `healthcheck`, `admin` (roles, reports, announcements, audit log) |
| **Security rules** | `firestore.rules` — ownership checks, field allowlists, rate limiting, optimistic locking, per-message deletion; `storage.rules` for media |
| **Storage** | Property images, chat images, profile photos |
| **Cloud Functions v2** | `functions/src/index.ts` — security-alert emails, breach broadcasts, `sendAccountDeletionConfirmation` + `sendSellerInquiry` callables; `functions/src/archive.ts` — daily auto-archive job; all email via Resend (`functions/src/email.ts`) |
| **Hosting** | Web export deployed via CI (`.github/workflows/deploy.yml`) |
| **Indexes** | `firestore.indexes.json` |

## 20. Tooling, Docs & Tests

| Item | Where |
|---|---|
| Delete-account end-to-end browser smoke test | `scripts/smoke-delete-account.mjs` (drives the web export over CDP) |
| Operations docs | `docs/` — production readiness, disaster recovery, incident response, breach notification, payment consent, data migrations, dependency security, system design audit, admin guide |
| Env configuration | `.env.example`, `src/utils/env.ts`, `src/config/firebase.ts` |