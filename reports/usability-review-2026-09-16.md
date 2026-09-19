# Right of Way usability review

Reviewed September 16, 2026 against the local product at http://127.0.0.1:5173.

The construction logic works in the flows tested, but the interaction model still requires users to learn hidden rules. Fix the input, recovery, mode-discovery, and map-layout issues before treating this as plug-and-play.

## Required changes, in priority order

### 1. P1 — Ordinary speed typing produces the wrong value

**Reproduced:** Select a section, select all text in Maximum speed, and type `200` normally. The field ends at `320`. Preset buttons avoid the bug, but users should not need that workaround.

**Cause:** `src/App.tsx:794` clamps the controlled input to 80–320 on every keystroke. The first `2` becomes `80`, corrupting subsequent typing.

**Change:** Keep draft text while typing; validate and clamp on blur or Enter. Use the same approach for endpoint distances, which also clamp on every change. Verify typing, clearing, replacing, decimals, and keyboard stepping.

### 2. P1 — Refresh silently loses work; save state is hidden on smaller desktops

**Reproduced:** Built 15.6 km of single track, added a 1 km passing section, and upgraded Hallsberg. Refresh returned the project to 0 km, €0, and 0 upgrades without warning. At the tested 1026 px desktop width, the Unsaved changes indicator is hidden.

**Related code findings:** Initial state is always an empty project (`src/App.tsx:56`); the brand is a navigation link (`:383`); Load replaces the working project without checking dirty state (`:338`). Saved projects require explicit Load. There is one browser-local save slot and no export/import.

**Change:** Autosave and restore the working draft, visibly distinguish saved/unsaved state at every width, and protect replacement of dirty work. Make returning to a saved project automatic or offer an obvious resume action. Add export/import for a portable final product.

**Scope:** No existing browser save was overwritten or loaded in this audit; the reload result concerns the test session's unsaved work.

### 3. P1 for mobile support — The editor obscures the map and focus cannot fit

**Reproduced at 390 × 844:** The fixed 290 px sidebar covers most of the usable map and has no collapse affordance, including on the welcome screen. Selecting A long-distance corridor logs: `Map cannot fit within canvas with the given bounds, padding, and/or offset.`

**Cause:** Phone styles retain a large floating sidebar (`src/styles.css:1107` onward). Map focus still reserves 85 px on the left plus 330 px on the right, exceeding the viewport width (`src/MapView.tsx:614`).

**Change:** Use a collapsible bottom sheet or explicit Map/Edit views; calculate focus padding from the actual unobstructed map area. If mobile is out of scope, state the supported minimum size explicitly.

### 4. P2 — Changing corridors requires a hidden clear-selection ritual

**Reproduced:** In Build mode, select a corridor, then click a different visible railway. A toast says to clear the current section with × first. Escape leaves the track selection in place.

**Cause:** Cross-corridor clicks are rejected (`src/App.tsx:241`), while Escape only clears station selection (`:215`).

**Change:** Let a click on another corridor start a new preview, with protection only if needed for a meaningful uncommitted edit. Escape should consistently cancel the current preview; expose a labeled Cancel action.

### 5. P2 — Station mode initially offers no stations to click

**Reproduced:** On an empty project, choose Station. The welcome panel still instructs users to choose a corridor/build track, the map hint still says Select a corridor, and there are no interactive station dots. The station dropdown works, but is below the welcome material.

**Cause:** Station markers are restricted to selected stations or stations near built/preview track (`src/MapView.tsx:138`). Entering Station mode clears the track selection.

**Change:** Show a station-specific panel and searchable picker immediately, display selectable station markers at suitable zoom levels, and give the active tool an accurate instruction. Apply similarly specific empty states to passing, overtaking, and delete tools.

### 6. P2 — First click chooses an unexplained, potentially huge section

**Reproduced:** Build your first section only changes tool mode. A subsequent railway click selected a 16.71 km section and immediately quoted €34.59m. It did not guide me through placing A then B or automatically frame the new selection. I needed the small Zoom to selection icon to inspect it.

**Cause:** A single click chooses up to 20 km or 30% of the corridor (`src/App.tsx:256`). Subsequent clicks move whichever endpoint is nearest rather than explicitly placing B.

**Change:** Use a clear two-step Pick start / Pick end interaction, with hover preview and snapping feedback. Alternatively, visibly explain the default section and frame it immediately. Distinguish the selected span from the full corridor.

### 7. P2 — Map controls can cover endpoint handles

**Observed:** After Zoom to selection on Godsstråket genom Bergslagen, the upper endpoint was partly covered by the Dark map control. The action intended to expose the selection still left a drag target obstructed.

**Change:** Reserve the complete overlay area when framing, or relocate controls. Acceptance: both endpoint handles remain visible and draggable after fit/zoom at supported sizes.

### 8. P2 — No undo for expensive or destructive edits

**UI/source finding:** There is no undo/redo or operation history. Delete has no refund and does not restore acquired buildings; it is not a recovery mechanism for an accidental Apply. Load is the only rollback-like action and replaces the entire project. Delete's Apply button also bypasses normal validity checks, permitting a remove action even when there is nothing built in the chosen span (`src/App.tsx:272` and `:866`).

**Change:** Add undo/redo for construction, acquisition, station edits, and removal. Disable no-op removal and clearly preview what will be removed. Undo should restore project costs and acquisitions as well as track geometry.

## Further interaction improvements

- **Station constraints need an actionable next step.** A 400 m / 12-platform Hallsberg preview correctly blocks Apply and names a service road, but only says reduce length or platform count. Offer zoom-to-conflict and a feasible configuration suggestion, reducing repeated plus/minus trial and error.
- **Make affected properties reviewable in a list.** The existing map popup worked and included acquisition detail, but inspecting many small red footprints requires precise individual map clicks. A synchronized list would make review easier.
- **Keep the primary action and station navigation accessible.** Editor content grows beyond the visible panel. A sticky review/apply footer and a prominent station search would avoid repeated sidebar scrolling.
- **Communicate active/selected controls programmatically.** Toolbar mode and track/preset selection primarily use CSS classes. Add pressed/selected semantics, and provide a keyboard-accessible corridor picker so the map is not the only way to start an arbitrary section.

## Verified working

- Single-track construction and subsequent identical-settings prevention.
- A 1 km passing section on the new single-track segment; cost and total length updated plausibly.
- Numeric endpoint replacement using a whole-value fill.
- Station dropdown navigation to Hallsberg.
- Hallsberg 400 m / 6 platforms: two acquired buildings, property popup, successful Apply, and removal of those acquisition charges from the subsequent preview.
- Hallsberg 400 m / 12 platforms: road obstruction feedback and disabled Apply.
- All 11 existing automated tests passed.
- Production TypeScript/Vite build passed, with a large-bundle warning.

## Limits

This was a hands-on local exploratory review plus focused source inspection, not an exhaustive compatibility or accessibility audit. Save/load persistence, offline behavior, touch gestures, and all station/corridor combinations were not exercised. Source-only findings are identified above. No product source changes were made. Browser test construction was discarded on refresh, and the temporary phone viewport was reset.

Recommended implementation order: speed/endpoint input handling; autosave and recovery; tool-specific selection flows; responsive map/editor layout; undo/redo; conflict-review polish.
