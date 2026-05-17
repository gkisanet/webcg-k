# 🌟 Troubleshooting & Retrospective Notes (docs/LESSONS.md)

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
