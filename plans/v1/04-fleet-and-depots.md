# V1 fleet and depots

Status: agreed direction from the fleet and depots planning discussion, not an implementation specification. The catalogue shape, storage model, turnaround model, servicing trigger, empty-movement ownership, and duty assignment are settled in kind. Siding capacity and the servicing-only empty movement were settled on 21 September, resolving two findings of that day's audit. The numerical catalogue is proposed and must be verified and balanced before implementation.

This document records determinations made using the [game vision](00-game-vision.md), the [development plan roadmap](01-development-plan-roadmap.md), the [infrastructure and operations plan](02-infrastructure-and-operations.md), and the [services and timetabling plan](03-services-and-timetabling.md).

It supplies what those plans consume and could not settle themselves: plan 02 needs acceleration, braking, length, and traction per train type, and plan 03 needs turnaround, empty movements, and depot access to decide whether a chain of trips is physically workable. Treat this document and plan 02's remaining numerical questions as one discussion, as the roadmap directs.

## Goals

Let players buy trains, stable and service them at depots they have built, and assign each duty to a physical train that can actually work it.

Success means a player can look at a duty and understand why it is or is not workable — this train is too long for that loop, this electric unit cannot reach that unwired depot, this chain leaves four minutes where the type needs six, this train runs out of service interval on Thursday — and can fix it by buying a train, rebuilding a depot, or re-chaining the duty.

The fleet is the constraint that makes a timetable cost something. Without it a player could publish any week at all.

## Agreed direction

### Requirements inherited from the game vision

- Start with purchased preset train types rather than designed or composed trains.
- Assign individual trains to duties: sequences of trips worked by one physical train.
- Account for turnaround, depot storage, and routine servicing.
- Express all purchases and costs in SEK.
- Keep automatic fleet assignment as a later possibility, not a requirement for v1.
- Electric trains require continuous electrification over the whole path, depot access included (plan 02).

### The catalogue is a list of fixed units

A **train type** is a complete, self-contained train with a fixed formation. It has one length, one capacity, one set of performance figures, and one traction type. Players buy whole units.

There are no locomotives, no coaches, and no composition editor. A type that is loco-hauled in reality — the night train — is catalogued as one indivisible unit, because its composition is not the player's business. This is what lets plan 02's constant acceleration and braking rates be authored figures per type rather than quantities derived from power-to-weight.

**Coupling** is the only formation control. Two or three units of the *same* type may be coupled into one train, which then works a duty as a single train: its length is the sum, its capacity is the sum, and its performance figures are those of the single unit. Each type declares the maximum number of units that may be coupled.

Coupling is decided per duty and holds for the whole duty. A train does not couple or split partway through a duty, and units of different types never couple. Dynamic coupling and splitting — joining two portions at a junction station, dividing a train to serve two branches — is deferred.

### The catalogue uses real Swedish classes

Types are named after the real Swedish classes they represent, because the network is Sweden and players who know it should recognise what they are buying.

The figures below are **proposed and indicative**. Every one must be verified against a documented source and then adjusted for game balance before implementation; several are approximations, and capacity in particular depends on interior layout, which varies by operator within a single class. Do not treat this table as data.

| Type | Role | Traction | Cars | Length | Max speed | Seats | Accel | Service brake | Max coupled |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| X11 | Short regional, older and cheap | Electric | 2 | ~49 m | 160 km/h | ~178 | 0.9 m/s² | 1.0 m/s² | 3 |
| X61 | Regional workhorse | Electric | 4 | ~74 m | 160 km/h | ~234 | 1.0 m/s² | 1.0 m/s² | 3 |
| X60 | High-capacity suburban | Electric | 6 | ~107 m | 160 km/h | ~374 | 1.0 m/s² | 1.0 m/s² | 2 |
| Y31 | Regional on unwired lines | Diesel | 2 | ~52 m | 160 km/h | ~116 | 0.8 m/s² | 0.9 m/s² | 3 |
| X40 | Double-deck regional/intercity | Electric | 3 | ~81 m | 200 km/h | ~234 | 0.8 m/s² | 1.0 m/s² | 2 |
| X55 | Intercity | Electric | 4 | ~107 m | 200 km/h | ~245 | 0.7 m/s² | 1.0 m/s² | 2 |
| X2 | Fast intercity, tilting | Electric | 6 | ~140 m | 200 km/h | ~280 | 0.5 m/s² | 0.9 m/s² | 1 |
| Nattåg set | Overnight sleeper | Electric | — | ~250 m | 160 km/h | ~250 berths | 0.35 m/s² | 0.8 m/s² | 1 |

