# V1 interface and player experience

Status: agreed direction from the interface planning discussion, not an implementation specification. The surface model, workspace set, editor forms, diagram scope, map overlay policy, time control placement, conflict presentation, assistance presentation, and the player-facing vocabulary are settled in kind. Visual design, layout figures, and the contents of individual panels are not settled, and onboarding is deliberately deferred out of v1.

This document records determinations made using the [game vision](00-game-vision.md), the [development plan roadmap](01-development-plan-roadmap.md), and the subsystem plans [02](02-infrastructure-and-operations.md), [03](03-routes-and-timetabling.md), [04](04-fleet-and-depots.md), [05](05-passengers-and-demand.md), [06](06-economy-and-progression.md), and [08](08-simulation-architecture-and-saves.md). It is the last subsystem plan and carries a backlog from every one of them.

It was grounded in the existing interface first; those notes are kept separately in [07-NOTES-interface-grounding.md](07-NOTES-interface-grounding.md) rather than repeated here.

**This plan renames things the other plans have already settled.** The player-facing vocabulary agreed here — route, schedule, timetable — becomes canonical everywhere, and one object in plan 03 ceases to exist. Both changes are recorded below and both oblige a follow-up pass across the set.

## Goals

Give the player one place to build, one place to author, and a way to find out why a week went badly.

Success means a player can carry out the vision's loop — identify demand, construct, timetable, operate, evaluate, improve — without ever being unable to find where a thing is done, and can attribute a poor result to a specific cause rather than to a general sense that the railway is not working.

## Agreed direction

### Requirements inherited from the game vision

- Players name routes and choose their stations on the map.
- Players author timetables manually, with individual station times and arrangements for stopping, holding, or slowing on passing tracks.
- Provide pause and fast-forward controls.
- Handle signalling automatically. Players do not configure signals, blocks, junction routing, or advanced dispatching, and the interface must not expose them.
- Let players choose where a route runs, and its passing arrangements, through understandable map and timetable controls.

### The map is the application; workspaces open over it

The main page is the map. Along the bottom sits a bar of buttons that open **workspaces**, each covering the map to do work the map is not needed for. A workspace is dismissed with a close control and the map is underneath again.

This is not a new architecture so much as a decision to make the existing one deliberate. The prototype already renders a full-bleed map with panels floating over it, but the panels are three absolutely positioned elements with hand-tuned pixel offsets: [`styles.css`](../../src/styles.css) places the construction sidebar and the network overview at the same coordinates and resolves the collision by stacking one over the other at a higher `z-index`, while the map controls carry a hardcoded offset to clear whichever is showing. The single-panel model had already failed by the time a second panel existed.

### A workspace is as large as its work requires, and no larger

**Workspace size follows whether the work needs the map.** This is the rule that decides the question rather than a visual preference:

- Work that uses the map opens as a **sidebar**, leaving the map usable beside it. Authoring a route means choosing stations on the map, so the Routes workspace is a sidebar.
- Work that does not use the map opens as a **near-full-screen panel**. A timetable is a grid and a time-distance diagram; neither gains anything from the map behind it, and both need width.

Construction is the limiting case and stays as it is: a contextual sidebar over the map, appearing when a tool is active or something is selected. Building track and placing stations *is* a map activity, so construction is not a workspace and does not appear on the bar. The accepted cost is two panel idioms — contextual sidebar for construction, workspaces for everything else — which must be visually distinguishable enough that players learn which is which without being told.

### Four workspaces

| Workspace | Form | Holds |
| --- | --- | --- |
| **Routes** | Sidebar | Route stations chosen on the map, call type and stop time at each stop, running-time allowance and speed between stops, layover at each end. Also the network inventory — stations, yards, and what serves them. |
| **Timetable** | Near-full | The week. Placing routes at times of day, per-day timetables, the schedule builder, the shift, and the time-distance diagram. |
| **Fleet** | Near-full | The catalogue, owned trains, depots and their sidings, and the assignment of rolling stock to schedules. |
| **Finance** | Near-full | The weekly statement by category, the contract browser, attribution of a bad week to a cause, and plan 05's demand diagnostics — forecast against actual, the traveller inspector, and named causes for lost demand. |

