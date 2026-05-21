# Getting Started with WebCG-K Development in a New Environment

> **Purpose of this Guide**: Full instructions on bootstrapping the WebCG-K project **from scratch** in a new or different developer environment.

### Concept: Analogous to Kitchen Setup

Setting up WebCG-K in a new environment is **analogous to setting up a new professional kitchen**:

| Kitchen Analogy | WebCG-K Component |
| :--- | :--- |
| Install stove, oven, and refrigerator | Install Node.js, Docker, and utilities |
| Plug in and power up the refrigerator | Start Supabase containers (`npx supabase start`) |
| Read and prepare the recipe | Clone the codebase (`git clone`) |
| Begin cooking dishes | Start the local development server (`npm run dev`) |

---

## 🏗 Project Structure

```
webcg-k/
├── supabase/                 ← Shared DB Config (migrations + seed)
│   ├── migrations/           ← Consolidated DB schema files (applied automatically)
│   ├── seed.sql              ← Default seeding data (run automatically on db reset)
│   ├── seed_demo_nrcs.sql    ← Demo seed: KBS News 9 NRCS integration
│   └── seed_demo_fathom.sql  ← Demo seed: Fathom articles + schedules
│
├── webcg-k/                  ← 🎬 Broadcast Graphics Playout System (Port 3000)
├── README.md
└── DESIGN.md
```

> [!IMPORTANT]
> **Supabase must be started first** for the WebCG-K application to operate correctly.

---

## 🔧 Prerequisites

### Install Required Utilities

1. **Node.js 20+** — Why? The **JavaScript runtime** required to run the React application, dependency scripts, and build tools.
   ```bash
   node --version  # Ensure v20 or higher is installed
   ```

2. **Docker Desktop** — Why? Required to **run Supabase (DB + Auth + Storage) locally** in container isolation.
   ```bash
   docker --version
   docker compose version
   ```

> [!TIP]
> **What is Docker?** A tool that packages applications inside isolated boxes called "containers". Instead of installing Supabase manually, Docker pulls and starts preconfigured boxes automatically.

> [!NOTE]
> **No global Supabase CLI installation required!**  
> The CLI is downloaded automatically via `npx`, so you do not need to install it globally.

---

## 📥 Project Setup

### 1. Clone Repository
```bash
git clone <repository-url>
cd webcg-k
```

### 2. Start Supabase

> **What is Supabase?** An open-source Firebase alternative providing a robust database (PostgreSQL), authentication, S3 file storage, and real-time messaging, perfectly self-contained via local Docker containers.

```bash
# Run from the repository root directory
npx -y supabase start
```

> [!IMPORTANT]
> **Migration vs Seed — Scope of automated execution differs!**
>
> | Command | Migration (Schema) | Seed (Initial Data) |
> | :--- | :--- | :--- |
> | `npx supabase start` | ✅ Applied Automatically | ❌ Not Applied |
> | `npx supabase db reset` | ✅ Applied Automatically | ✅ `seed.sql` Applied Automatically |
>
> - **Migrations (`migrations/`)**: DDL statements defining table structures, RLS policies, etc. Applied automatically on `start`.
> - **Seed (`seed.sql`)**: Default database records. Applied automatically during a `db reset` based on `config.toml` configurations.
> - **Demo Seeds (`seed_demo_*.sql`)**: Must be executed manually into database sessions (see details below).

**During initial start**:
- Supabase packages are downloaded automatically.
- Docker images are pulled (takes about 5–10 minutes).
- Automatically runs DDL scripts in `supabase/migrations/` in chronological order.
- Displays local development endpoints.

**Example Output**:
```
Started supabase local development setup.

╭──────────────────────────────────────╮
│ 🔧 Development Tools                 │
├─────────┬────────────────────────────┤
│ Studio  │ http://127.0.0.1:54323     │
│ Mailpit │ http://127.0.0.1:54324     │
╰─────────┴────────────────────────────╯

╭──────────────────────────────────────────────────────╮
│ 🌐 APIs                                              │
├────────────────┬─────────────────────────────────────┤
│ Project URL    │ http://127.0.0.1:54321              │
│ REST           │ http://127.0.0.1:54321/rest/v1      │
╰────────────────┴─────────────────────────────────────╯
```

### 3. Generate Database Types (★ Crucial)

> **Why?** `database.types.ts` is the type bindings file generated directly from the Supabase schema. If this file is missing or outdated, TypeScript compilation checks (`tsc`) fail, and IDE autocomplete triggers will not resolve.

