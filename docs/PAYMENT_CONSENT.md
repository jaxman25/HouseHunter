# Payment Consent — House Hunter

House Hunter does not charge users today. This page is the contract for the
day it does: charging requires **explicit, informed consent**, and the UI for
that already exists so it cannot be skipped.

## The rule

A user is only charged after tapping a button that states the exact amount
next to an itemized summary of what they are buying. No hidden fees, no
pre-checked "authorize" boxes, no surprise renewals.

## The consent gate UI

`src/components/common/PurchaseConsentModal.tsx` is a ready-made, reusable
modal. Every future paid flow MUST show it (or an equivalent with the same
guarantees) before any charge. It displays:

- what is being purchased,
- an itemized price summary,
- the billing cadence (e.g. "One-time", "Monthly, cancel anytime"),
- a confirmation button whose label contains the exact amount
  ("Authorize $29.00" — not "Buy" or "Upgrade"),
- a cancel path and the support contact.

Terms of Service already commit to this behavior
(`src/screens/legal/LegalScreens.tsx`, "Future paid features").

## Checklist when implementing a payment processor

1. **Pick the processor deliberately.** Payment data must be tokenized by the
   processor; the app must never touch raw card numbers. Research the
   provider (fees, regions, subscription support) before integrating.
2. **Server-side confirmation.** Finalize charges from a trusted backend or
   Cloud Function using the processor-issued token; never trust client-only
   "success" callbacks. Enforce price on the server.
3. **Receipts.** Email a receipt at the point of purchase.
4. **Cancellation & refunds.** Subscriptions must be cancellable in-app with
   no more than two taps; publish the refund policy at the point of purchase.
5. **Consent record.** Store `paymentConsentAt`/plan + amount on the user
   document (like `termsAcceptedAt`) for the audit trail, and add it to
   `docs/PRIVACY_AND_DATA.md` + the Privacy Policy table.
6. **Localized price clarity.** Always show currency + amount (e.g.
   "$29.00/month"); never show a price without the period it covers.
7. **No dark patterns.** No negative-option billing, no auto-opt-in to
   subscriptions from a free action.

## What to do when you get here

Open an issue/PR that: (1) selects the processor after research, (2) wires
`PurchaseConsentModal` into the paid screen with `lines` and `billing` filled
from server data, (3) adds the Cloud Function/backend for tokenized charges,
(4) records consent + receipt, and (5) updates the docs above. Then test the
full flow (authorize → receipt → cancel → refund) before shipping.