Four buttons is a bar a player can scan. The two foldings are deliberate: the network inventory belongs with Routes because it is mostly stations and what serves them, and demand diagnostics belong with Finance because forecast-against-actual and lost demand are ultimately questions about why a week earned what it did.

**Finance is absent in sandbox, not empty.** Plan 06 settles that sandbox tracks no total money at all — it keeps fares and profitability and has no balance, no debt and no contracts. A workspace that cannot answer its own central question should not be on the bar, so in sandbox the bar has three buttons. Where the demand diagnostics live in sandbox is an open question below.

### The player-facing vocabulary is canonical

The interface says **route**, **schedule** and **timetable**, and so do the plans from now on:

| Term | Means | Replaces |
| --- | --- | --- |
| **Route** | A named bidirectional object owning an ordered list of stations, with call types, stop times and allowances | Plan 03's *service*, and the authored content of its *pattern* |
| **Schedule** | One train's chain of work, which may cover several routes at different times of day | Plan 03's *duty* |
| **Timetable** | The week that is operated, seven explicit days | Plan 03's *published week* |

These are plainer than the terms they replace and are what the interface would say regardless, so the plans and the game should speak one language. The cost is a mechanical rename across plans 02, 03, 04, 06 and 08 — large but low-risk, the same shape as the agent-to-traveller rename already carried out. It is a required follow-up and is named as such at the end of this document.

### Pattern dissolves

Plan 03's **pattern** — a reference trip carrying direction, sub-range, call types, dwells and allowances, which generates concrete trips across the week — **ceases to be an object**. Its content moves to the route; its generating job moves to the timetable.

- The **route** carries the authored per-stop content: call types, stop times, allowances, layover.
- Placing a route on the **timetable** at a time, with a direction and optionally a sub-range, is what produces a trip.

Trips keep a live link to the route they came from, and plan 03's detachment rule carries over unchanged in shape: editing a trip directly detaches the whole trip from its route, it keeps its own values, it is marked as detached, and it can be re-linked to discard its overrides. Whole-trip detachment is already settled in plan 03; only the thing being detached *from* has changed.

The accepted cost is that a route carries one set of stop times and allowances, so a corridor served both fast and slow needs **two routes** rather than one route with two patterns. This is arguably clearer — a regional and an express are different things to a player, and plan 09's first-playable corridor already proposes exactly that pair — but it is a real reduction in what plan 03 allowed. **The intended extension**, if express-and-stopping on one corridor proves painful to author, is named variants beneath a route carrying their own call types and allowances. It is not pre-built.

### Several trains on one schedule shift in time

Assigning more than one train to a schedule **repeats the whole schedule, offset in time**. Four trains at a thirty-minute offset on a two-hour round trip produce a clean half-hourly service from one authored object.

This mechanism does not exist in any other plan. Plan 03 generates trips from a pattern; this generates schedules from a schedule, which is a different relationship and a more useful one for the thing players actually want — regular intervals without authoring each train's day separately.

Two consequences follow and are requirements rather than details. Editing the parent schedule must **re-flow its offset copies**, in the same spirit as the route-to-trip link. And plan 03's detachment rule must **extend to an edited copy**, which detaches from the parent and keeps its own values. The offset figure and whether copies may be individually retimed without full detachment are open below.

### The timetable is a table and a diagram, linked

The **table is the authoring surface** and the **time-distance diagram is the analysis surface**, with selection synchronised between them. Selecting a trip in one selects it in the other.

The split follows the plans rather than taste. Plan 03 has the player author allowances, dwells and call types — quantities, best edited in a table — and explicitly derives clock times rather than having them typed. Plan 02 separately requires a time-distance diagram of planned against actual. Editing by dragging graph lines was considered and rejected: dragging edits a derived clock time, not the authored allowance underneath it, so it would fight the authoring model plan 03 settled.