The catalogue deliberately spans a wide range of length and performance, so that the constraints this plan introduces actually bite: the X2 and the sleeper set are long enough to fail short platforms and short loops, the Y31 is the only way to work an unwired line, and the X11 exists to make a cheap thin-demand service viable.

X2's tilting is not modelled. Plan 02 excludes curve modelling, so tilting has nothing to act on; X2 is simply a fast intercity unit with weak acceleration. The class is kept because players expect it, not because it behaves specially.

#### What each type supplies to other plans

- **Plan 02** consumes length, maximum speed, acceleration, and service braking rate for the piecewise speed profile and the technical minimum running time, and traction for the strict electrification check. Braking rate also feeds the moving-block separation distance.
- **Plan 03** consumes length (against platforms and loops), traction, minimum reversal time, and capacity.
- **Plan 05** consumes seated capacity and, for the sleeper, berths.
- **Plan 06** consumes purchase price, and the recurring and per-kilometre costs this plan identifies but does not price.

Plan 02's remaining separation questions — the braking-distance formula and the safety margin — are not settled here. This plan supplies the braking rate those formulae take as input; the formulae themselves remain plan 02's.

### Turnaround is one minimum per type

Each type declares a **minimum reversal time**: the time a train needs at a stop before it can work a trip in the opposite direction. It represents a driver changing ends, and it is one authored number per type.

Plan 03's duty validation checks each consecutive pair of trips in a duty against it, and reports a shortfall as a named quantity — *this chain leaves four minutes, the X55 needs five*. A turnaround gap is not a dwell and is not authored per stop; it is a floor the chain must clear.

Reversal time does not scale with length or coupled unit count, and is not decomposed into crew walk, brake test, and platform release. The single number is what the player reads and the only thing validation needs.

A reversal occupies the platform or track the train stands on for its whole duration, per plan 02's occupancy rules. A short turnaround at a single-platform terminus is therefore a capacity problem as well as a duty problem, and validation reports both.

### Empty movements are derived by the duty

When a duty's chain requires a train to move without working a trip — out of a depot to its first trip, off the network at the end of a duty, or between two trips that do not meet end to end — the game creates an **empty movement** owned by that duty.

An empty movement is a real movement. It is timed by plan 02's technical minimum running time, it occupies track and platforms, it is subject to separation and reservation, and it appears on the time-distance diagram. It is not a time allowance and it is not invisible.

The player does not author empty movements from scratch, but they are visible and adjustable: the player can retime one within the gap available, or reject the chain and build a different duty. This does not breach plan 03's no-automatic-generation rule, which concerns revenue trips and the timetable the player publishes. An empty movement is the mechanical consequence of a chain the player authored, in the same way a derived station time is the consequence of an authored allowance.

An empty movement carries no passengers, earns no revenue, and accrues distance toward servicing.

Where no valid empty movement exists — no path, an unwired route for an electric unit, or not enough time — the chain is invalid and validation names which of those it is.

### Depots are pools of individual sidings

A depot is operationally a set of **sidings**, each with a usable length. A siding holds **any number of trains whose combined length fits within its usable length**, which is how a real stub siding works and what makes the length of a drawn yard matter rather than only its width.

This resolves a contradiction the 21 September audit found: this plan previously said a train occupied one siding entirely, while its own acceptance table already had two trains stabled on one siding. The acceptance table was right.

