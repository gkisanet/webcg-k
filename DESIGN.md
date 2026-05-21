# WebCG-K Design System

> Single source of truth for the WebCG-K visual design language.
> Structure: 9-section design system | Philosophy: Dark Void Canvas inspired by Framer, tailored for broadcast domain.

---

## 1. Design Philosophy

WebCG-K aims to be a **Dark Void Console for broadcasting**. Since it is a tool used for long hours in the dark lighting environment of a broadcast master control room (MCR), it uses an absolute dark theme to minimize eye strain.

**Core Principles:**

- **Void Canvas**: The background is almost pure black (`#0d0d0d`), making all UI elements appear as if they are floating in the dark. Bright background sections do not exist.
- **Cyan Accent Throughline**: A single accent color `#00d4ff` (Cyan) delivers electrical energy across interactive elements, focus rings, playheads, and selections.
- **Glassmorphism as Depth**: Cards, panels, and modals express layers with `rgba(255, 255, 255, 0.04~0.08)` translucent backgrounds and `blur(12px)` filters. Glass effects, rather than harsh drop shadows, build visual depth.
- **Product-First UI**: The broadcast graphics editor, timeline, and SVG renderer — the **product itself is the hero of the UI**. We do not use decorative illustrations or unnecessary gradients.
- **Broadcast Domain Colors**: We respect broadcast industry standard semantic colors such as PGM (Red), PVW (Amber), and On-Air (pulsing glow).
- **Tool Craftsmanship**: Precision of Penpot/Figma style design tools — 8px grid, precise spacing, and structured typography hierarchy.

---

## 2. Color Palette

### 2.1. Primary

| Token | Value | Usage |
|-------|-------|-------|
| `--app-bg` | `#0d0d0d` | **Main Background** — almost pure black. The foundation of everything. |
| `--text-primary` | `#ffffff` | **Primary Text** — titles, labels, emphasized text. |
| `--accent-primary` | `#00d4ff` | **Primary Accent** — CTAs, links, focus rings, playheads, selected states. The only highly saturated color. |

### 2.2. Surface & Background

| Token | Value | Usage |
|-------|-------|-------|
| `--app-bg-alt` | `#1a1a1a` | Header, sidebar, track header background |
| `--app-bg-secondary` | `#181818` | Modal, card, popup background (slightly darker than `--app-bg-alt`) |
| `--app-bg-muted` | `#252525` | Muted area, hover background |
| `--app-bg-raised` | `#2d2d2d` | Raised element background, track headers |
| `--surface-track` | `#1f1f1f` | Timeline track background |
| `--surface-block` | `#3d3d3d` | Timeline block default |
| `--surface-block-hover` | `#4a4a4a` | Timeline block hover |
| `--surface-block-selected` | `#5a5a5a` | Timeline block selected |

### 2.3. Text Hierarchy

| Token | Value | Usage |
|-------|-------|-------|
| `--text-primary` | `#ffffff` | Titles, labels, primary content |
| `--text-secondary` | `#a3a3a3` | Description text, secondary info |
| `--text-tertiary` | `#737373` | Captions, placeholders, inactive labels |
| `--text-muted` | `#525252` | Inactive text, hints |

### 2.4. Border

| Token | Value | Usage |
|-------|-------|-------|
| `--border-default` | `#404040` | General dividers, scrollbars |
| `--border-subtle` | `#2d2d2d` | Subtle dividers, panel boundaries |
| `--border-primary` | `#333333` | Card & modal primary borders |

### 2.5. Glassmorphism System

> **Why Glass?** Layering opaque gray panels on pure black creates flat, heavy interfaces. Translucent glass maintains the independence of foreground UIs while keeping connection with background contexts.

| Token | Value | Usage |
|-------|-------|-------|
| `--glass-bg` | `rgba(255, 255, 255, 0.04)` | Default glass background |
| `--glass-bg-strong` | `rgba(255, 255, 255, 0.06)` | Strong glass (cards, table headers) |
| `--glass-bg-hover` | `rgba(255, 255, 255, 0.08)` | Hover state glass |
| `--glass-border` | `rgba(255, 255, 255, 0.08)` | Glass element border |
| `--glass-border-hover` | `rgba(255, 255, 255, 0.15)` | Glass hover border |
| `--glass-blur` | `blur(12px)` | backdrop-filter value |
| `--glass-shadow` | `0 4px 24px rgba(0, 0, 0, 0.25)` | Glass default shadow |
| `--glass-shadow-hover` | `0 8px 32px rgba(0, 0, 0, 0.35)` | Glass hover shadow |
| `--glass-glow` | `0 0 20px rgba(0, 212, 255, 0.08)` | Cyan glow (optional) |

