# V1 services and timetabling

Status: agreed direction from the services and timetabling planning discussion, not an implementation specification. Editor detail, numerical rules, and several operational behaviours remain open.

This document records determinations made using the [game vision](00-game-vision.md), the [development plan roadmap](01-development-plan-roadmap.md), and the [infrastructure and operations plan](02-infrastructure-and-operations.md). It separates confirmed choices from questions that still need decisions.

## Goals

Let players create named services along their constructed network, author a weekly timetable manually, chain trips into duties for individual trains, and understand and fix conflicts before and during operation.

Success means a player can build a corridor, define the services that run on it, produce a week of departures without typing every station time by hand, see why a timetable will not work, and retain full authority over the result. Timetables remain player-authored; the game advises, and never writes the timetable itself.

## Agreed direction

### Requirements inherited from the game vision

- Players name services and select their routes by choosing stations on the map.
- Players author timetables manually, with individual station times and arrangements for stopping, holding, or slowing on passing tracks.
- Use a weekly timetable with weekday/weekend patterns, rush-hour demand, and overnight services.
- Advise on conflicts, including a faster train catching a slower train, with an optional easier assistance mode that preserves player control.
- Assign individual trains to sequences of trips, accounting for turnaround.
- Keep signals, blocks, junction routing, and dispatching out of player configuration.
- No automatic timetable generation.

### Services and routes

A **service** is a named, player-created object owning one route: an ordered list of stations chosen on the map along constructed infrastructure. A service is bidirectional. One service represents one corridor product, for example a regional service between two cities, rather than one object per direction.

Route stations are the service's timetable points. A route must be connected by usable operational track under the rules of plan 02; a route that becomes disconnected by an infrastructure edit flags the service and blocks its next departure.

### Trips may run any sub-range in either direction

Following the NIMBY Rails approach, a trip does not have to run the whole route. A trip declares a start stop and an end stop within the route, in either order. Running the route forwards end to end, running it backwards end to end, and running a short working over part of it are the same mechanism with different endpoints.

This removes the need for separate services per direction and gives short workings, peak extensions, and partial-route trips without new concepts.

### Authoring by running times, not clock times

Players do not type an arrival time for every station. They author, per pattern:

- the **call type** at each route stop: stop, pass, or hold;
- the **dwell** at each stopping station;
- the **running-time allowance** for each section between consecutive route stops.

The game derives a technical minimum running time per section from infrastructure speed, train performance, and connection limits (plans 02 and 04). Where the authored allowance exceeds that minimum, the difference is the player's recovery margin and is shown as such. An allowance below the minimum is not rejected; it is flagged immediately with the minimum and its cause, consistent with plan 02's rule that imperfect timetables may run. At runtime the train cannot beat its technical minimum, so the shortfall simply becomes delay. Clock times at every station are computed from the trip's departure time plus dwells and allowances, and are displayed for inspection and for individual override.

The player therefore still controls individual station times, but edits the quantity that carries meaning — margin — rather than re-deriving arithmetic.

The vision's "slowing on passing tracks" is not a fourth call type. A slow run through a station is a pass whose section allowance is authored above the technical minimum, so it needs no separate concept; what a pass and a hold mean in authored time remains open below.

Whether the game pre-fills allowances with the technical minimum, a padded default, or nothing is an open question.

### Patterns generate trips; edited trips detach

A **pattern** is a reference trip: direction, start and end stop, call types, dwells, and allowances. The player applies a pattern to produce departures across the week, by time band and day, which materialise as concrete **trips**.

Generated trips keep a live link to their pattern. Editing the pattern's call types, dwells, or allowances re-flows every still-linked trip. Editing a trip directly detaches it: it keeps its own values and is no longer changed by the pattern. Detached trips are marked, and the player can re-link a trip to discard its overrides.

This satisfies manual authorship while keeping a half-hourly service to a handful of authored objects rather than forty hand-written timetables.

### A flat week of seven explicit days

The published timetable is a flat list of seven days, each holding concrete trips. There are no day-type templates in the stored timetable: Tuesday and Wednesday are separate days that happen to contain similar trips.

Weekday, weekend, rush-hour, and off-peak differences are expressed by generating different departures into different days, not by a day-type abstraction. Patterns supply the reuse; the week itself stays explicit and directly editable.

Copying a day's trips to other days is an editor convenience and must be available, but it produces independent trips rather than a persistent link between days.

### Overnight trips and the week boundary

A trip belongs to the day it departs, and its later stops carry times beyond 24:00, such as 25:20 for 01:20 the next morning. The week wraps: a trip departing Sunday evening completes into Monday morning and occupies Monday's infrastructure and fleet.

