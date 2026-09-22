# V1 simulation architecture and saves

Status: agreed direction from the simulation architecture planning discussion, not an implementation specification. The simulation's home, time model, persistence boundary, autosave behaviour, undo scope, validation tiering, and performance target structure are settled in kind. The persistence boundary and the undo scope were both revised after the 21 September audit, and each revision is recorded below alongside the position it replaces. The target figures themselves are proposed, and the subsystem interfaces are named rather than specified.

This document records determinations made using the [game vision](00-game-vision.md), the [development plan roadmap](01-development-plan-roadmap.md), and the subsystem plans [02](02-infrastructure-and-operations.md), [03](03-services-and-timetabling.md), [04](04-fleet-and-depots.md), [05](05-passengers-and-demand.md), and [06](06-economy-and-progression.md).

It is taken ahead of section 07 because every preceding plan has deferred something here, and two of those deferrals are load-bearing: plan 05's individual travellers and plan 03's continuous incremental validation have both been agreed without a cost budget. This is the only document that can say whether the agreed direction is affordable.

It also resolves plan 05's open question about whether a traveller is one person or one person carrying a weight.

## Goals

Give the agreed subsystems somewhere to run, a consistent notion of time, a save format that survives the game growing, and numbers that say whether any of it is fast enough.

Success means the simulation can be made national in scale without the map stalling, a save written today still loads after the next three plans are implemented, and a performance claim can be tested rather than asserted.

## The problem this plan is solving

The prototype has no architecture a simulation could live in. This is worth stating plainly, because the preceding plans have been written as though one existed.

- **There is no clock.** No timers, no `requestAnimationFrame`, no `performance.now`. The only `Worker` in the codebase is maplibre's tile worker in [`MapView.tsx`](../../src/MapView.tsx). Nothing in the application advances or measures time.
- **State is a React value.** [`App.tsx`](../../src/App.tsx) is 1,476 lines holding one immutable `Project` in `useState`, replaced wholesale on every edit, with all derived state recomputed by `useMemo`. Every value in the application is a pure function of `project`.

That is a sound *rendering* architecture and a poor *simulation* one. It works precisely because nothing has state of its own: trains, reservations, travellers, a ledger, and a clock all do, and none of them can live in a `useMemo`.

The existing code already shows the pattern worth generalising, however. [`App.tsx`](../../src/App.tsx) separates `catchmentGeometryKey` from `catchmentNamesKey` so that renaming a station relabels coverage cells without recomputing catchments. That is exactly the discipline the rest of this plan formalises: expensive derived state, keyed narrowly on what actually affects it.

## Agreed direction

### The simulation lives in a Web Worker

One worker owns all simulation state: the clock, the operational infrastructure graph, train positions and reservations, track and platform occupancy, passenger travellers, and the financial ledger. React owns the interface, the map, and editing intent, and nothing else.

Communication is **commands in, snapshots out**. The main thread sends intents — apply this edit, publish this draft, set this fare, run at this rate — and receives render snapshots. It never reaches into simulation state.

The reason is plan 05 and plan 03 together. A traveller batch or a network-wide validation pass on the main thread would stall the map, and both are things the player triggers constantly by editing. A worker also forces the subsystem boundary the plans keep implying but nothing currently enforces: with commands and snapshots as the only channel, a component cannot quietly depend on simulation internals.

The costs are real and accepted: snapshot serialisation, no direct state access from components, and debugging across a thread boundary.

Snapshots are **viewport-scoped and rate-limited**. The worker sends what is being rendered at the rate the display needs, not the whole simulation every step. A national network with thousands of travellers must never serialise all of them to draw a corridor.

### Fixed timestep, decoupled from rendering

Simulated time advances in constant increments, accumulated against real elapsed time. Rendering interpolates between steps; it never drives them.

**Fast-forward runs more steps per frame, never larger steps.** A larger step would change movement and separation outcomes with the rate control, which would make the simulation's behaviour a function of how fast the player was watching.

Discrete-event simulation was considered seriously and rejected. It is genuinely tempting: plan 02's closed-form speed profile yields exact arrival times, so the simulation could skip empty time and fast-forward almost free. But plan 02's moving-block separation is continuous — a train closing on a slower one ahead has no discrete event to jump to — so a stepped fallback would be needed anyway, and maintaining both is worse than maintaining one.

