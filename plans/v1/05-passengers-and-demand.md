# V1 passengers and demand

Status: agreed direction from the passengers and demand planning discussion, not an implementation specification. The demand unit, attraction basis, time profile, assignment method, traveller lifecycle, denied-boarding rule, fare treatment, and reliability memory are settled in kind. Coefficients, purpose weights, and the scalability strategy remain open. The demand unit was originally called an “agent” — agent-based modelling terminology, not an AI agent — and was renamed throughout on 21 September for clarity.

This document records determinations made using the [game vision](00-game-vision.md), the [development plan roadmap](01-development-plan-roadmap.md), the [infrastructure and operations plan](02-infrastructure-and-operations.md), the [services and timetabling plan](03-services-and-timetabling.md), and the [fleet and depots plan](04-fleet-and-depots.md).

It resolves the vision's open **destination attraction** proposal, and it is the plan that turns the network overview's typed-in frequency into a frequency read from the published timetable.

Unlike the preceding plans, this one governs subsystems that already partly exist. Roughly half of it is a verdict on model choices the prototype has already made.

## Goals

Make the railway's usefulness to travellers the thing the player is actually optimising. A station in the right place, a service at the right hour, a train long enough, and a fare people will pay should all show up as people travelling; getting any of them wrong should show up as people not travelling, and the player should be able to see which one it was.

Success means a player can ask why a service is empty and get a specific answer — nobody lives within reach, the connection at the junction is twenty minutes, the train is full by the third stop, the fare is above what leisure travellers will pay at that journey time, or the service runs at hours nobody wants to travel.

## Agreed direction

### Requirements inherited from the game vision

- Develop the existing walking, cycling, transit, and car access model into door-to-door passenger journey choices.
- Include access and egress, waiting, onboard time, frequency, required transfers, ticket prices, and population at both ends.
- Represent car, air, cycling, walking, and feeder transit as background alternatives appropriate to the journey.
- Do not require rival businesses or a complete real-world external timetable network.
- Separate potential catchment, forecast demand, and actual travelled journeys (roadmap).

### Three layers, named and never conflated

The roadmap requires these to be distinct. They are distinct in kind, not merely in presentation:

| Layer | What it is | Needs a timetable? | Where it comes from |
| --- | --- | --- | --- |
| **Potential reach** | How many people can physically get to a station, and how | No | The existing catchment model, essentially unchanged |
| **Forecast demand** | How many journeys the published week should attract, by hour and purpose | Yes | Aggregate estimate over the published timetable |
| **Actual journeys** | Who travelled, on which train, and what happened to them | Yes, and operation | Individual travellers during simulation |

The prototype's current figures are potential reach and must keep saying so. A station with 40,000 residents in reach and no service has 40,000 potential reach, zero forecast demand, and zero actual journeys, and the interface must never let those three be mistaken for one another.

Forecast and actual will not agree exactly, and that is informative rather than a bug: the gap is where crowding, delays, missed connections, and denied boarding live. Plan 07 should present it as a comparison, in the same spirit as plan 02's planned-against-actual diagram.

### A passenger is a sampled journey, not a resident

Demand is simulated with **individual travellers**. A traveller is one person making one journey, with an origin, a destination, a purpose, a desired departure time, and a value of time.

Critically, a traveller is a **sampled journey**, created when a journey is decided and destroyed when it completes or is abandoned. The population grid produces a stochastic stream of intended journeys; it does not produce a standing population of residents who each wake up and decide. The live traveller count therefore tracks people on and around the network, not Sweden's population.

This is the decision that makes individual travellers affordable, and it is load-bearing. Millions of persistent residents would be plan 08's hardest problem; a sampled stream is bounded by how much travel the player's railway plausibly attracts. Nothing in this plan may assume a persistent per-person history, which is also why reliability memory is aggregate rather than per traveller.

Travellers are sampled only where rail is plausibly relevant — within reach of the player's stations, for journeys the network could serve. Demand between two places the player does not serve is not instantiated as travellers; it exists in the forecast layer only. If sampling still proves too costly at national scale, the intended fallback is aggregate flows outside the served area and travellers within it, rather than abandoning travellers.

One traveller is one person. Party or group travel is deferred, which means a family of four is four travellers making four similar decisions.