This keeps an overnight service as one object with one continuous timetable, and makes conflict checking and duty continuity behave the same at the week boundary as anywhere else.

### Explicit passing arrangements

A meet on single track, or an overtake, is an explicit first-class object created by the player: which two trips, at which location, and which one waits. It is not inferred from the authored times.

Explicit arrangements are what plan 02's fixed-passing-location rule protects. A validated arrangement is honoured at runtime: if one train is late, the planned location does not move, the other train waits, and the delay is explained. Retiming a trip does not silently move a meet; instead the arrangement is re-validated and flagged if the new times make it impractical.

The game may detect an unplanned conflict and advise creating an arrangement, but never creates one on its own.

### Automatic platform assignment with optional pins

The game assigns a platform track at each stop, under plan 02's automatic track choice rules. The player may **pin** a platform at any stop where it matters — a cross-platform connection, a terminating move, a consistent passenger-facing platform — and pins are then treated as constraints that validation must satisfy or report as unsatisfiable.

Unpinned platforms are derived state and are not player-authored timetable content. They are not, however, free to churn: plan 02's tie-break prefers the track chosen last time when the choice is otherwise equal, so an unpinned platform changes only when the movements around it change. The player may rely on a shown platform staying put between unrelated edits without it becoming authored content.

### Trips chain into duties in this plan

A **duty** is an ordered sequence of trips worked by one physical train. Chaining trips into duties belongs to the timetable workflow: the player builds duties in the same editor where the trips exist, and validation checks that each consecutive pair is workable — the previous trip ends where the next begins, with enough time for turnaround, and with any empty movement accounted for.

Plan 04 owns the train catalogue, purchases, train characteristics, depot access and storage, empty-movement rules, and servicing. This plan owns the chaining, its validation, and the reported fleet requirement.

### Draft and published timetables

The player edits a **draft** week freely. Live operation only ever runs the **published** week. Activation is explicit: the player reviews conflicts and fleet requirements, then publishes the draft, which replaces the published week.

Planned times live in the published timetable; actual times and delays are runtime state and never overwrite the plan. This keeps the comparison of planned against actual meaningful.

On activation, trips already underway complete against the timetable they departed on. No train is retimed mid-journey. Every departure after activation follows the new published week. Trips that exist in the old published week but not the new one simply do not depart again.

#### Departures are identified per week occurrence

"Every departure after activation" is not sufficient on its own, as the 21 September audit showed: retime a 10:00 trip to 10:30 and publish at 10:15, and the departure fires twice. **Every actual departure is identified by its trip together with the occurrence of the week it belongs to**, and that identity is what activation reconciles against.

- A departure already made in this week occurrence never fires again, whatever the new week says its time is.
- A departure in the new week whose time has already passed in this occurrence is **skipped**, and reported as skipped rather than silently omitted or fired late.
- Old definitions stay alive as long as a trip is running against them, so a running train's times, calls and meets remain readable while it completes.
- A passing arrangement referencing a trip that no longer departs is reported at publication; the surviving train keeps its right to the stretch under plan 02's contention rule.

The cost is a concept the timetable does not currently have — occurrence identity — and a new state, skipped-on-publication, which plan 07 must present.

### Continuous incremental validation

The draft is validated as the player edits. Each edit re-validates the affected trips, arrangements, and duties, and conflict markers appear in the editor without the player asking for them.

Validation covers at least: running-time allowances below the technical minimum, headway and separation conflicts between trips, platform and track occupancy including pinned platforms, meets and overtakes that the times make impractical, meets and overtakes planned at a loop shorter than the waiting train's length, duty continuity and turnaround, routes broken by infrastructure edits, and electrification incompatibility.

Length is checked against loop holding lengths and depot sidings, not against platforms: plan 02 permits a train longer than its platform to call there with a dwell penalty, so an over-length platform stop is a cost, not a validation error.

Incremental validation must use the same movement and capacity rules as runtime, per the vision's shared prediction requirement. Its cost at national scale is a question for plan 08.

### Imperfect timetables may be published

Consistent with plan 02, conflict advice does not block publication. A timetable with unresolved timing conflicts can be published and run; trains wait safely and the player sees the consequences.

Structural invalidity is different: a trip over a broken route, or a duty whose chaining is impossible, blocks that departure until repaired, and publication must report it clearly rather than silently dropping the trip.

### Assistance suggests, the player applies

The optional easier assistance mode proposes concrete, reviewable edits: move this meet to that loop, add two minutes of dwell here, shift this departure by four minutes, split this duty. Each suggestion is presented as a diff the player accepts or rejects.

Assistance never edits the draft on its own, never publishes, and never generates a timetable. Accepting a suggestion is an ordinary player edit and detaches trips from their pattern in the normal way.

## Existing functionality and gaps