If the worker cannot sustain the requested rate, it reports a **reduced effective rate** rather than silently falling behind. The player is told the simulation is running at less than the rate they asked for; time never drifts out of step with what is displayed.

### Determinism is a requirement, not a property

The same save, the same seed, and the same inputs must produce the same outcome. Plan 05's travellers are stochastic and plan 02's track tie-break prefers stability, so determinism is what makes both reproducible and testable.

This constrains implementation in specific ways: a seeded generator rather than `Math.random`, no dependence on wall-clock time inside simulation logic, and no dependence on object key iteration order where it affects outcomes — anything order-sensitive iterates a sorted or explicitly ordered collection.

Determinism is testable, and a same-seed-same-outcome test should exist from the first simulation commit rather than being retrofitted.

### A save restores the session exactly

Reloading a save puts the player back where they were, with nothing quietly reset. The clock, running trips, train positions and speeds, occupancy and reservations, onboard loads, travellers and their chosen itineraries, owned trains and accumulated mileage, servicing progress, the ledger and balance, contract progress, reliability records, and the random generator's state all persist alongside authored state.

**This reverses the position this document originally took.** The earlier rule was authored state only — infrastructure, services, timetables, duties, fleet, fares and contracts — with everything else recomputed on load, and a deliberately narrow exception persisting the clock, running trips and train positions. Travellers were to be resampled. That rule was chosen for honesty: a cached derived value is a chance for a save to disagree with the code that produced it, and that class of bug is subtle and long-lived.

It was overridden on the player's requirement, and the argument for the override is the stronger one. A save that resamples passengers, or rebuilds a number the player was watching, is not the same session — and this is a game in which a player diagnoses a bad week across several sittings. NIMBY Rails is the named reference: you reload and you are where you were. The 21 September audit reached the same conclusion from the other direction, observing that plan 02 makes dwell depend on passenger exchange and plan 06 earns fares from journeys, so resampled passengers change train timing and revenue rather than only the passengers.

The distinction that survives is **visible against invisible**. State may be recomputed on load only where the player cannot detect that it was: catchments, map geometry caches, the unpinned platform assignments plan 03 already declares derived, and forecasts and statements that are pure functions of what was saved. Anything a player could watch change across a reload is persisted. When in doubt, persist it.

#### The accepted costs

These are real, and they are accepted rather than minimised.

- **Saves are much larger.** A national network mid-week carries travellers, occupancy and accumulated history as well as authored state. This makes the move to IndexedDB below a requirement rather than a precaution, and it raises the quota and eviction risk that section names.
- **Every new piece of simulation state becomes a persistence decision.** Adding a field to a train or a traveller now means adding it to the format and to the migration chain. The authored-only rule made that automatic; this one does not.
- **The stale-value bug class returns.** A save can hold a value the current code would compute differently. The mitigation is the visible-against-invisible test above, applied deliberately rather than by default, together with the field-by-field validation of untrusted save data that [`persistence.ts`](../../src/persistence.ts) already does well.
- **Migrations break more often.** A format covering live simulation state is far more volatile during development than one covering authored state alone. This makes the migration policy question below more pressing, not less.

Deterministic replay from the week start was considered as an alternative — save a clock and a seed, replay forward — and rejected: replaying days of fixed timesteps on load could take a long time, and it would promote strict determinism from a valuable property to a hard correctness requirement for loading a file at all.

### Versioning, and no silent data loss

The save carries a version integer, with an explicit migration chain between versions and a clear refusal when no path exists. Plan 06's refusal of pre-SEK saves is the first such boundary, and the format should expect more.

The `networkKey` check is kept: a save is tied to the region data snapshot it was built against, which is correct, because positions along corridors are meaningless against different geometry.

One existing behaviour is explicitly **not** carried forward. [`persistence.ts`](../../src/persistence.ts) contains a `legacyStations` path that, on encountering stations without a `corridorId`, silently discards every station in the save and loads the rest. Silent data loss is worse than refusal: a player who loads a save and finds their stations gone has no way to know it happened or to recover. Any future incompatibility must refuse, name what is incompatible, and leave the file untouched.

The rest of that module's approach is kept and extended. Its field-by-field validation of untrusted save data is thorough and correct in spirit, and the same standard should apply to every new persisted type.

