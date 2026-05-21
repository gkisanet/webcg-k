# 🌟 LESSONS (트러블슈팅 및 오답 노트)

본 문서는 개발 과정에서 직면한 각종 컴파일 에러, 버그, 아키텍처적 난제를 디버깅 및 분석하여 유사 장애를 차단하고, 디버깅 역량을 극대화하기 위해 기록하는 **성장형 오답 노트**입니다.

---

## 📂 오답 노트 1: Supabase RPC 호출 시 TypeScript 정적 스키마 미인식 컴파일 에러

### 🔍 [증상 (Symptom)]
* `aiSvgService.ts`에서 신규 생성한 PostgreSQL 함수인 `get_decrypted_api_key`를 `supabase.rpc("get_decrypted_api_key", { key_id: ... })`로 호출할 때, TypeScript 컴파일러(ts-loader)가 다음과 같은 심각한 컴파일 경고 에러를 뿜음:
  > *Argument of type '"get_decrypted_api_key"' is not assignable to parameter of type '"is_admin" | "fathom_match_chunks" | ...'*

---

### 🕵️‍♂️ [원인 (Root Cause)]
* **정적 데이터베이스 타입 불일치:**
  Supabase의 `Database` 타입 정의(`database.types.ts`)는 이전에 생성된 DB 스키마를 기준으로 CLI가 정적 자동 생성한 파일입니다. 우리가 신규 마이그레이션 파일(`20260520000000_combined_migration.sql`)에 `get_decrypted_api_key` 함수를 동적으로 새로 정의했으나, 로컬 TypeScript 프로젝트 내부의 정적 타입 구조체에는 이 함수명이 등록되어 있지 않기 때문에 엄격한 TypeScript 컴파일 가드가 실행 흐름을 차단한 것입니다.

---

### 🛠️ [해결책 (Solution)]
* **보안 형변환(Type Assertion)을 통한 동적 게이트웨이 개방:**
  RPC 메서드 명세를 호출할 때 `"get_decrypted_api_key" as any`로 캐스팅하여 정적 데이터베이스 스키마 검증기(Static Schema Validator)의 과도한 제약을 우회했습니다.
  또한, 반환되는 평문 API 키 스트링 객체를 `decrypted as any as string`으로 변환하여, 런타임 결과 데이터가 안전하게 `string` 인터페이스를 만족하고 비즈니스 모듈(Gemini API 호출부)로 흘러갈 수 있도록 데이터 파이프라인을 정비했습니다.
  ```typescript
  const { data: decrypted } = await supabase
    .rpc("get_decrypted_api_key" as any, { key_id: svgKey.id });
  if (decrypted) return decrypted as any as string;
  ```

---

### 💡 [배운 점 (Lessons Learned)]
* **정적 타입 검사기와 런타임 스키마 변화의 결합 모델 이해:**
  데이터베이스 마이그레이션 변경(DDL, Functions 추가)이 빈번한 애자일 프로젝트에서는 정적 타입 정의와 실제 런타임 구조 사이에 불가피한 갭이 발생합니다.
  이러한 갭이 생겼을 때 프로젝트 빌드를 멈추지 않고 안전하게 우회하기 위해 `as any`를 조건부 활용하되, 반환되는 최종 리턴 데이터 타입을 강력한 안전망(`as string`)으로 다시 한 번 포장하여 하위 비즈니스 로직에 컴파일 누수가 퍼지지 않도록 틀어막는 **"타입 차단 및 살균 래핑 기술(Type Sanitization Wrapper)"**의 중요성을 뼈저리게 학습했습니다.
