# 📝 Technical Changelog (docs/CHANGELOG.md)

## [2026.05.21] Restore Original English Documentation & Sync Residue Cleanup

### 1. English Documentation Selective Restore
*   **What**: Selectively restored 19 documentation markdown (.md) files to their original high-quality English versions from commit `1a53224`.
*   **Why**: Resolved a syncing mistake where private Korean workspace documentations accidentally overwrote the public repository's English files.
*   **How**: Executed `git checkout 1a53224 -- README.md DESIGN.md webcg-k/README.md webcg-k/docs/` to roll back documents without affecting recently patched business logic (like PostgreSQL API key encryption or PL/pgSQL STUB hotfixes).

### 2. Synchronization Residue Purge
*   **What**: Permanently removed untracked files/folders at the root level including `docs/`, `graphify-out/`, `AGENTS.md`, `CLAUDE.md`, `.claudeignore`, `.graphifyignore`, and `skills-lock.json`.
*   **Why**: Cleaned up internal/private configuration and duplicated Korean docs left over from the migration script, keeping the public workspace lean and clean.

---

## [2026.05.17] Full Technical Documentation English Translation

### 1. English Translation of Root & Application Guides
*   **What**: Translated **15+ Markdown files** including guides, setup instructions, architectural specs, and retrospectives from Korean to high-quality technical English.
*   **Why**: To open-source the project and make the technical guides accessible to global developers, maintaining professional clarity on all system architecture pathways (e.g., SVG scaling pipelines, Realtime CDC sync models, etc.).
*   **How**: Mapped and translated:
    *   Root-level `README.md` and `DESIGN.md`.
    *   Application-level `webcg-k/README.md`.
    *   Core architectural files in `webcg-k/docs/` (`CONTEXT.md`, `HANDOVER.md`, `CHANGELOG.md`, `TASKS.md`, `LESSONS.md`).
    *   Guide files in `webcg-k/docs/guide/` (`SETUP.md`, `GRID_EDITOR.md`, `TROUBLESHOOTING.md`, `NRCS_CUESHEET_WORKFLOW.md`, `AI_CG_GUIDE.md`, `AI_CHARACTER_SYSTEM.md`, `RENDERER_RESOLUTION.md`, `REALTIME_SYNC_ARCHITECTURE.md`, `SHADCN_GUIDE.md`, `FONT_LICENSE_GUIDE.md`).

---

## [2026.05.17] Consolidated Supabase Migration Squash & Schema Isolation Resolution

### 1. Fragmented Migration Squashing
*   **What**: Combined **65 individual SQL files** scattered within the `supabase/migrations` directory into a single consolidated file: `202605140001_overlay_blend_mode.sql`.
*   **Why**: To eliminate logical dependency order errors (e.g., Foreign Key creation sequence conflicts) and resolve developer local build-time performance bottlenecks caused by highly fragmented migrations.
*   **How**: Safely dumped and sorted the local DB schema by running the `npx supabase migration squash --local` command.

### 2. Search Path Session Conflict Troubleshooting & Resolution
*   **What**: Appended the `RESET search_path;` statement to the bottom of the consolidated migration file.
*   **Why**: Due to postgres dump security isolation, the database session's `search_path` was overwritten to `''` (an empty string). Since this state was not restored, subsequent seeding scripts (`seed.sql`) failed to identify target tables (e.g., `grid_templates`), causing critical `SQLSTATE 42P01` exceptions.
*   **How**: Restored the session's default schema search path by writing the `RESET search_path;` command at the absolute bottom of the migration file, guaranteeing that `supabase db reset` passes with 100% integrity.