That is the modelling intent, and [plan 08](08-simulation-architecture-and-saves.md) qualifies it for performance: a traveller carries a weight, normally one, which scales up when the live traveller budget binds. A weight is a sampling ratio, not a group — a weighted traveller still makes one decision, not several.

### Destination attraction from population, asymmetrically

The existing gravity term `sqrt(reachA · reachB)` treats both ends as homes. That is the specific defect the vision's destination attraction proposal names.

The resolution uses **no new dataset**. Population remains the only input, but origin and destination stop being interchangeable:

- A journey has a **direction of purpose**. Commuting, education, and business travel flow from residence toward concentration; shopping, leisure, and tourism flow toward whichever end is the greater attractor at that hour.
- **Attraction scales superlinearly with size.** A place twice as large attracts more than twice the trips, because larger centres hold disproportionate shares of workplaces, institutions, hospitals, and retail. The exponent is a calibration parameter, not a settled figure.
- **Return travel is explicit.** A commute is an outbound journey in the morning and a return in the evening, sampled as two travellers. Demand is therefore directional by hour, and a peak-direction service can be full while the reverse working runs empty, which is the real behaviour of commuter railways.

The accepted limitation is that this cannot tell a city centre from a dormitory suburb of the same population. A 1 km cell of flats near offices and a 1 km cell of flats in a commuter town look identical as destinations.

If that proves too coarse, the **intended extension** is a land-use proxy from the OSM buildings the prototype already fetches for property costing — `buildingType`, `levels`, and `footprintArea` are available at no new data cost. This mirrors plan 02's approach of naming the intended extension rather than pre-building it. A second dataset such as SCB workplace statistics is a further option and is not currently planned.

Population change over time is not modelled. The grid is a snapshot with a year, and induced development around new stations is deferred.

### Journey purposes are broad, and profiles are weights rather than gates

Each traveller has a purpose, and each purpose carries an hourly profile across the week. **Profiles are weights, never gates.** Every purpose retains a nonzero share at nearly every hour of every day.

This is a deliberate modelling instruction, not a detail. A model where business travel exists only on weekday mornings is a caricature that produces a caricatured railway: it would make off-peak and overnight services pointless by construction and rob the player of the reason to run them. A student travelling home on a Saturday night train, a shift worker at 04:00, a business traveller on a Sunday evening, a family on a Tuesday at 11:00 — all of these are uncommon and all of them must exist.

The proposed purposes are deliberately broader than a commute/leisure split:

| Purpose | Character | Profile shape |
| --- | --- | --- |
| Commuting | Time-sensitive, repeated, directional | Twin weekday peaks, with a real floor at all hours for shift work |
| Education | Time-sensitive, term-bound, directional | Weekday morning concentration, long tail, weekend and evening presence |
| Business | Highly time-sensitive, price-tolerant | Weekday daytime spread, notable early departures and Sunday evening positioning |
| Shopping and errands | Flexible, short distance, price-sensitive | Daytime, weekend-weighted, little at night |
| Leisure and social | Flexible, evening-weighted | Evenings and weekends, latest-departure sensitivity |
| Visiting friends and relatives | Long distance, very flexible, price-sensitive | Weekend-weighted, holiday-weighted, strong overnight suitability |
| Tourism | Long distance, seasonal, baggage-carrying | Daytime, weekend and seasonal peaks |
| Healthcare and appointments | Inflexible arrival, toward larger centres | Weekday daytime, morning-weighted |
| Other and irregular | The residual that keeps the model honest | Near-flat, small, at every hour |

Weekday and weekend differences are a **modifier on the same purpose**, not separate purposes, which keeps this consistent with plan 03's refusal of day-type abstractions in the timetable.

Purposes also determine value of time, price sensitivity, baggage, latest acceptable arrival, and willingness to transfer. They are the mechanism by which an overnight sleeper and a suburban stopper both find a market.

Seasonality is noted in the tourism profile but not modelled in v1; the week repeats.

### Choice by generalised cost over real itineraries

A traveller builds a small set of **candidate itineraries** from the published timetable, covering realistic departures around its desired time, including those requiring transfers, and costs each one end to end:

- access time and mode to the origin station,
- waiting, including the penalty for a badly timed departure against the desired time,
- in-vehicle time, **as published** — see below,
- transfer time and a per-transfer penalty,
- crowding experienced onboard,
- the fare,
- egress time and mode at the destination.

Times come from the **published timetable**, not from plan 02's technical minimum. A traveller reads what a passenger reads: departure and arrival times including the allowance the player authored under plan 03, dwell at intermediate calls, and transfer connections judged feasible or not against those same times. This corrects what this plan originally said, which was that in-vehicle time came from the shared closed-form running time directly — the 21 September audit noted that travellers would then plan against times no train actually keeps, overstating demand for every padded service and rewarding the player for padding.

The shared movement function keeps its role: it supplies the technical minimum that plan 03 validates the allowance against, and it drives what the train actually does. It does not supply what the passenger believes. Reliability memory, below, continues to act separately on top of the published times, so a service that chronically fails to keep them still loses demand without the times themselves being quietly rewritten.

One consequence worth naming: the running-time allowance becomes a demand lever as well as a punctuality one. Padding a service makes it genuinely less attractive, which is correct, and makes the trade-off between robustness and attractiveness a real decision rather than a free choice.

The set includes **background alternatives** — car, air, cycling, walking, feeder transit — appropriate to the journey, as the vision requires. These are the outside options the existing catchment model approximates with its fixed `0.35` denominator term, made explicit and journey-dependent. A 40 km trip competes with a car; a 600 km trip competes with a flight; a 2 km trip competes with a bicycle.

Choice among the alternatives is **probabilistic**, not winner-take-all: the traveller draws from a logit over generalised cost. A service slightly slower than its competitor still carries passengers, in proportion to how much worse it is.

A useful consequence of individual travellers: the prototype's per-cell winner-take-all mode selection in [`calculateCatchments`](../../src/catchment.ts) stops being a defect. Picking one mode is correct for one person, and aggregate mode shares emerge from many travellers. The existing scoring becomes a per-traveller draw rather than a per-cell award, and the module keeps its present role as the potential-reach layer.

The number of candidate itineraries must be capped, and the cap is a performance question for plan 08.

### Fares trade against time through purpose-specific value of time

Fare enters generalised cost converted to minutes by the traveller's **value of time**, which differs by purpose. A business traveller is time-sensitive and price-tolerant; a student or a leisure traveller is the reverse.

This plan defines only the trade-off and the resulting elasticity. Plan 06 owns fares, fare policy, and every actual price. Demand therefore responds to price as a curve rather than a threshold, and a single fare change moves different purposes by different amounts, which is what makes fare policy an interesting decision rather than a slider.

Revenue is plan 06's; this plan supplies the journeys it is earned from.

### Capacity is a hard limit and denied boarding is reported

Train capacity comes from plan 04 — seats per type, summed over coupled units, berths for the sleeper. Capacity is a **hard limit**: when a train is full, travellers cannot board.

A denied traveller waits for the next acceptable service and re-evaluates. If the resulting journey is bad enough, it abandons rail and takes a background alternative, which is a lost journey and lost revenue rather than a passenger who eventually travels.

Where a traveller carries a weight above one, a partly full train **splits** it: as many board as there is room for, and the remainder stays behind as a smaller traveller and follows the rule above. This was settled in plan 08 after the 21 September audit observed that an indivisible weight of twenty cannot board three free seats. It keeps the limit literally hard and keeps denied boardings countable in people rather than in sampling groups.

Denied boardings are a named diagnostic, reported per train, stop, and hour, in the same spirit as plan 02's named delay causes. This is what makes plan 04's train lengths and coupling matter: without a hard limit, a two-car unit could carry a city.

Crowding short of capacity degrades comfort and therefore appears in generalised cost, so a reliably full train loses discretionary travel before it starts physically denying boarding.

Standing capacity is not yet distinguished from seated capacity; whether a type needs a crush capacity above its seat count is open.

### Missed connections are a consequence, not a special case

A traveller whose transfer fails because its first train was late re-plans from where it actually is, using the same generalised-cost logic. It may wait, take a different itinerary, or abandon.

There is no separate missed-connection rule, and no protection or held connections: plan 02 already forbids dispatching, so a train does not wait for a late connection. The consequence is simply that tight transfers are risky, and a traveller's planning already accounts for a transfer penalty.

