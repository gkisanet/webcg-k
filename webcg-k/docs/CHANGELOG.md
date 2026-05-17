# 📝 기술적 변경 이력 (docs/CHANGELOG.md)

## [2026.05.17] Supabase 마이그레이션 단일 병합 및 스키마 격리 복구

### 1. 분산 마이그레이션 스쿼시 (Squash)
*   **What**: 기존 `supabase/migrations` 디렉터리에 흩어져 있던 **65개의 개별 SQL 파일**을 하나의 통합 파일 `202605140001_overlay_blend_mode.sql`로 합쳤습니다.
*   **Why**: 마이그레이션이 분산되어 있을 때 발생하는 로직 의존성 오류(Foreign Key 생성 순서 꼬임 등)와 개발용 로컬 디렉터리 빌드 타임 속도 병목을 제거하기 위함입니다.
*   **How**: `npx supabase migration squash --local` 명령어를 구동하여 안전하게 local DB 스키마 상태를 덤프해 하나로 정렬하였습니다.

### 2. Search Path 세션 충돌 트러블슈팅 및 해결
*   **What**: 스쿼시된 파일 말미에 `RESET search_path;` 명령을 추가하였습니다.
*   **Why**: 스쿼시 덤프 과정에서 Postgres의 격리 조치로 인해 `search_path`가 `''`(빈 문자열)로 덮어씌워졌으며, 이 상태가 복구되지 않아 후속 시드 스크립트(`seed.sql`) 실행 시 `grid_templates` 등 테이블을 식별하지 못해 `SQLSTATE 42P01` 에러가 발생하는 치명적 문제가 발생했습니다.
*   **How**: 파일 가장 아래에 `RESET search_path;` 명령을 작성하여 세션의 기본 검색 경로를 정상 수복함으로써 `supabase db reset`이 100% 무결하게 통과하도록 조치했습니다.
