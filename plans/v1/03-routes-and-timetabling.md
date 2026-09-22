# V1 routes and timetabling

Status: agreed direction from the routes and timetabling planning discussion, not an implementation specification. Restructured on 22 September after [plan 07](07-interface-and-player-experience.md): the **pattern** object no longer exists, its authored content having moved to the route and its generating job to the timetable, and the player-facing vocabulary is now route, schedule and timetable. Editor detail, numerical rules, and several operational behaviours remain open.

This document records determinations made using the [game vision](00-game-vision.md), the [development plan roadmap](01-development-plan-roadmap.md), and the [infrastructure and operations plan](02-infrastructure-and-operations.md). It separates confirmed choices from questions that still need decisions.

## Goals

Let players create named routes along their constructed network, author a weekly timetable manually, chain trips into schedules for individual trains, and understand and fix conflicts before and during operation.

Success means a player can build a corridor, define the routes that run on it, produce a week of departures without typing every station time by hand, see why a timetable will not work, and retain full authority over the result. Timetables remain player-authored; the game advises, and never writes the timetable itself.

## Agreed direction

### Requirements inherited from the game vision

- Players name routes and choose their stations on the map.
- Players author timetables manually, with individual station times and arrangements for stopping, holding, or slowing on passing tracks.
- Use a weekly timetable with weekday/weekend patterns, rush-hour demand, and overnight services.
- Advise on conflicts, including a faster train catching a slower train, with an optional easier assistance mode that preserves player control.
- Assign individual trains to sequences of trips, accounting for turnaround.
- Keep signals, blocks, junction routing, and dispatching out of player configuration.
- No automatic timetable generation.

### Routes and routes

A **route** is a named, player-created object owning an ordered list of stations chosen on the map along constructed infrastructure. A route is bidirectional. One route represents one corridor product, for example a regional route between two cities, rather than one object per direction.

Route stations are the route's timetable points. A route must be connected by usable operational track under the rules of plan 02; a route that becomes disconnected by an infrastructure edit flags the route and blocks its next departure.

### Trips may run any sub-range in either direction

Following the NIMBY Rails approach, a trip does not have to run the whole route. A trip declares a start stop and an end stop within the route, in either order. Running the route forwards end to end, running it backwards end to end, and running a short working over part of it are the same mechanism with different endpoints.

This removes the need for separate routes per direction and gives short workings, peak extensions, and partial-route trips without new concepts.

### Authoring by running times, not clock times

Players do not type an arrival time for every station. They author, **on the route**:

- the **call type** at each route stop: stop, pass, or hold;
- the **dwell** at each stopping station;
- the **running-time allowance** for each section between consecutive route stops;
- the **layover** at each end of the route, before it works back the other way.

The game derives a technical minimum running time per section from infrastructure speed, train performance, and connection limits (plans 02 and 04). Where the authored allowance exceeds that minimum, the difference is the player's recovery margin and is shown as such. An allowance below the minimum is not rejected; it is flagged immediately with the minimum and its cause, consistent with plan 02's rule that imperfect timetables may run. At runtime the train cannot beat its technical minimum, so the shortfall simply becomes delay. Clock times at every station are computed from the trip's departure time plus dwells and allowances, and are displayed for inspection and for individual override.

The player therefore still controls individual station times, but edits the quantity that carries meaning — margin — rather than re-deriving arithmetic.

The vision's "slowing on passing tracks" is not a fourth call type. A slow run through a station is a pass whose section allowance is authored above the technical minimum, so it needs no separate concept; what a pass and a hold mean in authored time remains open below.

Whether the game pre-fills allowances with the technical minimum, a padded default, or nothing is an open question.

### The route holds the times; the timetable generates the trips

This plan originally had a third object between the two. A **pattern** was a reference trip — direction, start and end stop, call types, dwells and allowances — which the player applied across the week to materialise concrete trips. [Plan 07](07-interface-and-player-experience.md) **dissolves it**, and this section records what replaces it.

- The **route** carries the authored per-stop content: call types, dwells, running-time allowances, and layovers. This is the material that used to live on a pattern.
- **Placing a route on the timetable** at a day and time, with a direction and optionally a sub-range, is what produces a concrete **trip**.

Generated trips keep a live link to the route they came from. Editing the route's call types, dwells or allowances re-flows every still-linked trip. Editing a trip directly detaches the whole trip: it keeps its own values and is no longer changed by the route. Detached trips are marked, and the player can re-link a trip to discard its overrides. Only the object being detached *from* has changed; the rule itself is untouched, including its settled whole-trip granularity.

