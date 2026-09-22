# V1 economy and progression

Status: agreed direction from the economy and progression planning discussion, not an implementation specification. The currency basis, financial model depth, fare structure, progression mechanism, accounting period, debt treatment, legacy save treatment, and sandbox behaviour are settled in kind. The insolvency rule and bounded borrowing were both removed on 21 September, and the positions they replace are recorded below. Every numerical value is proposed and must be verified and balanced before implementation.

This document records determinations made using the [game vision](00-game-vision.md), the [development plan roadmap](01-development-plan-roadmap.md), and the preceding subsystem plans [02](02-infrastructure-and-operations.md), [03](03-services-and-timetabling.md), [04](04-fleet-and-depots.md), and [05](05-passengers-and-demand.md).

It resolves the vision's insistence that moving to SEK be a deliberate cost and balance decision rather than a currency substitution, and it closes the financial loop the other plans assume: plan 04 identified the cost categories a train needs without pricing any, and plan 05 supplies the journeys revenue is earned from without setting a fare.

## Goals

Make money the thing that forces choices. Every plan so far lets the player build and run whatever they like; this one decides what they can afford, what it costs to keep, and what they earn for it.

Success means a player can see why they are or are not solvent, attribute it to specific decisions — this corridor was built to 250 km/h for demand that needed 160, this fleet is larger than the duties require, this service runs at a fare below what it costs to operate — and that building the right railway is meaningfully cheaper than building an impressive one.

## Agreed direction

### Requirements inherited from the game vision

- Express all game finances in SEK, across construction, purchases, maintenance, operating costs, and revenue.
- Provide a financially constrained management mode and an unlimited-money sandbox using the same operating simulation.
- Include construction and maintenance costs for tracks, stations, and depots.
- Decide how legacy euro-denominated construction data is treated rather than assuming a conversion or a numerical balance (roadmap).

### SEK by recalibration, never by conversion

The existing cost model's **shape is kept and its magnitudes are replaced**. The structure in [`cost.ts`](../../src/cost.ts) is sound: a per-kilometre base, a track-count multiplier, a speed multiplier interpolated across a curve, electrification priced separately per track-kilometre, and property acquisition derived from building floor area and category. Those relationships were never the problem.

The magnitudes are. Double track at 200 km/h currently costs €2.52m per kilometre, against real Swedish new double track in the region of SEK 150–400m per kilometre depending on terrain and structures. Relabelling euros as kronor would leave construction roughly two orders of magnitude too cheap: an order of magnitude understated, in a currency worth about an eleventh. Electrification is the one existing figure in the right region, at €250k per track-kilometre against a real SEK 5–10m.

Every constant is therefore reset against documented Swedish figures, and no conversion rate is applied anywhere in the game or its migration path. The point of anchoring to real costs is not realism for its own sake: it means a player's intuition about what railways cost transfers into the game, and it gives every future balance change a defensible starting point rather than a tuned number with no origin.

The figures below are **proposed and indicative**, in the same spirit as plan 04's catalogue. Each needs a documented source and then balancing. Do not treat them as data.

| Item | Basis | Indicative value |
| --- | --- | --- |
| Track construction | Per km, single track, 120 km/h reference | SEK 80m |
| Track count multiplier | Existing shape retained | 1 / 1.8 / 2.5 / 3.1 |
| Speed multiplier | Existing curve retained, 80→320 km/h | 0.8 → 2.6 |
| Electrification | Per track-km | SEK 7m |
| Station | Per platform metre | SEK 120k |
| Depot | Per siding metre, plus land | SEK 40k |
| Property acquisition | Floor area × category multiplier | SEK 25k per m² |
| Track maintenance | Per track-km per year, scaled by speed and electrification | SEK 450k |
| Station standing cost | Per platform metre per year | SEK 6k |
| Depot standing cost | Per siding metre per year | SEK 2k |
| Train standing cost | Per unit per year | SEK 4m |
| Train running cost | Per unit-km | SEK 45 |
| Base fare rate | Per passenger-km before modifiers | SEK 1.20 |

Two structural changes accompany the recalibration. **Station cost moves into the cost module**: it is currently an inline expression at [`App.tsx`](../../src/App.tsx) computing `length × platforms × 2500`, with its own rebuild-versus-extension logic, which belongs with the other cost functions. And **depots gain a construction cost** beyond land: today [`applyDepot`](../../src/depots.ts) adds only demolished building acquisitions, so a yard's tracks are free.

Currency presentation changes with the figures. `money` and `compactMoney` hardcode `EUR` and `€`; they become SEK, and the compact form should follow Swedish convention with the unit trailing the number rather than leading it.