The prototype has no services, routes, trips, timetable, duties, or clock. The network overview's city-pair demand estimate takes a frequency as direct input rather than deriving it from scheduled services, and must eventually read frequency from the published timetable instead.

Station platforms are abstract counts rather than individually usable platform tracks, so platform assignment and occupancy cannot be represented until plan 02's station work exists. Non-platform station passing tracks, which meets and overtakes depend on, are also not implemented.

Nothing in the current save format anticipates timetable state. Route selection on the map has no precedent in the existing construction tools beyond corridor drawing.

## Player workflow

1. Create a service, name it, and pick its route stations on the map.
2. Author a pattern: direction, start and end stop, call types, dwells, and running-time allowances against the shown technical minimums.
3. Generate departures from the pattern into the days and time bands of the draft week.
4. Inspect and override individual trips where needed, accepting that an edited trip detaches from its pattern.
5. Create explicit meets and overtakes where trips interact, and pin platforms where they matter.
6. Chain trips into duties and review the reported fleet requirement and turnaround feasibility.
7. Read continuous conflict markers as the draft is edited, optionally reviewing and accepting assistance suggestions.
8. Publish the draft, accepting any remaining timing conflicts, and observe the operated week against the plan.
9. Return to the draft to improve the timetable, or pause and rebuild infrastructure, then repair flagged services before their next departure.

The editor's actual form — timetable table, graphical time-distance diagram, map interaction, and how each of these presents conflicts — belongs to plan 07 and is not settled here.

## Minimum data and interface changes

Planning needs implied by the agreed behaviour, not settled schemas:

- **Service:** identity, name, ordered route of stations, and validity against current infrastructure.
- **Pattern:** direction, start and end stop, per-stop call type and dwell, per-section running-time allowance, and the generation rules that produced trips from it.
- **Trip:** owning service and pattern, departure day and time, start and end stop, resolved per-station times permitting values beyond 24:00, link-or-detached state, pinned platforms, and blocked/flagged status.
- **Passing arrangement:** the two trips, the location, which trip waits, and validation state.
- **Duty:** ordered trips, with turnaround and empty-movement requirements resolved against plan 04, and a reference to the physical train assigned to work it. This plan owns the chain's shape; plan 04 owns the assigned train and validates that the assignment is physically possible.
- **Timetable:** separate draft and published weeks, with an activation operation and a record of what publication reported.
- **Departure identity:** trip plus week occurrence, sufficient to tell a departure already made from one still due, and to mark one skipped on publication.
- **Publication report:** timing conflicts, broken routes, orphaned passing arrangements, skipped departures, and fleet conflicts against live train positions — reported, never blocking.
- **Validation:** conflict records tied to the trips, arrangements, and duties that caused them, with explanations and, in assisted mode, suggested edits as reviewable diffs.
- **Runtime:** actual times and delays held separately from planned times.
- **Interfaces consumed:** technical minimum running time, track and platform occupancy, and safe-separation rules from plan 02; train length, performance, traction, and capacity from plan 04.
- **Interfaces produced:** published service frequencies and timed journeys for plan 05, and operating trip counts for plan 06.

Persistence, derived-state boundaries, incremental validation architecture, and save migration belong to plan 08.

## Open questions

- **Route editing:** how stations are added, reordered, and removed on the map; what happens to patterns, trips, arrangements, and duties when a route changes mid-draft.
- **Allowance defaults:** whether the game pre-fills running-time allowances with the technical minimum, a padded value, or nothing, and how the minimum is shown when infrastructure or train type changes it.
- **Hold and pass calls:** exactly what a hold or a pass at a non-platform track means in authored time, and how it differs from a dwell.
- **Generation controls:** how the player expresses time bands and frequencies when generating departures into a day, without that becoming a stored day-type abstraction.
- **Detachment granularity:** whether editing one stop detaches the whole trip or only that stop, and how a partially detached trip is presented.
- **Arrangement scope:** whether an arrangement binds specific trips or a recurring trip pair across days, and how it survives regeneration.
- **Duty presentation:** how duties are built and displayed alongside trips, and how the fleet requirement is reported before any trains are owned.
- **Publication reporting:** what publication must report and what it may not silently change. Two parts are now settled: a partly invalid draft may be published, and publication additionally checks the new duties against where trains actually are, reporting fleet conflicts without blocking. What remains open is the report's shape and how long it stays available after activation. Note that because that check reads live state, the same draft can report differently at two different moments — an accepted consequence.
- ~~**Validation cost**~~ — resolved in [plan 08](08-simulation-architecture-and-saves.md). Validation is tiered: structurally local checks run on every edit within a stated time budget, network-wide separation and occupancy analysis is debounced or requested, and publication always forces a full pass. The tiers differ in scope of analysis, never in thoroughness, and pending network-wide checking must be visible rather than implied clean.
- **Assistance scope:** which conflict classes assistance may propose fixes for, and how it explains a conflict it cannot fix.
- **Cancellation and disruption:** whether the player may cancel an individual trip in a published week without republishing. Note that any such control would be an exception to this plan's own boundary against in-operation controls, so the question is whether the exception is worth making, not merely how it would work.

