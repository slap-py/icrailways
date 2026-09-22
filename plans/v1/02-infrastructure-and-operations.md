# V1 infrastructure and operations

Status: agreed direction from the initial and second planning discussions, not an implementation specification. The station, loop, movement, separation, and live-edit models are now settled in kind; numerical parameters and several behavioural details still need decisions.

This document records determinations made using the [game vision](00-game-vision.md) and [development plan roadmap](01-development-plan-roadmap.md), and supplies the operational rules that [services and timetabling](03-services-and-timetabling.md) depends on. It separates confirmed choices from questions that remain open; the earlier proposed draft was not adopted as a specification.

## Goals

Make infrastructure capacity matter to train operations while keeping construction simple. Players should be able to build a railway, manually timetable services, observe conflicts and delays, and improve the result without configuring signalling or managing individual junction movements.

Success means that track capacity, train performance, platform length, and passing arrangements have understandable consequences, while the player retains control over the timetable.

## Agreed direction

### Requirements inherited from the game vision

- Build along existing railway rights of way, with player-placed stations and depots.
- Support single, double, triple, and quadruple track, configurable maximum speed, electrification, and passing loops for single track.
- Support configurable platform counts and lengths, plus non-platform passing tracks at stations.
- Model train performance and actual track/platform occupancy.
- Handle signals, blocks, junction routing, and advanced dispatching automatically rather than exposing them as player configuration.
- Preserve manual service paths, timetables, and passing arrangements, with advice and an optional easier assistance mode.
- Use the same operating simulation in management and sandbox modes.

### Simple construction controls

Keep construction close to the existing product's counts-and-lengths approach, favouring simplicity. Players set the relevant track/platform counts and lengths; the game handles the connected operational layout.

Do not require layout-preset selection, individual track placement, or switch-by-switch connection design. The exact station and loop controls remain to be discussed.

### Stations are simple occupancy pools

A station is operationally a set of tracks: its platform tracks, each with a length, plus any non-platform passing tracks. Every one of them is reachable from every approach. Trains enter, occupy one track, and leave.

There is no modelled station throat, no switch geometry, and no conflict between simultaneous entry and exit moves. This matches the existing representation, where a station is a box that lengthens with platform length and widens with platform count, and it keeps the promise that the player never designs a layout.

Throat congestion at busy termini is therefore not simulated. This is a deliberate simplification; if terminus capacity later proves too generous, a per-approach limit on simultaneous conflicting moves is the intended extension rather than modelled switches.

### Moving-block separation

There are no fixed block sections. A following train must stay at least a minimum separation distance behind the train ahead, derived from its braking distance at current speed plus a safety margin. Separation is continuous, so a train closes up gradually behind a slower one rather than stopping at a block boundary.

Opposing movements on the same track are prevented by reservation rather than by separation distance: a train may not enter track set against it.

This keeps signalling entirely out of the player's hands while producing the behaviour the vision asks for — a faster train catching a slower one, and losing time behind it.

The braking-distance model, safety margin, and separation at station approaches are numerical questions still open.

### Deadlock is prevented, not recovered from

A train may not enter a single-track stretch unless it can secure either its exit from that stretch or the loop where its planned meeting takes place. If it cannot, it waits at the last location where it can stand clear, and that wait is explained to the player as a named cause.

Deadlock is therefore impossible by construction, rather than something the game detects and unwinds. The cost is that trains sometimes wait conservatively, holding at a loop when the line ahead looks clear to the player.

This is what makes plan 03's fixed passing arrangements safe: the game never has to break a planned meet to recover, because it never enters a state requiring recovery.

#### The timetable decides who goes first

The 21 September audit observed that impossibility by construction is not established by the rule above alone: two trains can both want the same stretch, and without a deterministic tie-break there is no guarantee and no reproducible outcome. **The published timetable decides.**

1. A train whose planned meet under plan 03 takes place at that location has the right to the stretch.
2. Otherwise the train the published timetable schedules through the stretch earlier goes first.
3. Ties are broken by trip identity, so the order is total and the outcome replays identically under plan 08's determinism requirement.

The rule deliberately uses planned times rather than actual ones. A late train still holds its place, and a punctual train can be held behind it — which is the accepted cost, taken because the alternative lets lateness rewrite the player's plan. Plan 03's passing arrangements are authored, and a contention rule that ignored them would make them advisory.

The claim still needs three things this plan does not settle, all of them technical rather than directional, and all recorded as open below: reservations acquired atomically so a train never holds half of what it needs, clearance measured against the whole train rather than a point, and an explicit release rule. A deadlock-freedom check, a collision-avoidance check and an eventual-progress check are three separate acceptance obligations, not one.