### 2.6. Semantic / Domain Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--accent-primary` | `#00d4ff` | Cyan — primary interactive, playhead |
| `--accent-secondary` | `#7c3aed` | Purple — secondary emphasis, rundown type labels |
| `--accent-success` | `#10b981` | Green — success, ON AIR, play button |
| `--accent-warning` | `#f59e0b` | Amber — warning, PVW monitor border |
| `--accent-danger` | `#ef4444` | Red — danger, PGM monitor border, delete |

### 2.7. Broadcast Domain

| Token | Value | Usage |
|-------|-------|-------|
| `--preview-border` | `#f59e0b` (Amber) | PVW (Preview) monitor border |
| `--pgm-border` | `#ef4444` (Red) | PGM (Program) monitor border |
| `--pgm-glow` | `rgba(239, 68, 68, 0.3)` | PGM monitor glow |
| `--playhead-color` | `#00d4ff` (Cyan) | Timeline playhead |
| `--playhead-glow` | `rgba(0, 212, 255, 0.4)` | Playhead glow |

---

## 3. Typography

### 3.1. Font Stack

```
Primary (Body/UI): "Inter", "Pretendard", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif
Monospace (Code):  "JetBrains Mono", source-code-pro, Menlo, Monaco, Consolas, "Courier New", monospace
```

- **Inter** — Default Latin character. Highly legible UI font.
- **Pretendard** — Korean subset (`unicode-range: U+AC00-D7A3`). Visually harmonious with Inter.
- **JetBrains Mono** — CSS direct input, code blocks, technical labels.
- **Dedicated Broadcast Overlay Fonts** — 14 types (Noto Sans KR, Gmarket Sans, S-Core Dream, Montserrat, etc.) are used exclusively inside the graphics editor, separate from system UI fonts.

### 3.2. Weight System (4-Weight)

| Weight | Token/Value | Usage |
|--------|-------------|-------|
| Regular | `400` | Body text, reading |
| Medium | `500` | UI elements, navigation, interactive |
| SemiBold | `600` | Emphasized labels, section titles, buttons |
| Bold | `700` | Page titles, key values, headings |

### 3.3. Type Scale (8-Level Hierarchy)

| Role | Size | Weight | Line Height | Letter Spacing | CSS Example |
|------|------|--------|-------------|----------------|-------------|
| **Page Title** | 1.5rem (24px) | 600 | 1.33 | normal | `.page-title` |
| **Section Heading** | 1.125rem (18px) | 600 | 1.33 | normal | `.empty-state-title` |
| **Card Title** | 0.9375rem (15px) | 600 | 1.40 | normal | `.card-title` |
| **Body** | 0.875rem (14px) | 400–500 | 1.50 | normal | Default body |
| **Body Small** | 0.8125rem (13px) | 500 | 1.45 | normal | Descriptions, subtexts |
| **Caption** | 0.75rem (12px) | 500–600 | 1.33 | `0.03em` | Timecodes, statuses |
| **Micro Label** | 0.6875rem (11px) | 600 | 1.20 | `0.05em` | uppercase section labels |
| **Tiny** | 0.625rem (10px) | 600 | 1.00 | `0.05em` | Shortcut hints, badges |

### 3.4. Principles

- **font-smoothing required**: `-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;` — Subpixel rendering on dark backgrounds causes text blur.
- **Uppercase + letter-spacing**: Section labels (`sidebar-nav-label`, `settings-title`, `stat-label`) are unified using `text-transform: uppercase; letter-spacing: 0.05em`.
- **tabular-nums**: Applied where numerical figures change rapidly (e.g., timecodes, key stats, zoom percentages) via `font-variant-numeric: tabular-nums`.
- **Body text 400, UI text 500**: Differentiate between read-only text (descriptions, content) at 400 weight, and clickable elements (navigation, menus, tabs) at 500 weight.

---

## 4. Component Styles

### 4.1. Buttons

WebCG-K defaults to the **shadcn/ui `<Button>` component**. Only domain-specific buttons are customized.

**shadcn/ui Default Variants (with Dark Theme overrides):**

| Variant | Background | Text | Radius | Usage |
|---------|-----------|------|--------|-------|
| `default` (Primary) | Cyan (`--primary`) | Dark (`--primary-foreground`) | `var(--radius)` | Primary CTAs: "Save", "Create", "Add" |
| `secondary` | `--secondary` | `--secondary-foreground` | `var(--radius)` | Secondary actions |
| `destructive` | Red (`--destructive`) | White | `var(--radius)` | "Delete", hazardous actions |
| `outline` | Transparent | `--foreground` | `var(--radius)` | Border outline buttons |
| `ghost` | Transparent → hover `--accent` | `--accent-foreground` | `var(--radius)` | Icon buttons, navigation |

