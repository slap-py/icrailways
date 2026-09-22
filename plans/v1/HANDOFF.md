# Handoff: icrail v1 planning set

Written 2026-09-21, updated the same day after the audit repair pass. For the next agent picking up this work.

## What this is

`icrail` is a Swedish passenger railway game: map-based construction along real railway rights of way, plus manually authored timetables. Inspiration is Subway Builder crossed with NIMBY Rails, with deeper timetable analysis. The existing application is a **construction prototype** — React 19 + TypeScript + Vite + maplibre, with OSM corridor data and an SCB population grid. It has no trains, no clock, no timetable, and no financial loop.

`plans/v1/` is a **planning set that authorises no application changes.** Every document says so explicitly. It is a decision record: later plans cite earlier ones as settled, so the documents are load-bearing for each other.

## Status

| Doc | State |
| --- | --- |
| [00-game-vision.md](00-game-vision.md) | Living summary. Records settled mechanics from every completed plan and strikes through resolved proposals. **Update it whenever a plan settles something directional.** |
| [01-development-plan-roadmap.md](01-development-plan-roadmap.md) | Living index. Holds the plan table, the dependency notes, the nine-point checklist every plan follows, and the "next discussion" pointer. |
| [02-infrastructure-and-operations.md](02-infrastructure-and-operations.md) | Complete |
| [03-services-and-timetabling.md](03-services-and-timetabling.md) | Complete |
| [04-fleet-and-depots.md](04-fleet-and-depots.md) | Complete |
| [05-passengers-and-demand.md](05-passengers-and-demand.md) | Complete |
| [06-economy-and-progression.md](06-economy-and-progression.md) | Complete |
| `07-interface-and-player-experience.md` | Not written. Next once the audit repairs finish |
| [08-simulation-architecture-and-saves.md](08-simulation-architecture-and-saves.md) | Complete. Taken ahead of 07 deliberately, because it could have invalidated the others |
| `09-first-playable-and-validation.md` | Not written — take last |

Git: nothing committed. `plans/` and `reports/v1-plan-audit-2026-09-21.md` are untracked and are the only changes in the working tree. **No source file has been modified**, so the test suite (66 node tests plus Playwright) was never run — there was nothing to run it against.

## The audit repair pass — read this before plan 07

`reports/v1-plan-audit-2026-09-21.md` is an advisory audit of plans 00–06 and 08. It raised six blocking findings, six high ones, and six smaller consistency repairs. The user chose to resolve it **before** drafting plan 07, and to decide each finding individually rather than adopting the recommendations wholesale.

**All six blocking findings are settled and written in.** Two reversed earlier decisions, so read the plan text rather than assuming the old rule:

1. **Saves now restore the session exactly** (08). This reverses “saves hold authored state only” and removes the live-state exception. Travellers, loads, occupancy, mileage, ledger and generator state all persist. The surviving test is **visible against invisible**: recompute only what the player cannot detect being rebuilt. NIMBY Rails was the user's named reference. The costs are written up rather than minimised.
2. **Travellers are persisted, not resampled** (05, 08). The audit showed the discontinuity was never confined to passengers, because plan 02's dwell depends on passenger exchange and plan 06's revenue on journeys.
3. **Undo is bounded to a paused editing session** (08). The stack clears on resume, load and publication. This narrows the earlier unbounded snapshot stack.
4. **A weighted traveller splits on partial boarding** (05, 08). Three board, seventeen wait. A merge rule and a minimum weight are now required and are open questions, not optional refinements.
5. **The published timetable decides single-track contention** (02): planned meet, then earlier scheduled path, then trip identity. Lateness never rewrites the plan. Atomic reservation, whole-train clearance and release rules are named as what the deadlock-freedom claim still needs.
6. **Departures carry a trip-and-week-occurrence identity** (03), so publishing mid-week never double-fires a retimed departure and never fires one whose time has passed — those are reported as skipped. Publication also now checks new duties against live train positions, reporting fleet conflicts without blocking.

Two high findings were settled in the same pass: **travellers cost itineraries on published times including the player's allowance**, not the technical minimum (05) — which makes padding a demand lever as well as a punctuality one — and **national performance is a release gate reached through an early synthetic probe**, not a precondition for writing the first simulation (08 closing paragraph).

**Four high findings remain**, each needing a decision round:

- **Served-area budget** (05): the aggregate-flows fallback does little if travellers outside the served area never existed. Budget routing and traveller counts explicitly before changing the model.
- **Performance targets** (08): no step size and no benchmark hardware, so the figures cannot establish feasibility. One worker also runs a 15-second validation that would stall its own simulation.
- **Borrowing traps** (06): zero-revenue startup and a structurally loss-making network can both become unrecoverable. Needs explicit scenario capital, negative-balance behaviour, and a demonstrated recovery path.
- **Service-due and siding capacity** (04): whether a servicing-only empty movement is allowed, and whether a siding holds one train or several by total usable length — the prose and the acceptance example do not currently agree.

The **six smaller consistency repairs** in the audit's second section are also still open. They are narrow enough to decide without a full round.

The “agent” to “traveller” rename is **done** — 93 occurrences across 00, 01, 05 and 08. This file's “next agent” reference means an AI agent and was deliberately left alone.

## How to work on this — read this before drafting anything

The user's standing instruction, recorded in memory as `planning-docs-discussion-first`:

> **Settle the blocking decisions with the user via questions before drafting. Do not draft with assumed answers.**

Asked directly, they chose this over "draft with my recommendations, you revise." The reason matters: these documents get cited as settled by later plans, so a decision you quietly assumed propagates into other documents as though the user made it.

The method that has worked for five documents:

1. **Ground in the code first.** Read the relevant modules and report what the prototype already does, including what it does *wrong*. This has repeatedly changed the decisions — the euro/SEK magnitude analysis, the winner-take-all mode choice, the missing clock. Do not skip it.
2. **Batch decisions into rounds of up to four questions**, each with a recommended option and the trade-off stated plainly, including the cost of the recommendation.
3. **Expect to be overridden.** The user has picked against the recommendation three times (individual travellers, population-only attraction, refusing legacy saves). Record their choice faithfully, including the argument *for* it, and state the accepted cost plainly rather than minimising it.
4. **Expect qualifying instructions alongside a choice.** "Hourly profiles, but they don't need to be super strict" changed the demand model, not just the wording. Read the whole answer.
5. **Decide the small things yourself** and mark them as your own call in the document.

## Document conventions in use

Follow these; the set reads as one voice and should stay that way.

- **Structure** follows the roadmap's nine-point checklist: Status, Goals, Agreed direction (with "Requirements inherited from the game vision" first), Existing functionality and gaps, Player workflow, Minimum data and interface changes, Open questions, Dependencies, Acceptance scenarios (as a table), Deferred features and planning boundaries.
- **The Status line names what is settled in kind and what remains open.** Every document ends with a paragraph restating that it authorises no application changes and naming what must be resolved first.
- **Numerical figures are marked "proposed and indicative"** with an explicit instruction not to treat the table as data. Plans 04 and 06 both do this.
- **The "intended extension" pattern**: when a simplification might not hold, name the specific extension to reach for rather than pre-building it. Plan 02 started it (per-approach terminus limits), 04 and 05 reuse it.
- **Deferred features are a real boundary**, phrased as prohibitions, so nothing silently expands v1.
- **Cross-references get updated when a plan completes.** Change the dependency bullet in every plan that referenced it from a forward-looking description to "now written" plus what it settled, strike through any open question it resolved, add a "Settled in the X plan" block to the vision, and update the roadmap's status line, table row, and next-discussion pointer.
- **Links**: plan-to-plan is a bare filename; plan-to-source is `../../src/file.ts`. Em dashes, not hyphens, for parenthetical breaks. British spelling.
- **Editing mechanic**: the docs are long, so edits are done with a small Python script asserting `s.count(old) == 1` before each replacement. Write the script to the scratchpad and run it; a bash heredoc broke once on quoting. This catches typos in the match string instead of silently doing nothing.

## What's next: plan 07, interface and player experience

It is the last subsystem plan and carries a backlog from all six others. The requirements already assigned to it:

- **From 02:** simple counts-and-lengths construction controls, affected-service previews before an edit, named delay causes on waiting trains, the time-distance diagram of planned against actual, assisted passing advice that stays reviewable without exposing signalling.
- **From 03:** the timetable editor form (table? graphical diagram? both?), map route selection, pattern generation controls, how a detached trip is marked, conflict presentation, duty building and the fleet requirement before any trains are owned, assistance suggestions as reviewable diffs.
- **From 04:** catalogue browser, fleet and depot panels, duty assignment presentation, named assignment failures, usable siding length shown against drawn length.
- **From 05:** the three demand layers kept visually distinct and never conflated, load and demand overlays, the traveller inspector showing chosen and rejected itineraries with cost components, named causes for lost demand, forecast-versus-actual comparison.
- **From 06:** cost previews at build time including the recurring commitment a build adds, the weekly statement by category, the contract browser, borrowing controls, attribution of a bad week to a cause.
- **From 08:** pending tier-2 validation shown as pending rather than clean, effective simulation rate when it falls short of requested, undo, and save failures named specifically with the file left intact.
- **Its own:** map hierarchy at national through station zoom, time controls, onboarding, accessibility.