## Dependencies

- **Infrastructure and operations (02):** usable routes and connections, technical minimum running times, track and platform occupancy, safe separation, fixed passing locations, and services blocked by infrastructure edits.
- **Fleet and depots (04):** train catalogue, performance, length and capacity, purchases, turnaround and empty movements, depot access, and servicing. This plan chains trips into duties; plan 04 supplies what makes a chain physically possible.
- **Passengers and demand (05):** now written. Published frequencies, timed journeys, transfers, and crowding all read from the published timetable rather than from an input frequency, which plan 05 demotes to a labelled what-if.
- **Economy and progression (06):** operating costs per trip and ticket revenue derived from operated services.
- **Interface and player experience (07):** the timetable editor, time-distance diagram, map route selection, conflict presentation, and assistance review.
- **Simulation architecture and saves (08):** now written. Continuous incremental validation is tiered there — structurally local checks immediately within a budget, network-wide analysis debounced, and a forced full pass on publication — which answers this plan's open validation-cost question. Draft and published weeks are authored state; the week wrap is followed by both the clock and the weekly statement.
- **First playable and validation (09):** the regional and express corridor that exercises these rules together.

## Acceptance scenarios

Numerical expectations must be added once the open questions are resolved.

| Scenario | Expected behaviour |
| --- | --- |
| Player creates a service and picks route stations | One bidirectional service exists with an ordered route validated against constructed track. |
| Player authors a pattern and generates half-hourly departures | Trips appear across the chosen days with derived station times, all linked to the pattern. |
| Player increases a section's running-time allowance on the pattern | Every still-linked trip re-flows; previously detached trips are unchanged. |
| Player edits one trip's dwell directly | That trip detaches, is marked as such, and can be re-linked to discard the override. |
| Player sets an allowance below the technical minimum | The edit is flagged immediately with the minimum and its cause shown. |
| A trip runs only part of the route, backwards | It is an ordinary trip with a start and end stop, needing no separate service. |
| A trip departs Sunday 23:40 and arrives 01:20 | It belongs to Sunday, carries a 25:20 arrival, and occupies Monday's infrastructure and duty time. |
| Player creates a meet on single track | The arrangement is explicit, validated, and honoured at runtime even when one train is late. |
| Player retimes a trip so a meet becomes impractical | The arrangement is flagged for the player; it is not silently relocated. |
| Player pins a platform that cannot be satisfied | Validation reports it rather than quietly assigning a different platform. |
| Player chains two trips into a duty with insufficient turnaround | The duty is flagged with the shortfall before publication. |
| Draft contains an unresolved timing conflict | It can still be published; trains wait safely at runtime and the delay is explained. |
| Draft contains a trip over a route broken by an edit | Publication reports it and that departure is blocked until repaired. |
| Player publishes while a trip is underway | The running trip completes on its old times; later departures follow the new week. |
| Player retimes a trip later and publishes after its old departure | It does not depart twice. The occurrence already departed, so the new time is not fired again. |
| Player retimes a trip earlier, past the current moment, and publishes | That departure is skipped for this week occurrence and reported as skipped, not fired late. |
| A newly published duty needs a train still working an old trip | Publication reports the conflict without blocking; at runtime the departure is held and names the train and the trip holding it. |
| A published passing arrangement refers to a trip that no longer departs | Publication reports it; the remaining train proceeds under plan 02's contention rule rather than waiting for a partner that will never come. |
| Assisted mode finds a fixable conflict | It proposes a reviewable edit which the player accepts or rejects; the draft is unchanged until accepted. |

## Deferred features and planning boundaries

- No automatic timetable generation, and no assistance that edits or publishes a timetable by itself.
- No day-type templates in the stored week; patterns provide reuse instead.
- No player-configured signalling, blocks, junction routing, or dispatching, and no manual assignment of intermediate tracks.
- No automatic relocation of planned meets or overtakes to recover from delays.
- No automatic fleet assignment; duties are chained by the player, with automation a later possibility per the vision.
- No real-world external operator timetables, rival timetables, or competing operator services in v1.
- No in-operation dispatching controls, real-time regulation, or manual delay recovery beyond editing and republishing the draft.

This document records the determinations reached so far and does not authorize application changes. Resolve route editing, generation controls, duty presentation, and validation cost before treating it as implementation-ready.