This follows plan 02's treatment of stations: no throat, no switch geometry, no conflict between simultaneous entry and exit. It also matches what the prototype already derives. [`depotMetrics`](../../src/depots.ts) computes a siding count from the outline width at fixed 6 m spacing with 4 m side clearance, and a usable length from the body length less 4 m. Those derived figures become the real operational resource, so the yard the player draws is the capacity they get.

**Stabling order is not modelled.** A stub siding releases any train on it regardless of arrival order. This is deliberate: enforcing last-in-first-out would create exactly the shunting puzzle the vision's simple-construction promise avoids. The cost is that a yard of long stub sidings is more flexible than its real equivalent.

Consistent with plan 02's terminus note, a per-depot limit on simultaneous conflicting moves is the intended extension if depot capacity proves too generous, rather than modelled switches.

A siding's usable length, like a loop's holding length, is shown alongside the length the player drew, so the difference is never a surprise.

### Depots carry their own electrification

The prototype's `Depot` has no electrification property, while `Section` does. Plan 02 rules that an electric train requires continuous wiring over every part of its path, depot access included, with no exemption for yards. Closing that gap is this plan's responsibility.

A depot is therefore **explicitly wired or not wired**, as a build option with its own cost, covering both its access connection and its sidings. It does not inherit electrification from the section it connects to: a wired main line with an unwired yard beside it is a legitimate and initially cheaper thing to build, and a diesel-only depot is a real choice.

Wiring is all-or-nothing per depot. Individually wired sidings within one yard are not modelled.

An electric train assigned to a duty that stables at an unwired depot is a validation error reported before publication, not a discovery at runtime. This is the case plan 02's acceptance scenarios already name.

### Servicing is triggered by distance

Each type declares a **service interval** in kilometres and a **service duration** in hours. A train accumulates distance from every movement it makes, revenue trips and empty movements alike. When accumulated distance since its last service reaches the interval, the train requires a servicing visit: an unbroken stay of the service duration on a siding at any depot it can reach.

Distance rather than calendar days or running hours, because distance is what makes a long intercity duty genuinely more demanding than a short local one. Days would make an idle train as urgent as a hard-worked one; hours would penalise slow stopping work hardest, which is backwards.

Servicing is a **scheduling problem, not a failure mode**. A train does not break down and there is no reliability simulation. Plan 03's validation reports, over the published week, which trains reach their interval and whether their duty contains a stay long enough to service them.

An overrun blocks that train's **next revenue departure** until it is serviced, and does not interrupt a trip already underway. This follows plan 02's distinction exactly: a future departure may be blocked because the player has until then to fix it, a trip underway may not because there is no point at which they could have.

**One exception: an overrun train may still make an empty movement to a depot that can service it, and nothing else.** Without it a train that comes due far from any depot is stranded, because the run to the depot is itself a departure — which the audit identified. The empty run accrues distance like any other movement, and that further overrun does not re-trigger the block against the movement already under way.

The exception is an escape hatch, not the intended path. Plan 03's validation reports over the published week which trains reach their interval and where, so a player who reads the warning schedules the visit into the duty and never needs it.

Servicing occupies a siding for its whole duration, so a yard with just enough sidings to stable the fleet overnight does not necessarily have enough to service it.

Deeper periodic overhauls, component life, and condition are deferred.

### Purchases

A train is purchased from the catalogue and delivered to a depot the player selects, which must have a free siding it fits within, and must be wired if the type is electric. Delivery is immediate.

Delivery lead time, second-hand stock, leasing, resale value, and availability limits are deferred. Prices, depreciation, and recurring costs are plan 06's; this plan identifies that a type needs a purchase price, a recurring standing cost, and a per-kilometre running cost, and does not set any of them.

A train is an individual object with an identity, a type, an accumulated distance, and a current location. Two X61s are distinguishable, because a duty is assigned to one of them and only one of them is due for service on Thursday.

### Duty assignment belongs to this plan

Plan 03 owns a duty's **shape**: which trips, in which order, with turnaround gaps cleared and empty movements accounted for. This plan owns the **physical train** that works it, and the validation that the assignment is possible.

Plan 03's Duty record does not currently carry a train reference, though it defines a duty as trips worked by one physical train. That reference is added, and the split is named in both documents.