### A real account, and an unbounded balance

The player has a **balance**, not a spending odometer. Today `project.spent` only ever increases and is compared against a flat `DEMO_BUDGET`; it is replaced by an account that receives revenue and pays costs.

- **Capital out:** construction, property acquisition, electrification, depot building, train purchases.
- **Recurring out:** infrastructure maintenance, station and depot standing costs, train standing costs, and per-kilometre running costs on every kilometre operated — revenue trips and plan 04's empty movements alike.
- **In:** ticket revenue from plan 05's travelled journeys, and public service contract subsidy.
The balance **may go negative without limit**, and a negative balance is simply debt the player carries. There is no separate loan mechanism: nothing to apply for, no principal or term, and no capacity rule. Spending beyond the balance is the borrowing.

**This replaces two earlier decisions**, both removed on the player's instruction. The first was bounded borrowing: loans with a principal, a term and interest, with capacity bounded by recent revenue, on the argument that unlimited borrowing leaves no judgement in the decision. The second was the insolvency rule, dealt with below. They fell together, because once nothing blocks spending, a bounded loan is a mechanism no rational player would ever use — an unbounded overdraft sits right beside it.

Opening capital survives as scenario state and still matters: it sets where the player starts. What it no longer does is gate anything.

The accepted cost is real and is not minimised here. **Money no longer constrains any individual decision.** A player can build a national network on day one and carry the debt. The financial loop becomes something the player chooses to care about — a score they are judged by and a problem they elect to solve — rather than a limit the game enforces. That makes the weekly statement and the attribution of a bad week to a cause carry the whole burden of making money interesting, which raises their importance to plan 07 considerably.

Crew wages are not a cost line: plan 04 deliberately excluded crew as a modelled resource, so staffing is folded into the standing and per-kilometre figures rather than rostered. Asset depreciation, resale value, and inflation are deferred, consistent with plan 04's deferral of resale.

### Continuous balance, weekly statement

The balance moves as events occur, so a player watching a service run sees revenue arrive and running costs accrue. Alongside it, a **statement closes each timetable week** and reports by category: revenue by service, operating cost by category, maintenance, contract subsidy, interest, and the net result.

The week is the accounting period because the week is already the unit the player authors in plan 03. A statement that lines up with the timetable being edited makes cause and effect legible; a monthly period would not. The week wraps exactly as plan 03's does.

Capital spending appears in the week it occurs rather than being spread, since plan 02 excludes construction duration and there is nothing to spread it over.

### Debt is carried, and nothing is blocked

**Nothing is ever blocked for want of money.** Construction, purchases and operations all continue at any balance, however negative. There is no insolvency state, no game over, and no automatic withdrawal of services.

Debt carries **no consequence of its own**: no interest on a negative balance, no penalty, no effect on contract offers. It is a number the player carries, and digging out of it is entirely their decision, made with the same actions they always had.

This replaces what this plan originally said, which was that insolvency blocked new construction, purchases and borrowing while operations continued — shaped deliberately after plan 02's rule on infrastructure edits and plan 04's on service overruns, blocking the next commitment but never breaking what was underway. The player removed it. The argument for removal is that a block is a failure state wearing a different hat: the audit had already shown that a zero-revenue start and a structurally loss-making network could both make the block unrecoverable, and removing it dissolves that trap rather than tuning it.

The accepted cost is that there is no financial pressure in the simulation at all. Nothing pushes back on reckless spending, and a player who does not care about the balance will never be made to. That is the intended design, and plan 07 must make the consequences of a bad week legible enough that the player cares without being forced to.

There is no game over. The vision never asks for a losable game, and losing an hour of network construction to an accounting slip would be a poor trade for whatever tension a failure state adds.

That sentence originally continued “a player who wants stakes has the constraint already; a player who wants none has sandbox”. Removing the insolvency block removed the constraint, so it is no longer true, and it leaves the two game modes without a financial difference between them. That is an open question below, not something this document should quietly resolve.

### Fares: one national rate, per-service modifiers

The player sets a **base fare rate per passenger-kilometre**, and each service carries a **modifier** for its market position — a premium for an intercity product, a discount for a stopping service chasing volume.

One global lever keeps a large network from becoming a table of numbers to maintain, while the modifier gives the local control that makes a service a commercial decision. A journey's fare is derived from its distance and the modifiers of the services it uses, so a journey across two services prices coherently without a separate cross-network rule.