The accepted cost is two views to build, keep synchronised, and keep responsive across a seven-day week.

**The diagram covers one route or corridor at a time**, showing every trip that touches it — which is what makes a meet or an overtake legible at all. This answers the scope question plan 02 explicitly left open. Scope is bounded by selection rather than by network size, so it survives plan 08's national scenario of some twelve thousand trips a week, where a whole-network diagram would be a solid block. The cost is that a trip running across several corridors appears in pieces, and the player must choose a corridor before the diagram says anything.

### The map shows what is happening; panels show what it means

This is the rule governing every overlay.

**On the map:** the population overlay, built infrastructure, and live operation — train positions, which trains are late and why, which are waiting and what for, and infrastructure state.

**In panels:** forecast demand, actual journeys, load analysis, lost demand, and every comparison between them.

Plan 05 requires its three layers — potential reach, forecast demand, actual journeys — never to be conflated, and originally required the interface to keep all three visually distinct. **That requirement is narrowed here on the player's instruction:** the map carries a single population overlay, and forecast and actual are reported as figures in station inspectors, route panels and the Finance workspace rather than painted on the map. The layers remain separate in the model and separate in the numbers; what they are not is three competing choropleths over the same pixels. The prototype already carries six layer toggles, a population mode switch and an opacity slider, and the layers control is at its comfortable limit before demand is added at all.

The accepted cost is real and should not be minimised: a crowding or underperformance problem that a coloured line would have revealed at a glance now requires opening a workspace. Plan 05's worked example still holds in the numbers — a station with forty thousand residents in reach, no service, zero forecast and zero actual journeys reads correctly in its inspector — but it no longer reads at map scale.

### Time controls live in the bottom bar and the clock keeps running

Play, pause, fast-forward, the current simulated time, and plan 08's **effective rate when it falls short of the requested one** sit in the bottom bar beside the workspace buttons. They are visible and reachable from inside every workspace, and the railway keeps operating while the player reads a statement or edits next week's timetable.

The consequence must be made visible rather than discovered. Plan 08 settles that **undo exists only while paused** and that the stack clears on resume, load and publication. A player editing in the Timetable workspace with the clock running therefore has no undo, and the interface owes them that fact plainly — an undo control that is visibly unavailable while running, rather than one that silently does nothing.

### One persistent status region

A single always-visible region in the bottom bar carries operating and validation state, and opens a detail list from wherever the player is:

- plan 08's **tier 2 validation state** — checking, pending, clean, or a conflict count — which satisfies its requirement that pending network-wide checking must never read as clean, structurally, because the state is always on screen;
- plan 02's **named delay causes** on waiting trains;
- plan 03's **publication report** — timing conflicts, broken routes, orphaned passing arrangements, departures skipped on publication, and fleet conflicts against live train positions;
- plan 08's **save failures**, named specifically with the file left intact.

Detail also appears inline in the workspace that owns the object — a timetable conflict against the trip that caused it, a fleet conflict against the schedule — so the bar carries state and count while the workspace carries the specific. The two presentations must agree.

The accepted cost is permanent screen space, and the risk that a persistent status area becomes something players learn to ignore. Nothing in this plan prevents that; it is a visual design problem handed forward deliberately.

**Publication reporting must not read as an error.** Plan 03 settles that publication never blocks, and that an imperfect timetable may be published and run. A report that looks like a failure would teach players to treat a normal, permitted action as a mistake.

### Assistance is a reviewable diff

Plan 03's assisted mode and plan 02's assisted passing advice present a **proposed change as its current values against its proposed ones**, with the reason given in plain operating terms — this train holds here for four minutes rather than there, because it would otherwise meet that train on single track.

Accepting applies it as an ordinary player edit, which detaches the trip from its route in the normal way. Rejecting dismisses it. The draft is never touched until accepted, exactly as plan 03 requires, and assistance never publishes and never generates a timetable.