```bash
# Run from the repository root directory
npx -y supabase gen types typescript --local > webcg-k/src/lib/database.types.ts

# ⚠️ Docker pulls and logs (e.g. "Connecting to db...", "Pulling...") may pollute the top
#    of the output. If present, manually delete those lines. 
#    The file must start cleanly with `export type Json = ...`.
```

### 4. Application Installation & Launch

#### WebCG-K (Studio Controller & Playout Engine — Port 3000)
```bash
cd webcg-k
npm install
npm run dev
# Open in browser: http://localhost:3000
```

---

## 👤 Initial Administrative User Setup

### 1. Operator Sign Up
- Navigate to http://localhost:3000 (WebCG-K login portal).
- Open the Sign Up panel and create your developer profile credentials.

> [!TIP]
> Email verification is bypassed automatically in local Supabase environments, permitting immediate login after signing up.

### 2. Grant Administrator Privileges

Since the database starts empty, you must manually promote your first operator profile to administrator.

```bash
# 1. Query Profile UUID
docker exec supabase_db_2026.WebCg-K psql -U postgres -c \
  "SELECT id, display_name, is_admin, role FROM public.profiles;"

# 2. Grant System Administrator (Replace <USER_ID> with the UUID from step 1)
docker exec supabase_db_2026.WebCg-K psql -U postgres -c \
  "UPDATE public.profiles SET is_admin = true, role = 'system_admin' WHERE id = '<USER_ID>';"

# 3. Verify promotion
docker exec supabase_db_2026.WebCg-K psql -U postgres -c \
  "SELECT id, display_name, is_admin, role FROM public.profiles;"
```

> [!NOTE]
> **Relationship between `is_admin` and `role`:**
> - `is_admin = true` ➔ Displays "Admin" link in WebCG-K sidebar.
> - `role = 'system_admin'` ➔ Unlocks full data access under database RLS policies.

### 3. Sign In Again
- Log out and sign back in to view the active Admin panel.

---

## 🎬 Seeding Demo Data (Optional)

To quickly preview functional rundowns, execute the following SQL seed scripts manually.

### WebCG-K NRCS Integration Demo
Generates 7 rundown segments (news blocks) and 23 CG overlay blocks representing a KBS News 9 broadcast rundown.

```bash
# ⚠️ Because seeds reference owner UUIDs, perform operator sign up first.
# Update the created_by UUID inside the script to match your account, then run:
docker exec -i supabase_db_2026.WebCg-K psql -U postgres \
  < supabase/seed_demo_nrcs.sql
```

### Fathom Articles & Schedules Demo
Inserts 7 wire-service articles and cue assignments.

```bash
# ⚠️ reporter_id must also match your account profile UUID
docker exec -i supabase_db_2026.WebCg-K psql -U postgres \
  < supabase/seed_demo_fathom.sql
```

> [!CAUTION]
> **Watch out for hardcoded UUIDs in Seed scripts!**
> Both demo seeds default to user UUID `2cb4adf0-1d06-4f68-b799-d17b43e572e2` (jetski@example.com).
> Replace occurrences in bulk via `sed` (Replace `YOUR_USER_ID` with your UUID):
> ```bash
> sed -i 's/2cb4adf0-1d06-4f68-b799-d17b43e572e2/YOUR_USER_ID/g' \
>   supabase/seed_demo_nrcs.sql supabase/seed_demo_fathom.sql
> ```
> Your account UUID is found during the profile queries in "Grant Administrator Privileges".

---

## 🔄 Everyday Developer Workflow

### Supabase Lifecycles
```bash
# Start containers
npx -y supabase start

# Stop containers
npx -y supabase stop

# Display status
npx -y supabase status
```

### Database Reset (If Required)
```bash
# Drops all schemas, runs migrations in order, and executes seed.sql
npx -y supabase db reset
```

> [!NOTE]
> `db reset` destroys all database records, rebuilding schemas and auto-running `seed.sql`.
> Demo scripts (`seed_demo_*.sql`) must be executed manually after a reset.

### Create New Migrations
```bash
# Generate a new migration DDL file
npx -y supabase migration new <migration_name>

# Example: npx -y supabase migration new add_user_preferences
```

### Run Front End
```bash
cd webcg-k && npm run dev
```

---

## 🗂️ Schema Data Backups

### Export Current Database State
```bash
# Dump active database schemas and rows
docker exec supabase_db_2026.WebCg-K pg_dump -U postgres > backup.sql
```

### Restore Database Backups
```bash
# 1. Spin up Supabase
npx -y supabase start

# 2. Inject backup SQL
docker exec -i supabase_db_2026.WebCg-K psql -U postgres < backup.sql
```

---

## ⚠️ Troubleshooting

