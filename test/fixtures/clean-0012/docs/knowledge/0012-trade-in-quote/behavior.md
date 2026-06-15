# Trade-In Quote — Rules and Invariants

- An offer never exceeds 60% of current market value. This is the platform's
  margin floor, not a pricing-engine artifact — enforced at the form's
  service boundary so engine changes can't breach it.
- Offers expire 7 days from issue. The offer ID encodes its expiry, and the
  POS endpoint refuses expired IDs — expiry is enforced at redemption, not
  just displayed.
- Quote requests are rate-limited to 10 per session per hour (scraping
  protection; the valuation engine call is metered).
- Unknown and discontinued SKUs get a no-quote state with a store-contact
  link. They are never sent to the valuation engine.

Related: valuation engine rules live in `0004-valuation-engine`.