Signalling is never exposed. The diff speaks in holds, passes, allowances and locations — the same vocabulary the player authors in — and never in blocks, reservations or routes set.

A passing change is spatial, and a table does not show it well. Whether the proposal is also drawn on the time-distance diagram as a ghost against the current line is an open question below; it would be the strongest review of the three options considered, at the cost of a third rendering state on the diagram beside planned and actual.

### Cost previews extend the construction sidebar

Plan 06 requires the recurring commitment a build adds to be shown at build time, not only its one-off price. This joins the preview the construction sidebar already computes.

The prototype is a good starting point rather than a blank one. [`App.tsx`](../../src/App.tsx) already derives `preview`, `affected` and `blocked` — the geometry of a pending edit, the buildings it would take, and the roads it would block — and sums real OSM building estimates into a property cost before the player commits. The recurring figure joins that group: one-off cost, and what this build adds to the weekly running total.

No confirmation step is added. Committing a build stays a single action, because it is the most repeated action in the game. The accepted cost is a denser sidebar at a moment when it is already carrying parameters, preview and property cost — and, in sandbox, no weekly total for a recurring figure to be added to.

## Existing functionality and gaps

The prototype is one screen with no routing and no modes. [`App.tsx`](../../src/App.tsx) is 1,476 lines owning project state, tool state, selection, editing intent, interface state, cost computation and catchment orchestration together; [`MapView.tsx`](../../src/MapView.tsx) is a further 1,108.

What exists and is kept: the full-bleed map, the vertical construction toolbar with keyboard shortcuts surfaced in tooltips, the contextual editing sidebar, live preview of affected buildings and blocked roads before commit, property cost against real building estimates, an offline status line, and a genuinely reasonable accessibility baseline — `aria-label` on tools, `aria-pressed` on toggles, `role="alert"` on route errors, `role="status"` on the toast and connectivity line, and a labelled dialog role when editing a station or yard.

What does not exist: any entry point for anything plan 03 onward requires. There is no service, route, timetable, trip, schedule, fleet, depot-operation or contract surface of any kind. The seven construction tools are the whole interface.

What exists and must go: the network overview's display of `DEMO_BUDGET - project.spent` as a remaining balance, since plan 06 has deleted the concept it displays; and the `serviceFrequency` slider's authority, which plan 03 demotes to a labelled what-if because the real figure must come from the timetable.

One small inherited oddity worth fixing deliberately rather than inheriting: the construction tools are keyed 1–5 then 7 for Yard and 6 for Delete, because Yard was added later and took the next free key rather than the next position.

## Player workflow

1. Look at the map, with the population overlay on, and decide where a railway is worth building.
2. Build, using the construction tools and the contextual sidebar, seeing one-off cost, recurring commitment, and the buildings and roads a draft would take before committing.
3. Open **Routes**, create a route by choosing stations on the map beside the sidebar, and author its call types, stop times, allowances and layovers.
4. Open **Fleet**, buy rolling stock, and see what a schedule will require before any train is owned.
5. Open **Timetable**, place routes at times across the week, build schedules, assign trains, and shift a schedule to get regular intervals.
6. Read the time-distance diagram for one corridor, see a conflict, and accept or reject a proposed change shown as a diff.
7. Publish, and read a report that names skipped departures and fleet conflicts without reading as a failure.
8. Watch the railway run on the map — train positions, what is late, what is waiting and why — using the time controls in the bottom bar.
9. Open **Finance**, read the weekly statement by category, compare forecast against actual, inspect a traveller's chosen and rejected itineraries, and attribute a bad week to a cause.
10. Change something, and compare the next week against the last.

## Minimum data and interface changes