**Storage moves to IndexedDB.** A single localStorage key is the current mechanism, and localStorage is typically limited to around 5 MB of string data. A national network with a published week of some thousands of trips plus duties and contracts will approach or exceed that, and localStorage offers no way to fail gracefully when it does. Authored-state-only saves help but do not remove the risk. localStorage is kept for interface preferences only.

**Import and export** of a save as a file is required by the roadmap and is straightforward once the format is explicit: the same serialised state the store holds, written to and read from a file, with the same version gate and the same refusal behaviour. Export is also the player's independent backup against quota and eviction, which matters more now that saves are larger.

### Autosave into a separate recovery slot

Autosave runs on a timer and at significant moments — publishing a timetable, applying a construction edit, closing a week — into a rotating recovery slot that is **distinct from manual saves**. A recovery autosave never overwrites a save the player deliberately made.

If a session ends unexpectedly, the recovery slot is offered on next launch as a choice rather than loaded automatically.

### Undo is bounded to a paused editing session

Before each edit, a snapshot of authored state is pushed to a stack; undo pops it. This covers construction, services, timetable, duties, fleet and fares uniformly, rather than construction alone as the roadmap literally asks. It avoids the failure mode of inverse-operation undo, where a missing or wrong inverse is silent corruption rather than a visible bug.

**Undo is available only while the simulation is paused, and the stack is cleared on resume, on load, and on publication.** This narrows what this document originally said, which was one snapshot stack over all authored state with no session boundary.

The reason is that undo over a running railway is not well defined. Restoring an earlier balance would erase revenue the trains have since earned. Restoring earlier infrastructure could strand a train on track that no longer exists. Restoring an earlier published week would contradict trips already running against the current one. Each of those has a conceivable repair, and each repair is a source of invariant violations found late — which is the audit's objection, and it is correct. Bounding undo to a paused session removes the class rather than managing it. Plan 02 already requires a pause to edit infrastructure, so this extends an existing constraint rather than inventing one.

The accepted cost is that there is no undo once the railway is running. A mistake made during operation is corrected by editing rather than by undoing, and a player who wants the stack back must pause.

Depth is bounded, and the bound is a memory decision against the scenario sizes below. Snapshots are cheap because `Project` is already an immutable object replaced wholesale on every edit, so a snapshot is a reference rather than a copy — but, as the audit notes, a reference still retains everything it points at, so a deep stack over large authored state is not free.

### Validation is tiered

Plan 03 agreed continuous incremental validation without a cost. It is tiered:

- **Tier 1, immediate, on every edit, within a stated time budget.** Structurally local checks: running-time allowances below the technical minimum, duty continuity and turnaround, routes broken by infrastructure edits, pinned platforms that cannot be satisfied, electrification and length incompatibility, and fleet assignment feasibility. These depend on the edited object and its immediate neighbours, so their cost scales with the edit rather than the network.
- **Tier 2, debounced or on explicit request.** Network-wide analysis: headway and separation conflicts between trips, track and platform occupancy across the whole week, and meets and overtakes made impractical by times.
- **Publication always forces a full pass.** Plan 03 requires publication to report structural invalidity clearly, so it may not rely on a debounced tier having run.

The tiers must not disagree. A conflict tier 1 could have found must not be reported only by tier 2, or the player will trust an incomplete picture; the split is by scope of analysis, not by thoroughness within that scope.

Where tier 2 has not yet run, the interface must show that network-wide checking is pending rather than implying the draft is clean. Presentation is plan 07's, but the requirement is this plan's.

### One movement function, one occupancy model

The vision's shared prediction requirement and plan 02's closed-form speed profile mean the technical minimum running time is a single function used by tier 1 validation, tier 2 validation, forecast demand, and live operation alike.

This is an architectural constraint, not merely a tidiness preference: two implementations that agree today will diverge, and plan 03's entire authoring model rests on the authored allowance being compared against the same minimum the train will actually achieve. The same applies to occupancy and separation.

This is also why [`planning.ts`](../../src/planning.ts)'s `coveredJourney` must be deleted rather than corrected, as plan 05 requires. A second journey-time implementation is the exact thing this constraint forbids.

### Travellers carry a weight when the budget binds

Plan 05 left open whether one traveller is one person or one person scaled by a weight. It is resolved here, because it is a performance decision.

A traveller carries a **weight**, normally one. When the live traveller budget would be exceeded, the sampling rate is reduced and weights scale up correspondingly, so demand, revenue and load totals stay correct while the number of simulated objects stays bounded. Weight is a property of the traveller from the outset rather than a mode the simulation switches into, so no code path exists that assumes a weight of one.

