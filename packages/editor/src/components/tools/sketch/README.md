# 2D Sketch

The 2D sketch feature is intentionally split between geometry utilities and floorplan UI modules.

- `@pascal-app/core` owns true circular sketch geometry sampling and measurement for circles/arcs.
- `sketch-geometry.ts` owns pure line geometry: rectangle segment creation, profile detection, driven length/orientation edits, and unsupported profile checks.
- `components/editor/floorplan/sketch-state.ts` owns transient drawing state for line, rectangle, and smart dimension input.
- `components/editor/floorplan/sketch-actions.tsx` owns scene mutations: sketch creation, dimension actions, relation toggles, deletion, and profile conversion.
- `components/editor/floorplan/sketch-edit.ts` owns endpoint and whole-line drag state.
- `components/editor/floorplan/sketch-layer.tsx` owns SVG rendering for sketch lines, profile highlights, and edit handles.

Supported V0 behavior:

- Sketch line and construction line drawing.
- Persisted true circle/arc sketch node model and pure circular geometry helpers.
- Rectangle sketch creation with horizontal/vertical relations.
- Endpoint snapping to existing sketch endpoints while drawing sketch lines and rectangles.
- Coincident endpoint links are persisted when drawing snapped or chained sketch geometry.
- Smart dimension for line length.
- Horizontal, vertical, fixed, and construction/reference relation toggles.
- Trim/extend selected sketch lines to another clicked sketch line.
- Offset, mirror, and linear pattern commands for selected sketch lines.
- Equal length command for multi-selected sketch lines.
- Chamfer and line-connector fillet commands for selected sketch line corners.
- Split sketch lines at clicked positions while preserving lightweight endpoint connectivity.
- Endpoint drag and whole-line move in the floorplan, including lightweight coincident endpoint propagation.
- Selected or hovered sketch lines show relation badges and coincident endpoint markers in the floorplan.
- Sketch line action menus expose the implemented edit commands directly on selected sketch geometry.
- Single closed-loop conversion to walls, slab, or zone.
- Generated walls/slabs/zones store `metadata.sketchSource` with the source sketch line ids.

Known guardrails:

- Filled profile conversion rejects nested loops because holes are not represented yet.
- Profile conversion works one closed loop at a time.
- Constraint solving is lightweight and relation-based; coincident endpoints propagate directly, but there is no general solver yet.
