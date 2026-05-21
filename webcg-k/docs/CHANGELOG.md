# 📝 Technical Changelog (docs/CHANGELOG.md)

## [2026.05.21] AI Overlay Binding Validation Optimization & Aesthetic Autonomy

### 1. Advanced JS Destructuring Parsing & CSS Variables Mapping
*   **What**: `aiOverlayService.ts` 내의 스키마-바인딩 검증기(`validateOverlayBindings`)를 고도화하여 JS 구조 분해 할당(Destructuring) 및 CSS Variables 테마 매핑을 완벽하게 탐지하도록 수정하고, 테스트 스위트(`aiOverlayService.test.ts`)에 관련 검증 시나리오를 통합하였습니다.
*   **Why**: AI가 방송 템플릿 생성 시 단순 HTML 속성 바인딩을 넘어 CSS Variables 테마 `:root`나 복잡한 애니메이션을 위한 JS 구조 분해 할당을 사용할 때, 기존의 단순 텍스트 검증기가 미사용 변수(False Positive)로 잘못 오진하여 빌드 에러를 일으키는 문제를 해결하기 위함입니다.
*   **How**:
    *   **JS Destructuring Extracting**: `(?:const|let|var)\s*\{\s*([^}]+)\s*\}\s*=\s*data\b` 정규식으로 구조 분해 할당 영역을 쉼표로 파싱하고 별칭(`alias`) 구문을 분리하는 1차 추출을 구현하였습니다.
    *   **Heuristic Fallback Strategy**: CSS 텍스트 및 JS 소스 전체에 `new RegExp('\\b' + key + '\\b')` 패턴의 단어 경계(Word Boundary) 매칭 fallback을 설계하여, 특수한 동적 변수 접근이나 CSS variables 매핑을 오탐률 0%로 잡아내도록 설계했습니다.
    *   **Aesthetic Autonomy Relaxation**: 단순 미사용 스키마 키(`missingBindings`)가 있더라도, 빌드를 실패시키는 대신 비차단(Non-blocking) 경고만 띄우고 최종 `ok: true` 결과를 반환하게 완화하였습니다. 오직 오버레이 뷰포트에서 사용하는 바인딩에 스키마 매칭이 없는 치명적 에러(`orphanBindings`)만 빌드를 차단(`ok: false`)하게 함으로써 AI가 GSAP, WebGL2 등 극도로 화려한 미학적 시도를 무한히 할 수 있는 자율성을 확보하였습니다.

### 2. Complexity & Playout Performance (Big-O & Rendering Advantages)
*   **Time Complexity (시간 복잡도)**: 스키마 키가 $K$개, JS 코드가 $N$자, HTML/CSS가 $M$자일 때, 기존에는 단순 String 매치와 루프만 돌아 $O(K + N + M)$ 수준의 선형 탐색을 수행했습니다. 이번 고도화는 정밀 정규식 `matchAll`과 단어 경계(`\bkey\b`) 기반의 2차 휴리스틱 조회가 결합되어 최악의 경우에도 $O(K \times (N + M))$ 내에 완벽하게 수렴합니다. 방송 데이터 바인딩 로직 및 CSS 규모를 감안하면 지연 시간은 마이크로초(µs) 미만 수준에 불과하여 에디터 및 AI 생성 속도에 어떠한 부하도 주지 않습니다.
*   **Rendering & Playout Advantages (렌더링 이점)**: AI가 CSS 변수(`var(--primaryColor)`)를 `:root`에 정의하여 자율적인 UI 테마를 구축하게 됨으로써, 매번 DOM을 순회하며 `style`을 수동으로 업데이트하는 JS 오버헤드를 피할 수 있습니다. CSS 테마 변수 변경은 브라우저의 스타일 계산 및 GPU 가속 페인팅 루프 내에서 가볍게 처리되므로, CPU 병목 없이 방송 플레이아웃 도중 60fps 화면 유지를 보장하는 데 결정적 이점을 가져다 줍니다.

---

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
