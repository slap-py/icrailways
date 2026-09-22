# V1 first playable and validation

Status: agreed direction from the first-playable planning discussion, not an implementation specification. The delivery sequence, the first-playable boundary, the corridor scenario's shape, the fixture set, the contract freeze, and the approach to extracting [`App.tsx`](../../src/App.tsx) are settled in kind. Scenario figures, performance budgets, and the contents of each milestone's tests are not.

This document records determinations made using the [game vision](00-game-vision.md), the [development plan roadmap](01-development-plan-roadmap.md), the subsystem plans [02](02-infrastructure-and-operations.md) to [08](08-simulation-architecture-and-saves.md), and the advisory audit at [`reports/v1-plan-audit-2026-09-21.md`](../../reports/v1-plan-audit-2026-09-21.md), whose recommended delivery sequence is adopted here with corrections.

It is taken last, as the roadmap requires, because it **selects from what the other plans settled rather than deciding anything new**. Where it appears to decide something, it is bounding scope, not changing a rule.

## Goals

Choose the smallest thing worth building that is recognisably this game, and say how anyone would know it worked.

Success means a developer can start on Monday knowing what milestone they are in, what proves it done, and what they are explicitly not building yet.

## Agreed direction

### Requirements inherited from the game vision

- Demonstrate a regional and an express sharing several stations, a single-track section, and a passing loop, with individually assigned trains.
- Use the corridor to validate overtaking, opposing movements, connected passenger journeys, and financial consequences before broadening content.
- The core loop the first playable must express: identify travel demand → construct infrastructure → timetable routes → operate trains → evaluate results → improve the network.

### The first playable is milestone 3: passengers ride

**The first playable is reached when passengers travel.** Purpose-based journeys, at least one deliberate transfer, hard capacity with denied boarding reported, fares, and a minimal choice inspector — running over a timetable the player authored on infrastructure they built.

This is one milestone earlier than the audit implied and earlier than the recommendation made during this discussion, which was to wait for the financial week to close. The player chose milestone 3, and the argument for it is sound: passengers riding is the point at which the simulation becomes a game rather than an engine, and **milestone 3 already includes fares**, so "improve the network" has a real criterion — revenue for the week — without needing the balance, the weekly statement or contracts.

The accepted cost is narrower than it first appears but is still real. Without the ledger there is no cost side, so a player can compare revenue between weeks but cannot yet tell whether a route is worth running. Milestone 4 remains necessary; it is simply not the first playable.

### The whole of Sweden, from the start

**The player has the entire national dataset available from the first milestone.** The map is never clipped to a region, and there is no tutorial area, starter province, or progressive unlocking of geography. A player may build anywhere in Sweden on day one.

This is not a new requirement so much as the existing state of the application, made explicit because the corridor scenario below could be misread as a restriction. [`region.json`](../../region.json) already covers Sweden at `[10.5, 55.0, 24.5, 69.2]`, and the bundled snapshot is national: a 32 MB rail network, 8 MB of places, 7 MB of transit stops, and population tiled across roughly a hundred and ten files.

**Map extent and simulation scale are different things, and only the second is staged.** Plan 08's three performance scenarios — corridor, regional, national — measure simulated entities: trains, trips, travellers, occupancy. They say nothing about how much map is loaded. A player at milestone 3 with four stations and two routes is running a corridor-scale *simulation* on a national *map*, and that is the intended combination.

One consequence is worth stating plainly, because it makes milestone 0's scale probe less hypothetical than it sounds: **the load-time and memory baseline is already national.** Whatever milestone 0 measures, it measures with the full dataset present, which is the honest starting point rather than a small case that will later be scaled up.

### The corridor scenario

The shape is settled; every figure below is **proposed and indicative** and must not be treated as data.

| | Proposed |
| --- | --- |
| Route length | ~100 km |
| Stations | 4 |
| Track | Double, with one single-track section and one passing loop |
| Depot | 1 |
| Routes | 2 — a stopping regional and an express |
| Train types | 2 |
| Trains | Only as many as the schedules require |

Four decisions inside that table matter more than the numbers:

- **Two routes, not one.** Plan 03's pattern object is dissolved, so a corridor served both fast and slow is authored as two routes. The first playable therefore exercises that decision directly rather than working around it.
- **The calls must make a transfer genuinely useful.** Two overlapping end-to-end routes do not demonstrate transfers; a passenger only transfers when transferring is better than not. The express must skip a station the regional serves, so that a journey to that station from beyond the express's stops is best made by changing. This is a scenario design requirement, not a nice-to-have, because plan 05's transfer penalty, re-planning and missed-connection behaviour are otherwise untested.
- **Only enough trains for the schedules.** Plan 08's corridor performance scenario names ten trains; that figure stays as a separate stress fixture. The playable scenario uses the number the timetable actually needs, so a fleet shortfall is a thing the player causes rather than a thing they start with.
- **One depot visit is in scope.** Servicing must be reachable within the scenario, including the empty movement to a depot plan 04 now permits.

### The delivery sequence

Six milestones, in order. Each one's exit evidence depends on the previous one existing, which is why the order is not negotiable in the way the contents are.

| Milestone | Deliverable | Exit evidence |
| --- | --- | --- |
| **0. Baseline and contracts** | Preserve current editor behaviour. Freeze the contracts as code. Add a headless TypeScript core, the worker protocol, a deterministic clock, a checkpoint skeleton, and a tiny synthetic fixture. Extract from [`App.tsx`](../../src/App.tsx) only what the boundary needs. | The same command sequence gives the same outcome at normal and accelerated rates. Save and load meet plan 08's restore-exactly rule. The existing 66 unit tests and the Playwright suite stay green. An early larger synthetic workload gives a first reading on scale cost. |
| **1. One operating train** | One train moves through built infrastructure, stops, reverses, and reaches a depot. Map positions and a minimal inspector read from the core. | The analytical minimum, the displayed timetable and actual unconstrained operation agree within a declared step tolerance. Wiring gaps, disconnected track and length limits each produce a named error rather than a silent failure. |
| **2. Timetable and capacity** | Two routes, trips generated by placing routes on the timetable, schedules, explicit meets and overtakes, safe separation, draft and publication, and the planned-against-actual diagram. | Regional and express interact. Opposing movements resolve. A late train propagates. A blocked meet partner is handled. Publication mid-week neither double-fires nor silently drops a departure. Sunday runs into Monday. The player can find a bottleneck, explain it, and fix it. |
| **3. Passenger loop — the first playable** | Purpose-based journeys, at least one useful transfer, hard capacity, denied boarding, fares, and a minimal choice inspector. | Retiming a connection changes the number of completed journeys. A longer formation changes denied boardings. Weighted totals conserve people and fares, including across a split. A reload continues the same travellers, per plan 08. |
| **4. The financial loop** | SEK construction and operating costs, train purchase, one contract, the weekly statement, servicing, and the negative balance. | A complete operating week closes with a reconcilable ledger. The player can identify a loss, change something, and compare the next week. A service-due train recovers, including by empty movement to a depot. |
| **5. Regional, then national** | Broader catalogue and content, the remaining v1 assistance, accessibility, larger fixtures, save hardening, and distribution. | Representative regional and national benchmarks pass on the named reference machine. Export and import, failed writes, crash recovery, migration refusal, and offline behaviour are all verified. |

**Four items in the audit's original sequence are corrected here**, because the decisions beneath them moved after it was written. Milestone 2 no longer builds patterns, which plan 03 dissolved. Milestone 4 no longer builds bounded borrowing or a cash-shortage recovery, both of which plan 06 removed, and gains the negative balance instead. Milestone 3's reload evidence follows plan 08's current rule that travellers persist, rather than the resampling policy it replaced. Milestone 5 no longer carries onboarding, which plan 07 deferred out of v1 entirely.

### Contracts are frozen as code in milestone 0

The interfaces everything else depends on are settled as **TypeScript types and a short README in the repository**, as milestone 0's first deliverable — not as a tenth planning document.

The set covers: identifiers and units; simulation time and week-occurrence identity; the conversion from construction geometry to the operational graph; command acknowledgement and revision rules; the error taxonomy; the ownership split between state that is authored, state that is durable and state that is derived; the save schema; and the first fixture.

Writing them as code rather than prose makes them compiler-enforced rather than agreed-and-drifted-from, which is the specific failure the audit was guarding against. The accepted cost is that they get less deliberation than a written specification would, and that changing a frozen type later is a real refactor rather than an edit.

