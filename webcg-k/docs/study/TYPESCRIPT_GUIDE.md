# 🎓 TypeScript 실전 가이드 — WebCG-K 프로젝트 기반

> **목적**: 이 문서는 WebCG-K 프로젝트에서 **실제로 사용된 TypeScript 패턴 10가지**를 초보자도 이해할 수 있도록 설명합니다.
> 추가로 TypeScript를 기존 프로젝트에 **적용하는 순서**와 **파일 분할(File Splitting) 시 주의사항**을 다룹니다.

---

## 목차

1. [왜 TypeScript인가?](#1-왜-typescript인가)
2. [패턴 1: interface — 데이터 구조의 설계도](#패턴-1-interface--데이터-구조의-설계도)
3. [패턴 2: type alias와 Union Type — "이것 또는 저것"](#패턴-2-type-alias와-union-type--이것-또는-저것)
4. [패턴 3: Record\<K, V\> — 키-값 매핑의 타입화](#패턴-3-recordk-v--키-값-매핑의-타입화)
5. [패턴 4: 제네릭 \<T\> — 재사용 가능한 범용 함수](#패턴-4-제네릭-t--재사용-가능한-범용-함수)
6. [패턴 5: Props 타입 — React 컴포넌트의 계약서](#패턴-5-props-타입--react-컴포넌트의-계약서)
7. [패턴 6: useState\<T\> — 상태의 타입 지정](#패턴-6-tstatet--상태의-타입-지정)
8. [패턴 7: Omit / Pick — 기존 타입에서 골라쓰기](#패턴-7-omit--pick--기존-타입에서-골라쓰기)
9. [패턴 8: export type — 타입만 내보내기](#패턴-8-export-type--타입만-내보내기)
10. [패턴 9: as 타입 단언 — 비상 탈출구 (주의!)](#패턴-9-as-타입-단언--비상-탈출구-주의)
11. [패턴 10: 함수 시그니처와 콜백 타입](#패턴-10-함수-시그니처와-콜백-타입)
12. [TypeScript 적용 순서 — 처음부터 차근차근](#typescript-적용-순서--처음부터-차근차근)
13. [파일 분할(File Splitting) 주의사항](#파일-분할file-splitting-주의사항)

---

## 1. 왜 TypeScript인가?

JavaScript로 코드를 작성하면 **실행해봐야** 에러를 알 수 있습니다.

```javascript
// JavaScript — 이게 문제가 있는지 실행 전에는 모릅니다
function getUser(id) {
    return { name: "Alice", emal: "alice@test.com" }; // ← "email" 오타!
}
const user = getUser(1);
console.log(user.email); // undefined — 런타임에서야 발견
```

TypeScript를 쓰면 **코딩하는 순간** 에러를 잡아줍니다:

```typescript
// TypeScript — 코드 작성 시점에 빨간 줄이 뜹니다
interface User {
    name: string;
    email: string; // ← 여기가 정답
}

function getUser(id: number): User {
    return { name: "Alice", emal: "alice@test.com" };
    //                       ^^^^  ❌ Error: 'emal' does not exist in type 'User'
}
```

### 핵심 비유

| 비교 | JavaScript | TypeScript |
|------|-----------|------------|
| 비유 | 내비 없이 운전 | 내비 켜고 운전 |
| 에러 발견 시점 | 실행 중 (길 잃은 후) | 코딩 중 (출발 전) |
| 자동 완성 | 거의 없음 | 풍부 (Ctrl+Space) |
| 리팩터링 | 무서움 😱 | 안전함 ✅ |

---

## 패턴 1: interface — 데이터 구조의 설계도

**무엇?**: 객체가 **어떤 필드를 가져야 하는지** 정의하는 설계도입니다.

**왜 필요?**: 팀원이(또는 미래의 나 자신이) "이 객체에 무슨 필드가 있지?" 하고 매번 코드를 뒤지지 않아도 됩니다.

### 프로젝트 실제 예시

```typescript
// 📁 src/lib/aiCharacterTypes.ts

/** Rive ViewModel 프로퍼티 정보 */
export interface RivePropertyInfo {
    name: string;            // ViewModel 프로퍼티 이름
    type: RivePropertyType;  // "string" | "number" | "boolean" 등
    label?: string;          // 한글 라벨 (선택, ?가 붙으면 없어도 됨)
    hidden?: boolean;        // 숨김 여부 (선택)
    order?: number;          // 정렬 순서 (선택)
    enumValues?: string[];   // enum 타입일 때만 사용 (선택)
}
```

### 초보자 요약

```
interface = "이 객체는 반드시 이런 모양이어야 해요"

필수 필드: name: string       → 반드시 있어야 함
선택 필드: label?: string     → 있어도 되고 없어도 됨 (?가 핵심!)
```

### 읽는 법

```typescript
interface AiCharacterPreset {
    id: string;                           // 필수, 문자열
    name: string;                         // 필수, 문자열
    description: string | null;           // 필수이지만 null일 수 있음
    rive_analysis: RiveAnalysis | null;   // 다른 interface를 참조
    action_mappings: CharacterActionMapping[];  // 배열 (여러 개)
    zone_bounds: CharacterZoneBounds | null;   // 있을 수도, null일 수도
    created_at: string;
}
```

| 표현 | 의미 |
|------|------|
| `name: string` | "name은 반드시 문자열" |
| `label?: string` | "label은 있어도 되고 없어도 됨" |
| `string \| null` | "문자열이거나 null" |
| `RiveAnalysis` | "다른 interface의 모양을 따름" |
| `CharacterActionMapping[]` | "CharacterActionMapping 배열" |

---

## 패턴 2: type alias와 Union Type — "이것 또는 저것"

**무엇?**: `type`은 타입에 **별명**을 붙이는 것입니다. Union(`|`)과 함께 쓰면 "이 값은 A 또는 B만 허용"이라는 제약을 겁니다.

### 프로젝트 실제 예시

```typescript
// 📁 src/lib/aiCharacterTypes.ts

// 리터럴 유니온 — 허용되는 문자열 값을 제한
export type RivePropertyType =
    | "string"
    | "number"
    | "boolean"
    | "color"
    | "trigger"
    | "enum"
    | "image"
    | "list";

// 이제 이 타입을 쓰면...
const myType: RivePropertyType = "string";  // ✅ OK
const bad: RivePropertyType = "integer";    // ❌ Error: '"integer"'은 없는 값
```

```typescript
// 📁 src/routes/dashboard/admin.tsx

// 3개의 탭만 허용
type AdminTab = "users" | "ai" | "api-keys";

const [activeTab, setActiveTab] = useState<AdminTab>("users");
setActiveTab("ai");        // ✅ OK
setActiveTab("settings");  // ❌ Error: '"settings"'은 AdminTab이 아닙니다
```

### 판별 유니온 (Discriminated Union) — 고급이지만 강력

```typescript
// 📁 src/lib/aiCharacterTypes.ts

// type 필드의 값에 따라 다른 추가 필드를 가짐
export type CharacterActionType =
    | { type: "trigger" }                       // trigger면 추가 필드 없음
    | { type: "toggle" }                        // toggle도 추가 필드 없음
    | { type: "set"; value: any }               // set이면 value 필드 추가
    | { type: "cycle"; values: any[] };          // cycle이면 values 배열 추가
```

```typescript
// 사용 시점에서 TypeScript가 자동으로 좁혀줌 (타입 내로잉)
function execute(action: CharacterActionType) {
    if (action.type === "set") {
        console.log(action.value);   // ✅ value 접근 가능
    }
    if (action.type === "cycle") {
        console.log(action.values);  // ✅ values 접근 가능
    }
    if (action.type === "trigger") {
        console.log(action.value);   // ❌ Error: 'trigger'에는 value가 없습니다
    }
}
```

### interface vs type — 언제 뭘 쓰나?

| 상황 | 선택 |
|------|------|
| 객체의 모양을 정의할 때 | `interface` |
| "A 또는 B" 같은 유니온이 필요할 때 | `type` |
| 기존 타입을 조합/변형할 때 | `type` |
| 둘 다 가능 → 팀 컨벤션에 따라 | 어느 쪽이든 OK |

---

## 패턴 3: Record\<K, V\> — 키-값 매핑의 타입화

**무엇?**: `Record<키의타입, 값의타입>` — 객체의 키와 값을 동시에 타입 지정합니다.

**왜 필요?**: 매직 넘버/문자열로 가득한 매핑 테이블을 안전하게 만듭니다.

### 프로젝트 실제 예시

```typescript
// 📁 src/routes/dashboard/admin.tsx

// 키: 문자열(프로바이더명), 값: {label, color} 객체
const PROVIDERS: Record<string, { label: string; color: string }> = {
    gemini:      { label: "Google Gemini", color: "#4285f4" },
    deepseek:    { label: "DeepSeek",      color: "#00d4aa" },
    groq:        { label: "Groq",          color: "#f55036" },
    github:      { label: "GitHub Models", color: "#8b5cf6" },
    openrouter:  { label: "OpenRouter",    color: "#f59e0b" },
};
```

```typescript
// 📁 src/components/Characters/CharacterWizardModal.tsx

// 키: 숫자, 값: RivePropertyType(유니온 타입)
const RIVE_DATA_TYPE_MAP: Record<number, RivePropertyType> = {
    1: "string",
    2: "number",
    3: "boolean",
    // 숫자 4를 넣으면서 값을 "integer"로 하면? → ❌ Error!
};
```

```typescript
// 📁 src/services/dataProviders.ts

// 키: 도시명 문자열, 값: 위경도 좌표
const KOREA_CITIES: Record<string, { lat: number; lon: number }> = {
    서울: { lat: 37.5665, lon: 126.978 },
    부산: { lat: 35.1796, lon: 129.0756 },
};
```

### Record vs 일반 객체

```typescript
// ❌ 타입 없는 일반 객체 — 오타 검증 불가
const colors = { red: "#f00", bule: "#00f" }; // "blue" 오타 발견 불가

// ✅ Record로 값 타입 고정
const colors: Record<string, string> = { red: "#f00", bule: "#00f" };
// 키 오타는 못 잡지만, 값 타입은 보장

// ✅✅ 더 엄격하게: 키도 유니온으로 제한
type Color = "red" | "green" | "blue";
const colors: Record<Color, string> = {
    red: "#f00",
    green: "#0f0",
    // blue 빠뜨리면? → ❌ Error: Property 'blue' is missing
};
```

---

## 패턴 4: 제네릭 \<T\> — 재사용 가능한 범용 함수

**무엇?**: 함수를 작성할 때 **사용하는 측에서 타입을 결정**하게 하는 패턴입니다.

**왜 필요?**: 동일한 로직을 다양한 타입에 재사용할 수 있습니다.

### 프로젝트 실제 예시

```typescript
// 📁 src/services/characterService.ts

// T를 정의하지 않고, 호출하는 쪽에서 결정하게 함
export async function fetchPresets<T>(): Promise<T[]> {
    const { data, error } = await (supabase as any)
        .from("ai_character_presets")
        .select("*")
        .order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []) as T[];
}
```

```typescript
// 📁 src/routes/dashboard/characters.tsx — 사용하는 측

// <AiCharacterPreset>을 넣어서 반환 타입을 구체화
const { data: presets = [] } = useQuery({
    queryKey: ["ai_character_presets"],
    queryFn: () => fetchPresets<AiCharacterPreset>(),  // ← T = AiCharacterPreset
});

// 이제 presets 변수의 타입은 AiCharacterPreset[] 
// presets[0].name  ← ✅ 자동 완성!
// presets[0].foo   ← ❌ Error: 'foo'는 없습니다
```

### 비유

```
제네릭 = "빈칸이 있는 함수"

function 배달<상품>(상품): 상품 {
    return 상품;
}

배달<피자>(피자);    // → 피자 배달
배달<치킨>(치킨);    // → 치킨 배달
// 함수 로직은 동일, 타입만 다름
```

---

## 패턴 5: Props 타입 — React 컴포넌트의 계약서

**무엇?**: React 컴포넌트가 **어떤 props를 받는지** 명시합니다.

**왜 필요?**: 컴포넌트를 사용할 때 빠뜨린 props, 잘못된 타입을 **즉시** 발견합니다.

### 프로젝트 실제 예시

```typescript
// 📁 src/components/Characters/CharacterWizardModal.tsx

// Props 타입 정의
interface CharacterWizardModalProps {
    editTarget: AiCharacterPreset | null;  // 편집 대상 (없으면 새로 생성)
    onComplete: () => void;                // 저장 완료 콜백
    onClose: () => void;                   // 닫기 콜백
}

// 컴포넌트에서 Props 사용
function CharacterWizardModal({ 
    editTarget, 
    onComplete, 
    onClose 
}: CharacterWizardModalProps) {
    // editTarget이 null이면 신규 생성 모드
    // editTarget이 있으면 편집 모드
    return <div>...</div>;
}
```

```typescript
// 📁 src/routes/dashboard/characters.tsx — 사용하는 측

// 필요한 props를 안 넣으면?
<CharacterWizardModal
    editTarget={editTarget}
    onComplete={handleWizardComplete}
    // onClose 빠뜨림 → ❌ Error: 'onClose' is missing!
/>
```

### children을 받는 컴포넌트

```typescript
// React의 기본 제공 타입 활용
interface LayoutProps {
    children: React.ReactNode;  // JSX를 자식으로 받음
    title: string;
}

function Layout({ children, title }: LayoutProps) {
    return (
        <div>
            <h1>{title}</h1>
            {children}
        </div>
    );
}
```

---

## 패턴 6: useState\<T\> — 상태의 타입 지정

**무엇?**: React `useState` 훅에 **저장할 값의 타입**을 명시합니다.

**왜 필요?**: 초기값만으로 타입을 추론할 수 없거나, `null`이 들어갈 수 있을 때 꼭 필요합니다.

### 프로젝트 실제 예시

```typescript
// 📁 src/routes/dashboard/characters.tsx

// 1️⃣ 단순한 경우 — 타입 생략 가능 (TypeScript가 추론)
const [wizardOpen, setWizardOpen] = useState(false);
// TypeScript가 추론: useState<boolean> → wizardOpen: boolean

// 2️⃣ null 가능한 경우 — 타입 명시 필수!
const [editTarget, setEditTarget] = useState<AiCharacterPreset | null>(null);
// 명시하지 않으면 TypeScript는 null만 할당 가능하다고 판단

// 3️⃣ 객체 상태 — 구조를 명시
const [configDraft, setConfigDraft] = useState({
    temperature: 0.9,
    maxOutputTokens: 8192,
    topP: 0.95,
    topK: 40,
});
// 이 경우 초기값에서 타입 추론 가능 → 생략 OK
```

### 자주 하는 실수

```typescript
// ❌ 실수: 초기값 null인데 타입을 안 줌
const [selected, setSelected] = useState(null);
setSelected({ id: "1", name: "Alice" });
// Error: null에 객체를 할당할 수 없음

// ✅ 수정: 제네릭으로 가능한 타입을 알려줌
const [selected, setSelected] = useState<User | null>(null);
setSelected({ id: "1", name: "Alice" }); // ✅ OK
```

---

## 패턴 7: Omit / Pick — 기존 타입에서 골라쓰기

**무엇?**: 이미 정의된 interface에서 **일부 필드를 제거(Omit)하거나 선택(Pick)**하여 새로운 타입을 만듭니다.

**왜 필요?**: "이 타입에서 id와 created_at만 빼고 쓰고 싶다" 같은 상황에서 타입을 처음부터 다시 쓰지 않아도 됩니다.

### 프로젝트 실제 예시

```typescript
// 📁 src/lib/aiCharacterTypes.ts

// 원본 타입
interface AiCharacterState {
    id: string;
    session_id: string;
    preset_id: string | null;
    is_on_air: boolean;
    vm_values: Record<string, any>;
    visible: boolean;
    updated_at: string;
}

// Omit으로 id, session_id, updated_at을 제거한 기본 상태 타입
export const DEFAULT_CHARACTER_STATE: Omit<
    AiCharacterState,
    "id" | "session_id" | "updated_at"     // ← 이 3개 필드를 제외
> = {
    preset_id: null,
    is_on_air: false,
    vm_values: {},
    visible: false,
};
// 결과 타입: { preset_id, is_on_air, vm_values, visible } — 4개 필드만 남음
```

### Pick 예시

```typescript
// 이름과 설명만 필요한 폼 → Pick으로 선택
type PresetBasicInfo = Pick<AiCharacterPreset, "name" | "description">;
// 결과: { name: string; description: string | null; }

// 전체 타입(10개 필드)을 쓰지 않아도 됨!
```

### Omit vs Pick 비교

```
원본 = { A, B, C, D, E }

Omit<원본, "A">  = { B, C, D, E }    // A만 빼기
Pick<원본, "A">  = { A }              // A만 고르기

→ 빼는 게 적으면 Omit, 고르는 게 적으면 Pick
```

---

## 패턴 8: export type — 타입만 내보내기

**무엇?**: `export type`은 **런타임에 사라지는 타입 정보만** 내보냅니다.

**왜 필요?**: 빌드된 JavaScript에 불필요한 코드가 포함되지 않게 하고, "이건 타입이지 실제 값이 아니다"를 명확히 합니다.

### 프로젝트 실제 예시

```typescript
// 📁 src/lib/aiCharacterTypes.ts — 내보내기

// export type — 타입만 내보냄 (런타임에 사라짐)
export type RivePropertyType =
    | "string" | "number" | "boolean" | "color"
    | "trigger" | "enum" | "image" | "list";

// export interface — 이것도 타입 (런타임에 사라짐)
export interface RivePropertyInfo { ... }

// export const — 이건 진짜 값 (런타임에 존재)
export const DEFAULT_CHARACTER_STATE = { ... };
```

```typescript
// 📁 src/routes/dashboard/characters.tsx — 가져오기

// import type — "이건 타입만 가져와" (빌드 최적화)
import type {
    AiCharacterPreset,
    RiveAnalysis,
} from "../../lib/aiCharacterTypes";

// import — 진짜 값을 가져옴 (런타임에 필요)
import { CharacterWizardModal } from "../../components/Characters/CharacterWizardModal";
```

### import type vs import 차이

```
import { MyComponent } from "./file";
→ 번들에 포함됨 (실제 코드 가져옴)

import type { MyType } from "./file";
→ 번들에 포함 안 됨 (타입 체크용으로만 사용, 빌드 시 삭제)
```

> **규칙**: 타입/인터페이스만 가져올 때는 `import type`을 사용하세요.

---

## 패턴 9: as 타입 단언 — 비상 탈출구 (주의!)

**무엇?**: TypeScript에게 **"내가 타입을 알아, 그냥 믿어"**라고 말하는 것입니다.

**왜 필요?**: 외부 라이브러리(Supabase 등)의 타입이 불완전할 때 임시로 사용합니다.

### 프로젝트 실제 예시

```typescript
// 📁 src/services/characterService.ts

// Supabase 클라이언트의 타입이 DB 스키마를 완전히 반영하지 못할 때
const { data, error } = await (supabase as any)  // ← "supabase를 any로 취급해"
    .from("ai_character_presets")
    .select("*");
```

### ⚠️ 왜 위험한가?

```typescript
// as any = 타입 체크를 포기한 것
const user = { name: "Alice" } as any;
user.foo.bar.baz;  // TypeScript: "OK!" → 런타임에서 💥 크래시!
```

### 안전하게 쓰는 대안들

```typescript
// 1️⃣ as any 대신 구체적인 타입 단언
const data = response as AiCharacterPreset[];

// 2️⃣ 타입 가드로 런타임 검증
function isPreset(obj: unknown): obj is AiCharacterPreset {
    return typeof obj === "object" && obj !== null && "name" in obj;
}

// 3️⃣ 점진적으로 Supabase 타입 생성 (이상적인 최종 목표)
// npx supabase gen types typescript --local > src/lib/database.types.ts
```

### 프로젝트 현황

현재 WebCG-K에는 `as any`가 **37개** 존재합니다. 대부분 Supabase 클라이언트의 타입 부재 때문입니다. 이것들은 향후 `database.types.ts` 자동 생성으로 제거할 수 있습니다.

---

## 패턴 10: 함수 시그니처와 콜백 타입

**무엇?**: 함수의 **매개변수 타입과 반환 타입**을 명시합니다.

**왜 필요?**: "이 함수에 뭘 넣어야 하지?", "콜백이 뭘 돌려주지?" 같은 혼란을 **코드 자체로** 해결합니다.

### 비유로 이해하기 — 콜백 = "주문서"

> 카페에서 커피를 주문할 때, **주문서(타입)**에는 이렇게 적혀 있습니다:
>
> | 주문서 항목 | 콜백 타입 대응 |
> |------------|---------------|
> | "음료명을 적어주세요" | `(query: string)` — 매개변수 |
> | "영수증은 안 드립니다" | `=> void` — 반환값 없음 |
> | "영수증을 드립니다" | `=> string` — 문자열 반환 |
> | "제조가 끝나면 알려드립니다" | `=> Promise<void>` — 비동기 |
>
> **콜백 함수**란 "나중에 불러줄 함수"를 **미리 약속**하는 것이고,
> **타입**은 그 약속의 **주문서(계약서)**입니다.

### 화살표 함수 타입 해부하기

TypeScript에서 콜백 타입은 **화살표 `=>`로** 표현합니다. 이것을 한 글자씩 분해해 봅시다:

```
(query: string) => void
 ↑       ↑         ↑
 │       │         └── 반환 타입: 아무것도 돌려주지 않음
 │       └── 매개변수 타입: 문자열
 └── 매개변수 이름 (의미 전달용, 실제 이름 달라도 OK)
```

더 복잡한 경우:

```
(items: Item[], page: number) => Promise<void>
 ↑       ↑       ↑      ↑        ↑
 │       │       │      │        └── 반환: 비동기
 │       │       │      └── 두 번째 매개변수: 숫자
 │       │       └── 두 번째 매개변수 이름
 │       └── 첫 번째 매개변수: Item 배열
 └── 첫 번째 매개변수 이름
```

### 콜백 타입 읽는 법 (5초 만에)

| 타입 표현 | 한국어로 읽기 |
|-----------|--------------|
| `() => void` | "매개변수 없이, 아무것도 돌려주지 않는 함수" |
| `(id: string) => void` | "문자열 하나 받고, 아무것도 돌려주지 않는 함수" |
| `(id: string) => boolean` | "문자열 하나 받고, 참/거짓을 돌려주는 함수" |
| `(items: Item[]) => Promise<void>` | "배열 하나 받고, 비동기로 실행하는 함수" |
| `(value: string) => void` 뒤에 `?` | "있어도 되고 없어도 되는 선택적 콜백" |

### 프로젝트 실제 예시

```typescript
// 📁 src/services/characterService.ts

// 매개변수: presetId(문자열), rivFilePath(문자열 또는 null, 선택)
// 반환값: Promise<void> (비동기, 반환값 없음)
export async function deletePreset(
    presetId: string,
    rivFilePath?: string | null
): Promise<void> {
    await (supabase as any)
        .from("ai_character_state")
        .update({ preset_id: null })
        .eq("preset_id", presetId);
    // ...
}
```

### 콜백 함수 타입 — 실전 4가지 패턴

#### 패턴 A: 가장 단순한 콜백 — "알려줘"

```typescript
// "완료됐다고 알려줘" — 데이터 전달 없이 신호만 보냄
interface CharacterWizardModalProps {
    onComplete: () => void;    // ← 매개변수 0개, 반환 없음
    onClose: () => void;       // ← 매개변수 0개, 반환 없음
    editTarget: AiCharacterPreset | null;
}

// 사용하는 측:
<CharacterWizardModal
    onComplete={() => {
        refetchPresets();       // 부모가 "완료 신호"를 받고 목록 갱신
    }}
    onClose={() => setWizardOpen(false)}
    editTarget={null}
/>
```

#### 패턴 B: 데이터를 전달하는 콜백 — "이걸 보내줘"

```typescript
// "검색어를 보내줘" — 자식에서 부모로 데이터를 전달
interface SearchBarProps {
    onSearch: (query: string) => void;   // ← 문자열 1개 받음
}

// 자식 컴포넌트:
function SearchBar({ onSearch }: SearchBarProps) {
    const [text, setText] = useState("");
    return (
        <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
                if (e.key === "Enter") {
                    onSearch(text);  // ← 부모에게 검색어 전달
                }
            }}
        />
    );
}

// 부모에서 사용:
<SearchBar onSearch={(query) => {
    console.log("사용자가 검색한 단어:", query);
    filterList(query);
}} />
```

#### 패턴 C: 비동기 콜백 — "다 되면 알려줘"

```typescript
// "저장이 끝날 때까지 기다려줘"
interface FormProps {
    onSubmit: (data: FormData) => Promise<void>;  // ← 비동기 반환
}

// 자식 컴포넌트에서 await로 대기 가능:
function Form({ onSubmit }: FormProps) {
    const handleClick = async () => {
        setLoading(true);
        await onSubmit(formData);   // ← 부모의 저장이 끝날 때까지 대기
        setLoading(false);          // ← 이 시점에 로딩 해제
    };
    // ...
}
```

#### 패턴 D: 선택적 콜백 — "있으면 불러"

```typescript
// "변경 알림은 선택사항이야"
interface InputProps {
    value: string;
    onChange: (value: string) => void;     // ← 필수
    onBlur?: (value: string) => void;     // ← 선택 (? 붙음)
    onFocus?: () => void;                  // ← 선택
}

// 사용할 때:
<Input
    value={name}
    onChange={setName}          // 필수라서 반드시 제공
    // onBlur, onFocus는 생략 가능!
/>

// ⚠️ 선택적 콜백 호출 시 주의:
function Input({ value, onChange, onBlur }: InputProps) {
    return (
        <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={(e) => onBlur?.(e.target.value)}  // ← ?. 필수!
            //                     ↑
            //   onBlur가 undefined일 수 있으므로 옵셔널 체이닝 사용
        />
    );
}
```

### 자주 하는 실수

#### 실수 1: 콜백 타입에서 `=>`와 `:`을 혼동

```typescript
// ❌ 잘못된 문법: 콜론(:) 대신 화살표(=>) 사용해야 함
interface Props {
    onClick: (id: string): void;    // ❌ Syntax Error!
}

// ✅ 올바른 문법: 콜백 타입은 항상 =>
interface Props {
    onClick: (id: string) => void;  // ✅ OK
}
```

> **기억법**: 함수 본문(`function`)에서는 `:` (` ): void {`), 타입에서는 `=>` (`=> void`)

#### 실수 2: 콜백의 반환값을 무시

```typescript
// ❌ onDelete가 Promise를 반환하는데 await 안 함
interface Props {
    onDelete: (id: string) => Promise<void>;
}

function Card({ onDelete }: Props) {
    const handleClick = () => {
        onDelete(id);  // ❌ 비동기인데 await 안 함 → 에러 발생해도 모름!
    };
}

// ✅ async/await로 제대로 처리
function Card({ onDelete }: Props) {
    const handleClick = async () => {
        try {
            await onDelete(id);  // ✅ 비동기 대기
        } catch (e) {
            console.error("삭제 실패:", e);
        }
    };
}
```

#### 실수 3: 선택적 콜백을 `?.` 없이 호출

```typescript
interface Props {
    onChange?: (value: string) => void;
}

// ❌ onChange가 undefined일 수 있는데 바로 호출
onChange(newValue);  // 💥 TypeError: onChange is not a function

// ✅ 옵셔널 체이닝 사용
onChange?.(newValue);  // undefined면 아무 일도 안 일어남
```

#### 실수 4: 콜백에 매개변수를 전달하지 않음

```typescript
interface Props {
    onSelect: (itemId: string) => void;
}

// ❌ 매개변수를 빠뜨림
<button onClick={onSelect}>선택</button>
// onSelect()가 호출되지만 itemId = undefined (런타임 에러 가능)

// ✅ 화살표 함수로 매개변수를 명시적으로 전달
<button onClick={() => onSelect(item.id)}>선택</button>
```

### 초보자는 이것만 기억하세요!

```
1. 콜백 타입 = "이 함수에 뭘 넣고, 뭘 돌려받는지"의 약속

2. 읽는 법:
   () => void        → "아무것도 안 받고, 아무것도 안 돌려줌"
   (x: string) => void → "문자열 받고, 아무것도 안 돌려줌"

3. 사용 패턴:
   - 부모 → 자식: Props로 콜백 전달
   - 자식 → 부모: 콜백 호출로 데이터 전달

4. 주의사항:
   - 선택적(?) 콜백은 반드시 ?.()로 호출
   - Promise<void> 콜백은 반드시 await
```

---

## TypeScript 적용 순서 — 처음부터 차근차근

기존 JavaScript 프로젝트에 TypeScript를 도입할 때의 **단계별 순서**입니다.

### 🔵 Step 1: 환경 세팅 (5분)

```bash
# 1. TypeScript 설치
npm install -D typescript @types/react @types/react-dom

# 2. tsconfig.json 생성
npx tsc --init

# 3. 기본 설정 (strict: false로 시작 — 점진적 도입)
```

```jsonc
// tsconfig.json — 초보자용 느슨한 설정
{
    "compilerOptions": {
        "target": "ES2020",
        "module": "ESNext",
        "jsx": "react-jsx",
        "strict": false,           // ← 처음엔 false로!
        "noImplicitAny": false,    // ← 처음엔 false로!
        "esModuleInterop": true,
        "outDir": "./dist"
    },
    "include": ["src"]
}
```

### 🟢 Step 2: 파일 확장자 변경 (.js → .ts)

```
1. 가장 단순한 유틸리티 파일부터 시작
   utils.js → utils.ts
   
2. React 컴포넌트는 .tsx로
   Button.jsx → Button.tsx

3. 한 번에 모든 파일을 바꾸지 말 것!
   → 하루에 2~3개 파일씩, 빌드가 깨지지 않는 선에서
```

### 🟡 Step 3: 타입 정의 파일 만들기

```
가장 먼저 해야 할 것:
1. DB 스키마의 테이블 → interface 정의
2. API 응답 → interface 정의
3. 공유 상수 → const + type 정의
```

```typescript
// 📁 src/types/database.ts — 데이터베이스 모양 정의

export interface Profile {
    id: string;
    display_name: string | null;
    is_admin: boolean;
    created_at: string;
}

export interface Project {
    id: string;
    name: string;
    owner_id: string;
    description: string | null;
}
```

### 🟠 Step 4: 컴포넌트에 Props 타입 추가

```typescript
// Before (JavaScript)
function UserCard({ user, onDelete }) {
    return <div>{user.name}</div>;
}

// After (TypeScript)
interface UserCardProps {
    user: Profile;
    onDelete: (userId: string) => void;
}

function UserCard({ user, onDelete }: UserCardProps) {
    return <div>{user.name}</div>;
}
```

### 🔴 Step 5: strict 모드 점진적 활성화

```jsonc
// tsconfig.json — 점진적으로 strict 옵션 켜기
{
    "compilerOptions": {
        // Phase 1 (처음)
        "strict": false,

        // Phase 2 (몇 주 후)
        "noImplicitAny": true,     // any 암묵 금지

        // Phase 3 (안정화 후)
        "strictNullChecks": true,  // null 체크 강제

        // Phase 4 (최종)
        "strict": true             // 모든 strict 옵션 ON
    }
}
```

### 적용 순서 다이어그램

```
[Step 1] npm install typescript
   ↓
[Step 2] 유틸 파일 .ts 변환 (가장 단순한 것부터)
   ↓
[Step 3] types/ 폴더에 핵심 interface 정의
   ↓
[Step 4] 컴포넌트 Props 타입 추가 (.tsx)
   ↓
[Step 5] strict 옵션 점진적 ON
   ↓
[Step 6] as any 제거 (Supabase 타입 생성 등)
```

> **핵심**: 한 번에 다 하지 마세요. **하루에 2~3개 파일**, **빌드가 깨지지 않는 선**에서 조금씩!

---

## 파일 분할(File Splitting) 주의사항

대형 컴포넌트 파일을 여러 파일로 나눌 때의 **주의사항**입니다.
이번 프로젝트에서 `characters.tsx` (1488줄)를 분할한 실제 경험을 바탕으로 설명합니다.

### 1. 왜 파일을 나누나?

```
Before: characters.tsx (1488줄)
  → 스크롤이 끝도 없음, 어디가 어딘지 모름, 한 줄 고치면 전체 리렌더

After:
  characters.tsx (253줄)         — 페이지 레이아웃 + 카드 목록
  CharacterWizardModal.tsx (1251줄) — 위자드 모달 (독립 컴포넌트)
  → 각 파일이 한 가지 역할만 담당
```

| 장점 | 설명 |
|------|------|
| 🔍 코드 탐색 | 파일명만 보고 기능 찾기 가능 |
| 🧮 성능 | 모달이 열릴 때만 렌더링 |
| 👥 협업 | 서로 다른 파일을 동시 작업 가능 |
| 🧪 테스트 | 컴포넌트 단위 테스트 가능 |

### 2. 분할 전 체크리스트

파일을 나누기 전에 반드시 확인해야 할 것들:

#### ✅ 분할 가능한 경우

```typescript
// 모달이 자체적으로 모든 로직을 처리하고,
// 부모에서는 open/close + 결과만 받는 경우
<CharacterWizardModal
    editTarget={editTarget}     // 데이터 전달
    onComplete={handleComplete} // 결과 콜백
    onClose={closeWizard}       // 닫기 콜백
/>
// → Props가 3개 = 깔끔하게 분리 가능!
```

#### ❌ 분할이 어려운 경우

```typescript
// 모달이 부모의 state를 직접 조작하는 경우
<UploadModal
    uploadModal={uploadModal}              // 부모 state
    setUploadModal={setUploadModal}        // 부모 setter
    file2kInputRef={file2kInputRef}        // 부모 ref
    file4kInputRef={file4kInputRef}        // 부모 ref
    uploading={uploading}                  // 부모 state
    setUploading={setUploading}            // 부모 setter
    handleModalUpload={handleModalUpload}  // 부모 handler
    categories={categories}                // 부모 데이터
    closeUploadModal={closeUploadModal}    // 부모 handler
/>
// → Props가 9개 = 분리해도 복잡도가 줄지 않음!
```

### 3. 분할 단계 (실전 순서)

```
[Step 1] 대상 선정
   "이 코드 블록은 독립적인가?" → Props 3개 이하로 전달 가능?
   
[Step 2] 새 파일 생성
   📁 src/components/[Feature명]/[Component명].tsx
   
[Step 3] 코드 이동
   - 컴포넌트 본체
   - 관련 상수, 타입, 유틸 함수
   
[Step 4] import/export 정리
   - 새 파일에서 export
   - 원본 파일에서 import
   
[Step 5] tsc 빌드 검증
   npx tsc --noEmit → 에러 0이면 성공!
```

### 4. import/export에서 자주 하는 실수들

#### 실수 1: export 빠뜨림

```typescript
// ❌ 새 파일에서 export를 안 함
function CharacterWizardModal({ ... }) { ... }
// 다른 파일에서 import 불가!

// ✅ 반드시 export!
export function CharacterWizardModal({ ... }) { ... }
// 또는 파일 하단에:
export { CharacterWizardModal };
```

#### 실수 2: 공유 컴포넌트 export 누락 (이번에 실제로 겪은 문제!)

```typescript
// 📁 CharacterWizardModal.tsx

// Badge와 RivePreviewPanel은 위자드 안에서도 쓰이지만,
// 원본 파일(characters.tsx)의 카드 목록에서도 사용!
function Badge({ label, color }) { ... }           // 공유 컴포넌트
function RivePreviewPanel({ src }) { ... }         // 공유 컴포넌트
function CharacterWizardModal({ ... }) { ... }     // 메인 컴포넌트

// ❌ 메인만 export → characters.tsx에서 Badge/RivePreviewPanel 사용 불가
export { CharacterWizardModal };

// ✅ 공유되는 것들도 함께 export
export { CharacterWizardModal, Badge, RivePreviewPanel };
```

#### 실수 3: import 경로 오류

```typescript
// ❌ 상대 경로 실수
import { Wizard } from "./CharacterWizardModal";     // 같은 폴더가 아닌데!

// ✅ 올바른 상대 경로
import { Wizard } from "../../components/Characters/CharacterWizardModal";
```

#### 실수 4: 사용 중인 import 제거

```typescript
// 원본 파일에서 코드를 옮기면, 일부 import가 불필요해짐
// 하지만 원본에 남은 코드가 아직 쓰는 import를 실수로 제거!

// ❌ characters.tsx에서 supabase를 제거 → 카드 미리보기에서 supabase.storage 사용!
// ❌ characters.tsx에서 useCallback 제거 → handleDelete에서 사용!

// ✅ 해결법: tsc --noEmit으로 바로 확인
// "Cannot find name 'supabase'" → 아직 쓰고 있으니 import 복원!
```

### 5. 순환 의존성(Circular Dependency) 방지

```
❌ 위험한 구조:
A.tsx → import from B.tsx
B.tsx → import from A.tsx
→ 무한 루프 또는 undefined 에러!

✅ 안전한 구조:
types.ts  ← A.tsx와 B.tsx 모두 여기서 import
    ↑         ↑
  A.tsx     B.tsx   (서로 직접 import 안 함)
```

```
실전 규칙:
1. 타입/인터페이스 → 별도 파일 (lib/types/)
2. 공유 상수 → 별도 파일 (lib/constants/)
3. 컴포넌트 → 단방향 의존 (부모 → 자식, 자식 → 부모 ❌)
```

### 6. 분할 후 반드시 확인할 것

```bash
# 1. TypeScript 빌드 검증
npx tsc --noEmit
# → 에러 수가 분할 전과 동일하면 성공!

# 2. 실제 화면 확인
npm run dev
# → 기능이 정상 작동하는지 확인

# 3. 핫 리로드 확인
# → 파일 수정 시 자동 반영되는지 확인
```

### 7. 분할 판단 기준 요약

| 기준 | 분리 O | 분리 X |
|------|--------|--------|
| Props 수 | 3개 이하 | 5개 이상 |
| 파일 크기 | 300줄 이상 | 200줄 이하 |
| 코드 독립성 | 자체 state 관리 | 부모 state 직접 조작 |
| 재사용 여부 | 다른 곳에서도 사용 | 한 곳에서만 사용 |
| 상태 공유 | 콜백으로 통신 | 10개+ state 공유 |

---

## 요약 치트시트

| 패턴 | 한 줄 설명 | 예시 |
|------|-----------|------|
| `interface` | 객체 구조 정의 | `interface User { name: string }` |
| `type \| Union` | 허용 값 제한 | `type Tab = "a" \| "b" \| "c"` |
| `Record<K,V>` | 키-값 매핑 | `Record<string, number>` |
| `<T>` 제네릭 | 범용 함수 | `function fetch<T>(): T[]` |
| Props 타입 | 컴포넌트 계약 | `{ onClose: () => void }` |
| `useState<T>` | 상태 타입 지정 | `useState<User \| null>(null)` |
| `Omit/Pick` | 타입 부분 사용 | `Omit<User, "id">` |
| `export type` | 타입만 내보내기 | `export type { MyType }` |
| `as` 단언 | 비상 탈출구 | `data as any` (최소화!) |
| 함수 시그니처 | 입출력 타입 | `(id: string) => Promise<void>` |
