# Trade-In Quote Form

Customers get an instant trade-in offer for a used club — brand, model,
condition in; MSRP, market value, and the TGS offer out — with no staff
involvement.

It is shaped as a single anonymous form rather than an account-based flow
because launch evidence (archived spec 0012, discovery) showed most
trade-in interest arrives from first-time visitors; accounts were deferred,
not rejected. Discontinued SKUs are deliberately not quotable online: the
pricing source can't value them reliably, and a manual-review queue was
rejected as too staff-heavy for launch — those customers are routed to the
store instead.

Offers come from the valuation engine (0004). See `behavior.md` for the
rules that constrain them.
