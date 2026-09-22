# Implementation brief

Written 2026-09-22, when the planning set was completed. **For the assistant or developer beginning implementation.**

Planning is finished. Ten documents in `plans/v1/` record every settled decision, and the 21 September audit is fully resolved. Your job is to build what they describe, starting at milestone 0.

This brief is not a substitute for the plans. It tells you how to work, what is already decided, and where the traps are.

---

## 1. Read these first, in this order

1. [09-first-playable-and-validation.md](09-first-playable-and-validation.md) — the delivery sequence, the milestones, and what "done" means. **This is your working document.**
2. [08-simulation-architecture-and-saves.md](08-simulation-architecture-and-saves.md) — the worker boundary, the clock, determinism, saves. This is milestone 0's subject matter.
3. [00-game-vision.md](00-game-vision.md) — the shape of the whole thing, in one page.
4. [HANDOFF.md](HANDOFF.md) — how the planning set was built and what its conventions mean.

Read the rest when the milestone you are in reaches them. Do not read all ten before writing code.

---

## 2. Non-negotiables

These are settled decisions that later work depends on. If you think one is wrong, **stop and say so** — do not route around it.

**Architecture**

- All simulation state lives in **one Web Worker**. Commands in, viewport-scoped snapshots out. React owns the interface, the map, and editing intent, and nothing else.
- **One movement function and one occupancy model**, shared by tier 1 validation, tier 2 validation, forecast and live operation. Two implementations that agree today will diverge.
- The domain core is **pure TypeScript with no React, DOM or MapLibre dependency**, and runs unchanged in headless tests and in the browser worker.
- **No game rule may be duplicated into interface code**, even temporarily during extraction. A rule in two places is a defect regardless of whether the two currently agree.
- Fixed timestep, decoupled from rendering. Fast-forward runs **more steps**, never larger ones.
- Determinism is a requirement: seeded generator, ordered iteration. Same save plus same seed plus same inputs must give the same outcome.

**State and saves**

- **A save restores the session exactly.** Clock, running trips, train positions and speeds, occupancy, reservations, onboard loads, travellers and their itineraries, mileage, servicing progress, ledger, contract progress, reliability records, generator state. Reloading puts the player back where they were with nothing quietly reset.
- The only test for what may be recomputed on load is **visible against invisible**: recompute only what the player cannot detect being rebuilt. When in doubt, persist it.
- Saves go in **IndexedDB**. `localStorage` is for interface preferences only.
- **Never silently discard data.** On an incompatibility, refuse, name what is incompatible, and leave the file untouched.
- **Undo exists only while paused.** The stack clears on resume, on load, and on publication.

**Simulation rules**

- **The published timetable decides single-track contention**: a planned meet first, then the earlier scheduled path, then trip identity. Lateness never overrides the player's plan.
- Every actual departure is identified by **trip plus week occurrence**. Publishing mid-week must never fire a departure twice, and one whose time has passed is **skipped and reported as skipped**.
- Travellers plan itineraries on **published times** including the player's authored allowance — never on the technical minimum.
- Capacity is a hard limit. A weighted traveller **splits** on partial boarding; people are conserved exactly.
- **Nothing is ever blocked for want of money.** No loans, no insolvency state, no game over, and debt carries no consequence of its own.

**Interface**

- The map is the application. A **bottom bar** opens four workspaces: Routes, Timetable, Fleet, Finance.
- A workspace is **as large as its work requires**: Routes is a sidebar because it uses the map; the others cover it because they do not.
- **Construction stays a contextual sidebar** over the map. It is not a workspace and does not appear on the bar.
- In **sandbox**, Finance is absent rather than empty — the bar has three buttons.
- Signalling is never exposed anywhere, including in assistance.
- **No onboarding in v1.** Deferred deliberately.

**Vocabulary — use these words in code, comments, UI and commits**

| Use | Not |
| --- | --- |
| **route** | service |
| **schedule** | duty |
| **timetable** (draft / published) | published week, draft week |
| **traveller** | agent, passenger agent |

"Service" survives only in its unrelated senses — public service contract, service interval, service brake, servicing — and as ordinary English for a train a passenger catches.

---

## 3. How to work

This project has a specific method, and it produced a planning set that holds together. Keep it.

1. **Ground in the code before proposing anything.** Read the modules involved and report what they actually do, including what they do wrong. This has repeatedly changed decisions.
2. **The plans are the decision record, not a suggestion.** When the code and a plan disagree, the plan is right until the user says otherwise.
3. **When the plans are silent, ask — do not assume.** The standing instruction is: settle blocking decisions with the user via questions before building. A decision you quietly assume becomes load-bearing for everything after it.
4. **Decide small things yourself and say that you did.** Not every choice needs a question. Mark the ones you made.
5. **Expect to be overridden**, and record the user's choice faithfully, including the argument for it and the cost, rather than minimising it.
6. **Scope is the deliverable.** Build the milestone you are in. If you notice something outside it, write it down and carry on.

---

## 4. Milestone 0 — your actual first task

**Deliverable:** preserve current editor behaviour; freeze the contracts as code; add a headless core, the worker protocol, a deterministic clock, a checkpoint skeleton, and a tiny synthetic fixture; extract from `App.tsx` only what the boundary needs.

### 4.1 Write the contracts first

As **TypeScript types plus a short README in the repository** — not as another planning document. Compiler-enforced beats agreed-and-drifted-from. They cover:

- identifiers and units (state units explicitly: metres, seconds, km/h, SEK);
- simulation time, and **week-occurrence identity**;
- conversion from construction geometry to the operational graph;
- command acknowledgement and revision rules;
- the error taxonomy — every failure must be nameable;
- the ownership split between **authored**, **durable** and **derived** state;
- the save schema;
- the first fixture.