Assignment validation checks:

- the assigned train's type can work every trip in the duty — traction against the route's electrification, and length against every platform and every planned passing loop;
- the train is where the duty starts, reached by a valid empty movement if it is not;
- the duty's reversal gaps clear the type's minimum;
- the duty leaves the train stabled somewhere it fits at the end of the week, and the week wraps consistently with plan 03's seven explicit days;
- the train's service interval is not overrun within the published week without a stay long enough to service it;
- no train is assigned two duties that overlap in time.

A duty with no train assigned is not an error while the draft is being edited. It is a **reported fleet requirement**: plan 03 already promises the player a fleet requirement before any trains are owned, and an unassigned duty is exactly that promise — this week needs one more X61. Publication reports unassigned duties, and their trips do not depart.

Automatic assignment is not part of v1. The data this plan defines is deliberately sufficient for a later solver — a duty's requirements are explicit constraints, not implied by an editor — but nothing in v1 fills them in.

## Existing functionality and gaps

The prototype has editable depot footprints with derived siding count and usable length, depot rail connections including through-depots with a second exit endpoint, and construction and property-acquisition cost estimates for yards.

There is no train catalogue, no owned train, no purchase, no stabling assignment, no distance accumulation, and no servicing. Depot geometry is a construction representation: its derived sidings are drawn but are not operational resources, and nothing occupies them.

`Depot` carries no electrification property, which plan 02's strict rule requires. It also carries cached `tracks` and `lengthMeters` recovered from legacy saves; making those figures operational means deciding that the derived values are authoritative and the cached ones are a migration concern, which belongs to plan 08.

Depot access is currently an approximate connection drawn as a cubic curve to the nearest point on the corridor. Plan 02 warns against assuming every approximate construction connection is a valid train movement path, and depot access is the clearest case: a connection must be resolved into a usable operational path with a speed limit before an empty movement can be timed over it.

## Player workflow

1. Build a depot, seeing the usable siding count and length the drawn footprint yields, and choose whether to wire it.
2. Open the catalogue, compare types by capacity, length, speed, and traction against the services intended, and buy a train, choosing the depot it is delivered to.
3. Chain trips into duties in the timetable workflow (plan 03), reading the reported fleet requirement where duties have no train.
4. Assign a physical train to a duty, and couple units where one is not enough.
5. Read assignment failures as named quantities — the length that does not fit, the wiring that is missing, the minutes the reversal is short, the service overrun on Thursday.
6. Fix by buying a train, rebuilding or wiring a depot, re-chaining the duty, or placing a servicing stay in it.
7. Publish, and watch empty movements and depot arrivals on the map and the time-distance diagram alongside revenue trips.

The catalogue browser, fleet panel, depot panel, and how a duty presents its assignment belong to plan 07.

## Minimum data and interface changes

Planning needs implied by the agreed behaviour, not settled schemas:

- **Train type:** identity, display name, role, traction, car count, length, maximum speed, acceleration, service braking rate, seated capacity and berths, maximum coupled units, minimum reversal time, service interval, and service duration. Static catalogue content, not player-editable.
- **Train:** identity, type, accumulated distance since last service, current location, and stabled siding. Individually identifiable.
- **Coupling:** the units forming one train for one duty, constrained to a single type and the type's maximum.
- **Depot:** an electrification flag, and operational sidings each with a usable length, derived from the existing footprint geometry rather than newly authored. Occupancy is the combined length of the trains on a siding against that usable length.
- **Depot access:** a usable operational path with a speed limit, resolved from the existing approximate connection.
- **Duty:** a train reference, added to plan 03's record, with the ownership split named in both documents.
- **Empty movement:** owning duty, endpoints, derived times, adjustability within its gap, and the occupancy it holds.
- **Servicing:** required visits over the published week, the stays that satisfy them, and overruns that block a next departure.
- **Validation:** assignment failures tied to the duty and train that caused them, each naming the quantity that fails.
- **Interfaces consumed:** technical minimum running time, track, platform and loop occupancy, holding lengths, and strict electrification from plan 02; duty shape, turnaround gaps, and the published week from plan 03.
- **Interfaces produced:** length, performance, and traction to plan 02; reversal minimum, length, traction, and capacity to plan 03; capacity and berths to plan 05; the cost categories a type needs to plan 06.