This still satisfies manual authorship while keeping a half-hourly route to a handful of authored objects rather than forty hand-written timetables — the reuse simply comes from the route rather than from a pattern beneath it.

**The accepted cost is that one route carries one set of times.** A corridor served both fast and slow needs **two routes** rather than one route with two patterns. This is arguably clearer, since a regional and an express are different things to a player and plan 09's proposed first-playable corridor already pairs exactly those two — but it is a real reduction in what this plan previously allowed, and it is recorded as a loss rather than a simplification. **The intended extension**, if express-and-stopping on one corridor proves painful to author, is named variants beneath a route carrying their own call types and allowances. It is not pre-built.

### Several trains on one schedule shift in time

Assigning more than one train to a schedule **repeats the whole schedule, offset in time**. Four trains at a thirty-minute offset on a two-hour round trip produce a clean half-hourly service from one authored object.

This mechanism arrives from plan 07 and did not exist in this plan before. It is a different relationship from the trip generation above: that generates trips from a route, this generates schedules from a schedule. It is how regular intervals are authored without writing out each train's day separately.

Two requirements follow. Editing the parent schedule **re-flows its offset copies**, in the same spirit as the route-to-trip link. And the detachment rule **extends to an edited copy**, which detaches from its parent and keeps its own values. The offset's granularity, and whether a copy may be individually retimed without fully detaching, are open below.

### A flat week of seven explicit days

The published timetable is a flat list of seven days, each holding concrete trips. There are no day-type templates in the stored timetable: Tuesday and Wednesday are separate days that happen to contain similar trips.

Weekday, weekend, rush-hour, and off-peak differences are expressed by placing routes differently across days, not by a day-type abstraction. The route supplies the reuse; the week itself stays explicit and directly editable.

Copying a day's trips to other days is an editor convenience and must be available, but it produces independent trips rather than a persistent link between days.

### Overnight trips and the week boundary

A trip belongs to the day it departs, and its later stops carry times beyond 24:00, such as 25:20 for 01:20 the next morning. The week wraps: a trip departing Sunday evening completes into Monday morning and occupies Monday's infrastructure and fleet.

This keeps an overnight service as one object with one continuous timetable, and makes conflict checking and schedule continuity behave the same at the week boundary as anywhere else.

### Explicit passing arrangements

A meet on single track, or an overtake, is an explicit first-class object created by the player: which two trips, at which location, and which one waits. It is not inferred from the authored times.

Explicit arrangements are what plan 02's fixed-passing-location rule protects. A validated arrangement is honoured at runtime: if one train is late, the planned location does not move, the other train waits, and the delay is explained. Retiming a trip does not silently move a meet; instead the arrangement is re-validated and flagged if the new times make it impractical.

The game may detect an unplanned conflict and advise creating an arrangement, but never creates one on its own.

### Automatic platform assignment with optional pins

The game assigns a platform track at each stop, under plan 02's automatic track choice rules. The player may **pin** a platform at any stop where it matters — a cross-platform connection, a terminating move, a consistent passenger-facing platform — and pins are then treated as constraints that validation must satisfy or report as unsatisfiable.

Unpinned platforms are derived state and are not player-authored timetable content. They are not, however, free to churn: plan 02's tie-break prefers the track chosen last time when the choice is otherwise equal, so an unpinned platform changes only when the movements around it change. The player may rely on a shown platform staying put between unrelated edits without it becoming authored content.

### Trips chain into schedules in this plan

A **schedule** is an ordered sequence of trips worked by one physical train. Chaining trips into schedules belongs to the timetable workflow: the player builds schedules in the same editor where the trips exist, and validation checks that each consecutive pair is workable — the previous trip ends where the next begins, with enough time for turnaround, and with any empty movement accounted for.

Plan 04 owns the train catalogue, purchases, train characteristics, depot access and storage, empty-movement rules, and servicing. This plan owns the chaining, its validation, and the reported fleet requirement.

### Draft and published timetables

The player edits a **draft** week freely. Live operation only ever runs the **published** week. Activation is explicit: the player reviews conflicts and fleet requirements, then publishes the draft, which replaces the published timetable.

Planned times live in the published timetable; actual times and delays are runtime state and never overwrite the plan. This keeps the comparison of planned against actual meaningful.

On activation, trips already underway complete against the timetable they departed on. No train is retimed mid-journey. Every departure after activation follows the new published timetable. Trips that exist in the old published timetable but not the new one simply do not depart again.

#### Departures are identified per week occurrence

