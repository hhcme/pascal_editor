# 2D Sketch

The 2D sketch feature is intentionally split between geometry utilities and floorplan UI modules.

- `@pascal-app/core` owns true circular sketch geometry sampling and measurement for circles/arcs.
- `sketch-geometry.ts` owns pure line geometry: rectangle segment creation, profile detection, driven length/orientation edits, and unsupported profile checks.
- `components/editor/floorplan/sketch-state.ts` owns transient drawing state for line, rectangle, smart dimension input, and point/line reference distance picks.
- `components/editor/floorplan/sketch-actions.tsx` owns scene mutations: sketch creation, dimension actions, relation toggles, deletion, and profile conversion.
- `components/editor/floorplan/sketch-edit.ts` owns endpoint and whole-line drag state.
- `components/editor/floorplan/sketch-layer.tsx` owns SVG rendering for sketch lines, profile highlights, distance overlays, and edit handles.

Supported V0 behavior:

- Sketch line and construction line drawing.
- Persisted true circle/arc sketch node model and pure circular geometry helpers.
- Rectangle sketch creation with horizontal/vertical relations.
- Endpoint snapping to existing sketch endpoints while drawing sketch lines and rectangles.
- Coincident endpoint links are persisted when drawing snapped or chained sketch geometry.
- Smart dimension for line length and circle/arc radius.
- Persisted sketch dimensions can now be marked as driven or reference, with reference dimensions rendered distinctly and excluded from definition locking.
- Full sketch circles can switch persisted radial dimensions between radius and diameter display/input without changing the underlying radius solver.
- Horizontal, vertical, fixed, and construction/reference relation toggles.
- Equal-radius, concentric, and circle/arc tangent constraints for selected sketch circles/arcs.
- Tangent command for making a selected sketch line tangent to a clicked sketch circle or arc, with lightweight persistence across circle radius/center edits.
- Trim/extend selected sketch lines to another clicked sketch line, circle, or arc.
- Trim/extend selected sketch arcs to a clicked sketch line, circle, or arc.
- Offset, mirror, and linear pattern commands for selected sketch lines.
- Offset, mirror, and linear pattern commands for selected sketch circles/arcs.
- Equal length command for multi-selected sketch lines.
- Chamfer and true arc fillet commands for selected sketch line corners.
- Split sketch lines at clicked positions while preserving lightweight endpoint connectivity.
- Sketch line panels and floorplan overlays now support persistent length and angle dimensions with driven/reference modes.
- Smart dimension mode can now create persistent reference distance dimensions between sketch line endpoints, sketch circle centers, and whole sketch lines.
- Persistent sketch distance dimensions can be selected in the floorplan and managed from a dedicated inspector panel.
- Driven sketch distance dimensions can now rewrite the end reference geometry from the inspector for point-point, point-line, and parallel line-line measurements.
- Floorplan distance dimensions now support the same direct-edit flow as line/circle dimensions: smart-dimension clicks open input immediately, and double-clicking opens numeric edit.
- Endpoint context menus can attach a line endpoint to the nearest straight sketch line interior, line midpoint, or circle/arc point, with lightweight persistence across target edits.
- Endpoint drag and whole-line move in the floorplan, including lightweight coincident endpoint propagation.
- Endpoint drag and whole-line move preview now resolves lightweight line-to-line and coincident constraints before commit, so equal-length, parallel, perpendicular, collinear, and coincident relationships stay visible while dragging.
- Selected or hovered sketch lines show relation badges and coincident endpoint markers in the floorplan.
- Selected or hovered sketch circles/arcs show relation badges in the floorplan.
- Sketch relation badges can also be pinned visible globally from the sketch inspector.
- Selected or hovered sketch lines, circles, and arcs show lightweight under/fully/over-defined badges.
- Selected sketch line and circle panels show definition status, controlling relations, and unresolved reasons.
- Selected sketch line and circle panels list active control items, support type filtering, and allow single-item or batch removal for relations, constraints, connections, and driven dimensions.
- Selected sketch line and circle panels also expose a current-level control table for cross-entity filtering and batch cleanup.
- Line-to-line constraint toggles now reject obvious conflicting combinations and explain the failure inline.
- Selected sketch line and circle panels diagnose dangling or invalid constraint references and can clean them in place.
- Selected sketch line and circle panels also summarize current-level sketch issues and support batch cleanup for the active level.
- Sketch line and circle action menus expose the implemented edit commands directly on selected sketch geometry.
- Right-click sketch context menus support circle/arc radius editing and circle-to-circle constraints.
- Single closed-loop conversion to walls, slab, or zone.
- Single closed-loop profile extrusion into a V0 feature body with editable depth/base elevation.
- Single closed-loop profile revolve into a V0 feature body with a vertical axis and editable sweep angle.
- Revolve creation can use a selected vertical construction line as the source axis.
- Single closed-loop profile cut into containing slabs, ceilings, or V0 extrude feature bodies.
- Selected V0 extrusion features can enter a top-face sketch plane from the feature inspector.
- V0 extrusion top faces can also be double-clicked in the 3D view to enter that top-face sketch plane.
- V0 extrusion side faces can be double-clicked in the 3D view to enter a lightweight face sketch plane; new sketch lines store a `feature-face` plane and render on that selected face in 3D.
- Feature-face sketch mode gives the 2D panel a face-local U/V workplane: only that face's sketch entities are shown/editable, the selected face boundary is outlined, and wall/floorplan snapping is suppressed.
- Closed profiles drawn on a V0 extrusion side face can create a lightweight face-normal extrusion preview.
- Closed profiles drawn on a V0 extrusion side face can create a lightweight through-all side cut preview on the target feature.
- Side-face cuts are recorded as V1 `extrude-cut` timeline steps with a `feature-face` sketch plane, while the viewer applies them through the side-face CSG preview path.
- Top-face sketch entities store `metadata.sketchPlane`, and generated extrusions use that plane height as `baseElevation`.
- The sketch command bar shows the active top-face plane and elevation while drawing on a V0 extrusion top face.
- V0 extrusion features can select their source sketch, refresh the profile snapshot from source lines, and manage through-cut entries from the feature inspector.
- V0 extrusion feature inspector shows a lightweight feature history with source status for base profile, extrusion, and cuts.
- Feature history distinguishes synced snapshots from refreshable source changes and can refresh all changed steps at once.
- V0 revolve features can reassign their source axis by entering axis-pick mode from the feature inspector and selecting a vertical construction line.
- Feature nodes now also persist a V1 `definition.steps` timeline for rebuild-oriented
  feature history. Existing `extrude`, `revolve`, and through-cut fields remain as
  compatibility fields, while the timeline reserves stable step kinds for extrude/revolve
  cuts, hole, fillet, chamfer, shell, draft, sweep, loft, mirror, and feature patterns.