Plan 05 consumes the resulting fare as a term in generalised cost, converted to minutes by a purpose-specific value of time. This is the loop that makes fare policy interesting: raising the rate increases revenue per journey and reduces journeys, by different amounts for a business traveller and a student, and the net effect is not obvious in advance.

Ticket classes, reservations, season passes, and yield management are deferred, consistent with plan 05.

### Progression through public service contracts

Regional transport authorities offer **contracts**: a corridor or set of places, a minimum service level, a term, and a subsidy. The player accepts a contract and must meet its service level to be paid.

This is authentically how Swedish regional rail is actually procured, and it does several things at once that a milestone list would not. It gives concrete goals tied to where the player has actually built, rather than generic targets. It creates real tension, because a contracted service must run at hours and frequencies the player would not choose commercially. And it is a second revenue stream, so a corridor that cannot pay for itself on fares alone can still be worth operating — which is the actual economics of regional rail and a genuinely interesting decision.

A contract specifies at minimum a served corridor or place pair, a minimum service level expressed in departures and hours of operation, a term in weeks, and a subsidy per week. Compliance is measured against the published timetable and against actual operation, so a published service that persistently fails to run does not satisfy a contract.

Whether contracts are offered at a fixed subsidy or bid for competitively, how they are generated, and how non-compliance is penalised are open.

### Sandbox runs the same accounting

Removing the insolvency block removed what used to separate the modes, since sandbox was defined as the mode that never blocks and now neither does. They are redefined by **what money means**, not by what it prevents.

**Management mode has money as a concept.** A balance, opening capital, debt carried without limit, the weekly statement, and public service contracts. Nothing is blocked — but the total is tracked, reported, and is what the player is judged by.

**Sandbox does not track total money at all.** There is no balance, no opening capital, no debt, no accumulating total, and no contracts. What it keeps is **ticket price and profitability**: the player still sets fares, and still sees whether a service or a corridor earns more than it costs to run. That is the information a sandbox is most useful for — a player testing whether a corridor would pay needs to see whether it would pay — and it needs no running total to provide it.

The distinction is therefore real rather than a preset: in sandbox the question “how much money do I have” has no answer, because nothing is counting. In management it is the whole question.

Two consequences are my own reading of that instruction, recorded so they can be corrected rather than inherited silently. First, sandbox keeps per-service and per-week profitability reporting, because a rate is not a total; what it drops is the cumulative balance those weeks would otherwise sum into. Second, contracts go with management, because a contract is a commitment measured in subsidy paid into a balance that sandbox does not have.

This is one code path with two rule sets, matching the vision's requirement that both modes use the same operating simulation.

### Pre-SEK saves are not loadable

Because costs are recalibrated by roughly two orders of magnitude, a stored euro `spent` figure has no meaningful translation. Rather than migrate it, **saves predating the SEK economy are treated as incompatible** and refused, directing the player to start fresh.

This is a clean boundary with no migration code and no possibility of a strange figure surviving into a balanced economy. It is defensible because of what these saves are: the prototype's persistence is browser-local manual save/load of a construction toy with no trains, no timetable, and no finances beyond a spending total. There is very little in such a save that the new economy could honour.

The cost is real and should be stated plainly rather than minimised: players lose networks they built in the prototype, and re-costing the existing geometry under the new model would have been computable. The decision is that a hard version boundary is worth more than that migration.

`Project.version` is already `1` in [`types.ts`](../../src/types.ts), so the gate is a version bump with an explicit refusal and a clear message, not a silent failure. The mechanics of version gating, and whether any later migration is offered, belong to plan 08.

## Existing functionality and gaps

The prototype has a structurally reasonable capital cost model — per-km track cost by count and speed, separate electrification, OSM-derived property acquisition with category multipliers and a documented level-source fallback — and a cumulative spend total shown against a flat demonstration budget.

Its magnitudes are euro-denominated and roughly two orders of magnitude below Swedish reality. Station cost is inline in the application rather than in the cost module. Depot construction is unpriced apart from land.

There is **no recurring cost of any kind**, no revenue, no balance, no borrowing, no fares, and no contracts. `spent` cannot decrease, so there is no financial loop: a player can operate badly at no cost, because there is nothing to operate and nothing that costs.

The demonstration budget is an objective rather than capital, and `DEMO_BUDGET` is a module constant rather than scenario state.

## Player workflow

