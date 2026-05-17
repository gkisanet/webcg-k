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