Likely blocking decisions to put to the user: whether the timetable editor is primarily a table or a time-distance graph; whether the map is the primary surface with panels over it or a set of distinct screens; how the three demand layers are visually separated; how much of the network a time-distance diagram covers at once (plan 02 left this open); and the onboarding approach given how much the game now contains.

Then **09 last** — it selects a bounded first-playable slice from what the other plans settled rather than deciding anything new. The vision proposes a corridor with a regional and an express sharing stations, a single-track section and a passing loop. Plan 08's "corridor" performance scenario is already sized for it and must be the first target to hold.

## Loose ends

**Four calibration tasks**, each too narrow for a full planning discussion but none of them done:

1. Plan 04's train catalogue figures need verification against documented sources, then balancing. Capacity is least certain; acceleration and braking are most consequential, since plan 02's running times *and* separation distances both depend on them.
2. Plan 02's separation formulae — braking distance and safety margin — can now be written against plan 04's braking rates.
3. Plan 05's coefficients: attraction exponent, distance decay, value of time per purpose, transfer and crowding penalties, logit scale. The model's behaviour depends on these more than on its structure.
4. Plan 06's cost figures need sourcing from Swedish evidence.

**Plan 08's performance targets cannot be validated by discussion at all.** They need an implementation to measure against. If the national scenario proves unreachable, plan 05's aggregate-flows-outside-the-served-area fallback is the first response — not abandoning the worker boundary.

**The “agent” rename is closed.** The user confirmed it: plan 05's demand unit is now a “traveller” throughout, and plan 05's status line records why the term changed.

## Code-level findings the plans recorded

These are real defects and debts found while grounding, all written into the relevant plan. None has been fixed — no source file was touched.

- **[App.tsx](../../src/App.tsx) must be broken up before the worker boundary can exist** (plan 08). 1,476 lines owning project state, cost computation, editing intent, catchment orchestration and interface state together.
- **[persistence.ts](../../src/persistence.ts) silently discards data.** The `legacyStations` path drops *every* station in a save when it finds one missing `corridorId`, and loads the rest. A player has no way to know or recover. Plan 08 forbids this pattern outright: refuse, name the incompatibility, leave the file untouched.
- **`coveredJourney` in [planning.ts](../../src/planning.ts) must be deleted, not corrected** (plans 05 and 08). It derives journey time from section `maxSpeedKph` alone — no acceleration, no dwells, no train type — and is optimistic in a way that would systematically overstate demand. Plan 02 mandates one shared closed-form running time.
- **`serviceOpportunities` takes `departuresPerDay` as direct input** (default 8). Must read frequency from the published timetable; the input survives only as a labelled what-if.
- **`sqrt(reachA · reachB)`** treats both trip ends as homes. Plan 05 makes it directional and superlinear.
- **Station cost is inline at [App.tsx](../../src/App.tsx)** as `length × platforms × 2500` with its own rebuild logic; belongs in the cost module (plan 06).
- **Depot sidings are free.** `applyDepot` charges only demolished building acquisitions (plan 06).
- **`money` and `compactMoney` hardcode `EUR` and `€`.** Becoming SEK is the smallest part of that change; see plan 06 on why relabelling is not viable.
- **localStorage is the save store** and caps around 5 MB. A national published week will approach it with no graceful failure. Plan 08 moves saves to IndexedDB.
- **`DEMO_BUDGET` is a module constant** compared against a never-decreasing `spent`. Plan 06 replaces it with an account; opening capital should probably be scenario state.

The existing code is generally good and the plans say so where true — [catchment.ts](../../src/catchment.ts)'s access model is kept nearly intact, [cost.ts](../../src/cost.ts)'s structure is kept and only its magnitudes replaced, and `persistence.ts`'s field-by-field validation of untrusted save data is held up as the standard for new persisted types.

## One audit already done

Plans 00–03 were audited for inconsistencies before plan 04 was written; nine were found and fixed. Worth knowing so you don't re-derive them: the allowance-below-minimum contradiction, depot electrification being settled and open simultaneously, platform-assignment stability, the missing "slow" call type, duty-to-train ownership, unvalidated loop holding length, ambiguous length checks, and two smaller wording issues. A similar audit across 04–08 before starting 09 would be reasonable — the set has roughly doubled in size since.