"Every departure after activation" is not sufficient on its own, as the 21 September audit showed: retime a 10:00 trip to 10:30 and publish at 10:15, and the departure fires twice. **Every actual departure is identified by its trip together with the occurrence of the week it belongs to**, and that identity is what activation reconciles against.

- A departure already made in this week occurrence never fires again, whatever the new week says its time is.
- A departure in the new week whose time has already passed in this occurrence is **skipped**, and reported as skipped rather than silently omitted or fired late.
- Old definitions stay alive as long as a trip is running against them, so a running train's times, calls and meets remain readable while it completes.
- A passing arrangement referencing a trip that no longer departs is reported at publication; the surviving train keeps its right to the stretch under plan 02's contention rule.

The cost is a concept the timetable does not currently have — occurrence identity — and a new state, skipped-on-publication, which plan 07 must present.

### Continuous incremental validation

The draft is validated as the player edits. Each edit re-validates the affected trips, arrangements, and schedules, and conflict markers appear in the editor without the player asking for them.

Validation covers at least: running-time allowances below the technical minimum, headway and separation conflicts between trips, platform and track occupancy including pinned platforms, meets and overtakes that the times make impractical, meets and overtakes planned at a loop shorter than the waiting train's length, schedule continuity and turnaround, routes broken by infrastructure edits, and electrification incompatibility.

Length is checked against loop holding lengths and depot sidings, not against platforms: plan 02 permits a train longer than its platform to call there with a dwell penalty, so an over-length platform stop is a cost, not a validation error.

Incremental validation must use the same movement and capacity rules as runtime, per the vision's shared prediction requirement. Its cost at national scale is a question for plan 08.

### Imperfect timetables may be published

Consistent with plan 02, conflict advice does not block publication. A timetable with unresolved timing conflicts can be published and run; trains wait safely and the player sees the consequences.

Structural invalidity is different: a trip over a broken route, or a schedule whose chaining is impossible, blocks that departure until repaired, and publication must report it clearly rather than silently dropping the trip.

### Assistance suggests, the player applies

The optional easier assistance mode proposes concrete, reviewable edits: move this meet to that loop, add two minutes of dwell here, shift this departure by four minutes, split this schedule. Each suggestion is presented as a diff the player accepts or rejects.

Assistance never edits the draft on its own, never publishes, and never generates a timetable. Accepting a suggestion is an ordinary player edit and detaches trips from their route in the normal way.

## Existing functionality and gaps

The prototype has no routes, trips, timetable, schedules, or clock. The network overview's city-pair demand estimate takes a frequency as direct input rather than deriving it from scheduled services, and must eventually read frequency from the published timetable instead.

Station platforms are abstract counts rather than individually usable platform tracks, so platform assignment and occupancy cannot be represented until plan 02's station work exists. Non-platform station passing tracks, which meets and overtakes depend on, are also not implemented.

Nothing in the current save format anticipates timetable state. Route selection on the map has no precedent in the existing construction tools beyond corridor drawing.

## Player workflow

1. Create a route, name it, and pick its route stations on the map.
2. Author the route's times: call types, dwells, running-time allowances against the shown technical minimums, and layovers at each end.
3. Place the route into the days and time bands of the draft timetable, with a direction and any sub-range, generating trips.
4. Inspect and override individual trips where needed, accepting that an edited trip detaches from its route.
5. Create explicit meets and overtakes where trips interact, and pin platforms where they matter.
6. Chain trips into schedules, assign more than one train with an offset where a regular interval is wanted, and review the reported fleet requirement and turnaround feasibility.
7. Read continuous conflict markers as the draft is edited, optionally reviewing and accepting assistance suggestions.
8. Publish the draft, accepting any remaining timing conflicts, and observe the operated week against the plan.
9. Return to the draft to improve the timetable, or pause and rebuild infrastructure, then repair flagged routes before their next departure.

The editor's actual form — timetable table, graphical time-distance diagram, map interaction, and how each of these presents conflicts — belongs to plan 07 and is not settled here.

## Minimum data and interface changes

Planning needs implied by the agreed behaviour, not settled schemas:

- **Route:** identity, name, ordered stations, per-stop call type and dwell, per-section running-time allowance, layover at each end, and validity against current infrastructure. It carries what a pattern used to hold.
- **Trip:** owning route, departure day and time, start and end stop, resolved per-station times permitting values beyond 24:00, link-or-detached state, pinned platforms, and blocked/flagged status.
- **Passing arrangement:** the two trips, the location, which trip waits, and validation state.
- **Schedule:** ordered trips, with turnaround and empty-movement requirements resolved against plan 04, and a reference to the physical train assigned to work it. Where several trains work one schedule, also the parent schedule, the time offset, and the detached state of a copy. This plan owns the chain's shape; plan 04 owns the assigned train and validates that the assignment is physically possible.
- **Timetable:** separate draft and published timetables, with an activation operation and a record of what publication reported.
- **Departure identity:** trip plus week occurrence, sufficient to tell a departure already made from one still due, and to mark one skipped on publication.
- **Publication report:** timing conflicts, broken routes, orphaned passing arrangements, skipped departures, and fleet conflicts against live train positions — reported, never blocking.
- **Validation:** conflict records tied to the trips, arrangements, and schedules that caused them, with explanations and, in assisted mode, suggested edits as reviewable diffs.
- **Runtime:** actual times and delays held separately from planned times.
- **Interfaces consumed:** technical minimum running time, track and platform occupancy, and safe-separation rules from plan 02; train length, performance, traction, and capacity from plan 04.
- **Interfaces produced:** published route frequencies and timed journeys for plan 05, and operating trip counts for plan 06.

Persistence, derived-state boundaries, incremental validation architecture, and save migration belong to plan 08.

## Open questions

- **Route editing:** how stations are added, reordered, and removed on the map; what happens to the route's own call types, dwells and allowances, and to its trips, arrangements and schedules, when a route changes mid-draft. Dissolving the pattern sharpens this: the authored times now live on the object being edited rather than on a layer beneath it.
- **Allowance defaults:** whether the game pre-fills running-time allowances with the technical minimum, a padded value, or nothing, and how the minimum is shown when infrastructure or train type changes it.
- **Hold and pass calls:** exactly what a hold or a pass at a non-platform track means in authored time, and how it differs from a dwell.
- **Generation controls:** how the player expresses time bands and frequencies when generating departures into a day, without that becoming a stored day-type abstraction.
- ~~**Detachment granularity**~~ — closed. Editing any value on a trip detaches **the whole trip**, which is what this plan's own rule and acceptance scenarios already describe; partial detachment is not modelled, so there is no partially detached state to present. My own call, made to remove a contradiction rather than to decide something new: the alternative was live per-stop links, which would mean a trip could re-flow some stops and not others, and no part of this plan is written for that. Worth a second look if per-stop overrides later feel too blunt.
- **Arrangement scope:** whether an arrangement binds specific trips or a recurring trip pair across days, and how it survives regeneration.
- **Schedule presentation:** how schedules are built and displayed alongside trips, and how the fleet requirement is reported before any trains are owned.
- **Publication reporting:** what publication must report and what it may not silently change. Two parts are now settled: a partly invalid draft may be published, and publication additionally checks the new schedules against where trains actually are, reporting fleet conflicts without blocking. What remains open is the report's shape and how long it stays available after activation. Note that because that check reads live state, the same draft can report differently at two different moments — an accepted consequence.
- ~~**Validation cost**~~ — resolved in [plan 08](08-simulation-architecture-and-saves.md). Validation is tiered: structurally local checks run on every edit within a stated time budget, network-wide separation and occupancy analysis is debounced or requested, and publication always forces a full pass. The tiers differ in scope of analysis, never in thoroughness, and pending network-wide checking must be visible rather than implied clean.
- **Assistance scope:** which conflict classes assistance may propose fixes for, and how it explains a conflict it cannot fix.
- **Cancellation and disruption:** whether the player may cancel an individual trip in a published timetable without republishing. Note that any such control would be an exception to this plan's own boundary against in-operation controls, so the question is whether the exception is worth making, not merely how it would work.

## Dependencies

- **Infrastructure and operations (02):** usable routes and connections, technical minimum running times, track and platform occupancy, safe separation, fixed passing locations, and routes blocked by infrastructure edits.
- **Fleet and depots (04):** train catalogue, performance, length and capacity, purchases, turnaround and empty movements, depot access, and servicing. This plan chains trips into schedules; plan 04 supplies what makes a chain physically possible.
- **Passengers and demand (05):** now written. Published frequencies, timed journeys, transfers, and crowding all read from the published timetable rather than from an input frequency, which plan 05 demotes to a labelled what-if.
- **Economy and progression (06):** operating costs per trip and ticket revenue derived from operated routes.
- **Interface and player experience (07):** now written, and **it changes this plan in two ways that are not yet carried out here.** First, the player-facing vocabulary becomes canonical: *service* becomes **route**, *duty* becomes **schedule**, and *published timetable* becomes **timetable**. Second, the **pattern object dissolves** — its authored content moves to the route and its trip-generating job moves to the timetable, so a corridor served both fast and slow needs two routes rather than two patterns. Whole-trip detachment survives unchanged in shape, binding a trip to its route. That plan also settles the editor as a table for authoring with a linked time-distance diagram for analysis, and adds a mechanism this plan does not have: assigning several trains to one schedule repeats the whole schedule at an offset.
- **Simulation architecture and saves (08):** now written. Continuous incremental validation is tiered there — structurally local checks immediately within a budget, network-wide analysis debounced, and a forced full pass on publication — which answers this plan's open validation-cost question. Draft and published timetables are authored state; the week wrap is followed by both the clock and the weekly statement.
- **First playable and validation (09):** now written. Milestone 2 is this plan's milestone: two routes, trips generated by placing routes on the timetable, schedules, explicit meets, draft and publication. Its exit evidence includes the week-occurrence rule — publishing mid-week neither double-fires a departure nor silently drops one — and Sunday running into Monday.