- Extrude feature rendering consumes V1 hole steps as simple through-holes and feature reuse
  steps as visible mirror, linear pattern, and circular pattern instances.
- The feature inspector can add V1 simple through-hole, mirror, linear pattern, and circular
  pattern steps to the selected feature.
- V1 linear and circular pattern steps can edit count, spacing/angle, and skipped instances from
  the feature inspector. Skipped instances are reflected directly in viewer instances.
- The feature inspector can add V1 sweep and loft steps. Sweep uses a default 3-point path;
  loft uses the source profile plus a scaled second section.
- Viewer rendering supports V1 sweep and loft geometry when the participating profiles have
  matching point counts.
- The feature inspector can add V1 fillet, chamfer, shell, and draft preview steps. Fillet
  and chamfer map to uniform extrude bevels, shell creates a centered inset cavity, and draft
  tapers the top section around the profile center.
- The feature inspector now lists editable V1 timeline steps. Supported V1 steps can be
  suppressed/restored, deleted, and tuned with lightweight parameter controls for hole diameter,
  pattern counts, sweep path lift, loft scale, bevel sizes, shell thickness, and draft angle.
- V1 timeline steps can be moved up/down from the feature inspector. Reordered steps are marked
  for rebuild; dependency validation remains handled by the explicit rebuild action.
- The feature inspector can create V1 reference planes, axes, and points. Mirror steps use the
  first available reference plane, and reference plane X can be edited from the inspector.
- V1 feature definitions now ensure a default body record so future combine/intersect workflows
  can target bodies instead of only feature nodes.
