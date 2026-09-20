# Intercity rail proof-of-concept review

Reviewed September 20, 2026. Opportunities 4–8 were implemented in the subsequent proof-of-concept pass. Opportunities 1–3 remain proposals.

Implementation note: population is now an opt-in adjustable planning layer; map states distinguish built, draft and invalid geometry; Network provides a searchable station/yard/service-opportunity inventory; editor actions are sticky and yard connections labelled; catchment is labelled potential reach and kept separate from an explicit city-pair demand estimate; a €750m demonstration budget, deterministic demo, offline basemap fallback, and Playwright desktop/narrow theme flows were added. The raw yard-coordinate section was removed entirely at the user's direction rather than moved under Advanced.

The prototype already communicates railway construction well: real geography, connected routing, station catchments, property acquisition, and configurable infrastructure. The biggest missing piece for a game demonstration is a short, visible cause-and-effect loop between building a railway and running an intercity service.

## Recommended order

| Priority | Opportunity | Current evidence | Proposed outcome | Relative scope |
| --- | --- | --- | --- | --- |
| 1 | Protect the player's work | `src/App.tsx` starts with `emptyProject`; `src/persistence.ts` has one manually saved browser slot. Construction, acquisitions and removal have no undo history. | Autosave a recoverable working draft, resume on launch, and Undo/Redo covering construction plus associated spending/demolition. Add named projects and export/import after that. | Medium |
| 2 | One small playable intercity scenario | `README.md` explicitly describes no operational simulation; `src/types.ts` models infrastructure but no service, train or timetable. | A curated two-city route: build the missing link, open two stations, assign one train, and watch a departure reach its destination. A visible objective and completion result make the existing editor into a demonstrable game loop. | Large; deliberately constrain the first scenario |
| 3 | A service layer that explains infrastructure choices | Tracks have speed, count and electrification, but the interface primarily reports kilometres and total spending. | Select an origin/destination and a few calls; show estimated journey time, frequency, usable train types and capacity. Let improving infrastructure change those numbers before adding a full dispatch simulation. | Medium to large |
| 4 | A clearer map hierarchy | Population is on by default in `src/App.tsx`; the supplied screenshot's red population cell dominates the yard, buildings and railway. | Treat population as a planning view with adjustable intensity; keep selected infrastructure, approaches and acquisition conflicts distinct. Use clearly different styling for built track, draft track and invalid geometry. | Small to medium |
| 5 | An infrastructure overview, separate from the map editor | There is a yard list within Yard mode, but no unified project inventory of stations, yards and services. | A compact searchable network list with click-to-focus, names, connection status and relevant capacity. A station page can eventually show its served lines and departures. Keep empty map selection unobstructed. | Medium |
| 6 | Finish the editing interaction | `src/YardPanel.tsx` exposes raw corner coordinates; Apply/Cancel can scroll below the map controls. `src/MapView.tsx` still uses fixed focus padding in several places. | Put Apply/Cancel in a persistent action strip, move coordinates to Advanced, label entrance/exit handles, and derive camera padding from the visible panel. Add clear feedback for a valid snap, unavailable connection and unapplied draft. | Small to medium |
| 7 | Make demand and money legible | `src/catchment.ts` estimates station access using population and proximity; it does not represent intercity passenger trips. `Project.spent` accumulates construction spending without a budget or income loop. | Label access population as potential reach. For the scenario, introduce a small explicit city-to-city demand model and a budget objective; show why journey time, frequency and station placement matter. Avoid presenting catchment residents as passengers. | Medium to large |
| 8 | Demonstration reliability | `package.json` runs unit tests and a build; browser flows are verified manually. The basemap and fonts require network access. | Add a few automated end-to-end flows (build, undo, restore, edit/cancel, and run a service), a deterministic demo project, and a clear offline/error state. Test narrow desktop sizes and all supported map themes. | Medium |

## Suggested first demonstration

A five-minute session should answer: what am I connecting, what did my construction improve, and can I see a train use it?

1. Open a named two-city scenario already framed at the right map scale.
2. Complete a missing corridor and place a station with a visible access-population preview.
3. Assign one compatible train to a service and choose a simple frequency.
4. Start time and watch it depart, stop and arrive, with a small departures/journey-time panel.
5. Upgrade one bottleneck and compare the service outcome.

The first slice need not include nationwide scheduling, realistic signalling, multiplayer, a full fleet market or a detailed macroeconomy. Those would make the demo harder to finish before the core intercity loop is proven.

## Acceptance checks for a more complete product

- A first-time player reaches a moving train without needing verbal instructions.
- Refresh and an accidental edit do not lose the player's work.
- Every construction action has a visible effect and an understandable cost.
- Selected objects remain visible while editing, including at the smallest supported desktop size.
- Stations and yards explain their place in the network rather than only listing editable geometry.
- Potential station reach, estimated passengers and actual service performance are presented as different quantities.

The older `reports/usability-review-2026-09-16.md` contains useful history, but some of its interaction findings have since been fixed; this review does not treat its old reproduction results as current failures.
