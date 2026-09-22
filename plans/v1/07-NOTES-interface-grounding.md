# Grounding notes for plan 07: what the interface does today

Written 2026-09-21, for the plan 07 discussion. **These are notes, not a plan.** They record what the prototype's interface actually is, so the plan 07 decisions are made against the real thing rather than from memory. Nothing here is a decision, and nothing here authorises application changes.

Plan 07 is the last subsystem plan. It carries a backlog from all seven others, and three decisions taken on 21 September made it heavier rather than lighter — see [What changed on 21 September](#what-changed-on-21-september) at the end.

## The shape of the application as built

One React component tree, one screen, no routing, no modes. [`App.tsx`](../../src/App.tsx) is 1,476 lines and owns everything: project state, tool state, selection state, editing intent, interface state, cost computation and catchment orchestration. [`MapView.tsx`](../../src/MapView.tsx) is another 1,108. [`styles.css`](../../src/styles.css) is 1,509.

The layout is four regions:

| Region | What it is |
| --- | --- |
| `header` | Brand, save state indicator, Network overview toggle, Load, Save, New project |
| `nav.toolbar` | Seven construction tools, vertical, with tooltips and number-key shortcuts |
| The map | Full-bleed MapLibre canvas underneath everything |
| `aside.sidebar` | Context editor, appears only when a tool is active or something is selected |

Plus floating overlays: map-top controls (dark mode, layers popover), a connectivity status line, and a toast.

**This is already "map as the primary surface with panels over it."** Not as a decision anyone recorded — it is just what got built. Plan 07's question about map-versus-screens is therefore a question about whether to *keep* it, and the cost of changing it is 2,600 lines of coupled component code. That is worth knowing before the question is asked.

## The seven tools

From [`App.tsx:71`](../../src/App.tsx:71):

`select` (1), `build` track (2), `passing` section (3), `overtaking` section (4), `station` (5), `depot`/Yard (7), `delete` (6).

Note the key order: Yard is `7` and Delete is `6`. Yard was added later and took the next free key rather than the next position. Small, but it is the kind of thing an interface plan should decide deliberately rather than inherit.

There is **no tool for anything plan 03 onward needs**: no service, no timetable, no trip, no duty, no fleet, no contract. Every workflow the other six plans describe has no entry point in this interface at all.

## The sidebar is the only editor

`aside.sidebar` at [`App.tsx:891`](../../src/App.tsx:891) is conditional on `tool !== "select" || station || selection || anchor`. It becomes a modal `role="dialog"` when editing a station or yard — the code calls this `infrastructure-edit-overlay`.

What it currently holds: track parameters (tracks, speed, electrification), station parameters (name, position, lateral offset, length, platforms, symmetric resize), yard editing, route errors, and the catchment readout.

This one panel is the pattern every future panel will be judged against. Plan 07 has to decide whether the timetable editor, the fleet panel, the depot panel, the contract browser and the traveller inspector are all *this* — one contextual sidebar that swaps contents — or something else. The current sidebar is already doing a lot with a single slot.

## What the interface already does well

Worth naming, because plan 07 should keep these rather than rediscover them.

- **Live preview before commit.** `preview`, `affected` and `blocked` ([`App.tsx:233`](../../src/App.tsx:233), `:265`, `:308`) compute the geometry of a pending edit, the buildings it would take, and the roads it would block — before the player commits. Plan 02's "affected-service previews before an edit" has a working precedent here.
- **Property cost shown against the actual buildings affected.** `propertyCost` sums real OSM building estimates for the current draft footprint.
- **Accessibility is not an afterthought.** `aria-label` on every tool, `aria-pressed` on toggles, `role="alert"` on route errors, `role="status"` on the toast and connectivity line, `role="group"` on the population mode switch, `aria-label` on the dialog. Plan 07's accessibility section starts from a decent baseline, not from zero.
- **Offline is handled.** `navigator.onLine` drives a status line saying local railway data remains editable.
- **Keyboard shortcuts exist** and are surfaced in the tool tooltips via `<kbd>`.

## What will not survive contact with the other plans

- **`dirty` is the entire save model.** A boolean. There is no undo stack, no autosave, no recovery slot, no export. Plan 08 requires all four.
- **`DEMO_BUDGET` is displayed as "remaining"** in [`NetworkOverview.tsx`](../../src/NetworkOverview.tsx) as `DEMO_BUDGET - project.spent`. Plan 06 has deleted the concept this is showing. This panel needs rewriting, not adjusting.
- **Six layer toggles** (`row`, `buildings`, `roads`, `population`, `catchment`, `transit`) plus a population mode switch (density / all catchments) and an opacity slider. Plan 05 adds three demand layers that must stay visually distinct, plus load overlays. The layers popover is already near its comfortable limit.
- **`serviceFrequency` is a slider feeding a what-if.** [`NetworkOverview.tsx`](../../src/NetworkOverview.tsx) takes `frequency` as a direct input to `serviceOpportunities`. Plan 03 demotes this to a labelled what-if and requires the real figure to come from the published timetable. The control survives; its authority does not.
- **The network overview is an inventory, not a diagnostic.** It lists stations, yards and service opportunities with a text filter. Plans 05 and 06 need it to explain *why* a week went badly, which is a different kind of panel.

## The hard question plan 07 has to answer first

The other plans have quietly assumed an interface that does not exist and has no precedent here:

- a **timetable editor** — table, time-distance diagram, or both (plan 03 left this open)
- a **time-distance diagram** of planned against actual, whose network scope plan 02 explicitly left open
- **three demand layers** that must never be conflated (plan 05)
- a **traveller inspector** showing chosen and rejected itineraries with cost components (plan 05)
- a **weekly statement** by category, with attribution of a bad week to a cause (plan 06)
- **pending validation shown as pending**, not as clean (plan 08)

None of these fits the single contextual sidebar. The first real decision is probably not "table or graph" but **whether one sidebar slot can carry the whole game**, because every other layout decision follows from that answer.

## What changed on 21 September

Three decisions from the audit repair pass land directly on plan 07, and two of them make it harder.

1. **The economy has no constraints left.** Bounded borrowing and the insolvency block were both removed; the balance goes negative without limit and debt has no consequence. Plan 06 states the cost plainly: money no longer constrains any individual decision. **The weekly statement and the attribution of a bad week now carry the entire burden of making the economy matter.** They are not reporting features any more — they are the mechanic. There are also no borrowing controls to design, because there is no borrowing.
2. **Sandbox tracks no total money at all.** The two modes differ in what money means, not in what it prevents. Sandbox keeps fares and profitability and has no balance, no debt and no contracts. So parts of the financial interface must be absent in one mode rather than disabled in it — "how much money do I have" has no answer in sandbox.
3. **Undo only exists while paused.** The stack clears on resume, load and publication. The interface has to make that legible, or players will reach for undo mid-operation and find nothing. This is a presentation problem created deliberately, and plan 08 hands it here.

Also newly assigned to plan 07 by that pass: **departures skipped on publication** are a new state to show (plan 03), and **fleet conflicts reported at publication without blocking** need a presentation that does not read as an error (plans 03 and 04).

## Suggested first round of questions

Not decisions — a starting point for tomorrow, in the order the dependencies seem to run:

1. Does the single contextual sidebar carry the whole game, or do the timetable, fleet and finance workflows become distinct surfaces?
2. Is the timetable editor primarily a table, primarily a time-distance diagram, or both linked?
3. How much of the network does a time-distance diagram cover at once? (Plan 02 left this open and it constrains the answer to 2.)
4. How are the three demand layers kept visually distinct, given six layer toggles already exist?

Onboarding and accessibility are probably a later round: both depend on what the surfaces turn out to be.