Persistence, the authority of derived over cached depot figures, and save migration belong to plan 08.

## Open questions

- **Catalogue figures:** every number in the proposed table needs a documented source and then balancing. Capacity by class is the least certain, and acceleration and braking figures are the most consequential, since plan 02's running times and separation distances both depend on them.
- **Catalogue size:** whether eight types is the right initial breadth, and whether the X11 and X2 earn their places once balanced.
- **Coupled performance:** whether a coupled train really performs identically to a single unit, or needs a small penalty. Identical is assumed; it is close enough for multiple units but is an assumption.
- **Sleeper capacity:** how berths relate to seats for plan 05's demand and plan 06's revenue, and whether a berth is simply a more expensive seat. Plan 05 treats berths as a distinct capacity consumed by its overnight-suited purposes.
- **Servicing values:** the interval and duration per type, and whether one interval per type is enough or servicing needs light and heavy kinds.
- **Servicing location:** whether any depot can service any type, or whether servicing capability is a depot property the player builds and pays for.
- **Depot access speed:** the speed limit over a depot connection, and how it differs from a running line for plan 02's separation and reservation purposes. Plan 02 lists this as open and it remains open; this plan only establishes that the connection must resolve to a real path.
- **Stabling assignment:** whether the player assigns a train to a specific siding or the game packs them, and if the game packs them, how stable that packing is between validations. Capacity by combined length makes this a packing problem rather than a count, which sharpens the question — an unstable packing would make depot capacity appear to fluctuate between validations.
- **Through-depot use:** whether a depot's second exit makes it usable as a through route, and whether an empty movement may pass through a yard rather than terminating in it.
- **Fleet requirement reporting:** how an unassigned duty's requirement is expressed — a type, a capability, or a capacity — before any train exists to satisfy it.
- **Coupling granularity:** whether coupling is truly fixed for a whole duty, or whether a peak-only strengthening duty is common enough to need mid-duty joining sooner than deferral assumes.

## Dependencies

- **Infrastructure and operations (02):** consumes this plan's length, performance, and traction for movement, separation, and electrification; supplies running times, occupancy, holding lengths, and the blocked-departure rule this plan follows for service overruns. Plan 02's separation formulae take this plan's braking rates as input.
- **Services and timetabling (03):** supplies duty shape, turnaround gaps, and the published week; consumes this plan's reversal minimum, length, traction, and capacity, and gains a train reference on its Duty record. Publication there now checks newly published duties against where trains actually are, so a duty demanding a unit still working an old trip is reported at publication and, if published anyway, held at runtime with the blocking train named. The validation is this plan's; the reporting moment is 03's.
- **Passengers and demand (05):** now written. It consumes seated capacity, berths, and coupled-unit capacity as a hard boarding limit, so a train too short for its demand denies boarding rather than absorbing it. Whether a type also needs a crush capacity above its seat count is open there.
- **Economy and progression (06):** now written, and revised on 21 September. It prices the purchase, standing, and per-kilometre categories this plan identified, and charges depot construction for its sidings as well as its land. Bounded borrowing was removed there, so nothing limits the purchase of a train except the player's willingness to carry debt. Whether per-kilometre running cost differs by type is open there.
- **Interface and player experience (07):** the catalogue browser, fleet and depot panels, duty assignment presentation, and how a named assignment failure is shown.
- **Simulation architecture and saves (08):** now written, and revised after the 21 September audit. Train state and distance accumulation live in the worker and are persisted with the rest of the session, so accumulated mileage and servicing progress survive a reload rather than being reconstructed. The derived-versus-cached depot figures question is resolved there in favour of deriving, because depot capacity recomputes from the drawn outline invisibly — which is the test that plan now applies to everything it declines to persist.
- **First playable and validation (09):** the corridor scenario needs at least a regional and an intercity type, one depot, and duties that exercise turnaround, stabling, and a servicing visit.