**Tuning constants do not belong here.** Train performance, demand coefficients and costs live in versioned tuning data, with source evidence and any gameplay adjustment as **separate fields**, so calibration never requires a code change.

### 4.2 Then the core

A pure TypeScript domain core, the worker protocol, a deterministic fixed-step clock, and a checkpoint skeleton that satisfies the restore-exactly rule.

### 4.3 Extraction discipline

`App.tsx` is **1,476 lines** owning project state, cost computation, editing intent, catchment orchestration and interface state together. Plan 08 requires it broken up before the worker boundary can exist.

**Take out only what this milestone needs**, starting with project state and cost computation. Do not restructure it as a project of its own — a refactor designed before a train has run is guided by guesses, and the audit's judgement is that those guesses are usually wrong. The file shrinks as a consequence of building.

### 4.4 Exit evidence — this is the definition of done

- The same command sequence gives the same outcome at normal and accelerated rates.
- A save restores the session exactly, per plan 08.
- The existing **66 unit tests and the Playwright suite stay green**.
- An early larger synthetic workload gives a first reading on scale cost.

Do not declare the milestone done because the code exists. Each milestone is defined by its evidence.

---

## 5. Three known defects, in scope for milestone 0

These are real, confirmed, and the contracts touch all three.

1. **`persistence.ts` silently discards data.** The `legacyStations` path drops *every* station in a save when it finds one missing `corridorId`, and loads the rest. A player has no way to know or recover. Plan 08 forbids this outright.
2. **`coveredJourney` in `planning.ts` must be deleted, not corrected.** It derives journey time from section `maxSpeedKph` alone — no acceleration, no dwells, no train type — and is a second journey-time implementation, which the one-movement-function rule forbids.
3. **`serviceOpportunities` takes `departuresPerDay` as direct input** (default 8). It must read frequency from the published timetable. The input survives only as a labelled what-if.

The rest of the module is held up as the standard: `persistence.ts`'s field-by-field validation of untrusted save data is exactly right and should be the model for every new persisted type. `catchment.ts` is kept nearly intact. `cost.ts` keeps its structure; only its magnitudes change.

---

## 6. The map is national from day one

`region.json` covers Sweden at `[10.5, 55.0, 24.5, 69.2]`. The bundled snapshot is a 32 MB rail network, 8 MB of places, 7 MB of transit stops, and population tiled across roughly a hundred and ten files.

**Never clip the dataset, add a starter region, or gate geography.** The player may build anywhere in Sweden immediately.

What *is* staged is simulation scale — how many trains, trips and travellers run. Plan 08's corridor, regional and national scenarios measure simulated entities, not loaded map. A milestone-3 player with four stations is running a corridor-scale simulation on a national map, and that is the intended combination. Your milestone 0 load and memory figures therefore already carry the full dataset; that is the honest baseline, not a problem to fix.

---

## 7. Repository conventions

```bash
npm test
```

```bash
npm run build
```

- `npm test` runs 66 node tests via tsx. `npm run test:e2e` runs Playwright. `npm run dev` starts Vite on 127.0.0.1.
- `npm run build` is `tsc -b && vite build`. It must pass.
- Match the surrounding code's style, comment density and naming. It is generally good code — read before rewriting.
- Test domain invariants directly: separation, reservations, capacity, unit identity, money conservation, determinism, checkpoint round-trips, publication transitions, week boundaries.
- Benchmark with repeated runs and p95, on a named machine. Never assert a single timing on arbitrary hardware.
- Keep changes small and reviewed. Introduce minimal UI alongside each behaviour so usability failures surface early.

---

## 8. Do not

- Do not implement the plans in document order, or attempt the national simulation in one pass.
- Do not build interface ahead of the simulation it presents. Surfaces arrive as their milestone needs them.
- Do not add a tenth planning document. Contracts are code.
- Do not rewrite `App.tsx` wholesale before a train runs.
- Do not put tuning constants in the contracts.
- Do not let a mechanical rename run unreviewed — review the diff, not the count. Four errors slipped through the last one and were caught only by reading it.
- Do not expand the corridor scenario to demonstrate something it was not chosen to demonstrate. If you need a bigger case, add a fixture.
- Do not treat plan 08's ten-train corridor figure as the playable scenario's fleet; it is a stress fixture.

---

## 9. Open items you will hit

Settled as open, not as oversights. Raise them when the milestone reaches them.

- **The reference machine** for plan 08's performance targets is unnamed. Use the development machine, name it in the README, revise later. It does not block milestone 0.
- **Scenario figures** — every number in plan 09's corridor table is proposed and indicative. The user has said not to worry about them yet.
- **Four calibration tasks** run alongside implementation, not before it: the train catalogue figures, plan 02's separation formulae against those braking rates, plan 05's demand coefficients, and plan 06's costs sourced from Swedish evidence.
- **Plan 08's performance targets cannot be validated by discussion.** They need something to measure. If national proves unreachable, the first response is measurement — routing cost against traveller population, caching, shared search — not a change to the demand model.

---

## 10. When a plan turns out to be wrong

It will happen. Implementation finds things discussion cannot.

Say so directly, name which document and which decision, explain what the code showed, and ask. Do not silently build something different — the plans are cited by each other as settled, so a quiet divergence propagates. When a decision does change, update the owning plan and every document that cross-references it, exactly as the set has been maintained so far.

The one thing you should not do is treat a plan as binding when the evidence says it is wrong. It was written without an implementation to check it against. That was the point of writing it first, and also its limitation.