**Domain-Specific Buttons:**

| Component | Style | Usage |
|-----------|-------|-------|
| `.controller-tab.active` | `bg: --accent-primary, color: white` | Controller active tab |
| `.rundown-item-play` | `bg: --accent-success, radius: 4px` | Play button |
| `.live-badge` | `bg: --accent-danger, uppercase, pulse animation` | Live status badge |
| `.toggle-btn.active` | `gradient: accent-success` | Active toggle |

### 4.2. Cards & Containers

**Standard Card (`.card`):**
```css
background: linear-gradient(135deg, var(--glass-bg-strong), var(--glass-bg));
backdrop-filter: var(--glass-blur);
border: 1px solid var(--glass-border);
border-radius: 12px;
```

**Hover State:**
```css
border-color: var(--glass-border-hover);
box-shadow: var(--glass-shadow-hover);
transform: translateY(-1px);   /* subtle lift */
```

**Card Inner Structure:**
- `.card-header` — 1px glass border-bottom, padding `1rem 1.25rem`
- `.card-body` — padding `1.25rem`
- `.card-footer` — 1px glass border-top, `--glass-bg` background

### 4.3. Inputs & Forms

```css
background: var(--glass-bg);
border: 1px solid var(--glass-border);
border-radius: 6px;
color: var(--text-primary);
padding: 0.5rem 0.75rem;
font-size: 0.875rem;
```

**Focus State:**
```css
border-color: var(--accent-primary);
box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.1);   /* cyan focus ring */
outline: none;
```

### 4.4. Navigation (Sidebar)

- **Background**: Gradient glass (`rgba(26, 26, 26, 0.85)` ➔ `rgba(13, 13, 13, 0.92)`) + backdrop-filter
- **Active Item**: Cyan-purple gradient background (`rgba(0, 212, 255, 0.15)` ➔ `rgba(124, 58, 237, 0.15)`) + 3px cyan left border
- **Hover**: `--glass-bg-hover`
- **Section Label**: 11px, uppercase, `letter-spacing: 0.05em`, `--text-tertiary`

### 4.5. Tables (Data Table)

```css
/* Container */
background: var(--glass-bg);
border: 1px solid var(--glass-border);
border-radius: 12px;

/* Header */
background: var(--glass-bg-hover);
font-size: 0.75rem;
font-weight: 600;
text-transform: uppercase;
letter-spacing: 0.05em;
color: var(--text-secondary);

/* Row hover */
background: var(--glass-bg-hover);

/* Selected row */
background-color: rgba(0, 212, 255, 0.1);
border-left: 3px solid var(--accent-primary);
```

### 4.6. Monitors (Broadcast Domain)

```css
/* Preview Monitor */
border: 3px solid var(--preview-border);     /* Amber */

/* Program Monitor */
border: 3px solid var(--pgm-border);         /* Red */
box-shadow: 0 0 20px var(--pgm-glow);        /* Red glow */

/* Monitor Label */
font-size: 0.75rem;
font-weight: 600;
text-transform: uppercase;
letter-spacing: 0.05em;
border-radius: 4px;
```

### 4.7. Timeline

- **Track background**: `--surface-track` (`#1f1f1f`)
- **Block**: `--surface-block` ➔ hover `--surface-block-hover` ➔ selected `outline: 2px solid --accent-primary`
- **Playhead**: 2px `--playhead-color` + `box-shadow: 0 0 8px --playhead-glow` + triangular tip (via clip-path)
- **Zoom control**: `--app-bg-muted` background, `--border-subtle` border, 6px radius

---

## 5. Layout Principles

### 5.1. Application Zones

```
┌────────────────────────────────────────────────────┐
│  Dashboard         │        Controller              │
│  (Authoring Env)   │        (Playout Env)           │
│                    │                                │
│  240px Sidebar     │  auto Header                   │
│  + 1fr Content     │  + Dual Monitors               │
│                    │  + Tab Bar                     │
│                    │  + Timeline/Overlay/Character   │
└────────────────────────────────────────────────────┘
```

- **Dashboard**: `grid-template-columns: 240px 1fr` — fixed sidebar on left + content on right
- **Controller**: `grid-template-rows: auto 1fr auto` — header + content (monitors + tabs) + footer
- **Graphics Editor**: 3-Pane — left 240px (layers) + center (canvas) + right 280px (properties)
- **Rundown Editor**: 3-Pane — left 280px (library) + center (rundown) + right 320px (preview)

