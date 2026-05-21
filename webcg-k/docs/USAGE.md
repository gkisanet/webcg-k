# WebCG-K Usage Manual

> **Web-Based Broadcast Graphics System** — end-to-end workflow guide from graphics creation to live playout.

---

## Table of Contents

1. [Setup & Configuration](#1-setup--configuration)
2. [Broadcast Graphics Creation](#2-broadcast-graphics-creation)
3. [Rundown & Cuesheet Management](#3-rundown--cuesheet-management)
4. [Overlay Creation](#4-overlay-creation)
5. [Broadcast Playout](#5-broadcast-playout)
6. [Asset Management](#6-asset-management)
7. [System Administration](#7-system-administration)

---

## 1. Setup & Configuration

### Prerequisites

- Node.js 20+
- Docker & Docker Compose

### Installation

```bash
# 1. Clone repository
git clone <repo-url>
cd webcg-k

# 2. Start Supabase (local Docker)
npx -y supabase start
# All migrations are applied automatically

# 3. Install frontend dependencies
cd webcg-k
npm install

# 4. Configure environment
cp .env.example .env
# Edit .env with your Supabase URL/Key and VITE_GEMINI_API_KEY

# 5. Start dev server
npm run dev
# → http://localhost:3000
```

### Service Endpoints

| Service | URL |
|---------|-----|
| Web App | http://localhost:3000 |
| Supabase Studio | http://127.0.0.1:54323 |
| REST API | http://127.0.0.1:54321/rest/v1 |
| PostgreSQL | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

### Dev Commands

```bash
npm run dev              # Dev server
npm run build            # Production build
npx tsc --noEmit         # Type check
npx -y supabase stop     # Stop Supabase
npx -y supabase db reset # Reset DB (re-applies migrations)
```

For detailed setup instructions, see [SETUP.md](guide/SETUP.md).

---

## 2. Broadcast Graphics Creation

Create and edit broadcast graphics (lower-thirds, fullscreens, bumpers, etc.) using the Penpot-style vector editor.

### 2.1 Graphics Gallery

**Path:** Dashboard → Graphics

The gallery shows all graphics in a searchable, sortable table. Each graphic is a collection of SVG elements (rectangles, text, images, groups) that form a broadcast CG template.

- **Create:** Click "New Graphic" → enters the Graphics Editor
- **Duplicate:** Select a graphic → "Fork" to create a copy
- **Delete:** Select a graphic → "Delete"
- **Preview:** Click any graphic row to see a live SVG preview in the side panel

### 2.2 Graphics Editor

**Path:** Dashboard → Graphics → click a graphic

The editor follows a Penpot/Figma-style layout:

```
┌─────────────────────────────────────────────┐
│  Toolbar  │         Canvas          │ Panels │
│  (tools)  │    (WYSIWYG SVG)        │ (props)│
│           │                         │        │
│  Layers   │                         │ Design │
│  Panel    │                         │ Text   │
│           │                         │ Animate│
│           │                         │ Bind   │
│           │                         │ CSS    │
└─────────────────────────────────────────────┘
```

#### Adding Elements

1. Select a tool from the **Toolbar**: Rectangle, Text, Image, or HTML Plugin
2. Click and drag on the **Canvas** to place the element
3. Use the **Properties Panel** (right side) to adjust attributes

#### Editing Elements

| Panel Tab | What You Can Do |
|-----------|----------------|
| **Design** | Position (X/Y), Size (W/H), Rotation, Fill color, Stroke, Border radius, Opacity, Blend mode, Shadow, Glow |
| **Text** | Font family, Size, Weight, Color, Alignment, Line height, Letter spacing, Text shadow |
| **Animate** | Entrance animation (fade, slide, scale), Exit animation, Loop animation. 25+ presets powered by CSS/DOM |
| **Bind** | Bind element content to data source fields (weather, news, custom APIs) |
| **CSS** | Custom CSS overrides for advanced styling |

#### Canvas Controls

- **Pan:** Click and drag empty canvas area
- **Zoom:** Scroll wheel or pinch gesture
- **Select:** Click element on canvas or in Layers panel
- **Multi-select:** Shift+click or drag-select
- **Snap guides:** Blue guidelines appear when aligning with other elements
- **Undo/Redo:** Full history stack

#### Layers Panel

- Drag layers to reorder (z-index)
- Click to select, double-click to rename
- Toggle visibility (eye icon)
- Lock/unlock elements
- Group selection indicator

#### Graphics Editor Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Delete` | Delete selected elements |
| `Ctrl+D` | Duplicate selected elements |
| `Ctrl+G` | Group selected elements |
| `Ctrl+Shift+G` | Ungroup selected elements |

### 2.3 Grid Templates

**Path:** Dashboard → Graphics → Grid Templates tab

Grid Templates define split-screen layouts (e.g., anchor + headline + crawl zones) that determine where graphics appear on screen.

#### Creating a Grid

1. Click "New Grid Template"
2. Drag **split lines** horizontally or vertically to create zones
3. Hold `Shift` while dragging to constrain movement
4. Assign each zone a **type** (Band, Headline, Super, Crawl, Logo, Video, etc.)
5. Name the template and save

#### Grid Editor Shortcuts

| Key | Action |
|-----|--------|
| `Shift` (hold) | Constrain split line dragging |
| `Ctrl+Z` | Undo split operation |
| `Ctrl+Shift+Z` | Redo split operation |
| `Delete` | Delete selected split line |

### 2.4 Theme Bundles

**Path:** Dashboard → Bundles

Bundles group graphics into a coherent CG set (e.g., "Morning News Package") and define semantic role mappings for NRCS integration.

#### Creating a Bundle

1. Click "New Bundle" → enter name, description, program
2. In the Bundle Editor, add graphics to the bundle
3. Assign **CG type slots** (Lower Third, Fullscreen, Split Screen, Overlay, etc.)
4. Map semantic roles to graphic elements (Name → text element, Title → text element, etc.)
5. Configure **theme tokens** for consistent styling across all graphics in the bundle

### 2.5 Graphic Tagging

**Path:** Dashboard → Graphic Tagging

For AI-generated HTML/CSS graphics, assign semantic roles to elements so they can be auto-populated with data during playout.

1. Select an AI-generated graphic
2. The graphic renders in an iframe
3. Click any visual element and assign its **semantic role**: Name, Subtitle, Affiliation, Title, Stat, Quote, Label
4. Save the tagged graphic

---

## 3. Rundown & Cuesheet Management

Rundowns are ordered sequences of graphics for a broadcast. Cuesheets define the content that populates those graphics.

### 3.1 Rundown Editor

**Path:** Dashboard → Rundowns → select a rundown

The rundown editor uses a **3-Pane SPX-GC layout**:

```
┌──────────┐  ┌──────────────┐  ┌──────────────┐
│ Library  │  │   Rundown    │  │   Preview +  │
│ (graphics│  │  (ordered    │  │  Properties  │
│  pool)   │  │   sequence)  │  │              │
└──────────┘  └──────────────┘  └──────────────┘
```

#### Workflow

1. **Left pane (Library):** Browse available graphics. Use search to filter.
2. **Drag a graphic** from the Library into the Rundown list.
3. **Reorder** items by dragging them up/down in the list.
4. **Edit text content** in the Properties pane (right side).
5. Each rundown item gets a **section color** (12-color palette) for visual organization.

#### Rundown Editor Shortcuts

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate between items |
| `Space` | Select next item |
| `Delete` | Delete selected item |
| `Ctrl+C` | Copy selected item |
| `Ctrl+V` | Paste copied item |

### 3.2 Cuesheets

**Path:** Dashboard → Cuesheets

Cuesheets define the editorial content for graphics. Three creation methods are supported:

#### Manual Cuesheet

1. Click "New Cuesheet" → select "Manual"
2. Add items row by row: type the content for each field
3. Assign each item to a graphic template
4. Save → the cuesheet can be propagated to a rundown

#### NRCS-Linked Cuesheet

1. Click "New Cuesheet" → select "NRCS"
2. Configure the NRCS data source (newsroom computer system)
3. Cuesheet auto-populates from the NRCS feed
4. Review and approve items → propagate to rundown

#### CSV Import Cuesheet

1. Click "New Cuesheet" → select "CSV"
2. Upload a CSV file with predefined column mapping
3. Review parsed data → map columns to graphic fields
4. Save and use

#### Cuesheet Detail Editor

**Path:** Dashboard → Cuesheets → click a cuesheet

Two-column layout:
- **Left:** Item list with status badges (pending / mapped / approved / aired)
- **Right:** Rich text editor for editing item content

Features:
- Content validation (profanity filter, spell check, title validation, temporal validation)
- Data source sync (pull latest from NRCS)
- Propagate to rundown (creates a new rundown from the cuesheet)

### 3.3 AI Cuesheet Wizard

**Path:** Dashboard → AI Cuesheet

Generates a complete cuesheet from a text prompt using AI.

#### 3-Step Wizard

1. **System Prompt:** Enter the broadcast context, program type, duration, and any special requirements
2. **Content Review:** AI generates a structured cuesheet in JSON. Review and edit each scene/item in the GUI.
3. **Graphic Generation:** AI selects or generates appropriate CG templates for each item. Review and approve the pairings.

The generated cuesheet can then be exported to a rundown for playout.

### 3.4 Data Sources & NRCS

**Path:** Dashboard → Data Sources

Two tabs:

- **Live Sources:** Built-in data providers (weather, fine dust, earthquake, etc.) displayed as cards. Click to view data preview. Create **custom data sources** via the modal (REST API with configurable polling interval).
- **NRCS:** News program browser for newsroom integration. Browse programs, rundowns, and stories from the NRCS feed.

#### Custom Data Source Modal

1. Click "Add Custom Source"
2. Enter: Name, URL, Polling interval, Response mapping (JSON path)
3. Save → appears as a card in Live Sources
4. Bind to overlay elements via the Binding tab in Graphics Editor

---

## 4. Overlay Creation

Overlays are real-time graphic layers that can be toggled ON/OFF independently of the main timeline during broadcast.

### 4.1 Overlay Templates

**Path:** Dashboard → Overlays

The overlay gallery shows all templates in a glassmorphism card grid with thumbnail previews.

#### Manual Creation

1. Click "New Overlay"
2. Select a **base graphic** (can be a graphic from the Graphics Gallery)
3. Configure:
   - **Name** and **description**
   - **Layer** (z-index priority — higher numbers render on top)
   - **Animation config** (enter/exit animations)
   - **Data source binding** (optional — link to weather, news API, etc.)
4. Save

#### Editing

- Click an overlay card → Overlay Editor opens
- Modify the graphic, animations, or data bindings
- Preview in real-time

### 4.2 AI Overlay Wizard

**Path:** Dashboard → Overlays → AI Wizard button (✨)

Generates overlay graphics from a text description.

#### 4-Step Wizard

1. **Grid Selector:** Choose a grid template that defines the layout zones
2. **Zone Selector:** Select which zones the overlay should occupy (multi-select)
3. **AI Prompt:** Describe what you want (e.g., "Weather forecast lower third with temperature and humidity")
4. **Variation Gallery:** AI generates multiple variations → select the best one → save as overlay template

### 4.3 Plugin Editor

**Path:** Dashboard → Overlays → Plugin Editor

For advanced users: code-based overlay creation with full HTML/CSS/JS control.

```
┌──────────────────┐  ┌──────────────────────┐
│  Monaco Editor   │  │   Live Preview       │
│  (HTML/CSS/JS)   │  │   (iframe render)    │
│                  │  │                      │
│  Dashboard Panel │  │                      │
│  (config fields) │  │                      │
└──────────────────┘  └──────────────────────┘
```

#### Features

- **Monaco Editor** with syntax highlighting for HTML, CSS, JavaScript
- **Live Preview** iframe showing real-time rendering
- **Dashboard Panel** for configuring plugin metadata and exposed fields
- **AI Generation Panel** — describe what you want, AI writes the plugin code
- **Command Palette** (`Ctrl+Shift+P`) for global settings
- **Grid Zone Overlay** for positioning within a selected grid
- **Visual Edit Bridge** — two-way communication between editor and preview

#### Plugin Editor Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+Shift+P` | Toggle Command Palette (global settings) |
| `Ctrl+S` | Save plugin |

### 4.4 Overlay Gallery (Dashboard)

- Browse all overlays with thumbnail previews
- Filter by tags, search by name
- Organize with **group tags** for quick access during broadcast
- Delete, duplicate, or edit overlays inline

---

## 5. Broadcast Playout

The core workflow: take your prepared rundowns and overlays to live broadcast.

### 5.1 Creating a Broadcast Session

**Path:** Dashboard → Broadcast

1. Click "New Broadcast Session"
2. Select a **rundown** as the basis
3. Configure session settings:
   - Session title
   - Resolution (1080p or 4K)
   - OBS renderer URL (auto-generated)
4. Click "Create" → session appears in the list with status **Draft**

#### Session Status Lifecycle

```
Draft → Ready → Live → Ended
                 ↓
              (revert)
```

- **Draft:** Being prepared
- **Ready:** All assets loaded, waiting to go live. Renderer can connect and show Preview.
- **Live:** Broadcasting. PGM Take is active.
- **Ended:** Broadcast finished. Can be reverted to Ready for rehearsal.

### 5.2 Controller Overview

**Path:** Dashboard → Broadcast → click "Go to Controller" on a session (or navigate to `/controller/$sessionId`)

The controller is the live production control surface.

```
┌──────────────────────────────────────────────────────────────┐
│  Header Bar                                                   │
│  [Back] [Title + Status] [Renderer URL] [Broadcast Btn]      │
│  [Renderer Status] [Settings] [NRCS Alert] [Action Log] [Help]│
├──────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐     ┌─────────────────┐                 │
│  │  Preview (PVW)  │  →  │  Program (PGM)  │                 │
│  │  WYSIWYG render │     │  On-air output  │                 │
│  └─────────────────┘     └─────────────────┘                 │
├──────────────────────────────────────────────────────────────┤
│  [Timeline] [Overlays] [AI Characters]          ← Tab Bar    │
├──────────────────────────────────────────────────────────────┤
│  Main Tab Content Area                                        │
└──────────────────────────────────────────────────────────────┘
```

#### Header Bar Controls

| Element | Function |
|---------|----------|
| **Back button** | Return to Broadcast dashboard |
| **Session title** | Shows session name + item count + Realtime connection status |
| **Renderer URL** | OBS browser source URL. Click to copy or open in new tab |
| **Broadcast Button** | PLAY (start broadcast) / STOP (end broadcast). Also supports PLAY_MULTI for multi-track |
| **Revert to Ready** | (when Ended) Return to Ready state for rehearsal |
| **Renderer Status** | Heartbeat-driven: Connected / Delayed / Disconnected, with memory usage % |
| **Reset** | Clear completed blocks count, reset playhead |
| **User Avatars** | Connected users via Supabase Presence, color-coded |
| **Settings** | Controller preferences (gear icon) |
| **NRCS Alert** | Badge showing NRCS content changes, with diff drawer |
| **Action Log** | Filterable log of all session actions (broadcast events, PGM on/off, text edits, etc.) |
| **Help (?)** | Opens keyboard shortcut reference modal |

### 5.3 Timeline Operation

The **Timeline tab** is the primary control surface. It shows a multi-track timeline with draggable graphic blocks.

#### Basic Navigation

- **Move playhead:** Click anywhere on the timeline ruler, or use `←` / `→` to jump between block edges
- **Zoom:** `Ctrl + Mouse Wheel` (25%–100% range). Zoom-to-fit auto-adjusts on segment change.
- **Scroll:** Mouse wheel (vertical scroll) or drag the timeline area

#### Working with Blocks

- **Select:** Click a block
- **Move:** Drag a block horizontally (within its track) or vertically (to another track)
- **Resize:** Drag the left or right edge of a block
- **Edit content:** Double-click a block → BlockEditDrawer opens for hot-fixing text
- **Delete:** Select a block → `Delete` key

#### Multi-Track Support

The timeline supports multiple parallel tracks. Each track can have its own PGM block:
- `Ctrl+Up` / `Ctrl+Down`: Move block to upper/lower track
- `PLAY_MULTI`: Broadcasts all active track PGMs simultaneously

#### Segment Tabs

Segments divide the broadcast into logical sections (e.g., "Headlines", "Sports", "Weather"):
- `Alt+←` / `Alt+→`: Switch between segment tabs
- Segment tabs auto-activate when the rundown has NRCS-linked sections

#### Scrubbing Mode

Press `S` to toggle scrubbing mode:
- In scrubbing mode, moving the playhead updates the Preview (PVW) monitor in real-time
- Press `Escape` or `S` again to exit scrubbing mode
- Space is blocked during scrubbing (shows warning)

#### Timeline Shortcuts

| Key | Action |
|-----|--------|
| `←` / `→` | Move playhead to previous/next block edge |
| `↑` | Jump to last broadcast position |
| `Ctrl+←` / `Ctrl+→` | Jump to timeline start/end |
| `Alt+←` / `Alt+→` | Switch segment tab |
| `Space` | **PGM Take** — broadcast current block to Program |
| `S` | Toggle scrubbing mode |
| `Delete` / `Backspace` | Delete selected block (or ripple-delete if gap selected) |
| `Ctrl+C` | Copy selected block |
| `Ctrl+V` | Paste copied block |
| `Ctrl+↑` / `Ctrl+↓` | Move block to upper/lower track |
| `Ctrl+Shift+L` | Expand logo block to full segment width |
| `Escape` | Deselect all + exit scrubbing mode |
| `Ctrl+Wheel` | Zoom in/out |

> **Note:** All shortcuts are blocked when focus is in an `<input>` or `<textarea>`.

### 5.4 PGM Take

Taking a graphic to Program (on-air):

1. Position the **playhead** on the desired block (or use `↑` to return to last broadcast position)
2. The block appears in the **Preview (PVW) monitor** showing exactly what will render
3. Press **`Space`** → the block moves to **Program (PGM)** and renders on the OBS output
4. The playhead auto-advances to the next block edge

### 5.5 Overlay Control

**Tab:** Overlays

Manage real-time overlay layers independently from the timeline.

#### Adding Overlays to a Session

1. In the Overlay tab, click **"+ Add"**
2. Search/filter overlay templates
3. Select one or more overlays → they appear as **cards** in the overlay panel

#### Controlling Overlays

Each overlay card shows:
- **Thumbnail** preview
- **Name** and **layer** indicator
- **ON/OFF toggle** — click to show/hide the overlay on Program
- **Status indicator** (idle / playing-in / playing / playing-out)
- **Replicant data** (live data values bound to the overlay)

#### Conflict Resolution

When two overlays occupy the same screen zone, a **conflict modal** appears:
- **Overlay (겹쳐서 표시):** Show both overlays stacked
- **Hide Block (블록 숨기고 표시):** Hide the underlying timeline block and show only the overlay

#### Group Overlay Cards

Overlays can be grouped for simultaneous control:
- Toggle an entire group ON/OFF with one click
- Groups are defined by overlay tags set in the Dashboard

### 5.6 AI Character Control

**Tab:** AI Characters

Control Rive-based AI animated characters during broadcast.

- Select a character preset from the panel
- Trigger actions (greet, explain, react, etc.) mapped to Rive animations
- Characters render as an overlay layer on the Program output
- Live action log tracks all character triggers

### 5.7 Renderer (OBS Integration)

**Path:** `/render/$sessionId` (accessed via OBS Browser Source)

The renderer is a transparent-background page designed to be added as an OBS browser source.

#### Renderer URL Parameters

| Param | Values | Description |
|-------|--------|-------------|
| `sessionId` | UUID | The broadcast session ID |
| `resolution` | `1080p`, `4k` | Output resolution |
| `tag` | string | Optional renderer tag for identification |

#### Setup in OBS

1. Add a **Browser Source** in OBS
2. Set URL to: `http://localhost:3000/render/<sessionId>?resolution=1080p`
3. Set width/height to match your canvas (1920×1080 for 1080p, 3840×2160 for 4K)
4. Enable "Refresh browser when scene becomes active"

#### Renderer Features

- **Transparent background** — graphics render on a transparent layer
- **Supabase Realtime** subscription for instant PGM state changes
- **Heartbeat/ACK protocol** — the controller monitors renderer health (connected/delayed/disconnected)
- **Multi-track support** — renders multiple simultaneous graphic tracks
- **Overlay layers** — overlay graphics composite on top of timeline graphics
- **Clock-synced timers** — accurate time display using clock offset calibration

---

## 6. Asset Management

### 6.1 Image Library

**Path:** Dashboard → Assets → Images

Upload and manage images used in broadcast graphics.

#### Features

- **Upload:** Drag-and-drop or file picker. Supports PNG, JPG, WebP.
- **Multi-resolution:** Each image is stored in 2K and 4K variants
- **Categories:** Organize images by category for easy browsing
- **Upload integrity:** Modal verifies all resolutions uploaded successfully
- **Delete:** Remove unused images

### 6.2 Font Management

**Path:** Dashboard → Assets → Fonts

Manage custom fonts for broadcast graphics.

#### Pre-bundled Fonts (14 families)

| Category | Fonts |
|----------|-------|
| Korean | Noto Sans KR, Pretendard, Spoqa Han Sans Neo, Nanum Square Neo, SCDream, SUIT, Gmarket Sans |
| English | Inter, Roboto, Roboto Condensed, Montserrat, Poppins, Oswald |
| Mono | JetBrains Mono |

#### Uploading Custom Fonts

1. Click "Upload Font"
2. Select a `.woff` or `.woff2` file
3. Enter font family name and weight
4. Save → font becomes available in the Graphics Editor Text panel

> See [FONT_LICENSE_GUIDE.md](guide/FONT_LICENSE_GUIDE.md) for license information.

### 6.3 AI Character Presets

**Path:** Dashboard → Characters

Manage Rive animation characters used during broadcast.

#### Creating a Character Preset

1. Click "New Character" → Character Wizard opens
2. **Step 1 — Basic Info:** Enter name, description, select a zone for character placement
3. **Step 2 — Animation:** Upload a `.riv` file, map actions (greet, explain, react, idle) to Rive animation states
4. Save → character appears in the Controller's AI Character tab

---

## 7. System Administration

**Path:** Dashboard → Admin (requires admin role)

### 7.1 User Management

Manage users and their roles.

- **User table:** Searchable, sortable TanStack Table
- **Roles:** system_admin, playout_operator, cg_designer
- **Workspace membership:** Assign users to workspaces
- **Promote/Demote:** Change user roles
- **Delete:** Remove users from the system

### 7.2 AI Model Configuration

Configure AI providers and models used throughout the system.

- **Provider management:** Add/edit/remove AI providers (Google, Anthropic, OpenAI, etc.)
- **Model registry:** Configure available models per provider
- **System prompts:** Edit the default system prompts for AI CG generation and AI Cuesheet generation
- **Usage stats:** View token usage and generation counts
- **Generation config:** Set defaults for temperature, max tokens, etc.

### 7.3 API Keys

Manage API keys for external service access.

- **Create:** Generate new API keys with configurable scopes
- **Masking:** Keys are displayed masked (e.g., `sk-...a1b2`) after creation
- **Revoke:** Disable or delete keys
- **Scopes:** Control which endpoints each key can access

### 7.4 Workspaces

Organize users, projects, and assets into workspaces for multi-team environments.

- **Create workspaces** with name and description
- **Add members** with role assignment (admin / operator / designer per workspace)
- **Role badges** show each member's workspace-level permissions
- **Delete workspaces** (requires confirmation)

---

## Appendix

### Global Shortcuts

| Key | Context | Action |
|-----|---------|--------|
| `Ctrl+Shift+K` | Anywhere | Force logout (dev utility — clears auth session) |

### URL Utilities

| URL | Purpose |
|-----|---------|
| `/?reset` | Reset session state and redirect to login |

### Related Guides

- [SETUP.md](guide/SETUP.md) — Detailed environment setup
- [TROUBLESHOOTING.md](guide/TROUBLESHOOTING.md) — Common issues and solutions
- [NRCS_CUESHEET_WORKFLOW.md](guide/NRCS_CUESHEET_WORKFLOW.md) — NRCS integration deep dive
- [AI_CG_GUIDE.md](guide/AI_CG_GUIDE.md) — AI CG generation guide
- [AI_CHARACTER_SYSTEM.md](guide/AI_CHARACTER_SYSTEM.md) — Rive character system
- [RENDERER_RESOLUTION.md](guide/RENDERER_RESOLUTION.md) — Renderer resolution handling
- [REALTIME_SYNC_ARCHITECTURE.md](guide/REALTIME_SYNC_ARCHITECTURE.md) — Realtime sync architecture
- [SHADCN_GUIDE.md](guide/SHADCN_GUIDE.md) — UI component guide
- [GRID_EDITOR.md](guide/GRID_EDITOR.md) — Grid editor specification
- [FONT_LICENSE_GUIDE.md](guide/FONT_LICENSE_GUIDE.md) — Font license information
