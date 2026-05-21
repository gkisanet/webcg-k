# 🧠 HANDOVER (인수인계 및 뇌 워밍업 문서)

본 문서는 다른 개발 환경으로 전환하거나, 휴식 후 다시 개발에 복귀할 때 뇌의 작업 기억을 즉각적으로 환기시키고 뇌를 깨우기 위해 관리하는 **뇌 워밍업 가이드(Brain Warm-up Guide)**입니다.

---

## 🚀 1. 마지막 작업 상태 (Last Work Status)
* **완료된 주요 조치:**
  1. **`api_keys` 테이블 평문 저장 보완:** `20260520000000_combined_migration.sql` 내에 `pgcrypto` 활성화 및 대칭 암호화 트리거(`encrypt_api_key`) 설치 완료. 복호화 전용 스토어드 프로시저 `get_decrypted_api_key(id)`를 추가하고, `aiSvgService.ts`에서 RPC 호출 방식으로 안전하게 격리 복호화 연동 성공.
  2. **`characters` 스토리지 버킷 검증 강화:** 동일 통합 마이그레이션 파일 내에서 파일 크기(5MB) 제한 및 허용된 MIME 타입(Rive, SVG, PNG, JPEG, WebP) 엄격히 통합 적용 완료.
  3. **마이그레이션 파일 단일화 DDL 대통합:** 파편화되어 있던 `202605140001_overlay_blend_mode.sql` 파일의 역사와 `20260520000000_combined_migration.sql`을 의존성 순서에 맞춰 **하나의 `20260520000000_combined_migration.sql` 단일 파일로 완전 병합** 및 분리 파일 소거 완료.
  4. **수술적 Fathom 스키마 및 시드 소거 (Fathom Purged):** public 리포지토리의 경량화 및 공격 표면 최소화를 위해 통합 마이그레이션에서 9개의 `fathom_*` 테이블, 인덱스, RLS 정책, `fathom-files` 스토리지 버킷 및 시드 데이터를 완전히 삭제 처리. 단, 공통 인프라인 `profiles`, `pgcrypto` 등은 안전히 유지.
  5. **TypeScript 정적 타입 동기화:** `database.types.ts`에서 Fathom 관련 테이블 및 RPC 함수(`fathom_match_chunks`) 정의를 수동 전수 소거하여 정적 타입 일관성 확보 완료.

---

## 📋 2. 다음에 이어서 할 일 (Next Steps)
1. **[HIGH 3] iframe postMessage 오리진 검증 및 최소화:** `graphic-tagging.lazy.tsx`에서 `*`로 쏘는 `postMessage`의 오리진을 `window.location.origin` 등으로 차단하고, 전체 DOM HTML 전송 대신 핵심 메타 텍스트 맵 정보만 정제하여 전송하도록 프론트 개편.

---

## 🌟 3. 오늘 배운 핵심 개념 요약 (TL;DR)

> [!NOTE]
> * **Symmetric Encryption at Rest:** DB 저장 직전 트리거를 태워 AES 기반(pgp_sym) 암호화를 적용하면 DB 탈취 시 마스터 비밀 키의 노출을 영구 격리할 수 있습니다.
> * **RPC Decryption Gateway Pattern:** 평문 복호화는 오직 신뢰 영역에서 명시적으로 함수를 호출할 때만 1회성으로 처리하고, SELECT 쿼리에는 절대 노출하지 않는 것이 모던 데이터베이스 보안의 철칙입니다.
> * **Early Gatekeeping on Storage:** 스토리지 엔진 단에서 MIME과 용량을 검사하는 것이 프론트 검사보다 견고하며, 서버 리소스 낭비를 막는 가장 효율적인 조기 반환(Early Return) 모델입니다.
> * **Chronological Migration Merger:** 여러 개의 스키마 변경 이력을 순차성에 맞게 단일 DDL 스크립트로 융합함으로써 스위칭 비용을 최소화하고 형상 관리 무결성을 지키는 아키텍트의 형상 통합 방식입니다.
> * **Surgical Schema Retirement:** 사용하지 않는 대형 모듈을 의존성 트리 분석을 거쳐 공통 핵심 인프라(`profiles`, `pgcrypto`)와 깔끔하게 발라내어 은퇴시키는 리팩토링 설계 패턴입니다.

### ⚠️ 주의할 점 (Caveats)
1. 로컬 환경에서 테스트 시 암호화에 사용된 `app.settings.vault_key`가 런타임에 다르게 설정되면 기존 저장 키가 복호화되지 않고 깨집니다. 마스터 솔트 키 관리에 만전을 기하십시오.
2. `allowed_mime_types`에 `application/octet-stream`을 정의했으나, Rive 파일의 로컬 헤더 검증 시 브라우저가 다른 MIME을 식별할 가능성이 있으므로 UI 업로더 로그를 예의주시해야 합니다.