### Directional running

Trains keep to one side on multi-track sections by default, so double track normally behaves as two single directional lines. Sweden runs left-hand, and the default follows that.

The game may use a track against the normal direction where it is free and the movement requires it — to overtake, to pass an obstruction, or to reach a specific platform. Wrong-direction use is a deliberate exception subject to the same opposing-movement reservation rules, not a general freedom.

### Track selection tie-break

Where handedness does not decide the choice — a four-track section, or several free platforms at a station — the game picks the track conflicting least with other planned movements, and prefers the track it chose last time when the choice is otherwise equal.

Stability matters: plan 03 re-validates the draft continuously, and platform assignments that churn between validations would be unreadable.

### Imperfect timetables and safe delays

Advise players about conflicts before operation, but allow imperfect timetables to run. Trains wait safely when movements conflict, letting players see the consequences and improve their timetable.

This decision concerns timing and capacity conflicts. It does not permit departures over broken routes: infrastructure edits that invalidate a service prevent its next departure until repaired.

### Short platforms and loop lengths

- Allow trains longer than the platform to make passenger stops, with a boarding penalty.
- Require the entire train to fit within a loop's usable holding length to wait clear of another train.
- Keep these rules distinct: allowing a short platform does not mean a short loop can accommodate a train clear of the passing route.

The boarding penalty is additional dwell time, scaling with how much of the train overhangs the platform and with how many passengers board and alight there. It represents passengers walking through the train to reach doors that are at the platform. No part of the train becomes unusable: capacity is unaffected, only time.

A loop's usable holding length is its built length minus a fixed clearance allowance at each end, representing the switch clearance a train must stand clear of. The player builds a length; the game shows the resulting usable holding length alongside it so the difference is never a surprise.

The numerical penalty scale and clearance allowance are still to be set.

### Automatic track choice

On sections with multiple tracks, the game chooses a usable track between the player's scheduled stops and passing arrangements. Automatic choices must respect the selected service route and planned passing arrangements.

Players do not need to assign every intermediate track. Detailed direction defaults, available connections, and track-selection rules remain open.

### Planned passing locations remain fixed

If delays make a planned meeting or overtake impractical, keep the planned passing location. Trains wait safely and explain the delay; the player remains responsible for changing the arrangement.

Do not automatically move a meeting or overtake elsewhere as a recovery action. Automatic track choice within the planned arrangement remains allowed.

### Speed and train performance

Journey times depend on the chosen infrastructure speed limit, train capability, acceleration and braking, and automatic limits through track connections.

Leave terrain, curve restrictions, and gradient modelling out of the initial implementation. A higher selected infrastructure limit does not remove a train's own performance limits or connection restrictions.

#### Piecewise analytical movement

Movement over a section is a closed-form speed profile: accelerate at a constant rate to the lowest applicable limit, cruise, then brake at a constant rate for the next restriction or stop. Acceleration and braking rates are constant per train type; speed-dependent tractive effort is not modelled.

Because the profile is analytical, the **technical minimum running time** between two points can be computed directly rather than by simulating a train over it. Plan 03's running-time authoring, its continuous incremental validation, and live operation therefore all use one cheap function, which is what the vision's shared prediction requirement asks for.

Numerical performance values and connection speed limits remain to be determined.

### Electrification is strict

An electric train requires continuous electrification over every part of its path: running lines, platform tracks, loops, and depot access alike. Any gap makes the path unusable, which plan 03's validation reports as a service or duty problem rather than discovering at runtime. Diesel trains run anywhere.

There is no coasting through short unwired gaps and no exemption for yards and depot access. Wiring a depot is part of the cost of running electric trains.

### Rebuilding during operation

Pause to edit infrastructure and apply accepted changes immediately. Construction duration and disruption from ongoing works are not part of the initial approach.

Before applying an edit, show affected services. If the edit breaks a service, allow the change and flag that service, preventing its next departure until the problem is repaired. Do not require every affected service to be repaired before the infrastructure edit can be applied.

Trains already operating are protected more strictly than services. An edit is rejected if any train currently running would lose a valid path to the end of its trip — not merely if the edit touches track the train occupies or has reserved. A running train can therefore veto an edit well ahead of itself, and the rejection must name the train and the trip it would strand.

The distinction is deliberate: a **future departure** may be broken and flagged, because the player has until that departure to repair it; a **trip already underway** may not, because there is no point at which the player could have fixed it.