Train, demand and economic constants do **not** belong in these contracts. They live in versioned tuning data, with the source evidence and any gameplay adjustment recorded as separate fields, so that calibration can proceed without touching code.

### `App.tsx` is extracted incrementally

Plan 08 requires [`App.tsx`](../../src/App.tsx) to be broken up before the worker boundary can exist. It is 1,476 lines owning project state, cost computation, editing intent, catchment orchestration and interface state together.

**It is extracted milestone by milestone, taking only what that milestone needs**, beginning with project state and cost computation in milestone 0. The file shrinks as a consequence of building rather than as a project of its own.

The alternative — restructuring it properly first — was rejected on the audit's reasoning: a refactor designed before a train has run is guided by guesses about what the simulation needs, and those guesses are usually wrong. The accepted cost is that `App.tsx` stays untidy for several milestones and is touched repeatedly rather than once.

One rule constrains the extraction throughout: **game rules must not be duplicated into interface code while it is under way.** A rule that exists in both places will diverge, and plan 08's single-implementation requirement is the thing that makes prediction and operation agree.

### Three fixtures, for three different jobs

- **A tiny synthetic graph**, for precise invariants — separation, reservations, capacity, unit identity, money conservation, determinism. Small enough that a failure points at a line.
- **The curated Swedish corridor**, for real map integration and playtesting. This is the scenario above. It is a **saved project on the national map**, not a reduced dataset — a fixture describing what has been built, against geography that is always fully present.
- **Generated regional and national workloads**, for scale.

Real geography alone is a poor diagnostic fixture: when something goes wrong in it, the cause is buried in data. The synthetic graph exists so that correctness is testable separately from realism.

### What is v1 but after the first playable

Named explicitly so that nothing is silently dropped when milestone 3 lands and the thing becomes demonstrable: the financial loop and contracts; the broader train catalogue; the remaining assistance from plans 02 and 03; accessibility beyond the existing baseline; the demand diagnostics in the Finance workspace; save hardening, export and import; and the regional and national performance work.

## Existing functionality and gaps

The prototype is a construction editor. It has corridor selection along real rights of way, track count, speed and electrification, passing and overtaking sections, stations with platform counts and lengths, depots with derived siding geometry, an OSM-derived property cost model, an SCB population catchment model, manual save and load, and 66 passing unit tests plus a Playwright suite.

It has no clock, no trains, no routes, no timetable, no passengers, no economy, no worker, no undo, and no import or export. Nothing in its save format anticipates any of them.

Three known defects are in scope for milestone 0 because the contracts touch them directly: the silent station discard in [`persistence.ts`](../../src/persistence.ts), which plan 08 forbids outright; `coveredJourney` in [`planning.ts`](../../src/planning.ts), which must be deleted rather than corrected because it is a second journey-time implementation; and `serviceOpportunities`, which must read frequency from the timetable rather than taking it as input, surviving only as a labelled what-if.

## Player workflow at the first playable

What a player can actually do when milestone 3 is done:

1. Open the map, see the population overlay, and pick a corridor worth serving.
2. Build track, a single-track section, a passing loop, four stations and a depot, seeing costs and affected property before committing.
3. Author two routes — a stopping regional and an express that skips a station — choosing stations on the map from the Routes sidebar.
4. Place both routes across the timetable, build schedules, and assign trains.
5. Resolve the meet on the single-track section, reviewing an assistance diff if they want it.
6. Publish, and run the week with the time controls.
7. Watch trains move, see one wait and read why.
8. Inspect a traveller, and see the itinerary they chose, the ones they rejected, and why — including one who transfers.
9. See denied boardings on a full train, lengthen the formation, and see them fall.
10. Retime the connection, run the week again, and see completed journeys change.

That last pair is the loop. It is the smallest thing that is recognisably this game.

## Minimum data and interface changes

This plan adds no new data of its own. It requires, from the plans that own them: the frozen contracts above; the three fixtures as test assets; per-milestone acceptance tests; and a benchmark harness reporting p95 over repeated runs on a named reference machine, per plan 08.

## Open questions

