# 🎬 WebCG-K

> **Next-Generation Web-Based Broadcast Graphics Playout System**  
> Web-based broadcast graphics playout and timeline controller system built with React 19 and Supabase real-time synchronization.

---

<p align="center">
  <img src="https://img.shields.io/badge/React-19.0-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/Supabase-Backend-3ECF8E?style=flat-square&logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/TailwindCSS-v4.0-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white" alt="Tailwind v4" />
  <img src="https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="License" />
</p>

---

## 🎯 Problems Solved by WebCG-K (Why WebCG-K)

The broadcast graphics (CG) industry has long been constrained by expensive hardware dependencies and closed software ecosystems. Whether in terrestrial, cable, or online streaming playout, generating and broadcasting graphics and lower-thirds remains structurally rigid and complex.

WebCG-K resolves these issues by **establishing a complete broadcast graphics pipeline powered entirely within the web browser**:

*   **Zero Hardware Lock-in**: Directly play out high-quality transparent graphics through OBS/vMix Browser Sources without specialized, high-cost graphics hardware. All authoring and control take place directly in the web browser.
*   **Standardized Broadcast Networks**: Share exact split-screen grid templates across regional stations or branch offices, guaranteeing consistent branding, alignment, and playout protocols.
*   **Timeline Control Beyond Rundowns**: Escape from simple sequential cuesheets. Utilize a multi-track playout timeline editor to stack graphics in layered depth (z-index) and edit playout timings precisely.
*   **Boost Productivity with AI**: Input news scripts or transcripts, and our AI will automatically identify graphics types (e.g., Intro ➔ Main Title overlay, Interview ➔ speaker identification lower-third) and generate structured playout cuesheets in seconds, eliminating tedious manual entry.

---

## 🏗️ System Architecture Overview

WebCG-K links visual overlay Authoring (Editor), playout programming (Controller), and lossless broadcast rendering (Renderer) into a single, unified data and sync pipeline.

```
┌────────────────────────────────────────────────────────┐
│             WebCG-K Frontend (React 19 SPA)            │
├────────────────────────────────────────────────────────┤
│  [Authoring Layer] Graphics Editor (Visual Vector Canvas)    │
│  [Playout Layer] Multi-track Playout Timeline Controller  │
│  [Output Layer] Transparent BG OBS Web Renderer          │
└───────────────────────────┬────────────────────────────┘
                            │ (Supabase Realtime CDC / Broadcast)
                            ▼
┌────────────────────────────────────────────────────────┐
│             Database & Backend (Supabase)              │
├────────────────────────────────────────────────────────┤
│  PostgreSQL (Schema)  ·  Auth (RLS Isolation)          │
│  Realtime Sync        ·  S3 Storage (Fonts & Images)     │
└────────────────────────────────────────────────────────┘
```

---

## 💡 4 Key Technical Innovations

### 🎨 1. Visual Vector Graphics Editor for Broadcast Overlay (Penpot-Style)
Traditional broadcast CG tools operate on rigid forms, template scripts, or manual coordinates. WebCG-K introduces a **Penpot-inspired freehand vector editor**, letting designers and playout operators draw shapes, align typography, and inspect overlays directly over a transparent alpha channel, achieving a highly intuitive WYSIWYG editing experience.

### 📐 2. Grid Template System for Regional Standardization (GridEditor)
In large-scale broadcasting networks with multiple regional stations (Branch Stations), graphics alignments can easily drift, fracturing brand identity. **GridEditor** resolves this by sharing standardized grid templates (FancyZones-style layout models) in the database layer. This guarantees regional operators play out graphics with **100% identical styling, font scaling, and alignment rules**.

### ⏱️ 3. Multi-Track Playout Timeline
Going beyond simple sequential playout systems (e.g., SPX-GC), we introduce a full **Multi-Track Playout Timeline UI** akin to professional video editors. Background elements, lower-thirds, corner bug logos, and live interactive AI characters reside on separate track layers. They composite seamlessly with exact z-index priority, supporting continuous on-air transitions.

### 🤖 4. AI-Driven Playout Cuesheet Wizard
Simply copy-paste raw script drafts, program outlines, or transcripts. Our LLM pipeline (Gemini) evaluates the content against broadcast patterns (e.g., Intro ➔ Main Title overlay, Interview ➔ speaker identification lower-third) and automatically constructs **fully populated playout cuesheets with estimated block durations in under a second**.

---

## 🛠️ Tech Stack & Rationale

