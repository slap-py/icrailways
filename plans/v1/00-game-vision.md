# V1 game vision

Status: planning baseline, not an implementation specification.

This document separates the existing prototype, agreed game direction, and proposals that still need decisions. The [development plan roadmap](01-development-plan-roadmap.md) identifies the detailed plans needed before implementation.

## Agreed direction

Build a Swedish passenger railway game combining map-based construction with detailed, manually authored timetables. The intended visual and functional inspiration is Subway Builder mixed with NIMBY Rails, with deeper timetable analysis and advice. Support local, regional, and intercity passenger routes across Sweden.

The core gameplay loop is:

**Identify travel demand → construct infrastructure → timetable routes → operate trains → evaluate results → improve the network.**

### Construction

- Restrict construction to existing railway rights of way; do not introduce freely drawn new alignments.
- Let players place their own stations and depots rather than requiring real station locations.
- Support single, double, triple, and quadruple track, configurable maximum speed, electrification, and passing loops for single track.
- Allow configurable station platform counts and lengths, plus non-platform passing tracks. Station passing tracks remain to be implemented.
- Include construction and maintenance costs for tracks, stations, and depots. Express all game finances in SEK.

### Routes, timetables, and operations

- Players name routes and choose their stations on the map.
- Players author timetables manually, with individual station times and arrangements for stopping, holding, or slowing on passing tracks.
- Use a weekly timetable with weekday/weekend patterns, rush-hour demand, and overnight services. Provide pause and fast-forward controls.
- Model real train performance and actual track/platform occupancy so infrastructure capacity affects operations.
- Handle signalling automatically. Players do not configure signals, blocks, junction routing, or advanced dispatching.
- Let players choose where a route runs, and its passing arrangements, through understandable map and timetable controls.

Settled in the [interface and player experience plan](07-interface-and-player-experience.md):

- The map is the application. A bottom bar opens four workspaces — Routes, Timetable, Fleet and Finance — and a workspace is as large as its work requires: Routes is a sidebar because it uses the map, the others cover it because they do not. Construction stays a contextual sidebar and is not a workspace.
- The player-facing vocabulary is canonical everywhere: **route**, **schedule**, **timetable**, replacing service, duty and published timetable.
- Plan 03's pattern object dissolves. A route carries the authored per-stop content; placing a route on the timetable generates trips. A corridor served both fast and slow needs two routes.
- Assigning several trains to one schedule repeats the whole schedule at a time offset, which is how regular intervals are authored.
- The timetable is a table for authoring and a linked time-distance diagram for analysis, covering one route or corridor at a time.
- The map shows what is happening — population, infrastructure, and live operation. Panels show what it means. Demand analysis is not painted on the map.
- Time controls and one persistent status region sit in the bottom bar, carrying pending validation, named delay causes, publication reports and save failures.
- Assistance is a before-and-after diff in operating terms, never exposing signalling, and never touching the draft until accepted.
- **Onboarding is deferred out of v1**, against the recommendation, and must be revisited before any public release.

Settled in the [infrastructure and operations plan](02-infrastructure-and-operations.md):

- Train movement is a closed-form piecewise speed profile, giving one cheap technical minimum running time shared by timetable validation and live operation.
- Separation is moving-block: a following train keeps a braking-based distance behind the train ahead, with no fixed block sections.
- Deadlock is prevented by reservation rather than recovered from; a train holds clear when it cannot secure a single-track stretch or its planned meeting loop. When two trains contend, the published timetable decides — a planned meet first, then the earlier scheduled path, then trip identity — so lateness never rewrites the player's plan.
- Stations are simple occupancy pools of platform and passing tracks, with no modelled throat or switch geometry.
- Multi-track sections run handed by default, with wrong-direction use as a deliberate exception.
- Electrification is strict across the whole path, depot access included.
- Waiting trains name their specific blocker, and a time-distance diagram shows actual against planned.
- Advise on conflicts, including a faster train catching a slower train. Offer an easier assistance mode that suggests solutions to difficult passing arrangements while preserving player control of the timetable.

Settled in the [routes and timetabling plan](03-routes-and-timetabling.md):

