# WebCG-K

> **Web-Based Broadcast Graphics System** — next-generation broadcast CG control and playout.

## Overview

WebCG-K is a web-based broadcast graphics system that generates and controls transparent-background graphics for OBS, vMix, and other broadcast software. It replaces traditional hardware CG (character generators) with a modern React + Supabase stack.

```
┌──────────────────────────────────────────────┐
│  webcg-k/  — Broadcast Graphics Application  │
│                                              │
│  Dashboard (Authoring)                       │
│  ├── Graphics Editor (Penpot-style vector)   │
│  ├── Grid Templates (FancyZones layouts)     │
│  ├── Overlay Wizard (AI-powered generation)  │
│  ├── Rundown & Cuesheet Management           │
│  └── Asset Library (Images, Fonts, Chars)    │
│                                              │
│  Controller (Playout)                        │
│  ├── Multi-track Timeline                    │
│  ├── Real-time Overlay Control               │
│  ├── AI Character System (Rive)              │
│  └── PGM/PVW Dual Monitor                   │
│                                              │
│  Renderer (Output)                           │
│  └── Transparent BG for OBS Browser Source   │
└──────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────┐
│  supabase/  — Shared Backend                 │
│  PostgreSQL · Auth · Realtime · Storage      │
└──────────────────────────────────────────────┘
```

## Key Innovations

### Penpot-Style Visual Editor for Broadcast Graphics

Traditional broadcast CG tools force operators to work with rigid, code-driven templates. WebCG-K brings a **Penpot-inspired freeform vector editor** into the broadcast domain — operators design graphics visually with drag-and-drop, direct manipulation, and real-time preview on a transparent background. No need to switch between a design tool and a playout system: what you design is what goes on air.

### GridEditor: Standardized Graphics Across Branch Stations

Broadcast networks with multiple regional branches face a fragmentation problem — each station creates graphics differently, leading to inconsistent branding and wasted effort. The **GridEditor** solves this by constraining graphics creation to a **shared grid template system**:

- Graphics are composed within predefined, reusable grid zones — every title, lower-third, and overlay snaps into a consistent layout.
- Templates are stored centrally in Supabase and replicated in real time. When a branch station loads a graphic, they get the same grid, same fonts, same positioning — **identical protocol, identical output**.
- This turns one-off graphic creation into a **reusable asset pipeline**: design once, deploy everywhere, and maintain brand consistency without manual coordination.

### Multi-Track Timeline: Beyond the Traditional Rundown

Existing systems like SPX-GX rely on a **linear rundown** — one cue after another, with limited control over layered graphics. WebCG-K introduces a **multi-track timeline UI** inspired by video editors:

- Each graphic occupies its own **track**, with independent in/out points and duration.
- Tracks are stacked by **z-index** — background plates, lower-thirds, logos, and character overlays all play simultaneously with correct depth ordering.
- Operators can scrub, trim, overlap, and layer graphics **visually on the timeline**, seeing exactly what will play at any given moment.

This shifts broadcast graphics control from "execute the next cue" to **"compose the full visual output over time"** — a fundamentally more expressive paradigm.

### AI Cuesheet: Automatic Rundown from Raw Input

Building a broadcast rundown manually is repetitive and error-prone. The **AI Cuesheet** feature automates this: streamers and producers paste raw broadcast data (scripts, segment notes, guest names, timing instructions), and the system generates a complete, structured cuesheet with:

- Correctly ordered segments and graphics cues.
- Inferred timing based on content length and broadcast conventions.
- Auto-assigned graphic templates mapped to segment types (intro → title card, interview → lower-third with guest name, etc.).

This eliminates the mechanical work of rundown assembly, letting the production team focus on **creative decisions** rather than data entry.

## Project Structure

```
webcg-k/
├── webcg-k/                 # Frontend application (React 19 SPA)
│   ├── src/
│   │   ├── routes/          # Pages (Dashboard, Controller, Renderer)
│   │   ├── components/      # UI components by domain
│   │   ├── lib/             # Shared utilities, types, auth
│   │   ├── services/        # External API + business logic
│   │   ├── stores/          # State management (TanStack Store)
│   │   ├── hooks/           # Custom React hooks
│   │   └── locales/         # i18n (Korean/English)
│   ├── docs/                # Usage manual + guides
│   └── package.json
│
├── supabase/                # Backend (Self-hosted Docker)
│   ├── migrations/          # SQL migrations
│   ├── docs/                # DB schema documentation
│   └── config.toml
│
├── README.md                # This file
└── DESIGN.md                # Design system specification
```

## Tech Stack

| Category | Technology |
|----------|-----------|
| **Framework** | React 19 + Vite + TanStack Start |
| **Routing** | TanStack Router (File-based) |
| **State** | TanStack Store, Query, Table |
| **Backend** | Supabase (PostgreSQL, Auth, Realtime, Storage) |
| **Styling** | Tailwind CSS 4 + shadcn/ui + Glassmorphism |
| **AI** | Multi-provider (Gemini, Claude, GPT) |
| **Editor** | Monaco Editor, TipTap Rich Text |
| **Animation** | Rive (WebGL2), GSAP |
| **Validation** | Zod |
| **i18n** | react-i18next (ko, en) |

## Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose

### Installation

```bash
# 1. Clone
git clone <repo-url>
cd webcg-k

# 2. Start Supabase (local Docker)
npx -y supabase start
# Migrations are applied automatically

# 3. Install dependencies
cd webcg-k && npm install

# 4. Configure environment
cp .env.example .env
# Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and VITE_GEMINI_API_KEY

# 5. Start dev server
npm run dev
# → http://localhost:3000
```

### Service Endpoints

| Service | URL |
|---------|-----|
| **Web App** | http://localhost:3000 |
| **Supabase Studio** | http://127.0.0.1:54323 |
| **REST API** | http://127.0.0.1:54321/rest/v1 |
| **PostgreSQL** | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

## Documentation

| Document | Description |
|----------|-------------|
| **[USAGE.md](webcg-k/docs/USAGE.md)** | Comprehensive usage manual — all workflows, shortcuts, step-by-step guides |
| **[DESIGN.md](DESIGN.md)** | Design system — colors, typography, components, layout |
| **[DB.md](supabase/docs/DB.md)** | Database schema, ERD, RLS policies |
| **[SETUP.md](webcg-k/docs/guide/SETUP.md)** | Detailed environment setup |
| **[TROUBLESHOOTING.md](webcg-k/docs/guide/TROUBLESHOOTING.md)** | Common issues and solutions |

### Workflow Guides

- [NRCS Cuesheet Workflow](webcg-k/docs/guide/NRCS_CUESHEET_WORKFLOW.md)
- [AI CG Generation Guide](webcg-k/docs/guide/AI_CG_GUIDE.md)
- [AI Character System](webcg-k/docs/guide/AI_CHARACTER_SYSTEM.md)
- [Renderer Resolution](webcg-k/docs/guide/RENDERER_RESOLUTION.md)
- [Realtime Sync Architecture](webcg-k/docs/guide/REALTIME_SYNC_ARCHITECTURE.md)
- [Grid Editor Specification](webcg-k/docs/guide/GRID_EDITOR.md)
- [Font License Guide](webcg-k/docs/guide/FONT_LICENSE_GUIDE.md)

## Dev Commands

```bash
# Supabase
npx -y supabase start       # Start
npx -y supabase stop        # Stop
npx -y supabase db reset    # Reset DB (re-applies migrations)

# Frontend
npm run dev                  # Dev server
npm run build                # Production build
npx tsc --noEmit             # Type check
```

## License

MIT License