### "supabase start" Fails
```bash
# 1. Purge containers
npx -y supabase stop
docker ps -a | grep supabase | awk '{print $1}' | xargs docker rm -f

# 2. Drop stale storage volumes
docker volume ls | grep supabase | awk '{print $2}' | xargs docker volume rm

# 3. Restart
npx -y supabase start
```

### Schema Migration Errors
```bash
# Check migration execution logs
docker exec supabase_db_2026.WebCg-K psql -U postgres -c \
  "SELECT * FROM supabase_migrations.schema_migrations ORDER BY version;"

# If errors persist, purge volumes and rebuild
npx -y supabase stop
docker volume rm $(docker volume ls -q | grep supabase)
npx -y supabase start
```

### ⚠️ Prevent Migration Drift — Mandatory for Multi-device Workflows

> [!TIP]
> Essential guidelines to prevent schema drift when developing across multiple computers:

1. **Run `npx supabase db reset` immediately after performing a `git pull`** to update local tables.
2. **Add hours and minutes to migration timestamps (`YYYYMMDDHHMM`)** to bypass sorting clashes.
3. **Run `npx supabase migration list --local`** to verify unapplied migrations.
4. **Always prefix `CREATE POLICY` DDLs with `DROP POLICY IF EXISTS`** to guarantee idempotency.

```bash
# Recommended shell aliases (.zshrc or .bashrc)
alias sb-check='cd ~/topProject/webcg-k && npx supabase migration list --local'
alias sb-reset='cd ~/topProject/webcg-k && npx supabase db reset'
```

> [!WARNING]
> **Caution during `is_admin` and `role` Synchronization!**
> 
> After `db reset`, profile data is purged. When a new user registers, the database trigger `handle_new_user()` inserts a default role value `role = 'viewer'`. 
> Modifying `is_admin = true` inside Supabase Studio later will not automatically sync the system role because migration updates run exactly once during setup. 
> Promote profiles directly in the database using commands listed above.

### Port Conflicts

| Component | Default Port | Config File Location |
| :--- | :--- | :--- |
| WebCG-K React SPA | 3000 | `webcg-k/vite.config.ts` |
| Supabase API Server | 54321 | `supabase/config.toml` `[api].port` |
| Supabase PostgreSQL | 54322 | `supabase/config.toml` `[db].port` |
| Supabase Studio UI | 54323 | `supabase/config.toml` |

---

## 📦 Environment Variables (.env)

### WebCG-K (`webcg-k/.env.local`)

> Copy `.env.example` into `.env.local` to start. Vite reads `.env.local` variables automatically.

```bash
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
# Required for AI Cuesheet and AI Graphics Wizard features
# Obtain from: https://aistudio.google.com/apikey
VITE_GEMINI_API_KEY=your-gemini-api-key
```

> [!TIP]
> **How to locate the Anon Key:**
> ```bash
> npx -y supabase status
> ```
> Copy the displayed `anon key` value directly into `.env.local`.

Since fallback defaults are declared in the codebase, the application can boot without `.env.local` in standard conditions, but creating `.env.local` with fresh Anon Keys is highly recommended.

> [!NOTE]
> AI components (Gemini integrations) bypass execution without raising errors if API keys are missing, but features such as AI Graphics Generation and AI Cuesheet Parser will display "API key not configured" warnings.

---

## 🚀 Quick Start (TL;DR)

```bash
# 1. Clone & Navigate
git clone <repository-url>
cd webcg-k

# 2. Boot Supabase
npx -y supabase start

# 3. Generate TypeScript DB Types
npx -y supabase gen types typescript --local > webcg-k/src/lib/database.types.ts
# Remove Docker pull log header from database.types.ts if present.

# 4. Start WebCG-K SPA
cd webcg-k && npm install && npm run dev
# App loaded: http://localhost:3000

# 5. Sign up profile, and grant is_admin directly via CLI.
```

---

## ✅ Bootstrap Checklist

- [ ] Node.js 20+ installed
- [ ] Docker Desktop installed and running
- [ ] Repository cloned successfully
- [ ] `npx -y supabase start` finishes cleanly
- [ ] `npx -y supabase gen types typescript --local > webcg-k/src/lib/database.types.ts`
- [ ] Cleaned Docker logs from type bindings file header
- [ ] WebCG-K packages installed and running (`npm run dev`)
- [ ] `.env.local` configured with `VITE_GEMINI_API_KEY`
- [ ] Created first profile in the login interface
- [ ] Promoted profile to admin (`is_admin = true`, `role = 'system_admin'`) via CLI
- [ ] Verified active Admin sidebar links after logging in again
- [ ] (Optional) Injected demo seed data
- [ ] Reference standard menus in USAGE.md