- **Layout system:** a real layout replacing the three absolutely positioned panels and their hand-tuned offsets, supporting one map, one bottom bar, one contextual construction sidebar, and one open workspace in either sidebar or near-full form.
- **Workspace state:** which workspace is open, and its scroll and selection state preserved across close and reopen.
- **Route:** stations, call types, stop times, allowances, layovers — carrying what plan 03 held on a service and a pattern together.
- **Trip link:** the route a trip came from, its detached state, and its own overrides.
- **Schedule:** the chain of work, the train assigned, and — where several trains work one schedule — the parent schedule, the offset, and the detached state of a copy.
- **Diagram:** the selected corridor, the trips touching it, and planned, actual and proposed rendering states.
- **Status region:** validation state and count, named delay causes, publication report, and save failures, with a detail list.
- **Assistance diff:** current values, proposed values, the reason in operating terms, and accept and reject as ordinary edits.
- **Mode difference:** the bar carries three buttons in sandbox and four in management.

## Open questions

- **Demand diagnostics in sandbox:** Finance is absent there, so forecast against actual, the traveller inspector and lost-demand causes need a home or an explicit absence. Not settled.
- **Ghost proposals on the diagram:** whether an assistance diff is also drawn against the current line, and the cost of a third rendering state.
- **Shift figures:** the offset's granularity, whether copies may be individually retimed without fully detaching, and how a shifted set is presented as one object rather than four.
- **Inventory inside Routes:** whether the existing network overview becomes a section of the Routes sidebar or a mode of it, given a sidebar is narrower than the panel it lives in today.
- **Diagram corridor selection:** how the player chooses which corridor the diagram shows, and whether selecting a trip re-scopes it automatically.
- **Status region density:** how many simultaneous states it can carry before it stops being read, and what is suppressed when they exceed it.
- **Layer control:** whether the existing six toggles, population mode switch and opacity slider survive as they are, now that demand analysis has left the map.
- **Keyboard and accessibility beyond the baseline:** workspace navigation, diagram and table keyboard access, and whether the time-distance diagram can be made non-visually accessible at all.
- **Visual design:** every layout figure, and the distinguishability of the two panel idioms.

## Dependencies

- **Infrastructure and operations (02):** supplies named delay causes for the status region and the planned-against-actual diagram, whose corridor scope this plan settles; requires that signalling never be exposed, which the assistance diff respects.
- **Routes and timetabling (03):** supplies the authoring model this plan builds surfaces for. **This plan changes it**: the pattern object dissolves into route and timetable, and service, duty and published week are renamed route, schedule and timetable. Whole-trip detachment carries over unchanged.
- **Fleet and depots (04):** supplies the catalogue, owned trains, depots and sidings for the Fleet workspace, and the assignment of rolling stock to schedules with its named failures. Usable siding length must be shown against drawn length, as that plan requires.
- **Passengers and demand (05):** supplies forecast, actual journeys, the traveller inspector and lost-demand causes for Finance. **This plan narrows its three-layer interface requirement** to separation in the model and the numbers rather than on the map.
- **Economy and progression (06):** supplies the weekly statement, contracts and cost previews. There are no borrowing controls to design, since bounded borrowing was removed there. The statement carries unusual weight because nothing is blocked for want of money.
- **Simulation architecture and saves (08):** supplies effective rate, pending validation state, undo availability and save failures, all of which surface in the bottom bar. Its paused-only undo is a presentation obligation this plan accepts.
- **First playable and validation (09):** selects which of these surfaces the first playable slice actually needs, and is where a deferred onboarding decision would first be felt.

## Acceptance scenarios

