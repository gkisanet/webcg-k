# 🚚 환경 전환 및 뇌 워밍업 (docs/HANDOVER.md)

## 📌 마지막 작업 상태
- **마이그레이션 통합 완료**: 65개의 파편화된 마이그레이션 파일을 `202605140001_overlay_blend_mode.sql` 단 하나로 압축하고, DB를 완벽히 단일화했습니다.
- **세션 충돌 해결**: `pg_dump` 격리 찌꺼기인 `search_path = ''`를 복구하는 `RESET search_path;` 명령을 추가하여 `seed.sql`이 정상 동작하도록 조치했습니다.
- **통합 로컬 테스트 완료**: `supabase db reset`을 구동하여 스키마 생성 ➔ 시드 데이터 삽입 ➔ 스토리지 버킷 빌드 ➔ 서버 재시작의 전 과정이 단 1초의 렉이나 에러 없이 클린하게 통과하는 것을 확인했습니다.

## 🚀 다음에 해야 할 일 (Next Steps)
1.  **원격 Supabase Production 반영 검토**:
    *   `supabase migration repair --status applied` 명령을 remote 에 실행하여 remote 마이그레이션 이력 테이블의 버전을 최신화하기.
2.  **Dual-Layer Canvas 기법 검토 및 프로토타입 작성**:
    *   `Canvas.tsx` 내의 정적 SVG 렌더링 노드 부분과 드래그 시 발생하는 Selection Box/Snap Guide 렌더링 노드를 별도 컴포넌트로 분리하고 `React.memo` 적용하기.

---

## 💡 핵심 개념 요약 (TL;DR)

### pg_dump의 `set_config('search_path', '', false)`와 부작용
*   **원인**: Postgres 백업 도구인 `pg_dump`는 이식성을 높이기 위해 스키마 지정 경로(`search_path`)를 빈 문자열로 강제하고 모든 개체를 `public.table_name`과 같이 절대 경로로 표기하도록 코드를 내보냅니다.
*   **문제**: 이 스크립트가 실행된 데이터베이스 연결 세션은 세션이 종료되기 전까지 계속 `search_path`가 비어있게 되며, 후속으로 실행되는 시드 스크립트(`seed.sql`) 등에서 `public.`을 안 붙인 상대 테이블 조회(`SELECT * FROM users;`) 시 테이블을 찾지 못하는 대형 참사가 일어납니다.
*   **해결**: 마이그레이션 스크립트 최하단에 `RESET search_path;`를 배치함으로써 세션을 원래 정상 상태로 복구해야 합니다.