### 5.2. Spacing System (8px Base)

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | 2px | Inline gap, fine tuning |
| `--space-2` | 4px | Icon-text gap, micro padding |
| `--space-3` | 8px | Base unit, components internal gap |
| `--space-4` | 12px | Card inner padding, small margins |
| `--space-5` | 16px | Standard padding, grid gaps |
| `--space-6` | 24px | Margins between sections |
| `--space-7` | 32px | Page padding |
| `--space-8` | 48px | Large section spacing |

### 5.3. Grid & Container

- **Minimum Resolution**: 1280px (broadcast gear standard)
- **Dashboard Content**: `padding: 2rem` (32px)
- **Card Grid**: `grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1.5rem`
- **Stat Card Grid**: `grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem`

### 5.4. 3-Pane Panels

Left/Right panels combine glass gradient + backdrop-filter + border:
```css
background: linear-gradient(180deg, rgba(26, 26, 26, 0.85) 0%, rgba(13, 13, 13, 0.9) 100%);
backdrop-filter: var(--glass-blur);
border-right: 1px solid var(--glass-border);   /* or border-left */
```

---

## 6. Depth & Elevation

### 6.1. Elevation Levels

| Level | Treatment | Usage |
|-------|-----------|-------|
| **Level 0** (Flat) | No shadows, `--app-bg` | Page background, empty spaces |
| **Level 1** (Glass) | `1px solid var(--glass-border)` + `var(--glass-bg)` | Cards, panels, table containers |
| **Level 2** (Raised) | `var(--glass-shadow)` + glass border | Hovered cards, raised elements |
| **Level 3** (Float) | `0 8px 24px rgba(0,0,0,0.5)` + `blur(16px)` | Modals, dropdowns, context menus |
| **Focus** | `0 0 0 3px rgba(0, 212, 255, 0.1)` | Focus ring (accessibility) |
| **Glow** | `0 0 20px rgba(0, 212, 255, 0.2)` | Active/selected special elements |

### 6.2. Shadow Philosophy

WebCG-K's depth system reverses **traditional light theme shadows** in a manner similar to Framer:

- **Glass borders** are the primary depth indicators — `rgba(255, 255, 255, 0.08~0.15)` borders define element boundaries.
- **Dark ambient shadows** — deep shadows utilizing `rgba(0, 0, 0, 0.25~0.5)`; light-colored shadows are strictly forbidden.
- **Cyan glow** — reserved strictly for selected or active states. Avoid abusing decorative glows.
- **translateY(-1px ➔ -4px)** — subtle elevation lift on hover provides tactile interactive feedback.

---

## 7. Motion & Animation

### 7.1. Transition Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--transition-fast` | `100ms ease` | Hover background colors, focus rings |
| `--transition-normal` | `200ms ease` | Card hover, panel transitions |
| `--transition-slow` | `300ms ease` | Settings panel slides, modals |

### 7.2. Standard Patterns

**Hover Lift (Cards):**
```css
transition: all var(--transition-normal);
/* hover */
transform: translateY(-1px);   /* subtle lift */
border-color: var(--glass-border-hover);
box-shadow: var(--glass-shadow-hover);
```

**Hover Grow (Library Items):**
```css
/* hover */
transform: translateY(-2px);
```

**Pulse Glow (Live Badge):**
```css
@keyframes pulseGlow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
  50%      { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
}
animation: pulseGlow 2s ease-in-out infinite;
```

**Shimmer (Loading Skeleton):**
```css
background: linear-gradient(90deg, var(--app-bg-alt) 25%, var(--app-bg-muted) 50%, var(--app-bg-alt) 75%);
background-size: 200% 100%;
animation: shimmer 1.5s infinite;
```

**Spin (Loading Spinner):**
```css
border: 3px solid var(--border-default);
border-top-color: var(--accent-primary);
animation: spin 1s linear infinite;
```

**Slide In (Settings Panel):**
```css
transform: translateX(100%);
transition: transform var(--transition-normal);
/* open */
transform: translateX(0);
```

### 7.3. Principles

- **Restraint**: Use animations strictly when meaningful. Do not append scale transformations to every hover state.
- **Consistency**: Card lift = `-1px`, library item lift = `-2px`. Higher offsets are excessive.
- **Performance**: Only animate `transform` and `opacity`. Avoid animating layout-triggering properties like `height`, `width`, `top`, or `left` directly.
- **Deceleration**: Use `ease` or `cubic-bezier(0.33, 1, 0.68, 1)` for organic, fluid deceleration.

