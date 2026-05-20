# 서비스 레이어란? — 왜, 무엇을, 어떻게

> 이 문서는 프로그래밍 배경지식이 적은 분도 이해할 수 있도록 작성되었습니다.

---

## 1. 비유로 이해하기: "방송국 조직도"

방송국을 예로 들어봅시다.

### ❌ 지금 상태 (서비스 레이어 없음)
```
PD(페이지)가 직접 테이프 보관실(DB)에 가서 테이프를 찾고,
직접 편집실(Storage)에서 파일을 꺼내고,
직접 송출기(Supabase)를 조작합니다.

→ 보관실 위치가 바뀌면? PD 7명이 전부 새 위치를 외워야 합니다.
→ 테이프 라벨링 규칙이 바뀌면? PD 7명의 작업 방식을 전부 수정해야 합니다.
```

### ✅ 목표 상태 (서비스 레이어 도입)
```
PD(페이지)가 자료실 담당자(서비스)에게 "오늘 방송용 테이프 줘" 하면,
담당자가 알아서 보관실에서 찾아서 전달합니다.

→ 보관실 위치가 바뀌어도? 담당자만 업데이트하면 됩니다.
→ PD들은 아무것도 바꿀 필요 없습니다.
```

즉, **서비스 레이어 = 자료실 담당자**입니다.

---

## 2. 실제 코드에서 뭐가 달라지나?

### 지금 (Before) — `images.tsx` 안에 직접 작성

```typescript
// 이미지 페이지 안에 데이터베이스 쿼리가 그대로 들어있음
const { data, error } = await (supabase as any)
    .from("images")
    .select("*")
    .order("created_at", { ascending: false });
if (error) throw error;

// URL도 직접 생성
const url = supabase.storage.from("images")
    .getPublicUrl(img.storage_path_2k).data.publicUrl;
```

**문제점:**
- 같은 쿼리가 여러 파일에 **복붙**되어 있음
- `"images"` 같은 테이블명이 **하드코딩**으로 흩어져 있음
- 테이블 구조가 바뀌면 **7개 파일**을 전부 찾아서 수정해야 함

### 바꾼 후 (After) — 서비스 파일에 한 번만 작성

```typescript
// services/imageService.ts (서비스 파일)
export async function fetchImages(category?: string) {
    let query = supabase.from("images").select("*")
        .order("created_at", { ascending: false });
    if (category) query = query.eq("category", category);
    const { data, error } = await query;
    if (error) throw error;
    return addStorageUrls(data);  // URL 생성도 내부에서 처리
}
```

```typescript
// images.tsx (페이지 — 매우 깔끔해짐)
const { data: images = [] } = useQuery({
    queryKey: ["images", selectedCategory],
    queryFn: () => fetchImages(selectedCategory),  // 한 줄!
});
```

---

## 3. 구체적 효용성 5가지

| # | 효용 | 설명 |
|---|------|------|
| 1 | **수정 비용 감소** | 테이블이나 쿼리를 바꿀 때 **1곳**만 수정하면 됨 (7곳 → 1곳) |
| 2 | **코드 가독성** | 페이지 컴포넌트에서 "DB 어떻게 접근하나"를 몰라도 됨 |
| 3 | **에러 처리 일관성** | 에러 메시지 형식, 로깅, 재시도 로직을 서비스에서 통일 |
| 4 | **테스트 용이성** | 서비스 함수만 따로 테스트 가능 (페이지 전체를 렌더링할 필요 없음) |
| 5 | **타입 안전성** | `(supabase as any)` 캐스팅 제거 → TypeScript가 오류를 미리 잡아줌 |

---

## 4. 이번에 만들 서비스 파일들

```
src/services/
├── aiCgService.ts         ← 이미 있음 (AI CG 생성)
├── dataProviders.ts       ← 이미 있음 (외부 API 테스트)
├── overlayApiService.ts   ← 이미 있음 (오버레이 CRUD)
│
├── dashboardService.ts    ← 🆕 프로젝트 목록, 세션 목록, 템플릿 CRUD
├── imageService.ts        ← 🆕 이미지 업로드/삭제/편집 + Storage URL
├── characterService.ts    ← 🆕 AI 캐릭터 프리셋 CRUD + riv 파일 관리
├── dataSourceService.ts   ← 🆕 커스텀 데이터소스 CRUD
└── adminService.ts        ← 🆕 사용자 관리, AI 모델, API 키, 사용량
```

각 서비스 파일은 해당 도메인의 **모든 데이터 접근 로직**을 담당합니다.

---

## 5. 아키텍처 전/후 비교

### Before (현재)
```
┌─────────────┐     ┌──────────────┐
│ images.tsx   │────▶│              │
│ admin.tsx    │────▶│  Supabase    │
│ broadcast.tsx│────▶│  (DB)        │
│ ...7개 파일  │────▶│              │
└─────────────┘     └──────────────┘

모든 파일이 Supabase에 직접 접근
→ 결합도 높음, 변경에 취약
```

### After (서비스 레이어 도입 후)
```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│ images.tsx   │────▶│ imageService │────▶│              │
│ admin.tsx    │────▶│ adminService │────▶│  Supabase    │
│ broadcast.tsx│────▶│ dashboard    │────▶│  (DB)        │
│ ...          │     │   Service    │     │              │
└─────────────┘     └──────────────┘     └──────────────┘
     (UI 계층)        (서비스 계층)         (데이터 계층)

페이지는 서비스만 호출, 서비스만 DB를 알고 있음
→ 결합도 낮음, 변경에 강함
```

---

## 6. FAQ

### Q. 파일이 더 많아지지 않나요?
A. 네, 서비스 파일이 5개 추가됩니다. 하지만 각 파일의 **책임이 명확**해지고, 기존 페이지 파일들은 **훨씬 짧아집니다**. "짧은 파일 여러 개"가 "긴 파일 하나"보다 유지보수에 훨씬 유리합니다.

### Q. 성능이 떨어지진 않나요?
A. 전혀 아닙니다. 서비스 레이어는 단순히 코드를 정리하는 것이지, 네트워크 호출이 추가되는 것이 아닙니다. 함수 호출 한 번이 추가될 뿐이고, 이는 무시할 수 있는 수준입니다.

### Q. P1에서 한 TanStack Query 작업과 뭐가 다른가요?
A. P1은 **"데이터를 언제 가져오느냐"** (useEffect → useQuery)를 개선했고, P2는 **"데이터를 어떻게 가져오느냐"** (인라인 쿼리 → 서비스 함수)를 개선합니다. 역할이 다릅니다.