- A route is bidirectional and owns one route; a trip may run any sub-range of that route in either direction, so short workings need no separate route.
- Players author running-time allowances, dwells, and call types rather than typing clock times; times are derived, displayed, and individually overridable.
- A route carries its own call types, dwells, allowances and layovers; placing it on the timetable generates trips that stay linked to it, and directly editing a trip detaches the whole trip. A corridor served both fast and slow needs two routes. The stored week is seven explicit days.
- An overnight trip belongs to its departure day and carries times past 24:00. The week wraps.
- Meets and overtakes are explicit player-created objects, not inferred from times.
- Platforms are assigned automatically, with optional player pins.
- Players chain trips into schedules in the timetable workflow; the fleet plan supplies what makes a chain possible.
- The draft timetable is validated continuously as it is edited, and published by explicit activation. Each actual departure is identified by trip and week occurrence, so publishing mid-week never runs a departure twice and never fires one whose time has passed; such departures are reported as skipped.

### Fleet and depots

- Start with purchased preset train types and individual train schedules: sequences of trips assigned to physical trains.
- Account for turnaround, depot storage, and routine servicing.
- Keep automatic fleet assignment as a later possibility, not a requirement for the initial implementation.

Settled in the [fleet and depots plan](04-fleet-and-depots.md):

- The catalogue is a list of fixed, self-contained units named after real Swedish classes. There are no locomotives, coaches, or composition; the overnight sleeper is one indivisible unit.
- Same-type units may be coupled in multiples for a whole schedule. Dynamic coupling and splitting are deferred.
- Turnaround is one minimum reversal time per type, which schedule validation checks as a floor.
- Empty movements are derived by the schedule rather than authored, and are real timed movements occupying track.
- Depots are pools of individual sidings with usable lengths derived from the drawn footprint. Stabling order is not modelled.
- A depot is explicitly wired or unwired as a build option, rather than inheriting electrification from the line it connects to.
- Servicing is triggered by accumulated distance and is a scheduling constraint, not a failure mode. An overrun blocks a next departure, never a trip underway.
- Schedule-to-train assignment belongs to the fleet plan, which validates that the assignment is physically possible.

### Passengers and competing travel

- Develop the existing walking, cycling, transit, and car access model into door-to-door passenger journey choices.
- Include travel to and from stations, waiting, onboard journey time, route frequency, required transfers, ticket prices, and population at origins and destinations.
- Represent car, air, cycling, walking, and feeder transit as background alternatives appropriate to the journey.
- Do not require active rival businesses or a complete real-world external timetable network for v1.

Settled in the [passengers and demand plan](05-passengers-and-demand.md):

- Potential reach, forecast demand, and actual travelled journeys are three separately labelled layers and are never substituted for one another. The prototype's existing figures are potential reach.
- Demand is simulated with individual passenger travellers, each a sampled journey created when travel is decided and destroyed on arrival, rather than a standing population of residents.
- Destination attraction comes from population only, made directional by purpose and superlinear in size. No new dataset is added; the OSM building proxy is the named intended extension if that proves too coarse.
- Nine broad journey purposes carry hourly weekly profiles that are weights with a floor, never gates, so uncommon travel at unusual hours exists rather than being modelled away.
- Travellers choose by generalised cost over real itineraries built from the published timetable, against journey-appropriate background modes, drawing probabilistically rather than all taking the best option. They use published times including the player's running-time allowance, not the technical minimum, so padding a route genuinely makes it less attractive.
- Fares trade against time through a purpose-specific value of time, so price sensitivity differs by traveller. Plan 06 still owns every actual price.
- Train capacity is a hard limit: a denied traveller waits or abandons, and denied boardings are a named diagnostic. Where sampling gives a traveller a weight above one, a partly full train splits it, so denied boardings are counted in people.
- Reliability is remembered in aggregate per route rather than per traveller, so a chronically late service loses demand gradually and regains it gradually.

### Game modes

- Provide a financially constrained management mode and an unlimited-money sandbox using the same operating simulation.
- Use SEK consistently for construction, purchases, maintenance, operating costs, and revenue.

Settled in the [economy and progression plan](06-economy-and-progression.md):

- SEK figures are established by recalibrating the existing cost model's constants against documented Swedish sources. Its shape is kept; no conversion rate is applied anywhere. Relabelling euros would have left construction roughly two orders of magnitude too cheap.
- The player has a real account — opening capital, ticket revenue, and recurring maintenance and operating costs — replacing the prototype's cumulative spend total. The balance may go negative without limit; there is no separate loan mechanism.
- The balance moves continuously and a statement closes each timetable week by category, so the accounting period matches the week the player authors.
- Nothing is ever blocked for want of money, and debt carries no consequence of its own. There is no insolvency state and no game over. This replaces an earlier rule that insolvency blocked new commitments, removed on 21 September; it leaves the financially constrained management mode named above without a financial constraint, so the modes are redefined by what money means rather than by what it prevents — see below.
- Fares are a national rate per passenger-kilometre set by the player, with a per-route modifier.
- Progression comes from public service contracts: a corridor, a minimum service level, a term, and a subsidy the player is paid while meeting it.
- The two modes differ in what money means, not in what it prevents. Management mode tracks a balance, debt, a weekly statement and contracts. Sandbox tracks no total at all — it keeps fares and profitability so a player can see whether a corridor would pay, and holds no balance and no contracts. Neither mode ever blocks. Revised 21 September, after removing the insolvency block left the modes indistinguishable.
- Saves predating the SEK economy are refused rather than migrated.