| Scenario | Expected behaviour |
| --- | --- |
| The player opens the Timetable workspace | It covers the map, because timetabling does not use the map, and is dismissed with a close control. |
| The player opens the Routes workspace | It opens as a sidebar, leaving the map usable, because choosing route stations is a map activity. |
| The player authors a route and then a second, faster one on the same corridor | Both exist as separate routes. One route carries one set of stop times and allowances. |
| The player assigns four trains to one schedule at a thirty-minute offset | Four offset copies of the whole schedule exist, and editing the parent re-flows them. |
| The player edits one offset copy directly | It detaches from the parent, keeps its own values, and is marked as detached. |
| The player selects a trip in the timetable table | The same trip is selected in the time-distance diagram, and the reverse. |
| The player opens the diagram without choosing a corridor | It asks for one. It never attempts to draw the whole network. |
| The player looks at the map for demand | There is one population overlay. Forecast and actual journeys are not on the map and are never mistakable for population. |
| The player looks at the map during operation | Train positions, lateness, and waiting trains with their named causes are shown. |
| Tier 2 validation has not yet run | The status region reads as pending. It never reads as clean, and the player cannot reach a state where absence of conflicts implies absence of checking. |
| The player edits the timetable while the clock is running | Undo is visibly unavailable, not silently inert. |
| The player pauses, edits, then resumes | Undo is available while paused and visibly empties on resume. |
| Assisted mode proposes a passing change | It is shown as current against proposed with a reason in operating terms, and the draft is unchanged until accepted. |
| The player reads an assistance proposal | No block, reservation or signal appears anywhere in it. |
| The player publishes a timetable with unresolved conflicts | It publishes. The report names skipped departures and fleet conflicts and does not present itself as a failure. |
| The player drafts a new section of track | One-off cost, recurring weekly commitment, affected buildings and blocked roads are all shown before committing, and committing takes one action. |
| The player runs in sandbox | The bottom bar carries three workspace buttons. Finance is absent rather than present and empty. |
| A save fails to write | The status region names the specific failure and the existing file is left intact. |
| The simulation cannot sustain the requested rate | The bottom bar reports the effective rate rather than letting displayed time drift. |

## Deferred features and planning boundaries

- **No onboarding, tutorial, or guided scenario in v1.** This is a deliberate choice against the recommendation made during this discussion, and the cost is stated rather than minimised: a game with four workspaces, a timetable editor and a time-distance diagram is not discoverable without one, and the first players will have to be told how it works out of band. The argument for deferring is that onboarding designed before the game is playable teaches a workflow that may not survive contact with it, and that it is cheaper to see where people actually get stuck. It should be revisited before any public release, and plan 09 should note where a first-playable scenario would have carried it.
- No player-arranged, dockable or resizable panel layouts; one workspace is open at a time and its form is decided by this plan, not by the player.
- No second map inside any workspace.
- No editing by dragging on the time-distance diagram, per the authoring model in plan 03.
- No whole-network time-distance diagram.
- No demand analysis overlays on the map, and no restoration of a three-way demand layer switch.
- No exposure of signalling, blocks, reservations or set routes anywhere in the interface, including in assistance.
- No confirmation step on committing a build.
- No borrowing controls, since there is no borrowing.
- No mobile or touch layout; this is a desktop browser interface.
- No theming, customisation, or user-configurable keyboard bindings in v1.
- No in-operation dispatching controls of any kind, per plan 03's boundary.

## Required follow-up, now carried out

Two changes agreed here reached into documents that were already complete. **Both were carried out on 22 September**, immediately after this plan was written.

1. **The rename.** Service became route, duty became schedule, and the published and draft weeks became timetables, across plans 02 to 08 and the vision — 232 occurrences. Plan 03 is now [03-routes-and-timetabling.md](03-routes-and-timetabling.md). The rename is deliberately partial: eighty uses of “service” carry unrelated meanings and were left alone — public service contracts, service level, service interval, service duration, service brake, service-due and the servicing verb — as were about twenty where it is ordinary English for a train a passenger can catch. A route is the line; a service is a train running on it.
2. **Pattern's dissolution.** Plan 03's pattern section, data list, acceptance scenarios and open questions are rewritten around routes carrying the authored content and timetables generating trips. The offset-schedule mechanism this plan introduced is absorbed there too.

This document records the determinations reached so far and does not authorize application changes. Settle where demand diagnostics live in sandbox and resolve the shift's remaining figures before treating it as implementation-ready.