| Category | Tech Stack | Rationale & Educational Value |
| :--- | :--- | :--- |
| **Framework** | **React 19 + Vite** | Playout engines require extremely lightweight UI painting pipelines. Combining React 19's optimized rendering cycle with Vite's instant HMR provides a highly responsive playout runtime. |
| **Routing** | **TanStack Router** | Employs file-system routing and robust TypeScript Type-Safety to manage complex routing variables for controllers and renderers without runtime exceptions. |
| **State** | **TanStack Store & Query** | Achieves clear separation of concerns between client state and server state (Supabase Realtime). Leverages structural sharing to optimize frequent sync cycles without performance overhead. |
| **Backend** | **Supabase (PostgreSQL)** | Composed of secure PostgreSQL transactions alongside RLS policies. Educates engineers on database change data capture (CDC) to stream overlay updates instantly to on-air rendering clients. |
| **Styling** | **Tailwind CSS v4** | Speeds up UI structure workflows by utilizing modern CSS features and CSS Variables optimized for GPU hardware acceleration. |
| **Animation** | **Rive (WebGL2) & GSAP** | Utilizes WebGL2 vector animations and GSAP to deliver buttery-smooth, high-fidelity broadcast graphics at 60fps directly in the browser environment. |

---

## 📂 Project Structure

```
webcg-k/
├── webcg-k/                 # Frontend application (React 19 SPA)
│   ├── src/
│   │   ├── routes/          # Page routes (Dashboard, Controller, Renderer)
│   │   ├── components/      # Domain-specific components (GraphicsEditor, Timeline, etc.)
│   │   ├── services/        # Infrastructure adapters (AI services, Supabase APIs, etc.)
│   │   ├── stores/          # TanStack global state stores
│   │   └── locales/         # Translation resource files (ko, en)
│   └── docs/                # Architectural manuals, learning resources, and archives
│
└── supabase/                # Backend infrastructure (Self-hosted Docker)
    ├── migrations/          # Squashed single database migration DDL scripts
    └── docs/                # Database schema details (DB.md)
```

---

## 🚀 Quick Start Guide

### Prerequisites
*   Node.js 20 or higher
*   Docker & Docker Compose (for local Supabase deployment)

### Installation & Local Bootstrapping

```bash
# 1. Clone Repository & Navigate
git clone <repository-url>
cd webcg-k

# 2. Spin up Local Supabase & Apply Squashed Migration
npx -y supabase start
# Container initializes and automatically runs the squashed migration.

# 3. Install Frontend Dependencies
cd webcg-k
npm install

# 4. Configure Environment Variables
cp .env.example .env
# Fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and VITE_GEMINI_API_KEY in the .env file.

# 5. Start Local Development Server
npm run dev
# Running at http://localhost:3000
```

---

## 🔗 Knowledge Base & Documentation Map

WebCG-K maintains highly detailed learning guides and documentations to ensure the codebase serves as an **educational textbook**.

### 📚 Core Educational Docs
*   **[CONTEXT.md](webcg-k/docs/CONTEXT.md)**: Complete playout pipeline visualised via Mermaid diagrams, and in-depth renderer comparisons with Excalidraw.
*   **[TASKS.md](webcg-k/docs/TASKS.md)**: Ongoing development milestones coupled with explicit educational learning objectives.
*   **[CHANGELOG.md](webcg-k/docs/CHANGELOG.md)**: Technical changelog tracking optimizations along with Big-O complexites and rendering performance gains.
*   **[HANDOVER.md](webcg-k/docs/HANDOVER.md)**: Handover summaries to warm up your brain when returning to active development.
*   **[LESSONS.md](webcg-k/docs/LESSONS.md)**: Troubleshot retrospective detailing database `search_path` connection session isolation errors.

### 💻 Production Manuals & Workflows
*   **[USAGE.md](webcg-k/docs/USAGE.md)**: Complete operator manual detailing graphics editing shortcuts, snap guides, and playout workflows.
*   **[DB.md](supabase/docs/DB.md)**: Database ERD, schema architectures, and Row-Level Security (RLS) policies.
*   **[REALTIME_SYNC.md](webcg-k/docs/guide/REALTIME_SYNC_ARCHITECTURE.md)**: Ultra-low latency database synchronization and channel playout architecture.
*   **[GRID_EDITOR.md](webcg-k/docs/guide/GRID_EDITOR.md)**: Grid editor technical specifications enforcing alignment standards across branch stations.

---

## 📝 License

[MIT License](LICENSE)