Plan 05's deferral of party travel is unaffected: a weighted traveller represents a sampling ratio, not a family travelling together, and it makes one decision rather than several.

#### A weighted traveller splits when a train fills

Plan 05 makes capacity a hard limit, and a traveller weighted twenty cannot board a train with three seats left. **It splits.** Three board as a weight-three traveller; seventeen remain as a weight-seventeen traveller that waits for the next acceptable service or abandons under plan 05's existing rule. People are conserved exactly, capacity stays literally hard, and denied boardings stay accurate instead of being rounded up to whole sampling groups.

The cost is that splitting raises the traveller count at exactly the crowded moments weighting exists to bound. A **merge rule is therefore required**, not optional: travellers waiting at the same place with the same destination, purpose and acceptable-service set recombine rather than accumulating, and a minimum weight exists below which a traveller does not split further. Both figures belong to the traveller budget question below.

Splitting is a capacity mechanism and nothing more — my own call, recorded here so it is not read more widely later. Where a weighted traveller's members might rationally diverge, plan 05's probabilistic choice is still drawn once for the whole weight, and the whole weight moves together. Splitting does not re-introduce per-person decisions through the back door.

### Subsystem boundaries

The minimum split, named rather than specified:

| Owner | Holds |
| --- | --- |
| Worker: infrastructure | Operational track graph, connections, usable lengths, occupancy, reservations |
| Worker: operations | Clock, train positions, movement, separation, delays, named blockers |
| Worker: timetable | Draft and published weeks, patterns, trips, arrangements, duties, validation |
| Worker: fleet | Train catalogue, owned trains, stabling, distance accumulation, servicing |
| Worker: demand | Traveller sampling, itinerary search, boarding, reliability records |
| Worker: economy | Ledger, balance, loans, fares, contracts, statements |
| Main thread | React interface, map rendering, editing intent, presentation of snapshots |

Extracting this from [`App.tsx`](../../src/App.tsx) is a prerequisite rather than a later refactor. That file currently owns project state, cost computation, editing intent, catchment orchestration and interface state together; the boundary above cannot be introduced while it does.

### Performance targets

Three named scenarios with explicit budgets, so the plans' cost questions have numbers rather than opinions. Sizes and budgets are **proposed** and need validating against a real implementation.

| | Corridor | Regional | National |
| --- | --- | --- | --- |
| Route length | ~100 km | ~600 km | ~5,000 km |
| Stations | 4 | 30 | 200 |
| Depots | 1 | 4 | 20 |
| Services | 2 | 12 | 60 |
| Trips per week | ~100 | ~1,500 | ~12,000 |
| Trains | 10 | 80 | 500 |
| Render | 60 fps | 60 fps | 30 fps minimum |
| Simulation step at 1× | < 2 ms | < 8 ms | < 25 ms |
| Sustained fast-forward | ≥ 200× | ≥ 120× | ≥ 60× |
| Tier 1 validation | < 16 ms | < 50 ms | < 200 ms |
| Tier 2 validation | < 500 ms | < 2 s | < 15 s |
| Load, including derivation | < 1 s | < 3 s | < 10 s |

The corridor scenario is plan 09's first playable and must hold first. The national scenario is the one that decides whether the agreed direction survives; if it cannot be met, plan 05's fallback to aggregate flows outside the served area is the first thing to reach for, before anything structural is reconsidered.

Targets belong in automated tests against fixture scenarios, alongside the existing 66 unit tests and the Playwright end-to-end suite, so a regression fails a build rather than being noticed later.

## Existing functionality and gaps

The prototype has manual whole-project save and load to one localStorage key, with thorough field validation, a version gate, and a region-snapshot check. It has an immutable project value, memoised derived state, and one narrowly-keyed expensive computation already tuned for edit responsiveness.

It has no clock, no worker of its own, no simulation state, no autosave, no undo, no import or export, no migration chain, and no performance test. Save validation contains one silent data-loss path. All application state and much application logic sit in a single 1,476-line component file.

Nothing in the save format anticipates services, timetables, fleet, demand, or finance, which is every plan from 03 onward.

## Player workflow

Architecture is mostly invisible, but some of it is not:

1. Edit and see conflict markers appear immediately, with network-wide checking shown as pending until it completes.
2. Run, pause, and fast-forward, and be told when the simulation cannot sustain the requested rate rather than silently drifting.
3. Pause, undo an edit — construction, timetable or fleet — and get the previous authored state back, understanding that resuming ends that undo session.
4. Save and load deliberately, export a save to a file, and import one, and find the railway exactly as it was left.
5. Be offered a recovery autosave after an unexpected end, as a choice.
6. Be told clearly and specifically when a save cannot be loaded, with the file left intact.

## Minimum data and interface changes

- **Worker boundary:** a command protocol for editing intent and rate control, and a snapshot protocol that is viewport-scoped and rate-limited.
- **Clock:** fixed step size, accumulator, rate control, and reported effective rate.
- **Determinism:** a seeded generator threaded through everything stochastic, and ordered iteration wherever order affects outcome.
- **Authored state:** one serialisable definition of everything the player wrote, across all subsystems, as the save's contents and the undo stack's element.
- **Persisted live state:** clock, running trips, train positions and speeds, occupancy and reservations, onboard loads, travellers and their itineraries, mileage and servicing progress, ledger and contract progress, reliability records, and generator state.
- **Save store:** IndexedDB for saves, localStorage for preferences only, with file import and export over the same serialised form.
- **Versioning:** a version integer, a migration chain, and refusal that names the incompatibility without touching the file.
- **Undo stack:** bounded snapshots of authored state, live only while paused and cleared on resume, load and publication.
- **Validation tiers:** a tier assignment per check, a time budget per tier, pending state for tier 2, and a forced full pass on publication.
- **Performance fixtures:** the three scenarios as test fixtures with asserted budgets.
- **Extraction from `App.tsx`:** project state, cost computation, and catchment orchestration moved out before the boundary can exist.

## Open questions

- **Step size:** the fixed step in simulated seconds, and whether separation and moving-block following are stable at the largest step that meets the budgets.
- **Snapshot design:** what a snapshot contains, how viewport scoping interacts with a time-distance diagram spanning a corridor, and whether transferable buffers are needed.
- **Target validity:** every figure in the scenario table, and whether the national scenario is achievable at all with individual travellers.
- **Traveller budget:** the live traveller cap, how sampling weight is chosen and adjusted without demand appearing to jump, and the two figures the splitting rule requires — the merge condition and the minimum weight below which a traveller does not split.
- **Tier 2 trigger:** debounce interval, whether it runs speculatively during idle time, and how a long pass is cancelled when the player edits again.
- **Load-time derivation:** which values pass the visible-against-invisible test and may therefore be recomputed at all, whether recomputing catchments and validation on load fits the load budget, and what may be deferred until after the interface is interactive.
- **Undo depth:** the bound, now that the stack's lifetime is a paused editing session rather than the whole game.
- **Worker and map interaction:** whether the map needs simulation data at a rate that makes snapshot cost dominant, which would argue for shared memory.
- **Migration policy:** how long backward compatibility is maintained during v1 development, when saves are expected to break, and whether that is acceptable pre-release. Persisting live state sharpens this: the format now moves whenever the simulation does.
- **Multiple save slots:** whether the single-key model becomes named slots, which the roadmap does not require but IndexedDB makes easy.
- **Save size and write failure:** what a national mid-week save actually costs, and what the game does when a write is refused on quota — a question the authored-only rule made remote enough to leave alone.

## Dependencies

- **Infrastructure and operations (02):** the shared movement function and occupancy model this plan requires be singular; the pause-to-edit rule the worker must quiesce for.
- **Services and timetabling (03):** continuous incremental validation, now tiered with a budget; draft and published weeks as authored state; the week wrap the clock and statement follow.
- **Fleet and depots (04):** owned trains, distance accumulation and servicing, all persisted; the derived-versus-cached depot figures question, resolved here in favour of deriving, because depot capacity recomputes invisibly from the drawn outline.
- **Passengers and demand (05):** traveller sampling and itinerary search as the dominant runtime cost; travellers persisted with the rest of the session rather than resampled; the one-person-versus-weighted question resolved here, with weighted travellers splitting on partial boarding.
- **Economy and progression (06):** ledger and statement derivation; the version gate that refuses pre-SEK saves as the first migration boundary.
- **Interface and player experience (07):** presentation of pending validation, effective simulation rate, undo, and save failures. This plan sets what must be communicated, not how.
- **First playable and validation (09):** the corridor scenario is the first performance target that must hold, and the vehicle for testing the worker boundary end to end.

