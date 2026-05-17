# 🌟 트러블슈팅 및 오답 노트 (docs/LESSONS.md)

## 📌 [오답 노트] Supabase Migration Squash 후 `seed.sql` 실행 실패 (SQLSTATE 42P01)

### 1. 증상 (Symptom)
*   Supabase CLI로 65개의 마이그레이션을 squash한 뒤, 로컬 데이터베이스를 리셋하기 위해 `supabase db reset`을 실행했을 때, 스키마 정의 마이그레이션은 성공하나 시드 단계인 `Seeding data from supabase/seed.sql...`에서 아래와 같은 오류가 발생하며 전체 리셋 작업이 취소됨.
    ```bash
    failed to send batch: ERROR: relation "grid_templates" does not exist (SQLSTATE 42P01)
    ```

---

### 2. 원인 (Root Cause)
*   Supabase의 `migration squash` 도구는 내부적으로 Postgres `pg_dump` 유틸리티를 사용하여 로컬 스키마 상태를 파일로 추출합니다.
*   이때 `pg_dump`는 모든 DDL 구문이 명확히 정규화되어 빌드되도록 스크립트 시작 지점에 `SELECT pg_catalog.set_config('search_path', '', false);`를 선언하여 세션의 `search_path`를 빈 문자열로 강제 비활성화시킵니다.
*   문제는 Supabase CLI가 **동일한 데이터베이스 세션 및 커넥션**을 재활용하여 `seed.sql`을 이어서 실행한다는 점입니다. 이로 인해 `seed.sql`이 동작할 때까지 `search_path`가 계속 비어 있는 상태가 유지되고, `INSERT INTO grid_templates ...`와 같은 구문 실행 시 schema-qualification(`public.grid_templates`)이 누락되어 Postgres가 해당 테이블을 영영 찾지 못해 충돌(42P01)을 유발한 것입니다.

---

### 3. 해결책 (Solution)
*   압축된 단일 마이그레이션 SQL 파일의 최하단에 `RESET search_path;` 구문을 추가하여 스키마 정의 작업이 모두 완료되는 즉시 세션의 검색 경로를 기본값(`"public", "auth", "extensions"` 등)으로 깨끗하게 수복시킵니다.
*   **수정된 마이그레이션 파일 최하단 (`202605140001_overlay_blend_mode.sql`)**:
    ```sql
    CREATE POLICY "fathom_files_select" ON "storage"."objects" FOR SELECT TO "authenticated" USING (("bucket_id" = 'fathom-files'::"text"));

    -- Restore search_path to default session settings for subsequent scripts (e.g. seed.sql)
    RESET search_path;
    ```
    이 보정이 추가된 후 `supabase db reset`을 구동하면 스키마 빌드와 시딩이 단 1초의 렉이나 경고 없이 100% 무결하게 완료됩니다.

---

### 4. 배운 점 (Key Lesson)
*   데이터베이스 덤프 스크립트(특히 Postgres의 `pg_dump` 유래 파일)를 수동 혹은 자동으로 합칠 때, 세션 상태를 변형시키는 설정 명령어(`SET search_path`, `SET timezone`, `SET client_encoding` 등)가 남기는 부작용(Side Effect)을 반드시 엄수하고 관리해야 한다는 점입니다.
*   데이터베이스 트랜지션 스크립트의 마지막에는 항상 **"세션 상태 원상 복구(Session State Reset)"** 명령(`RESET ALL` 또는 `RESET search_path`)을 기재하는 것이, 배포 환경에서 후속 유틸리티나 벌크 로더가 안전하게 동작하도록 보장하는 시니어 아키텍트의 완벽한 안전장치임을 깊이 인지했습니다.