1. Begin with opening capital, and a view of what a corridor will cost before committing to it.
2. Build, seeing capital cost and the recurring commitment each build adds, rather than only the one-off figure.
3. Buy trains against plan 04's catalogue, with purchase price and standing cost both visible.
4. Set the base fare rate and per-service modifiers, and see the forecast effect on journeys and revenue from plan 05.
5. Review contract offers, accept those the network can serve, and read their service level as a requirement against the draft timetable.
6. Operate, watching the balance move and reading the weekly statement by category.
7. Fund the next expansion whenever they judge it right, carrying debt if the balance will not cover it.
8. Attribute a poor result to a specific cause — overbuilt speed, oversized fleet, a fare below operating cost, an uncontracted thin service — and respond.

Statement presentation, cost previews, the contract browser, and how a recurring commitment is shown at build time belong to plan 07.

## Minimum data and interface changes

Planning needs implied by the agreed behaviour, not settled schemas:

- **Cost model:** recalibrated SEK constants, with station cost moved into the cost module and a depot construction cost added alongside land.
- **Account:** a balance, opening capital, and a transaction record sufficient to produce a weekly statement by category.
- **Recurring commitments:** maintenance and standing costs derived from built infrastructure, owned depots, and owned trains, plus per-kilometre running costs from operated distance including empty movements.
- **Opening capital:** scenario state rather than the module constant `DEMO_BUDGET` is today. No loan record exists: a negative balance is the whole of the debt model.
- **Fare policy:** the base rate per passenger-kilometre and a per-service modifier, with a rule for pricing a journey spanning several services.
- **Contract:** served corridor or place pair, minimum service level in departures and operating hours, term in weeks, subsidy per week, acceptance state, and measured compliance.
- **Mode rules:** one accounting implementation computing costs and revenue in both modes. Management adds a balance, opening capital, debt, the weekly statement and contracts on top of it; sandbox exposes only rates — fares and profitability — and holds no total. Neither ever blocks.
- **Save version:** a bump with an explicit refusal of pre-SEK saves and a clear message.
- **Interfaces consumed:** built infrastructure and its properties from plan 02; operated trips, published services, and the timetable week from plan 03; train purchase categories, owned trains, and operated distance from plan 04; travelled journeys and fare response from plan 05.
- **Interfaces produced:** fares and fare policy to plan 05; affordability constraints on construction and purchases to plans 02 and 04; statement and contract state to plan 07.

Transaction storage, statement derivation, and version gating belong to plan 08.

## Open questions

- **Every figure in the table.** Each needs a documented Swedish source and then balancing. Construction and train purchase prices matter most, because they set the scale of everything else.
- **Opening capital and scenario framing:** how much the player starts with. That it is scenario state rather than a constant as `DEMO_BUDGET` is today is settled; the figure is not.
- **Contract generation:** how offers arise, whether they respond to unserved demand plan 05 can already identify, and how many exist at once.
- **Contract subsidy:** fixed offer or competitive bid, and if bid, against what.
- **Non-compliance:** how a failed service level is penalised — withheld subsidy, a penalty, or termination — and what tolerance a contract allows for delays.
- **Speed multiplier validity:** whether the existing 0.8–2.6 curve still holds against Swedish high-speed cost evidence, or whether high speed is disproportionately more expensive than it implies.
- **Maintenance scaling:** how maintenance responds to speed, track count, and electrification, and whether usage contributes.
- **Per-kilometre cost by type:** whether running cost is uniform per unit-kilometre or differs by type, which plan 04 left as a category without a value.
- **Property acquisition realism:** whether SEK 25k per m² of floor area is defensible nationally, given land values vary enormously between Stockholm and Norrland.
- **Fare modifier bounds:** how far a service modifier may deviate, and whether a contracted service's fare is the player's to set at all.
- **Depreciation and inflation:** both deferred, but whether a long game needs either.

## Dependencies

- **Infrastructure and operations (02):** supplies what is built and its properties, priced here. Affordability becomes a new reason a construction edit cannot be applied, alongside plan 02's running-train veto.
- **Services and timetabling (03):** supplies the published week, operated trips, and the week boundary the statement follows. Contract compliance is measured against the published timetable and actual operation.
- **Fleet and depots (04):** identified purchase price, standing cost, and per-kilometre running cost as categories without values; this plan prices them. Operated distance includes empty movements.
- **Passengers and demand (05):** consumes fares and fare policy from here; supplies the travelled journeys revenue is earned from. The fare and value-of-time loop spans both documents.
- **Interface and player experience (07):** cost previews at build time, the weekly statement, the contract browser, and attribution of a poor result to a cause. There are no borrowing controls to design. Note that with nothing blocked for want of money, these are the only things making the economy legible, so they carry more weight here than a financial interface usually would.
- **Simulation architecture and saves (08):** now written, and revised after the 21 September audit. The ledger lives in the worker and is persisted in full — balance, loans, transaction history and contract progress — because none of it can be reconstructed from authored state. Statements remain derived, since they are a pure function of the ledger and rebuild invisibly. The refusal of pre-SEK saves is the first boundary in its version and migration chain, which must refuse without silently discarding anything. Note also that undo there is bounded to a paused editing session, precisely so that popping the stack cannot erase revenue the trains have earned.
- **First playable and validation (09):** the corridor scenario needs opening capital, one contract, a fare decision, and a weekly statement that closes.