Settled in the [simulation architecture and saves plan](08-simulation-architecture-and-saves.md), as revised after the 21 September audit:

- A save restores the session exactly. Reloading puts the player back where they were — clock, trains, loads, travellers, money, mileage and contracts — with nothing quietly reset. Only values the player could not detect being rebuilt are recomputed on load.
- Undo covers every kind of edit uniformly, but only while the simulation is paused. The stack clears on resume, on load and on publication, because undo over a running railway could erase earned revenue or strand a train.

## Existing functionality and gaps

The current React/TypeScript map application is a railway construction prototype. It already provides:

- Construction along mapped railway corridors, with editable track count, speed, and electrification.
- Passing and overtaking section additions.
- Player-placed stations with configurable platform counts and lengths.
- Editable yard/depot footprints, connections, and derived storage geometry.
- Construction and property-acquisition cost estimates.
- Population grids and multimodal station catchment estimates, including competition between player-built stations.
- A network overview with a simple city-pair demand estimate and frequency input.
- Browser-local manual save/load.

These are foundations rather than a running railway simulation. There are no operating trains, individual schedules, timetable system, simulated passenger journeys, or operating economy. Catchment figures represent potential station reach, not actual passengers. The city-pair estimate does not route passengers through scheduled services.

The population and catchment model has no journey purposes, no time of day, no travellers, no itineraries, no transfers, no fares, and no capacity or crowding, and neither end of its city-pair estimate is anything but residents. Its journey times come from section speed alone, which plan 02's shared running time replaces rather than corrects.

There is no train catalogue, no owned train, and no stabling or servicing. Depot footprints derive a siding count and usable length, but those are construction figures rather than operational resources, and a depot has no electrification property at all despite the strict electrification rule.

Current costs are in euros, and accumulated construction spending is not an account balance. There are no recurring costs, no revenue, and no fares, so there is no financial loop at all. Station cost sits inline in the application rather than in the cost module, and depot construction is unpriced apart from land. Station platforms are abstract counts rather than individually usable platform tracks. Existing passing sections and depot geometry do not yet provide operational occupancy, train movement, or servicing behaviour.

## Proposals awaiting decisions

The following ideas should be evaluated in the detailed plans; they are not settled mechanics. Struck-through entries have since been resolved and are kept here to record where the decision was made:

- ~~**Destination attraction**~~ — resolved in [plan 05](05-passengers-and-demand.md). No new dataset is added. Population remains the only input, but origin and destination stop being interchangeable: purposes have a direction, attraction scales superlinearly with size, and return travel is sampled explicitly. The accepted limitation is that a city centre and a dormitory suburb of equal population look alike as destinations, and the OSM building proxy is the named extension if that matters.
- ~~**Draft and published timetables**~~ — resolved in [plan 03](03-routes-and-timetabling.md). The player edits a draft, validated continuously, and publishes it by explicit activation. Trips already underway finish on their old times; later departures follow the new week. Actual times are runtime state and never overwrite the plan.
- **First playable corridor:** demonstrate a regional and an express sharing several stations, a single-track section, and a passing loop, with individually assigned trains. Use it to validate overtaking, opposing movements, connected passenger journeys, and financial consequences before broadening content.
- ~~**Shared prediction and runtime rules**~~ — resolved in kind by [plan 02](02-infrastructure-and-operations.md) and completed by [plan 08](08-simulation-architecture-and-saves.md). The piecewise analytical speed profile is closed-form, so timetable validation and live operation compute running times from the same function rather than from two models kept in agreement. Plan 08 makes that singularity an architectural constraint rather than a convention, runs the simulation in a Web Worker on a fixed timestep, tiers validation against explicit time budgets, and sets three named performance scenarios so the national-scale cost question can be measured instead of argued.

## Planning boundaries

This vision does not set numerical costs, demand coefficients, train specifications, safe-separation rules, or performance targets. It does not prescribe the detailed timetable editor or automatically generated timetables. Resolve these questions through the [future development plans](01-development-plan-roadmap.md), recording decisions and acceptance scenarios before implementing each subsystem.