---

## 8. Responsive Behavior

### 8.1. Design Constraints

WebCG-K is designed exclusively for **professional broadcast environments**:
- **Minimum Supported Resolution**: 1280 × 720px
- **Recommended Resolution**: 1920 × 1080px or higher
- **Touch Input Support**: None (mouse + keyboard environment)
- **Mobile Device Support**: None (responsive mobile layouts are not implemented)

### 8.2. Breakpoints

| Name | Width | Key Changes |
|------|-------|-------------|
| Minimum | 1280px | Collapsed sidebar, single monitor layout |
| Standard | 1920px | Full layout, dual monitor panels |
| Ultra-wide | 2560px+ | Expanded margins, larger previews |

### 8.3. Panel Behavior

- **Sidebar (240px)**: Fixed width. Overlay mode is only triggered below 1280px.
- **Properties Panel (280–320px)**: Fixed width. Can be toggled closed.
- **Monitor Region**: `max-height: 60vh` — must not exceed 60% of the viewport height.
- **Graphics Editor Canvas**: Maintains `aspect-ratio: 16/9`, scaling gracefully to fit available screen space.

---

## 9. Do / Don't

### ✅ Do

- **Use Glass System**: Apply `--glass-*` tokens for all cards and panels. Raw `rgba` values are strictly forbidden.
- **Cyan Accent Only**: Limit primary interactive accents to `--accent-primary` (`#00d4ff`). Do not introduce secondary high-saturation accent colors.
- **Reference Semantic Tokens**: Always reference `--text-secondary`, avoiding hardcoded hex colors like `#a3a3a3`.
- **Strict 8px Grid**: Restrict spacings to multiples of 8 (`4`, `8`, `12`, `16`, `24`, `32px`). Arbitrary values like `5px`, `7px`, or `15px` are prohibited.
- **Strict Border Radius Scale**: Adhere strictly to the 5 radius tiers listed below.
- **Uppercase + Letter-Spacing**: Always format section labels with `text-transform: uppercase; letter-spacing: 0.05em`.
- **Prioritize shadcn/ui Components**: Standard components (Buttons, Dialogs, Selects) must use shadcn/ui defaults directly.

### ❌ Don't

- **No Light Backgrounds**: Do not apply light colors like `#ffffff` or `#f5f5f5` to the UI chrome. (Active graphic content is exempt.)
- **No High-Saturation Rainbows**: Do not blend three or more saturated accent colors. Mixing cyan, red, and green across UI chrome creates a chaotic, unprofessional look.
- **No Heavy Shadows**: Avoid heavy shadows like `box-shadow: 0 10px 30px rgba(0,0,0,0.8)`. Intense drop shadows clash with glassmorphism depth levels.
- **No Positive Letter-Spacing on Body**: Adding positive letter spacing to body text degrades legibility. The only exception is uppercase labels.
- **Minimize px and rem Mixing**: UI structural dimensions should use `rem`. Limit `px` units to static values (e.g. border widths, shadows).
- **No Arbitrary Transition Durations**: Avoid hardcoded values like `0.15s` or `0.2s`. Reference `--transition-fast` or `--transition-normal` instead.
- **No Decorative Gradients or Illustrations**: Extraneous UI ornaments degrade focus. Playout monitors must distinctly contrast with UI decorations to prevent operator confusion.

### Border Radius Scale

| Level | Value | Usage |
|-------|-------|-------|
| **Micro** | `3px–4px` | Badges, tags, keyboard hints, monitor labels |
| **Small** | `6px` | Input fields, zoom controls, inline elements |
| **Medium** | `8px` | Buttons, sidebar items, monitors, library items |
| **Large** | `12px` | Cards, table containers, preview panels |
| **XL** | `16px` | Empty-state icons, large decorative containers |
| **Pill** | `100px` / `9999px` | Rundown count badges, view mode counts |

---

## Quick Color Reference

```
Background:           #0d0d0d
Surface Alt:          #1a1a1a
Text Primary:         #ffffff
Text Secondary:       #a3a3a3
Text Tertiary:        #737373
Accent Cyan:          #00d4ff
Accent Purple:        #7c3aed
Success Green:        #10b981
Warning Amber:        #f59e0b
Danger Red:           #ef4444
Glass Border:         rgba(255, 255, 255, 0.08)
Glass Background:     rgba(255, 255, 255, 0.04)
Focus Ring:           0 0 0 3px rgba(0, 212, 255, 0.1)
```