Whether travellers should prefer robust connections over tight ones — an explicit reliability weighting on transfer time — is open.

### Reliability is remembered in aggregate, not per traveller

Sampled travellers are short-lived and cannot hold a history, so memory lives with the game rather than with the individual.

The game maintains observed **reliability and crowding records** per route or origin-destination pair, accumulated from operation, and every traveller consults them as part of generalised cost. A chronically late or chronically full service loses demand gradually, and a repaired one regains it gradually.

This is deliberately visible: the player can see which record is costing them demand, and that a service's reputation recovers over time rather than instantly. The accumulation and decay rates are open, as is whether the record is per route, per origin-destination pair, or per hour band.

### What the prototype must stop doing

Three existing behaviours are superseded rather than extended:

1. **Typed-in frequency.** [`serviceOpportunities`](../../src/planning.ts) takes `departuresPerDay` as direct input with a default of 8. Frequency must be read from the published timetable, as plan 03 already promised. The input survives only as a what-if tool in the planning layer, clearly labelled as a hypothetical rather than as the network's state.
2. **Journey time from section speed.** `coveredJourney` derives minutes from `maxSpeedKph` alone — no acceleration, no dwells, no train type. Plan 02 mandates a single shared closed-form running time for validation and runtime alike, so this function must be **replaced** by that one, not corrected. Its current output is optimistic in a way that would systematically overstate demand.
3. **Symmetric resident-to-resident gravity.** `estimatedDailyDemand`'s `sqrt(reachA · reachB)` becomes directional and purpose-dependent, per the attraction decision above.

The existing catchment model itself is **kept**. Its access modes, urbanity-driven weights, cell subdivision, and station competition are a sound potential-reach layer, and the 45-minute access cutoff and `exp(-minutes/18)` decay are reusable as per-traveller access costs.

## Existing functionality and gaps

The prototype has the SCB 1 km population grid, tiled and lazily loaded by bounds with a data year; a multimodal access model over walk, cycle, transit, and car with density-driven weights and station competition; per-station potential reach with a mode split and coverage cells; and a city-pair gravity estimate with a frequency input.

It has no journey purposes, no time of day, no travellers, no itineraries, no transfers, no fares, no capacity, and no crowding. There is no destination attraction of any kind: both ends of every estimated flow are residents.

Catchment figures are potential reach presented without that qualification in places, which the three-layer separation must fix. The gravity estimate does not route anyone through a service, because there are no services.

Access and egress are currently the same calculation applied at one end. A door-to-door journey needs egress at the far end, where the relevant modes and their weights differ — a business traveller arriving at a city centre station behaves unlike a resident reaching their local one.

Population is a static snapshot, and nothing anticipates demand state in the save format.

## Player workflow

1. Place stations and read **potential reach**, understanding it as who could reach the station, not who will travel.
2. Publish a timetable and read **forecast demand** by hour and purpose over the served pairs, including demand the network fails to capture.
3. Operate, and watch **actual journeys**: loads by section and hour, boardings and alightings by stop, and denied boardings.
4. Inspect an individual traveller's journey to see the choice it made and the alternatives it rejected, with each cost component shown.
5. Compare forecast against actual to find where operation is losing demand the plan expected.
6. Read named causes for lost demand — no service at the needed hour, connection too long, train full, fare above willingness to pay, access too slow, reliability record too poor.
7. Respond by retiming, lengthening or coupling trains, adding a service, moving a station, or changing fares.

Overlay design, the traveller inspector, and how forecast and actual are compared belong to plan 07.

## Minimum data and interface changes

Planning needs implied by the agreed behaviour, not settled schemas:

- **Purpose:** identity, hourly weekly profile as weights with a floor, value of time, price sensitivity, transfer tolerance, baggage, and directionality. Static tuned content.
- **Demand source:** population cells with a data year, and the superlinear attraction derived from them per purpose and hour.
- **Traveller:** origin, destination, purpose, desired departure, value of time, chosen itinerary, current state, and accumulated experience for this journey only. Created on sampling, destroyed on completion or abandonment.
- **Itinerary:** ordered legs with services and trips, access and egress modes, transfers, fare, and the generalised cost components that produced its score, retained for the inspector.
- **Background alternatives:** car, air, cycle, walk, and feeder transit as journey-appropriate outside options with their own costs.
- **Occupancy:** load per trip per section against plan 04's capacity, boardings and alightings per stop, and denied boardings as a named diagnostic.
- **Reliability record:** observed punctuality and crowding per route or pair, with accumulation and decay, consulted by every traveller.
- **Three layers:** potential reach, forecast demand, and actual journeys held and labelled separately, never substituted for one another.
- **Interfaces consumed:** shared closed-form running time, occupancy, and delays from plan 02; published week, frequencies, timed journeys, and transfers from plan 03; capacity, berths, and train length from plan 04; fares and fare policy from plan 06.
- **Interfaces produced:** travelled journeys and revenue basis for plan 06, and load and denied-boarding diagnostics for plan 07.

Traveller storage and the cost of sampling and itinerary search belong to plan 08. The save question raised here is now settled there, and against this plan's original expectation: travellers are **persisted**, not resampled on load. This plan had assumed resampling was affordable and the resulting discontinuity minor; the audit showed it was not minor, because plan 02's dwell depends on passenger exchange and plan 06's revenue depends on journeys, so redrawing passengers changes train timing and money. A reloaded save therefore continues with the same travellers it was saved with.

## Open questions

- **Coefficients:** every number here needs calibration — the attraction exponent, distance decay, value of time per purpose, transfer penalty, crowding penalty, waiting penalty, and the logit scale. None is settled, and the model's behaviour depends on them more than on its structure.
- **Purpose weights:** the hourly profiles themselves, and how large the floor at unusual hours should be. Too small and overnight services die; too large and the peaks stop mattering.
- **Sampling rate:** how many travellers represent how much demand, and whether the rate varies by how closely the player is watching. The weighting part is resolved in [plan 08](08-simulation-architecture-and-saves.md): a traveller always carries a weight, normally one, which scales up as sampling reduces when the live traveller budget binds, so totals stay correct and no code path assumes a weight of one. What remains open there are the two figures splitting needs — the condition under which split travellers merge again, and the minimum weight below which a traveller does not split further.
- **Itinerary cap:** how many candidates a traveller considers, how they are generated, and whether search is shared between travellers with similar journeys.
- **Egress asymmetry:** how far egress differs from access in available modes and weights, given the current model computes one end only.
- **Standing capacity:** whether a type needs a crush capacity above its seat count, and how standing enters the crowding penalty.
- **Reliability record shape:** per route, per pair, or per hour band; and its accumulation and decay rates.
- **Connection robustness:** whether travellers should penalise tight transfers beyond the flat transfer penalty.
- **Forecast method:** whether forecast demand is computed analytically or by sampling travellers without operating them, and how closely it must match actual to be trustworthy. Now that itineraries are costed on published times, forecasting needs those times as an input; where crowding affects dwell and dwell affects the times, the iteration between them must be bounded and its convergence rule stated.
- **Background alternative costs:** how car, air, and feeder transit costs are estimated without a real external network, and how air competition is bounded without modelling airports.
- **Population snapshot:** whether the grid year is surfaced to the player, and whether induced development around stations is ever revisited.
- **Unserved demand:** how demand the network never captures is surfaced without implying a promise that building would capture all of it.

## Dependencies

- **Infrastructure and operations (02):** the shared closed-form running time, actual occupancy, and named delays. `coveredJourney` is replaced by plan 02's function.
- **Services and timetabling (03):** the published week is the only source of frequency and timed journeys, replacing the typed-in `departuresPerDay`. Transfers exist because services do.
- **Fleet and depots (04):** seated capacity, berths, and coupled-unit capacity set the hard boarding limit; length and performance shape journey times.
- **Economy and progression (06):** now written. It sets a national fare rate per passenger-kilometre with per-service modifiers, which this plan consumes as the fare term in generalised cost, and takes travelled journeys as the revenue basis. This plan still sets no price.
- **Interface and player experience (07):** the three-layer presentation, demand and load overlays, the traveller inspector, and named causes for lost demand.
- **Simulation architecture and saves (08):** now written, and revised after the 21 September audit. Travellers run in the worker and are **persisted** with the rest of the session rather than resampled on load, reversing that plan's original position. Traveller sampling and itinerary search are named as the dominant runtime cost, with a live traveller budget and three scenario targets. It also resolves this plan's open question on traveller weighting, and settles that a weighted traveller splits on partial boarding.
- **First playable and validation (09):** the corridor scenario must demonstrate a connected passenger journey with a transfer, a peak-direction crowding case, and a denied boarding.

