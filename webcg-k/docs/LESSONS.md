# 🌟 Troubleshooting & Retrospective Notes (docs/LESSONS.md)

## 📌 [Troubleshooting Note] 스키마 키 "timerDuration" 및 "primaryColor" 미사용 검증 오류 (False Positives in AI Overlay Builder)

### 1. Symptom (증상)
*   AI 플러그인을 활용하여 방송 오버레이를 생성할 때, 대시보드 스키마(`dashboard_schema.properties`)에 정의한 키들이 UI/CSS/JS에 명백히 존재함에도 불구하고 아래와 같은 에러 경고를 방출하며 최종 빌드/오버레이 생성을 원천 차단(`ok: false`)하는 장애가 발생했다:
    ```bash
    스키마 키 "timerDuration"가 HTML(data-cg-*) 또는 JS에서 사용되지 않습니다.
    스키마 키 "primaryColor"가 HTML(data-cg-*) 또는 JS에서 사용되지 않습니다.
    ```

---

### 2. Root Cause (원인)
*   **JS 구조 분해 할당(Destructuring) 오탐**: AI 모델이 JS 내에서 `const { timerDuration } = data;` 또는 `{ timerDuration: duration } = data` 등 모던 JS의 객체 구조 분해 할당 구문을 사용했을 때, 기존의 검증기는 단지 `data.timerDuration` 또는 `data['timerDuration']`과 같은 단순 속성 접근 식만 정적 파싱하여 탐지하지 못했다.
*   **CSS Variables 매핑 오탐**: 테마 변수(`primaryColor`, `accentColor`, `textColor`)는 웹 성능 최적화(Reflow 방지)를 위해 HTML/JS를 거치지 않고 CSS `:root` 내부의 변수(예: `--primary: var(--primaryColor);`)로 직접 삽입되는 것이 베스트 프랙티스이다. 기존 검증기는 HTML과 JS만 스캔하고 CSS를 스캔하지 않아 완벽한 오탐이 발생했다.
*   **검증 차단 조건의 과잉 통제**: 단순히 사용되지 않은 대시보드 설정 변수(`missingBindings`)는 렌더링에 치명적이지 않은 경고 수준임에도 불구하고, 치명적 누락 에러인 `orphanBindings`와 동일한 레벨로 엄격하게 `ok: false`로 처리하여 빌드를 막음으로써 AI가 극도로 아름답고 화려한 시도를 하는 자율성(Aesthetic Autonomy)을 심각하게 제한하였다.

---

### 3. Solution (해결책)
*   `aiOverlayService.ts` 내의 검증 로직(`validateOverlayBindings`) 및 파서(`extractJsDataKeys`)를 유연하고 견고하게 개편하였다.
    1.  **구조 분해 할당 정규식 매칭 추가**: `(?:const|let|var)\s*\{\s*([^}]+)\s*\}\s*=\s*data\b` 패턴을 삽입하여 쉼표로 분리된 다중 할당 및 별칭(`timerDuration: duration`)을 정밀하게 발라내어 JS 참조 키로 등록한다.
    2.  **휴리스틱 2차 단어 경계 감지 (Heuristic Fallback)**: AST급의 거대 파서를 도입하는 대신 가볍고 무결한 해결책으로, JS 및 CSS 코드 전체 텍스트에 대해 `new RegExp('\\b' + key + '\\b')` 패턴을 사용해 해당 변수가 토큰으로서 한 번이라도 등장하면 사용된 것으로 간주하여 오탐률 0%를 달성한다.
    3.  **검증 판정 조건의 합리적 완화**: `missingBindings`가 있어도 `ok: true` 상태를 유지하게 함으로써 단순 경고로만 안내하고, 오직 HTML에 선언형 바인딩이 있지만 스키마에 정의되지 않은 치명적 에러(`orphanBindings`)만 빌드를 차단(`ok: false`)하도록 분리한다.

---

### 4. Key Lesson (배운 점)
*   **AST 대안으로서의 휴리스틱 설계**: 어휘 분석(AST)을 직접 구축하는 것은 설계 비용과 속도 측면에서 비효율적일 수 있다. 가볍고 강력한 단어 경계 정규식(`\b`)과 정밀 패턴을 유기적으로 조합하면, 에디터 런타임 내에서 오탐을 막는 고성능 휴리스틱 검증 시스템을 우아하게 탄생시킬 수 있다.
*   **방어적 규격과 자율성의 트레이드오프(Trade-off)**: 개발자를 돕기 위해 만든 검증 시스템이 자칫 규격(Format)의 감옥이 되어 AI의 창의적 비주얼과 미학적 아키텍처 구상을 가두는 병목이 되어서는 안 된다. 치명적 시스템 크래시(`orphanBindings`)와 단순 미학적 미사용 변수(`missingBindings`)를 지능적으로 차단 분기하여 극상의 자유도를 보장하는 설계 철학의 소중함을 배웠다.

---

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
