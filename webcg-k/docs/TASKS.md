# 📚 WebCG-K Security & Learning Tasks

본 문서는 단순히 코딩 구현(Doing)을 넘어, 각 태스크 달성 시 실무 및 아키텍처 관점에서 무엇을 학습하고 성장하는지 정의하는 **학습형 백로그(Learning Backlog)**입니다.

---

## 🎯 Completed Tasks (Done)

### 1) [HIGH] api_keys.encrypted_key 컬럼 암호화
- **상태:** ✅ 완료
- **조치:** Supabase 마이그레이션 내 pgcrypto 활성화 + 대칭 암호화 트리거 구성 + `aiSvgService.ts` RPC 연동.
- **💡 🎯 이 태스크의 학습 목표 (Learning Objective):**
  > "데이터베이스 저장 시점(Rest)의 암호화 기법(Symmetric Encryption)을 구현하고, DB가 통째로 유출되는 위기 상황에서도 마스터 자격 증명(API Key)을 보존할 수 있는 **Deep Security-by-Design 설계 사상**을 터득한다."

### 2) [HIGH] characters 스토리지 버킷 파일 제한 강화
- **상태:** ✅ 완료
- **조치:** 단일 마이그레이션 파일 내 `storage.buckets` 제약 조건(MIME, 크기 5MB 제한) 부착 및 `ON CONFLICT DO UPDATE` 방어 쿼리 적용.
- **💡 🎯 이 태스크의 학습 목표 (Learning Objective):**
  > "스토리지 버킷에 대한 무제한 업로드 취약점(DoS, 악성 스크립트 실행 XSS)을 스키마 제어단에서 근본적으로 봉쇄하는 **스토리지 엔지니어링 방어 전략**을 완성한다."

### 3) [MIGRATION] 마이그레이션 파일 단일화 통합
- **상태:** ✅ 완료
- **조치:** `202605140001_overlay_blend_mode.sql`과 `20260520000000_combined_migration.sql`을 연대기적(Chonological) 순서로 하나의 통합 SQL로 빌드 완료.
- **💡 🎯 이 태스크의 학습 목표 (Learning Objective):**
  > "다중으로 파편화된 데이터베이스 마이그레이션 파일들을 시간순 의존성(Chronological Dependency)을 해치지 않고 하나의 원자적(Atomic) 단일 파일로 완전 융합하는 **스키마 무결성 최적화 관리 기술**을 익힌다."

### 4) [CLEANUP] Fathom 모듈 및 시드 데이터 소거
- **상태:** ✅ 완료
- **조치:** 통합 마이그레이션 파일 내에서 9개의 `fathom_*` 테이블, `fathom-files` 스토리지 버킷, helper 함수, 관련 RLS 및 시드 데이터를 퍼블릭 리포지토리에서 완전 분리·소거 (공통 핵심 인프라인 `profiles`, `pgcrypto` 등은 안전히 유지).
- **💡 🎯 이 태스크의 학습 목표 (Learning Objective):**
  > "불필요한 대형 모듈을 상호 의존성 분석 하에 영향도 없이 완벽히 은퇴(Retire)시키고, 스키마 및 저장소 공격 표면(Attack Surface)을 선제적으로 극소화하는 **안전한 레거시 은퇴 및 경량화 기술**을 습득한다."

---

## ⏳ In Progress Tasks (Doing)

- 현재 진행 중인 상위 태스크 없음.

---

## 📋 Backlog Tasks (Todo)

### 5) [HIGH] iframe postMessage 오리진 검증 및 최소화 (우선순위 상)
- **💡 🎯 이 태스크의 학습 목표 (Learning Objective):**
  > "크로스 도메인 통신(postMessage)의 무방비 와일드카드 타깃 지정을 피하고, DOM Tree 탈취(innerHTML exfiltration) 방지를 통해 **클라이언트 샌드박싱 격리 기술**을 체득한다."

