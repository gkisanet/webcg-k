# Grid Layout Editor (Grid Editor)

> **Core Module for Regional Branch Station Graphic Standardization**  
> Benchmarks: Microsoft PowerToys FancyZones | Architecture: Quadrant coordinates scale matrix

The Grid Layout Editor is a visual tool that segments the broadcast screen into grid zones (Zone/Quadrant) to establish **standardized guidelines** for broadcast lower-thirds and graphical overlays.

---

### Concept: Analogous to Window Panes

Defining screen grids is **analogous to crafting window frame panes**:

| Window Frame | Grid Editor |
| :--- | :--- |
| Partition window frames (e.g. 2 panes, 4 panes) | Screen segmentation (e.g. 2x2, 1x3 column/rows) |
| Glass pane number indicators | Quadrant ID designations (`q1`, `q2`, etc.) |
| Frame boundaries dimensions specs | Zone width/height percentage ratios |

---

## 📐 Grid Structure & Data Model

A screen layout is defined by a single **GridTemplate**, partitioned internally into multiple **Quadrants**.

*   **GridTemplate**: Declares template names, row/column split ratios (Grid Spacing), and split types (`split_type: 'vertical' | 'horizontal' | 'custom'`).
*   **Quadrant**: Represents individual split zones. Declares unique IDs (`q1`, `q2`, etc.), coordinate ratios (`x`, `y`, `width`, `height` values spanning 0% to 100%), and snap toggles (`snap_enabled`).

### Data Model Example (JSON Schema)

#### `"grid_templates"` Table Schema
```json
{
  "id": "78e4f6a9-8b2c-4d1e-9f3a-1c5b8d6f9a2b",
  "name": "KBS News 9 Dual Anchor Split",
  "split_type": "vertical",
  "split_ratio": [45, 10, 45],
  "created_at": "2026-05-17T08:00:00Z"
}
```

#### `"quadrants"` Table Schema (Linked via `grid_template_id`)
```json
[
  {
    "id": "q1",
    "grid_template_id": "78e4f6a9-8b2c-4d1e-9f3a-1c5b8d6f9a2b",
    "x": 0,
    "y": 0,
    "width": 45,
    "height": 100,
    "snap_enabled": true
  },
  {
    "id": "q2",
    "grid_template_id": "78e4f6a9-8b2c-4d1e-9f3a-1c5b8d6f9a2b",
    "x": 45,
    "y": 0,
    "width": 10,
    "height": 100,
    "snap_enabled": false
  },
  {
    "id": "q3",
    "grid_template_id": "78e4f6a9-8b2c-4d1e-9f3a-1c5b8d6f9a2b",
    "x": 55,
    "y": 0,
    "width": 45,
    "height": 100,
    "snap_enabled": true
  }
]
```

---

## 🛠️ Split Algorithms

The Grid Editor is designed by benchmarking the layout model of **Microsoft PowerToys FancyZones**. Key splitting methods include:

### 1. Vertical Split
Segments the screen into column zones along vertical guidelines.
*   **Formula**: Partitioning into $N$ vertical columns yields quadrant widths of `100 / N %` each.
*   **Use Cases**: Split-screens for dual anchor feeds, or 3-way remote interview panels.

### 2. Horizontal Split
Segments the screen into row zones along horizontal guidelines.
*   **Formula**: Partitioning into $N$ horizontal rows yields quadrant heights of `100 / N %` each.
*   **Use Cases**: Breaking news tickers at the top and lower-third graphic strips at the bottom.

### 3. Custom / Quad Split
Intersects horizontal and vertical guidelines to generate symmetrical grid blocks or asymmetric quadrants.
*   **Algorithm**: Dragging central splitters dynamically calculates adjoining quadrant `width` and `height` ratios proportional to mouse coordinates (enforcing structural sharing properties).

---

## 🎨 UI/UX Design Specifications

### 1. Grid Overlay Guide
*   **Design**: Highlighted using thin dashed or translucent lines (`--border-subtle`).
*   **Coloring**: Inactive lines utilize `rgba(255,255,255,0.15)`; transitions to `var(--accent-primary)` (`#00d4ff`) when highlighted or snap-engaged.

### 2. Splitter Drag Handle
*   **Thickness**: 8px (expands interactive bounding boxes on mouse hover).
*   **Hover Effect**: `bg-cyan-400` neon glows + cursor transforms (`col-resize` or `row-resize`).

### 3. Zone Preview Highlight
*   **Snap Engagement**: Dragging graphics near grid boundaries highlights the corresponding quadrant via cyan translucent sheets (`rgba(0, 212, 255, 0.08)`), triggering a magnetic snapping drop zone.

---

## 📡 AI CG Wizard Integrations

Schemas built inside the Grid Editor govern the base models for the **AI CG Wizard (Steps 1 & 2)**:

1.  **Step 1: Grid Template Selection**: Queries saved database configurations and renders visual thumbnails.
2.  **Step 2: Zone Selection**: Click events on target panes (`q1`, `q3`, etc.) register the specific Quadrant IDs inside the wizard's memory.
3.  **Step 3: AI Prompt Synthesis**: The AI pipeline evaluates coordinates and dimension metadata to compute **optimized HTML absolute layouts and margins** that fit the targeted quadrants perfectly.

---

## 🔗 Reference Manuals

*   **[AI_CG_GUIDE.md](./AI_CG_GUIDE.md)** — AI graphics prompting rules.
*   **[SETUP.md](./SETUP.md)** — Database and workspace setup.