- **Which corridor.** Deferred rather than open: the map is national from the start, so this is a question of where the fixture happens to be built, not of what data exists. It needs a single-track section and somewhere a loop plausibly goes, and it can be chosen when the fixture is written.
- **The reference machine.** Plan 08's targets are claims about hardware that has not been named.
- **Scenario figures.** Every number in the corridor table.
- **Milestone 0's extraction boundary.** Exactly which parts of `App.tsx` the worker protocol needs, which cannot be answered precisely until the contracts are written.
- **Transfer design.** Which station the express skips, and whether one skipped station produces enough transfer demand to test plan 05's behaviour.
- **Fixture maintenance.** How the curated corridor survives a change to the OSM data snapshot, given plan 08 ties a save to the region snapshot it was built against.

## Dependencies

This plan depends on all of them and settles none of their rules.

- **02:** the movement model, separation, deadlock prevention with its timetable-decided contention rule, and named delay causes — exercised by milestones 1 and 2.
- **03:** routes carrying authored times, trips generated by placing routes on the timetable, schedules, explicit meets, draft and publication with week-occurrence identity — milestone 2.
- **04:** the catalogue, two train types, one depot, siding capacity by combined length, and the servicing empty movement — milestones 1 and 4.
- **05:** purposes, generalised cost over published times, hard capacity, denied boarding, transfers and the traveller inspector — milestone 3.
- **06:** SEK costs, fares at milestone 3, and the ledger, statement, contract and negative balance at milestone 4.
- **07:** the map with its bottom bar, the four workspaces, the linked table and diagram, and the status region — introduced progressively as each milestone needs its surface, never as a separate interface milestone.
- **08:** the worker boundary, deterministic clock, restore-exactly saves, paused-only undo, tiered validation and the performance targets — milestone 0, then enforced throughout.

## Acceptance scenarios

| Scenario | Expected behaviour |
| --- | --- |
| Milestone 0 is claimed done | The same command sequence replays identically at 1× and accelerated, a save restores the session exactly, and the existing 66 tests and Playwright suite are green. |
| Milestone 1 is claimed done | One train runs the corridor, stops, reverses, reaches the depot, and its actual running time agrees with the analytical minimum within the declared step tolerance. |
| A train is assigned to unwired track or a too-short loop | A named error identifies the train and the constraint. Nothing fails silently. |
| Milestone 2 is claimed done | The express overtakes the regional at the loop, opposing movements resolve on the single-track section, and a late train's delay propagates and is explained. |
| The player publishes mid-week | No departure fires twice, and one whose time has passed is reported as skipped. |
| Milestone 3 is claimed done | A traveller transfers between the express and the regional, denied boarding is reported on a full train, and fares accrue against completed journeys. |
| The player retimes the connection and re-runs the week | The number of completed journeys changes, and the inspector shows the changed choice. |
| The player lengthens a formation | Denied boardings fall. People and fares are conserved, including where a weighted traveller split. |
| A save is taken mid-week at milestone 3 and reloaded | The same travellers continue the same itineraries. Dwell and revenue are unaffected by the reload. |
| Milestone 4 is claimed done | A week closes with a reconcilable ledger, and a player who makes a loss can change something and compare the following week. |
| A train comes due for service away from its depot | It runs empty to the depot and returns to work. It is never stranded. |
| The national benchmark misses a budget | The build fails, and the first response is measurement rather than a change to the demand model. |
| A game rule appears in both the core and the interface | It is a defect, regardless of whether the two currently agree. |

## Deferred features and planning boundaries

- No milestone may be declared done on the basis of code existing. Each has exit evidence, and the evidence is the definition.
- No work on regional or national *content* before milestone 3 is demonstrable, other than the synthetic scale probe in milestone 0. This does not restrict the map, which is national throughout — what is staged is the size of the simulation, not the extent of the geography.
- No clipping of the dataset to a region, no starter area, and no progressive unlocking of geography.
- No full restructure of `App.tsx` as a project in its own right.
- No tenth planning document. The contracts are code.
- No onboarding, per plan 07.
- No calendar estimates until milestones 0 to 2 are done, because they carry the operational and authoring risk and nothing before them is evidence.
- No expansion of the corridor scenario to demonstrate features it was not chosen to demonstrate. If something needs a bigger fixture, it gets a separate fixture.
- No treatment of the ten-train figure in plan 08's corridor performance scenario as the playable scenario's fleet.

This document records the determinations reached so far and does not authorize application changes — but it is the last of the planning set, and what it bounds is what implementation should begin on. Choose the corridor, name the reference machine, and write milestone 0's contracts; the first three milestones will then say more about the remaining figures than further discussion can.
