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
- Generated walls/slabs/zones store `metadata.sketchSource` with the source sketch line ids.

Known guardrails:

- Filled profile conversion rejects nested loops because holes are not represented yet.
- Profile conversion works one closed loop at a time.
- Constraint solving is lightweight and relation-based; endpoint, tangent, equal-radius, and concentric edits propagate directly, but there is no general solver yet.