## Acceptance scenarios

Numerical expectations must be added once coefficients are calibrated.

| Scenario | Expected behaviour |
| --- | --- |
| A station is placed with no service | Potential reach is reported; forecast demand and actual journeys are zero, and the three are separately labelled. |
| A timetable is published over a served pair | Forecast demand appears by hour and purpose, derived from the published week rather than a typed frequency. |
| The player changes a hypothetical frequency in the planning view | It is labelled a what-if and does not alter the network's forecast, which follows the published timetable. |
| A commuter flow is simulated on a weekday | Morning journeys run toward the larger centre and evening journeys return; the peak-direction service loads while the reverse working runs light. |
| An overnight service is timetabled | It attracts travellers — chiefly visiting friends and relatives, leisure, and some education and business — because no purpose is gated out of unusual hours. |
| A student travels home on a Saturday night train | A valid, uncommon traveller, not an impossible one. |
| A journey time is needed for demand | It comes from plan 02's shared closed-form running time, including dwells and train performance, never from section speed alone. |
| A 600 km journey is evaluated | Air is among the background alternatives; on a 40 km journey it is not, and a car is. |
| Two services differ slightly in journey time | Both carry passengers, split by the logit rather than the faster taking all. |
| A business traveller and a student face the same fare rise | The student's demand falls further, because value of time and price sensitivity differ by purpose. |
| A train reaches its capacity mid-route | Further travellers cannot board; they wait for the next acceptable service or abandon to a background alternative. |
| A traveller is denied boarding | It is reported as a named diagnostic against that train, stop, and hour, not absorbed into a crowding average. |
| Two coupled units work a busy trip | Capacity is the sum, and the denied boardings that occurred with one unit do not recur. |
| A traveller's first train is late and its transfer fails | It re-plans from where it is under the same generalised-cost logic; no train is held for it. |
| A service is persistently late for several weeks | Its reliability record degrades and demand falls gradually; after repair, demand returns gradually rather than instantly. |
| The player asks why a service is empty | A specific named cause is given — access, hour, connection, capacity, fare, or reliability — rather than a single demand number. |
| The player inspects one travelling traveller | Its chosen itinerary and the rejected alternatives are shown with each generalised-cost component. |
| Forecast and actual diverge over an operated week | The difference is presented as a comparison attributable to crowding, delays, missed connections, or denied boarding. |
| Demand exists between two unserved places | It appears in the forecast layer only; no travellers are instantiated for it. |
| A traveller weighted twenty reaches a train with three seats free | It splits: three board, seventeen wait or abandon. The denied boarding is reported as seventeen people, not as one group or as twenty. |
| A save is reloaded mid-journey | The same travellers continue the same itineraries; none is redrawn, so dwell and revenue are unaffected by the reload. |

## Deferred features and planning boundaries

- No party or group travel; one traveller is one person, and a sampling weight above one is a ratio rather than a group.
- No persistent residents and no per-traveller memory or habit; reliability memory is aggregate.
- No new demand dataset: attraction comes from population only, with the OSM building proxy named as the intended extension if that proves too coarse.
- No population growth, and no induced development around new stations.
- No seasonality beyond a noted tourism tendency; the week repeats.
- No rival operators, no real-world external timetables, and no modelled airports; background modes are costs, not networks.
- No ticket types, reservations, season passes, revenue management, or yield pricing. Fare policy is plan 06's and is not elaborated here.
- No held or protected connections, and no dispatching to recover a missed transfer, per plan 02.
- No modelled station interchange walking distances or platform-level geometry, consistent with plan 02's no-throat simplification.
- No freight, and no non-passenger demand of any kind.
- No standing-versus-seated distinction in the initial approach, pending the crush-capacity question.

This document records the determinations reached so far and does not authorize application changes. Calibrate the coefficients, settle the purpose profiles and the sampling rate, and agree the scalability strategy with plan 08 before treating it as implementation-ready.