The player can always pause, wait for the conflicting trip to finish, and then apply the edit.

### Delay explanations

Every waiting train states why it is waiting and names the specific blocker — the train ahead, the occupied platform, the meet it is holding for, the single-track stretch it cannot yet secure. Reasons are named objects, not categories.

Alongside this, a time-distance diagram overlays actual movement against the published plan, so a delay's propagation along a corridor is visible rather than inferred from individual trains.

Neither surface offers any control. The player reads what happened and responds by editing the timetable or the infrastructure, never by dispatching a train.

## Existing functionality and gaps

The prototype already supports track counts, speed and electrification properties, passing/overtaking additions, station platform counts and lengths, and depot geometry.

These are construction representations, not operational capacity. Platforms are currently abstract counts, and there are no moving trains, operational track occupancy, automatic separation, or timetable conflicts. Non-platform station passing tracks also remain to be implemented.

Operational connections and usable holding lengths must be defined before the existing geometry can support the agreed behaviour. Do not assume that every approximate construction connection is already a valid train movement path.

## Player workflow

The agreed workflow is:

1. Build or edit infrastructure through simple counts, lengths, speed, and electrification controls.
2. Author service routes and timetable arrangements in the dedicated service/timetable workflow.
3. Review conflict advice, with the option to operate an imperfect timetable.
4. Observe trains choosing tracks automatically, waiting safely, and retaining planned passing locations.
5. Improve the timetable or pause and rebuild infrastructure.
6. Review services affected by an infrastructure edit, then repair flagged services before their next departure.
7. Read named delay causes on waiting trains and the planned-against-actual diagram, and respond by editing the timetable or the infrastructure.

The presentation of previews, map overlays, delay explanations, and the time-distance diagram belongs to the interface plan; this document settles what must be explained, not how it looks.

## Minimum data and interface changes

The following are planning needs implied by the agreed behaviour, not settled schemas:

- **Infrastructure:** represent usable operational tracks and connections, platform lengths, loop holding lengths, speed restrictions, and electrification.
- **Train operations:** expose train length and performance, occupied track/platform space, and the reason a train is waiting.
- **Services and timetables:** retain player-authored routes and passing locations separately from automatic intermediate track choices and actual delays.
- **Infrastructure editing:** identify affected services and operating trains, reject unsafe edits, and flag services whose next departure is blocked.
- **Advice and interface:** explain conflicts, short-platform consequences, and changes needed to restore service validity.

Persisted versus derived state, reservation representation, and save migration belong to the architecture discussion. This document does not settle those technical choices.

## Open questions

The models are settled in kind. What remains is mostly numerical, plus a few behaviours the settled models do not yet determine.

- **Movement parameters:** acceleration and braking rates per train type, connection and junction speed limits, and how a speed restriction is applied across a train's length.
- **Separation parameters:** the braking-distance formula, the safety margin, and how separation behaves on station approaches and at a stand.
- **Reservation scope:** how far ahead a train reserves, when reservations are released, and how the deadlock-prevention check identifies "the last location where it can stand clear". The audit adds three specific requirements to settle here: atomic acquisition of everything a movement needs, whole-train clearance rather than point clearance, and the interaction between loops and station occupancy pools when a cyclic wait spans both.
- **Conservative waiting:** how often deadlock prevention holds a train that a player believes could have proceeded, and whether that is acceptable or needs a lookahead refinement.
- **Loop and station interaction:** how loops relate to station passing tracks and to the prototype's existing passing/overtaking additions, and whether a station's passing track and an adjacent loop are one resource or two.
- **Clearance and penalty values:** the loop clearance allowance and the short-platform dwell scale.
- **Wrong-direction running:** when the game may use a track against the normal direction, and whether the player is told it happened.
- **Terminus capacity:** whether the no-throat simplification proves too generous, and the trigger for adding per-approach limits.
- **Depot access:** how depot connections differ from running lines for separation and reservation purposes, and what speed limit applies over them. Electrification is not open: it is settled strictly above, and [plan 04](04-fleet-and-depots.md) makes a depot explicitly wired or unwired as a build option.
- **Diagram scope:** how much of the network a time-distance diagram covers at once, given national scale.

## Dependencies