## Acceptance scenarios

Numerical expectations must be added once the figures are verified and balanced.

| Scenario | Expected behaviour |
| --- | --- |
| Player builds double track at 200 km/h | Cost is in SEK, on the order of real Swedish construction, derived from the retained model shape with recalibrated constants. |
| Player compares 160 km/h against 250 km/h for the same corridor | The speed multiplier makes the faster option materially more expensive, in both capital and maintenance. |
| Player electrifies a section | Priced per track-kilometre, separately from track construction, as today's model already does. |
| Player builds a depot | Construction cost is charged for its sidings as well as for land acquired, which the prototype does not do. |
| A week of operation closes | A statement reports revenue by service, operating and maintenance costs by category, subsidy, interest, and the net result. |
| A train runs an empty movement | Its kilometres accrue running cost, because plan 04 makes empty movements real movements. |
| Player raises the base fare rate | Revenue per journey rises and journeys fall, by different amounts per purpose, per plan 05's value-of-time treatment. |
| Player sets a premium modifier on an intercity service | That service's fares rise without affecting a stopping service on the same corridor. |
| A journey uses two services with different modifiers | It prices coherently from distance and the modifiers involved, with no separate cross-network rule. |
| Player borrows to build ahead of demand | The loan is granted within capacity, interest appears in the statement, and the corridor can be built before it earns. |
| Player attempts to borrow beyond capacity | Refused against the stated capacity rule, naming what bounds it. |
| Balance cannot fund a construction edit | The edit proceeds and the balance goes negative. Affordability is never a reason an edit is refused. |
| Balance runs out during operation | Nothing changes. Trains keep running, building and buying stay available, and the balance goes negative and stays there. No game over and no penalty. |
| The player carries a large negative balance for several weeks | No interest accrues, no offer is withdrawn, and nothing is blocked. The statement reports it and that is all. |
| Player accepts a public service contract | Its minimum service level becomes a requirement visible against the draft timetable, and subsidy is paid while it is met. |
| A contracted service level is not met | Reported against that contract, with the consequence the non-compliance rule specifies, rather than silently unpaid. |
| A thin corridor cannot pay on fares alone | With a contract it can be worth operating; without one it cannot, which is a real decision rather than a bug. |
| Player operates in sandbox | Fares, costs and per-service profitability are computed and shown. There is no balance to read, no debt, and no contracts, and nothing is ever blocked. |
| Player asks how much money they have in sandbox | The question has no answer, because no total is kept. Profitability answers whether a service pays, which is the question sandbox exists to serve. |
| Player operates in management mode | The same costs and revenue additionally accumulate into a balance and a weekly statement, and contracts are offered. Nothing is blocked there either. |
| Player opens a pre-SEK save | It is refused with a clear message explaining the economy change, not silently loaded or partially migrated. |
| Player asks why the week lost money | The statement attributes it by category, and a specific cause can be identified from it. |

## Deferred features and planning boundaries

- No currency conversion anywhere: SEK figures are recalibrated from Swedish sources, never derived from the euro constants.
- No migration of pre-SEK saves; the version boundary is a refusal.
- No game over, bankruptcy, or failure state.
- No asset depreciation, resale value, or second-hand market, consistent with plan 04.
- No inflation, interest rate variation over time, or macroeconomic simulation.
- No crew wages as a separate cost line; staffing is folded into standing and per-kilometre figures, since plan 04 excludes crew as a resource.
- No ticket classes, reservations, season passes, revenue management, or yield pricing, consistent with plan 05.
- No shareholders, dividends, corporate structure, or taxation.
- No competing operators bidding against the player for contracts, and no rival businesses, per the vision.
- No freight revenue of any kind.
- No construction duration, so no capital spreading or works financing, per plan 02.
- No land value variation by region in the initial approach, pending the property acquisition question.

This document records the determinations reached so far and does not authorize application changes. Verify the cost figures against documented Swedish sources and settle opening capital and the contract rules before treating it as implementation-ready.