## Acceptance scenarios

Numerical expectations must be added once the open questions are resolved.

| Scenario | Expected behaviour |
| --- | --- |
| Player creates a route and picks route stations | One bidirectional route exists with an ordered route validated against constructed track. |
| Player places a route into the timetable at half-hourly intervals | Trips appear across the chosen days with derived station times, all linked to the route. |
| Player increases a section's running-time allowance on the route | Every still-linked trip re-flows; previously detached trips are unchanged. |
| Player wants the same corridor served fast and slow | Two routes are authored. One route carries one set of call types, dwells and allowances. |
| Player assigns four trains to one schedule at a thirty-minute offset | Four offset copies of the whole schedule exist, and editing the parent re-flows them. |
| Player edits one offset copy directly | It detaches from its parent, keeps its own values, and is marked as detached. |
| Player edits one trip's dwell directly | That trip detaches, is marked as such, and can be re-linked to discard the override. |
| Player sets an allowance below the technical minimum | The edit is flagged immediately with the minimum and its cause shown. |
| A trip runs only part of the route, backwards | It is an ordinary trip with a start and end stop, needing no separate route. |
| A trip departs Sunday 23:40 and arrives 01:20 | It belongs to Sunday, carries a 25:20 arrival, and occupies Monday's infrastructure and schedule time. |
| Player creates a meet on single track | The arrangement is explicit, validated, and honoured at runtime even when one train is late. |
| Player retimes a trip so a meet becomes impractical | The arrangement is flagged for the player; it is not silently relocated. |
| Player pins a platform that cannot be satisfied | Validation reports it rather than quietly assigning a different platform. |
| Player chains two trips into a schedule with insufficient turnaround | The schedule is flagged with the shortfall before publication. |
| Draft contains an unresolved timing conflict | It can still be published; trains wait safely at runtime and the delay is explained. |
| Draft contains a trip over a route broken by an edit | Publication reports it and that departure is blocked until repaired. |
| Player publishes while a trip is underway | The running trip completes on its old times; later departures follow the new week. |
| Player retimes a trip later and publishes after its old departure | It does not depart twice. The occurrence already departed, so the new time is not fired again. |
| Player retimes a trip earlier, past the current moment, and publishes | That departure is skipped for this week occurrence and reported as skipped, not fired late. |
| A newly published schedule needs a train still working an old trip | Publication reports the conflict without blocking; at runtime the departure is held and names the train and the trip holding it. |
| A published passing arrangement refers to a trip that no longer departs | Publication reports it; the remaining train proceeds under plan 02's contention rule rather than waiting for a partner that will never come. |
| Assisted mode finds a fixable conflict | It proposes a reviewable edit which the player accepts or rejects; the draft is unchanged until accepted. |

## Deferred features and planning boundaries

- No automatic timetable generation, and no assistance that edits or publishes a timetable by itself.
- No day-type templates in the stored week; the route provides reuse instead.
- No pattern object, and no third layer between a route and a trip. Named variants beneath a route are the intended extension if one proves necessary, and are not v1.
- No player-configured signalling, blocks, junction routing, or dispatching, and no manual assignment of intermediate tracks.
- No automatic relocation of planned meets or overtakes to recover from delays.
- No automatic fleet assignment; schedules are chained by the player, with automation a later possibility per the vision.
- No real-world external operator timetables, rival timetables, or competing operator routes in v1.
- No in-operation dispatching controls, real-time regulation, or manual delay recovery beyond editing and republishing the draft.

This document records the determinations reached so far and does not authorize application changes. Resolve route editing, generation controls, and schedule presentation before treating it as implementation-ready. Validation cost is no longer outstanding: [plan 08](08-simulation-architecture-and-saves.md) tiers it, and publication forces a full pass.