## Acceptance scenarios

Numerical expectations must be added once the catalogue figures are verified and balanced.

| Scenario | Expected behaviour |
| --- | --- |
| Player buys a train | A distinguishable individual train exists, of a catalogue type, delivered to a chosen depot with a free siding it fits within. |
| Player buys an electric train and selects an unwired depot | The delivery is refused, naming the missing wiring, rather than delivering a train that cannot move. |
| Player couples two X61s for a duty | The train's length and capacity are the sum; its acceleration, braking, and maximum speed are the single unit's; the coupling holds for the whole duty. |
| Player tries to couple an X61 to an X40 | Refused: only units of the same type couple. |
| Player assigns an X2 to a duty calling at a station with shorter platforms | The duty is valid and the stop happens, with plan 02's overhang dwell penalty; length does not invalidate a platform stop. |
| Player assigns an X2 to a duty whose planned meet is at a loop shorter than the train | The assignment is invalid before publication, naming the loop and the holding length, rather than failing at runtime. |
| Player assigns an electric unit to a duty stabling at an unwired depot | Validation reports it before publication, per plan 02's electrification scenario. |
| A duty's consecutive trips leave less than the type's minimum reversal time | The duty is flagged with the shortfall as a named quantity, before publication. |
| A duty requires a train to reach its first trip from a depot | An empty movement is derived, timed by the same running-time function, occupying real track and visible to the player. |
| No valid empty movement exists for a chain | The chain is invalid, naming which reason: no path, no wiring for that traction, or not enough time. |
| Player retimes a trip so a derived empty movement no longer fits its gap | The chain is re-validated and flagged; the empty movement is not silently shortened below its technical minimum. |
| A yard is drawn with a given footprint | The usable siding count and length are derived from the footprint and shown alongside it, and are the capacity actually available. |
| Two trains stable on one stub siding and the inner one is needed first | It leaves; stabling order is not modelled. |
| A siding's usable length is 200 m and two 90 m units are stabled on it | Both fit, and 20 m remains. Capacity is by combined length, not by train count. |
| A train comes due for service at a station with no depot | It may run empty to a depot that can service it. Every other departure is blocked until it has been. |
| More trains are assigned to a depot than it has sidings they fit within | Reported as a stabling shortfall against that depot, before publication. |
| A train reaches its service interval mid-week with no long enough stay in its duty | Validation reports the overrun and the day it falls on; the player adds a servicing stay or re-chains. |
| A train overruns its service interval during operation | Its next departure is blocked until serviced; a trip already underway completes. |
| A servicing visit and overnight stabling compete for sidings | Both occupy a siding for their full duration; the shortfall is reported rather than silently shared. |
| A duty has no train assigned | It is not an error in the draft; it is reported as a fleet requirement, and publication reports that its trips will not depart. |
| Two duties overlapping in time are assigned the same train | Invalid, naming both duties and the overlap. |

## Deferred features and planning boundaries

- No locomotives, coaches, or train composition; no player-designed or upgraded trains.
- No dynamic coupling or splitting partway through a duty, and no mixed-type coupling.
- No automatic fleet assignment; the data supports a later solver but v1 fills nothing in.
- No breakdowns, reliability simulation, component life, or condition modelling; servicing is a scheduling constraint only.
- No heavy overhauls, and no light/heavy servicing distinction in the initial approach.
- No delivery lead time, second-hand market, leasing, resale, or stock availability limits.
- No crew as a modelled resource: reversal time represents a driver changing ends, but rosters, hours, and depots for staff are out of scope.
- No last-in-first-out stabling, no shunting moves within a yard, and no depot throat or switch-conflict modelling.
- No individually wired sidings within a yard.
- No freight or non-passenger stock of any kind.
- No modelled tilting, and no performance effect from curves or gradients, per plan 02.

This document records the determinations reached so far and does not authorize application changes. Verify and balance the catalogue figures, and settle servicing values and depot access speed, before treating it as implementation-ready.
