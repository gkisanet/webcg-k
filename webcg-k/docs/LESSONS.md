# 🌟 Troubleshooting & Retrospective Notes (docs/LESSONS.md)

## 📌 [Retrospective Note] Selective Git Documentation Rollback & Synchronization Residue Purge

### 1. Symptom
*   During a workspace synchronization process between private and public repositories, English translations of core documentations (`README.md`, `DESIGN.md`, and guides) were accidentally overwritten by private Korean workspace versions.
*   We needed to completely restore the beautiful English version of all documentations without rolling back the recently committed functional code and DB security patches (e.g., API key PGP encryptions, layout profiles, or PL/pgSQL STUB fixes).

---

### 2. Root Cause
*   The syncing process copy-pasted all workspace files indiscriminately.
*   Because standard gitignore files did not distinguish between markdown documentation files and raw functional codebase files, a full overwrite occurred, replacing high-quality English guides with the private Korean iterations.

---

### 3. Solution
*   Leveraged **Git's Selective Checkout** mechanism to extract specific documentation directories and files from the target commit (`1a53224`) where the translation was completed.
*   **Command Executed**:
    ```bash
    git checkout 1a53224357cc426030f5b5241df89b8f4d7a6e6b -- README.md DESIGN.md webcg-k/README.md webcg-k/docs/
    ```
*   Pruned all internal duplicated untracked files (`docs/`, `graphify-out/`, `.claudeignore`, etc.) at the root level using `rm -rf` to prevent future synchronization errors.
*   This approach guarantees a **100% zero regression rate** on the React 19 playout runtime and Supabase schema while seamlessly restoring the visual and architectural guides to English.

---

### 4. Key Lesson
*   **Decouple Docs from Logic in Sync Pipelines**: Indiscriminate synchronizations can cause regression on documentation efforts. Syncing pipelines must always separate workspace logic from documentation assets.
*   **Leverage Git as a Fine-Grained Surgical Tool**: Never resort to a heavy-handed `git reset --hard` to fix local document overrides. Knowing how to surgically slice and splice past commits using `git checkout/restore` is an essential safety net for multi-repository environments.

---

## 📌 [Retrospective Note] seed.sql Execution Failure Post-Supabase Migration Squash (SQLSTATE 42P01)

### 1. Symptom
*   After squashing 65 migrations using the Supabase CLI, running `supabase db reset` to restore the local database successfully executes schema-definition migrations. However, the process aborts during the seeding phase (`Seeding data from supabase/seed.sql...`) with the following error:
    ```bash
    failed to send batch: ERROR: relation "grid_templates" does not exist (SQLSTATE 42P01)
    ```

---

### 2. Root Cause
*   The Supabase `migration squash` utility internally uses the PostgreSQL `pg_dump` tool to extract the local database schema state into a flat SQL file.
*   To ensure all DDL statements are explicitly and consistently normalized, `pg_dump` prefixes the output with `SELECT pg_catalog.set_config('search_path', '', false);` at the top, forcing the connection session's `search_path` to be empty.
*   The core issue is that the Supabase CLI **reuses the exact same database connection session** to execute the subsequent `seed.sql` script. Because the connection context remains active, `search_path` stays empty. When `seed.sql` attempts queries like `INSERT INTO grid_templates ...` without explicit schema qualification (`public.grid_templates`), PostgreSQL fails to identify the target relation, triggering the `SQLSTATE 42P01` error.

---

### 3. Solution
*   Append `RESET search_path;` at the absolute bottom of the consolidated migration SQL file. This ensures that immediately after schema building is complete, the session search path is cleanly restored to its default configuration (containing `"public", "auth", "extensions"`, etc.).
*   **Bottom of Consolidated Migration File (`202605140001_overlay_blend_mode.sql`)**:
    ```sql
    CREATE POLICY "fathom_files_select" ON "storage"."objects" FOR SELECT TO "authenticated" USING (("bucket_id" = 'fathom-files'::"text"));

    -- Restore search_path to default session settings for subsequent scripts (e.g. seed.sql)
    RESET search_path;
    ```
    After adding this restoration clause, executing `supabase db reset` successfully completes both schema construction and seeding in a single pass without any bottlenecks or warnings.

---

### 4. Key Lesson
*   When merging database dump scripts manually or programmatically (especially files originating from Postgres's `pg_dump`), we must always keep a strict eye on state-mutating session configurations (e.g., `SET search_path`, `SET timezone`, `SET client_encoding`) and properly clean up their side effects.
*   We reinforced that appending a **"Session State Reset"** directive (`RESET ALL` or `RESET search_path`) at the absolute end of database schema transitions is a senior architect's essential fail-safe. It guarantees that subsequent utilities, batch seeding scripts, or bulk loaders operate safely and securely across all target deployment environments.
