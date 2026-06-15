---
id: 0012
slug: trade-in-quote
type: feature
status: shipped
decider: jonathan
ratified_by: jonathan
ratified_at: 2026-06-13        # amended once mid-build; see Amendments
created: 2026-06-11
shipped: 2026-06-15
acceptance_results: PR #214    # checks executed in the implementation PR
---

# Trade-In Quote Form

## Intent

Let a customer get an instant trade-in offer for a used club without staff
involvement. Appetite: one sitting — a single form, one valuation call, one
result screen. Anything beyond (multi-club carts, account history) is
deferred.

## Non-goals

- No customer accounts or saved quotes (deferred, ID not yet allocated).
- No price negotiation or staff override flow — offers are take-it-or-leave.
- No discontinued SKUs (added in amendment, 2026-06-13: the pricing source
  cannot quote them; rejected option was a manual-review queue — too much
  staff load for launch).

## Behavior

1. Customer selects brand → model → condition from catalog-backed dropdowns.
2. Submitting requests a valuation from the pricing engine (spec 0004) and
   renders MSRP, market value, and the TGS offer.
3. Offers expire after 7 days; the result screen states the expiry date.
4. Unknown or discontinued SKUs render a "we can't quote this online" state
   with a store-contact link (amended — was: "all catalog SKUs quotable").

## Business rules

- Offer **must** never exceed 60% of current market value.
- Quote requests **must** be rate-limited per session (10/hour).
- Expired offers **must not** be honored at POS; the offer ID encodes expiry.
- The form **should** preserve entries on validation errors.

## Critical files

- `app/services/valuation/` — pricing engine entry point (spec 0004).
- `app/views/quotes/` — existing staff-side quote rendering to mirror.

## Acceptance checks

- Selecting a known SKU in each condition tier returns an offer ≤ 60% of
  market value. *(automated — passed, PR #214)*
- A discontinued SKU renders the no-quote state, not an error. *(automated —
  passed, PR #214)*
- An expired offer ID presented at the POS endpoint is refused. *(automated —
  passed, PR #214)*
- Form retains entries after a validation failure. *(manual — verified by
  jonathan, PR #214)*

## Resolved questions

- *Offer expiry window?* — decider: jonathan; options: 3/7/14 days; default:
  7. **Resolved by default at deadline (2026-06-13): 7 days.**

## Relations (final)

depends_on:
  - 0004-valuation-engine: produces the offer this form renders