## Acceptance scenarios

| Scenario | Expected behaviour |
| --- | --- |
| A network-wide validation pass runs while the player pans the map | The map stays responsive, because validation is in the worker. |
| The player fast-forwards a week | More steps run per frame; step size is unchanged and outcomes match running at 1×. |
| The worker cannot sustain the requested rate | A reduced effective rate is reported; simulated time does not drift from what is displayed. |
| The same save is run twice with the same seed | Identical outcomes, including traveller decisions and platform choices. |
| A save is written and reloaded | Everything the player could observe is restored exactly. Only invisibly recomputable values — catchments, map caches, unpinned platform assignments, forecasts and statements — are rebuilt rather than read. |
| A save is taken mid-week and reloaded | The clock, running trips, train positions, onboard loads, travellers and the week's accumulated money and mileage all resume unchanged. There is no observable discontinuity. |
| A save is taken mid-week, reloaded, and run on | Dwell times and recognised revenue follow the same course they would have without the reload, because the passengers driving them were not redrawn. |
| A save from an incompatible version is opened | It is refused, naming the incompatibility, and the file is left untouched. No partial load and no silent discard of any object type. |
| A save exceeds what localStorage would have held | It is stored successfully in IndexedDB. |
| A save is exported and imported | It round-trips through a file with the same version gate and refusal behaviour. |
| A session ends unexpectedly | The recovery autosave is offered on next launch as a choice, and no manual save has been overwritten. |
| The player undoes a timetable edit, then a construction edit | While paused, both revert through one stack over authored state. |
| The player resumes the simulation, then looks for undo | The stack is empty and is shown as such. Resuming ended the editing session; the earlier edits stand and are corrected by editing. |
| The player publishes a draft, then tries to undo it | The stack was cleared on publication. Publication is not reversed by undo. |
| The player edits one trip's dwell | Tier 1 checks complete within budget; network-wide checking is shown as pending. |
| The player publishes a draft | A full validation pass runs regardless of whether tier 2 had completed. |
| A conflict exists that tier 1 covers | It is reported immediately, not only after tier 2 runs. |
| A running time is needed by validation, forecast and operation | All three call the same function; `coveredJourney` no longer exists. |
| The traveller budget would be exceeded | Sampling reduces and weights scale so totals stay correct, with no path assuming a weight of one. |
| A traveller weighted twenty meets a train with three seats free | It splits: three board, seventeen wait or abandon. Twenty people are still accounted for, and three denied boardings are not reported as twenty. |
| Split travellers accumulate on a crowded platform | The merge rule recombines those sharing a destination, purpose and acceptable-service set, so the count stays bounded. |
| The corridor scenario runs | Every budget in its column is met, asserted by an automated test. |
| The national scenario misses a budget | The build fails, and plan 05's aggregate-flow fallback is the first response considered. |

## Deferred features and planning boundaries

- No multiplayer, no server, and no networked state of any kind.
- No discrete-event simulation, and no variable timestep.
- No caching in saves of values that fail the visible-against-invisible test — anything cheaply and invisibly recomputable is recomputed, not stored.
- No per-traveller history beyond the journey in progress, consistent with plan 05. Travellers themselves are persisted; what is not persisted is a past they never had.
- No deterministic replay as a load mechanism, and no replay-based save format.
- No cloud saves, accounts, or cross-device sync.
- No inverse-operation undo, and no redo beyond what the snapshot stack gives.
- No undo of anything that happened while the simulation was running, and no undo across a resume, a load or a publication.
- No shared-memory optimisation in the initial approach, pending the snapshot-cost question.
- No hot-reloading of simulation state, and no in-place upgrade of a running simulation.
- No migration of prototype-era saves, per plan 06.
- No silent tolerance of invalid or partially-readable save data, ever.

This document records the determinations reached so far and does not authorize application changes. Validate the performance targets against a real implementation, settle the step size and snapshot design, and confirm the national scenario is achievable before treating it as implementation-ready — and treat a failure there as a reason to revisit plan 05's sampling, not to abandon the boundary. The audit's warning applies to that last clause: requiring proof of national performance before implementation begins is a loop, because the evidence needs code. Treat it as a release gate reached through an early synthetic scale probe, not as a precondition for writing the first simulation.