- **Services and timetabling (03):** now written. It consumes the technical minimum running time, track and platform occupancy, separation rules, and blocked-departure handling defined here, and owns routes, authored passing arrangements, duties, draft/published activation, and conflict advice.
- **Fleet and depots (04):** now written. It supplies the train lengths, maximum speeds, acceleration and braking rates, traction types, and reversal minimums this plan's movement, separation, and electrification rules consume, and it makes depots explicitly wired or unwired. The separation formulae remain this plan's; plan 04 supplies the braking rates they take as input.
- **Passengers and demand (05):** now written. It consumes the shared closed-form running time, actual occupancy, and named delays, and replaces the prototype's section-speed journey estimate with this plan's function. The passenger consequences of short platforms, waiting, and delays are settled there.
- **Economy and progression (06):** now written. Construction, electrification, station, and depot costs are recalibrated into SEK there, with recurring maintenance added. Affordability becomes a further reason a construction edit cannot be applied, alongside this plan's running-train veto.
- **Interface and player experience (07):** simple construction controls, affected-service previews, and understandable operational feedback.
- **Simulation architecture and saves (08):** now written. Operational state lives in a Web Worker on a fixed timestep; prediction/runtime consistency becomes an architectural constraint that the movement and occupancy implementation be singular; and performance targets are set as three named scenarios with explicit budgets.
- **First playable and validation (09):** a bounded scenario demonstrating these rules together.

## Acceptance scenarios

These scenarios capture the agreed direction. Numerical expectations and unresolved mechanics must be added before implementation.

| Scenario | Expected behaviour |
| --- | --- |
| Player adds station or passing capacity | Counts-and-lengths controls remain simple; the game handles operational connections. |
| A timetable contains a timing conflict | Advice explains the conflict; the player can run it and trains wait safely. |
| A train is longer than its platform | The stop happens, dwell increases with the overhang and the number of passengers exchanged, and train capacity is unaffected. |
| A fast train catches a slower one on double track | It closes up to the moving-block separation distance and follows at the slower speed; the delay names the train ahead. |
| A train approaches single track it cannot yet secure | It holds at the last location where it stands clear, and the wait names the stretch and the conflicting train. No deadlock occurs. |
| Two trains reach the same single-track stretch together | The one with a planned meet there goes first, otherwise the one scheduled through earlier, otherwise the lower trip identity. The same situation resolves the same way every run. |
| A late train holds a punctual one at a planned meet | The plan is honoured and the delay propagates, with the wait named against the late train. The timetable is not overridden by lateness. |
| A cyclic wait is constructed across two loops and a station | No cycle forms, because no train acquires part of what it needs. Deadlock freedom, collision avoidance and eventual progress are each asserted separately. |
| An electric train's path has an unwired depot connection | The path is invalid and reported during timetable validation, not discovered at runtime. |
| A speed profile is needed for validation and for runtime | Both use the same closed-form piecewise calculation, giving identical technical minimum running times. |
| Two free platforms are equally usable | The game picks the one conflicting least with other planned movements, and keeps its previous choice when they are otherwise equal. |
| A train is longer than a loop's usable holding length | It cannot use that loop to wait clear of another train. |
| Several intermediate tracks are usable | The game chooses a track while respecting the service route and passing arrangements. |
| A train is late for a planned meeting or overtake | The planned location remains fixed; trains wait safely and the delay is explained. |
| Infrastructure speed exceeds the train's capability | Train performance still limits movement, alongside connection restrictions. |
| A paused edit breaks a service whose trains are not endangered | The player sees the affected service, can apply the edit, and its next departure is blocked until repaired. |
| An edit would leave a running trip without a path to its end | The edit is rejected, naming the train and trip, even where the edit is far ahead of the train's current position and reservations. |

## Deferred features and planning boundaries

- No required layout presets, individual switch design, manual signalling, or advanced dispatch controls.
- No automatic relocation of planned meetings or overtakes to recover from delays.
- No curve, terrain, or gradient movement modelling in the initial implementation.
- No construction duration or staged works during operation in the initial approach.
- No automatic timetable generation implied by automatic track selection or conflict advice.
- No fixed block sections, and no player-visible signalling of any kind.
- No station throat or switch-conflict modelling, and no speed-dependent tractive effort, in the initial implementation.
- No deadlock recovery mechanism, because deadlock is prevented rather than unwound.
- No coasting through unwired gaps and no depot exemption from electrification.

This document records the determinations reached so far and does not authorize application changes. [Plan 04](04-fleet-and-depots.md) now proposes the per-type acceleration, braking, length, speed, and traction figures, so what remains here is the rules that consume them — the braking-distance formula and safety margin, clearance and penalty values, and reservation scope — together with the behavioural questions above: wrong-direction running, terminus capacity, loop and station interaction, conservative waiting, and diagram scope.
