# shadcn/ui + Tailwind CSS v4 — WebCG-K Integration Guide

> **Last Updated:** 2026-02-13  
> **Purpose**: Technical concepts manual, configurations, collision resolution examples, and migration guides for developer reference during system maintenance.

---

## Table of Contents

1. [Core Concepts](#1-core-concepts)
2. [Project Directory & Configurations](#2-project-directory--configurations)
3. [CSS Variables Architecture](#3-css-variables-architecture)
4. [Conflict Cases & Resolutions (Post-Mortem)](#4-conflict-cases--resolutions-post-mortem)
5. [Button Component Guidelines](#5-button-component-guidelines)
6. [Installing New shadcn Components](#6-installing-new-shadcn-components)
7. [Phase Migration Roadmap](#7-phase-migration-roadmap)
8. [Playout Troubleshooting Checklist](#8-playout-troubleshooting-checklist)

---

## 1. Core Concepts

### Analogies for Understanding

| Tool | Analogy | Description |
|------|---------|-------------|
| **Tailwind CSS** | **LEGO Bricks** | Build complex layouts by snapping pre-fabricated style variables (`bg-red`, `p-4`) together. |
| **shadcn/ui** | **IKEA Flat-Pack Furniture** | Deploy ready-to-use functional elements (Button, Dialog) with **full source code access** — adjust screw layouts or styles as needed. |
| **Radix UI** | **The Structural Skeleton** | Headless foundation engines managing accessible behavior patterns (WAI-ARIA) and keyboard controls. |

> While standard npm packages (Bootstrap, MUI) are immutable "black boxes", shadcn **copies component source files directly into the repository**, allowing for full customization.

### 1.1 Key Differences: Tailwind CSS v4 vs. v3

Tailwind CSS v4 updates styling mechanics:

| Parameter | v3 Configuration | v4 Implementation (Active) |
|---|---|---|
| **Configuration File** | `tailwind.config.js` (JavaScript) | `@theme inline` blocks inside CSS files |
| **Color Mapping** | `theme.extend.colors` objects | `@theme { --color-*: var(--*) }` CSS variables |
| **Utility Generation** | Derived from JavaScript configurations | Auto-generated from CSS variables |
| **Dark Mode Selector** | `darkMode: 'class'` class toggles | `@custom-variant dark (...)` queries |

> [!IMPORTANT]
> Under v4, classes like `bg-primary` dynamically evaluate corresponding `--color-primary` CSS variables inside `@theme` blocks.
> **Declaring variable names like `--bg-primary` or `--text-primary` causes rendering conflicts with Tailwind utility classes.**

### 1.2 What is shadcn/ui?

shadcn/ui is a **copy-and-paste component registry**:
- Components are downloaded directly into the repository as source code.
- Files live inside `src/components/ui/`.
- Developer-owned code — customize components to match system requirements.

#### Dependency Stack

```
shadcn/ui
├── Radix UI (@radix-ui/*) — Accessible headless primitives
├── class-variance-authority (cva) — Variant-driven class generation
├── clsx — Conditional class name composer
├── tailwind-merge — Dynamic Tailwind class conflict resolver
└── Tailwind CSS v4 — High-performance vector styling
```

### 1.3 Playout Color Pipeline

```
:root (Defines CSS variables)
  --primary: oklch(0.75 0.15 200)    ➔ ① Core color token
       │
       ▼
@theme inline (Tailwind theme configuration)
  --color-primary: var(--primary)    ➔ ② Registered with Tailwind
       │
       ▼
Tailwind Utility Classes Generated
  bg-primary ➔ background-color: var(--color-primary)  ➔ ③ Available for use
  text-primary ➔ color: var(--color-primary)
       │
       ▼
shadcn Button (cva applies styling variant)
  variant="default" ➔ className="bg-primary text-primary-foreground"  ➔ ④ Playout Output
```

---

## 2. Project Directory & Configurations

### 2.1 File Map

```
webcg-k/
├── components.json              ➔ shadcn CLI configuration
├── src/
│   ├── styles.css               ➔ Stylesheets root, shadcn variables, and @theme declarations
│   ├── lib/
│   │   └── utils.ts             ➔ cn() merging utilities
│   └── components/
│       └── ui/                  ➔ Downstream component source files
│           ├── button.tsx
│           ├── input.tsx
│           ├── dialog.tsx
│           ├── select.tsx
│           └── label.tsx
```

### 2.2 `components.json` Configuration

```json
{
  "style": "new-york",          // Design preset theme
  "rsc": false,                 // Server-side rendering disabled
  "tsx": true,
  "tailwind": {
    "css": "src/styles.css",    // Stylesheet entrypoint
    "baseColor": "neutral",     // Neutral base palette
    "cssVariables": true        // Enables CSS variables
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui"     // Directory target for components
  }
}
```

### 2.3 `cn()` Utility

```ts
// src/lib/utils.ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

**Role**: Combines class lists conditionally and resolves Tailwind class overrides automatically:

```tsx
// If both "px-4" and "px-2" exist, only "px-2" is kept
cn("px-4 py-2", isActive && "px-2", className)
// ➔ "py-2 px-2" ("px-4" is automatically removed)
```

### 2.4 `styles.css` Layout Overview

```
styles.css structure (2610 lines)
│
├── [1-3]    @import — Tailwind base, animation hooks, and shadcn directives
├── [5]      @custom-variant dark — Dark mode selectors
├── [13-129] :root — Global CSS variables
│   ├── [15-71]   Custom theme tokens (--app-bg, --glass-*, --accent-*)
│   └── [74-129]  shadcn variables (--primary, --secondary, etc.)
├── [131-2525] Legacy CSS layout rules
├── [2527-2566] @theme inline — Tailwind v4 configuration block
├── [2568-2600] .dark {} — (Retained for backwards-compatibility)
└── [2602-2610] @layer base — Root body styles
```

---

## 3. CSS Variables Architecture

### 3.1 Variable Naming Constraints ⚠️ CRITICAL

> [!CAUTION]
> **Tailwind v4 derives utility classes directly from CSS variable names.**
> If `--bg-primary` exists, Tailwind generates a corresponding `bg-primary` class that refers to it.
> **Custom application variables must use unique prefixes to prevent collisions.**

#### Naming Conventions to Avoid Collisions

| Collision Risk (DO NOT USE) | Recommended Alternative | Playout Target |
|---|---|---|
| ~~`--bg-primary`~~ | `--app-bg` | Core background #0d0d0d |
| ~~`--bg-secondary`~~ | `--app-bg-alt` | Secondary panels #1a1a1a |
| ~~`--bg-tertiary`~~ | `--app-bg-muted` | Muted backgrounds #252525 |
| ~~`--bg-elevated`~~ | `--app-bg-raised` | Raised surfaces #2d2d2d |

#### Safe Custom Variable Prefixes

```
✅ --app-*       ➔ Application layout coloring tokens
✅ --glass-*     ➔ Glassmorphism UI properties
✅ --accent-*    ➔ Accent highlight color tokens
✅ --surface-*   ➔ Panel surface colors
✅ --text-*      ➔ Text colors (ensure they do not clash with text-primary)
✅ --border-*    ➔ Border colors

❌ --bg-*        ➔ Conflicts with Tailwind bg-* classes
❌ --color-*     ➔ Reserved by v4 @theme engines
❌ --primary     ➔ Reserved by shadcn button skins
❌ --secondary   ➔ Reserved by shadcn button skins
❌ --destructive ➔ Reserved by shadcn button destructive skins
```

### 3.2 shadcn Color Variables — WebCG-K Dark Theme Mapping

`:root` variable definitions default to dark theme tokens (bypassing `.dark` selector wrappers):

| shadcn Variable | oklch Token | Approximate HEX | Intended Playout |
|---|---|---|---|
| `--primary` | `oklch(0.75 0.15 200)` | `≈ #00d4ff` | Primary actions (Cyan highlight) |
| `--primary-foreground` | `oklch(0.13 0 0)` | `≈ #0d0d0d` | Dark text rendered on Primary backgrounds |
| `--secondary` | `oklch(0.269 0 0)` | `≈ #2d2d2d` | Muted panel actions |
| `--secondary-foreground` | `oklch(0.92 0 0)` | `≈ #e8e8e8` | Light text rendered on Secondary backgrounds |
| `--destructive` | `oklch(0.577 0.245 27.325)` | `≈ #ef4444` | High-risk actions (Delete alerts) |
| `--accent` | `oklch(0.32 0 0)` | `≈ #3a3a3a` | Hover states |
| `--background` | `oklch(0.145 0 0)` | `≈ #0d0d0d` | Playout viewport background |
| `--foreground` | `oklch(0.985 0 0)` | `≈ #ffffff` | Standard light body text |
| `--border` | `oklch(0.3 0 0)` | `≈ #3a3a3a` | Separation lines |
| `--ring` | `oklch(0.75 0.15 200)` | `≈ #00d4ff` | Interactive focus boundaries (Cyan) |

### 3.3 Regarding the `.dark` Class Selector

Because this system is **exclusively dark-themed** (`html { color-scheme: dark }`), root variables default to dark colors. The `.dark { ... }` block is bypassed.

If a future update requires a light theme:
1. Re-map `:root` variables to light-theme colors.
2. Move current dark-theme variables into `.dark { ... }` blocks.
3. Add class toggles to update the `<html>` node.

---

## 4. Conflict Cases & Resolutions (Post-Mortem)

### 4.1 Button Visibility Collision

* **Symptom**: Playout `<Button>` components match the background color, making them invisible.
* **Root Cause Analysis**:

```
Stage 1: Initialization scripts set root variables to light theme defaults
  --primary: oklch(0.205 0 0)           ➔ Dark gray button background
  --primary-foreground: oklch(0.985 0 0)➔ White text
  ➔ Conflict: Dark gray buttons blend into the dark UI background.

Stage 2: Developer overrides root variables to dark theme equivalents
  --primary: oklch(0.75 0.15 200)       ➔ Cyan accent
  ➔ Buttons are still invisible.

Stage 3: Resolved variable naming collision
  The styles sheet had a legacy rule: .bg-primary { background-color: var(--bg-primary) }
  This rule overrode the Tailwind utility class.
  --bg-primary resolved to #0d0d0d, blending the button into the background.
  ➔ Resolution: Renamed --bg-primary to --app-bg and deleted the duplicate class.
```

### 4.2 Resolution Patch

```diff
# Step 1: Update root properties to dark mode tokens
- --primary: oklch(0.205 0 0);         /* Default light-mode gray */
+ --primary: oklch(0.75 0.15 200);     /* Playout Cyan accent */

# Step 2: Rename conflicting variables across files
- --bg-primary: #0d0d0d;
+ --app-bg: #0d0d0d;

# Step 3: Remove custom class definitions that override Tailwind utilities
- .bg-primary { background-color: var(--app-bg); }
- .bg-secondary { background-color: var(--app-bg-alt); }
+ /* Tailwind v4 automatically maps classes to @theme parameters */
```

### 4.3 Key Lesson

> [!WARNING]
> **Ensure new CSS variable names do not collide with Tailwind utility prefixes.**
> - Prefixes like `bg-`, `text-`, and `border-` are reserved by Tailwind.
> - Naming a variable `--bg-anything` can cause conflicts with the corresponding `bg-anything` utility class.

---

## 5. Button Component Guidelines

### 5.1 Playout Examples

```tsx
import { Button } from "@/components/ui/button"

// Primary Action (Cyan background)
<Button onClick={saveConfiguration}>Save State</Button>

// Secondary Action (Dark gray background with white text)
<Button variant="secondary">Cancel</Button>

// Destructive Action (Red alert background)
<Button variant="destructive">Delete Item</Button>

// Outline Action (Transparent background with border)
<Button variant="outline">Edit Properties</Button>

// Ghost Action (Invisible background; hover background highlight)
<Button variant="ghost">Close Window</Button>

// Sizing Classes
<Button size="sm">Small Action</Button>
<Button size="lg">Large Action</Button>
<Button size="icon"><PlusIcon /></Button>
```

### 5.2 Router Link Wrappers (asChild Pattern)

```tsx
import { Link } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"

// Render Link as a Primary Button
<Button asChild>
  <Link to="/dashboard/graphics/new">Create Template</Link>
</Button>

// Render Link as a Secondary Button
<Button variant="secondary" asChild>
  <Link to="/dashboard">Back</Link>
</Button>
```

### 5.3 Legacy Button Classes Mapping

| Legacy Class | shadcn Equivalent Component |
|---|---|
| `btn btn-primary` | `<Button>` (Default) |
| `btn btn-secondary` | `<Button variant="secondary">` |
| `btn btn-danger` | `<Button variant="destructive">` |
| `btn btn-accent` | `<Button variant="outline">` |
| `btn btn-sm` | `<Button size="sm">` |
| `Link className="btn btn-primary"` | `<Button asChild><Link /></Button>` |

### 5.4 Conditional Variant Mappings

```tsx
// Append custom classes (cn() automatically merges styles)
<Button className="w-full mt-4">Expand Actions</Button>

// Toggle variants conditionally
<Button variant={isAired ? "default" : "secondary"}>
  {isAired ? "Aired" : "Ready"}
</Button>
```

---

## 6. Installing New shadcn Components

### 6.1 Using the CLI (Recommended)

```bash
cd webcg-k
npx shadcn@latest add <component-name>
```

Examples:
```bash
npx shadcn@latest add slider        # Range sliders (Phase 3)
npx shadcn@latest add switch        # System toggles (Phase 3)
npx shadcn@latest add toast         # Alert notifications (Phase 3)
npx shadcn@latest add tabs          # Tabs panel layouts
npx shadcn@latest add dropdown-menu # Dropdown select selectors
```

### 6.2 Installation Checklist

1. **Verify Files**: Ensure new files are created in `src/components/ui/<component>.tsx`.
2. **Verify Imports**: Import elements using `@/components/ui/<component>`.
3. **Verify Variables**: Check that all required variables are defined in `:root`.
4. **Run Builds**: Execute `npm run build` to verify there are no compilation errors.

### 6.3 Extending Base Components

Because components are copied directly into the project, their source code can be modified directly:

```tsx
// Inside src/components/ui/button.tsx
const buttonVariants = cva("...", {
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground ...",
      // Custom variant addition
      cyan: "bg-[#00d4ff] text-black hover:bg-[#00bfe0]",
    },
    size: {
      // Custom sizing options
      "icon-xs": "size-6 rounded-md",
    },
  },
})
```

---

## 7. Phase Migration Roadmap

### Phase 2 ✅ (Completed 2026-02-13)
- Replaced legacy `btn` classes with shadcn `<Button>` components across 40 locations in 11 files.
- Renamed conflicting CSS variables (`--bg-primary` ➔ `--app-bg`).
- Removed duplicate `.bg-primary` and `.bg-secondary` style rules.

### Phase 3 ✅ (Completed 2026-02-13)
- Installed the shadcn `slider` component.
- **admin.tsx**: Replaced 20 HTML `<button>` elements with `<Button>`, 10 `<input>` elements with `<Input>`, and 2 range controls with `<Slider>`.
- **SettingsPanel.tsx**: Replaced range controls with `<Slider>` and buttons with `<Button>`.
- Verified the build pipeline completed successfully.

### Phase 4 (Glassmorphism & shadcn Integration)
**Goal**: Consolidate layout styling and theme tokens.

1. **Map Glassmorphism Tokens to shadcn Variables**
   ```css
   :root {
     --card: rgba(255, 255, 255, 0.04); /* Replaces legacy --glass-bg */
   }
   ```
2. **Remove Unused CSS Rules**
   - Delete legacy `.btn`, `.btn-primary`, and `.btn-secondary` classes.
   - Clean up unused structural overrides.
3. **Verify Layouts**
   - Ensure visual consistency across all panels.
   - Check that Glassmorphism styling (blur, transparencies) remains intact.

---

## 8. Playout Troubleshooting Checklist

### Invisible Buttons

```
□ Check if --primary resolved to a light accent color in :root.
□ Check if custom styles like .bg-primary override Tailwind utility classes.
□ Verify element backgrounds in the browser console:
  document.querySelector('[data-slot="button"]').style.backgroundColor
□ Verify active variable colors in the browser console:
  getComputedStyle(document.documentElement).getPropertyValue('--primary')
```

### Adding CSS Variables

```
□ Verify the variable name does not clash with Tailwind utility prefixes (bg-, text-, border-).
□ Use safe custom prefixes: --app-*, --glass-*, --surface-*.
□ Add custom tokens to @theme inline blocks only if they are used by Tailwind utilities.
```

### Layout Artifacts After Installing Components

```
□ Check if the installation script appended new variables to styles.css.
□ Update any newly created variables to match dark-theme values in :root.
□ Run npm run build to check for TypeScript type definition errors.
□ Clear browser caches (Vite HMR can occasionally cache old styles).
```

### OKLCH Color Reference

```
oklch(Lightness Chroma Hue)
  Lightness: 0 (Pure Black) to 1 (Pure White)
  Chroma:    0 (Muted Grays) to 0.4+ (High Saturation)
  Hue:       0 to 360 (0 is Red, 120 is Green, 200 is Cyan, 270 is Blue)

Examples:
  oklch(0.75 0.15 200) = Cyan accent color (~#00d4ff)
  oklch(0.13 0 0)      = Dark background color
  oklch(0.985 0 0)     = Off-white text color
  oklch(0.269 0 0)     = Muted gray color (~#2d2d2d)
```

---

## Appendix: Installed shadcn Components

| Component | File Path | Phase | Playout Purpose |
|---|---|---|---|
| Button | `ui/button.tsx` | Phase 1 | Standard buttons UI |
| Input | `ui/input.tsx` | Phase 1 | Plain text inputs |
| Dialog | `ui/dialog.tsx` | Phase 1 | Playout confirmation overlays |
| Select | `ui/select.tsx` | Phase 1 | Option select menus |
| Label | `ui/label.tsx` | Phase 1 | Accessible field labels |
| Slider | `ui/slider.tsx` | Phase 3 | Range controls (Temperature, Top P, Transitions Duration) |