- The feature inspector can create additional V1 body records and add combine steps for
  add/subtract/intersect intent. Combine V1 is recorded and diagnosed against body ids, and the
  viewer executes a lightweight body-profile rebuild: add bodies become merged extrude previews,
  subtract bodies become profile holes, and intersect uses the overlapping body bounds.
- V1 body records can be hidden/shown, deleted, and moved along X from the feature inspector.
  Deleting a body cleans combine steps that targeted or used that body, while keeping at least one
  body record.
- V1 combine steps can edit operation, target body, tool bodies, and keep-tools behavior from the
  feature inspector. Target bodies are automatically excluded from the tool body set.
- V1 feature definitions also reserve bodies and reference geometry collections so future
  SolidWorks-style body combine, offset planes, axes, and points can be added without
  changing the legacy V0 feature shape again.
- Generated walls/slabs/zones store `metadata.sketchSource` with the source sketch line ids.
- Generated extrusion features store a sketch profile snapshot plus source sketch line ids.
- Generated extrusion/revolve features auto-sync their base profile snapshot when the source
  sketch still resolves to the same closed profile; matching cut profile snapshots also refresh.

Known guardrails:

- Filled profile conversion rejects nested loops because holes are not represented yet.
- Profile conversion works one closed loop at a time.
- Extrude V0 uses a profile snapshot, with automatic refresh for still-closed source profiles.
- Cut V0 is a vertical through-cut and automatically targets containing slabs, ceilings, and V0 extrude features.
- Feature editing V0 supports automatic and manual refresh from source sketch lines, but does not recreate missing source geometry.
- Feature history V0 is informational and action-oriented; it is not yet a reorderable parametric timeline.
- Feature history sync V0 refreshes base/cut profile snapshots when source topology is still valid. The V1 timeline records rebuild status, but full dependency-sorted rebuild execution is still limited.
- Revolve V0 uses a selected vertical construction line as the source axis when available, otherwise defaults to the profile minimum X; it supports manual axis X and sweep angle editing, but does not yet support arbitrary-angle sketch axes.
- Revolve axis reassignment V0 only accepts vertical construction sketch lines.
- Top-face sketch V0 supports horizontal extrusion top faces; arbitrary non-extrusion faces and direct 3D face drawing are not implemented yet.
- Feature-face sketch V0 supports a face-local 2D workplane, line placement, 3D display, lightweight face-normal add extrusions, and V1-recorded lightweight through-all side cuts on vertical extrusion side faces, but solver-backed/topology-aware face cuts are still future work.
- Constraint solving is lightweight and relation-based; endpoint, line-to-line, tangent, equal-radius, and concentric edits propagate directly, but there is no general solver yet.
- Hole V1 is a simple vertical through-hole only; blind, counterbore, and countersink
  parameters are represented in schema but not rebuilt as stepped/countersunk geometry yet.
- Mirror and pattern V1 are visual feature instances using default planes/axes. Per-instance
  editing, arbitrary reference geometry, and robust body-level pattern rebuild are future work.
- Sweep and loft V1 use default generated paths/sections until multi-sketch picking, guide
  curves, and path references are implemented.
- Fillet, chamfer, shell, and draft V1 are whole-feature previews. They do not yet support
  selecting individual edges/faces, variable radii, neutral planes, or robust entity healing.
- Timeline editing V1 updates step parameters in place, but it is still an immediate viewer
  rebuild path rather than a full dependency-sorted rebuild runner with detailed failure recovery.
- Reference geometry V1 is lightweight. Only mirror plane X affects viewer output today; arbitrary
  planes, axes, and points are still future work.
- Combine V1 executes a profile-level preview, not a robust solids-kernel boolean. Complex
  polygon splitting, curved intersections, topology naming, and healing are still future work.
- Timeline diagnostics V1 checks profile/path/guide/source/body/reference ids, flags missing
  references, catches unsupported loft section mismatch, and auto-adds the default body record.
- The feature inspector rebuild action now runs a sequential V1 timeline rebuild. It marks
  downstream source-step dependents as failed when an upstream step fails and hydrates the default
  body from the current feature profile/depth before viewer rebuild.
- Timeline rebuild V1 does not yet perform true geometry rollback, topological naming, or failed
  topology repair.
