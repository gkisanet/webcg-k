# Zod 가이드 — 런타임 타입 안전성을 위한 스키마 검증

## 1. Zod란?

**Zod**는 TypeScript 퍼스트 스키마 선언 및 검증 라이브러리입니다. TypeScript의 타입 시스템은 **컴파일 타임에만** 동작하며, 런타임에는 완전히 사라집니다. Zod는 이 갭을 메워, **런타임에서도 데이터의 구조와 타입을 검증**할 수 있게 합니다.

```text
TypeScript 타입: 컴파일 시에만 존재 → 빌드 후 사라짐
Zod 스키마:     런타임에도 존재   → API 응답, DB 데이터 등 실시간 검증
```

### 핵심 특징
| 특징 | 설명 |
|------|------|
| TypeScript 네이티브 | 스키마에서 타입 자동 추론 (`z.infer`) |
| 제로 의존성 | 외부 라이브러리 없이 단독 동작 |
| 불변(Immutable) | 모든 메서드가 새 인스턴스 반환 |
| 체이닝 API | `.optional()`, `.default()`, `.transform()` 등 직관적 체인 |
| 경량 | ~50KB (gzip ~13KB) |

---

## 2. Zod를 사용하는 이유

### 2.1 `as any`의 위험성

```typescript
// ❌ 위험: as any는 타입 체크를 완전히 우회
const config = data.generation_config as any;
console.log(config.temperature); // 런타임 에러 가능!
```

`as any`는 TypeScript의 타입 안전 그물을 완전히 찢습니다:
- **컴파일러가 에러를 잡지 못함** — 존재하지 않는 속성에 접근해도 경고 없음
- **자동완성 불가** — IDE가 속성을 제안할 수 없음
- **전파 오염** — `as any`가 된 값은 이후 모든 연산에서 `any`로 전파

### 2.2 Zod로 해결

```typescript
// ✅ 안전: Zod 스키마로 런타임 검증 + 타입 추론 동시 획득
const config = GenerationConfigSchema.parse(data.generation_config);
console.log(config.temperature); // ✅ 자동완성 + 타입 안전
```

### 2.3 사용 이점 정리

1. **외부 데이터 신뢰 불가** — API 응답, DB 레코드, URL 파라미터 등은 실제 구조를 보장할 수 없음
2. **런타임 에러 사전 차단** — 잘못된 데이터가 들어오면 즉시 에러를 throw
3. **타입 자동 추론** — `z.infer<typeof Schema>`로 별도 타입 정의 불필요
4. **기본값 자동 적용** — `.default()`로 누락 필드에 폴백 값 설정
5. **에러 메시지 자동 생성** — 어떤 필드가 왜 잘못되었는지 상세 보고

---

## 3. Zod 기본 사용법

### 3.1 설치

```bash
npm install zod
```

### 3.2 기본 스키마 정의

```typescript
import { z } from "zod";

// 원시 타입
const nameSchema = z.string();
const ageSchema = z.number().min(0).max(150);
const isActiveSchema = z.boolean();

// 객체
const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().optional(),         // 선택적 필드
  role: z.enum(["admin", "user"]),    // 열거형
  createdAt: z.string().datetime(),   // ISO 날짜
});

// 타입 자동 추론
type User = z.infer<typeof UserSchema>;
// → { id: string; name: string; email: string; age?: number; role: "admin" | "user"; createdAt: string }
```

### 3.3 파싱 (검증 + 변환)

```typescript
// .parse() — 실패 시 throw
try {
  const user = UserSchema.parse(unknownData);
  // user는 이제 User 타입으로 보장됨
} catch (err) {
  if (err instanceof z.ZodError) {
    console.error(err.issues); // 상세 에러 목록
  }
}

// .safeParse() — throw하지 않고 결과 객체 반환
const result = UserSchema.safeParse(unknownData);
if (result.success) {
  console.log(result.data); // User 타입
} else {
  console.error(result.error.issues);
}
```

### 3.4 기본값과 변환

```typescript
const ConfigSchema = z.object({
  temperature: z.number().default(0.9),       // 누락 시 0.9
  maxTokens: z.number().default(8192),
  model: z.string().default("gpt-4o-mini"),
});

// 빈 객체를 파싱하면 모든 기본값이 적용됨
ConfigSchema.parse({});
// → { temperature: 0.9, maxTokens: 8192, model: "gpt-4o-mini" }

// .transform()으로 값 변환
const DateSchema = z.string().transform((val) => new Date(val));
```

### 3.5 배열과 중첩 구조

```typescript
const ElementSchema = z.object({
  id: z.string(),
  type: z.enum(["text", "image", "rect"]),
  x: z.number(),
  y: z.number(),
});

// 배열
const ElementsSchema = z.array(ElementSchema);

// 중첩 객체
const TemplateSchema = z.object({
  elements: z.array(ElementSchema),
  canvas: z.object({
    width: z.number().default(1920),
    height: z.number().default(1080),
  }),
});
```

---

## 4. 대표적인 사용 사례 10선

### 사례 1: API 응답 검증

```typescript
// 외부 API 응답을 신뢰할 수 없으므로 Zod로 검증
const WeatherResponseSchema = z.object({
  temperature: z.number(),
  humidity: z.number(),
  condition: z.string(),
});

const response = await fetch("https://api.weather.com/current");
const data = WeatherResponseSchema.parse(await response.json());
// data는 이제 타입 안전
```

### 사례 2: 폼 입력 검증

```typescript
const LoginFormSchema = z.object({
  email: z.string().email("올바른 이메일을 입력하세요"),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다"),
  rememberMe: z.boolean().default(false),
});

function handleSubmit(formData: unknown) {
  const result = LoginFormSchema.safeParse(formData);
  if (!result.success) {
    // result.error.issues에서 필드별 에러 메시지 추출
    return result.error.issues.map(i => `${i.path}: ${i.message}`);
  }
  // result.data는 안전한 LoginForm 타입
  login(result.data);
}
```

### 사례 3: URL 쿼리 파라미터 검증

```typescript
const SearchParamsSchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
  sort: z.enum(["asc", "desc"]).default("desc"),
  q: z.string().optional(),
});

// z.coerce는 "3" → 3 자동 변환 (URL 파라미터는 항상 string)
const params = SearchParamsSchema.parse(searchParams);
```

### 사례 4: DB 레코드 타입 안전 파싱 (본 프로젝트 적용)

```typescript
// Supabase에서 가져온 JSONB 컬럼 파싱
const ps = parsePlayheadState(data.playhead_state);
const blocks = parseTimelineData(data.timeline_data);

// 기존: (data.playhead_state as any)?.pgmBlockId — 위험
// 변경: ps.pgmBlockId — 타입 안전 + 기본값 보장
```

### 사례 5: AI 모델 설정 파라미터 (본 프로젝트 적용)

```typescript
const GenerationConfigSchema = z.object({
  temperature: z.number().optional().default(0.9),
  maxOutputTokens: z.number().optional().default(8192),
  topP: z.number().optional().default(0.95),
  topK: z.number().optional().default(40),
}).passthrough();

// DB에서 null이 올 수도 있는 generation_config 안전 파싱
const gc = parseGenerationConfig(model.generation_config);
// gc.temperature는 number 타입 보장 (기본값 0.9)
```

### 사례 6: 환경 변수 검증

```typescript
const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  API_KEY: z.string().min(1, "API 키가 비어있습니다"),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

// 앱 시작 시 환경 변수 검증 — 누락되면 즉시 crash
export const env = EnvSchema.parse(process.env);
```

### 사례 7: WebSocket / Realtime 메시지 검증

```typescript
const RealtimeMessageSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("PLAY"), item: ItemSchema }),
  z.object({ action: z.literal("STOP") }),
  z.object({ action: z.literal("NEXT"), skipCount: z.number().default(1) }),
]);

channel.on("broadcast", { event: "playout" }, (payload) => {
  const msg = RealtimeMessageSchema.parse(payload.payload);
  // msg.action이 "PLAY"이면 msg.item이 자동 추론됨
});
```

### 사례 8: 그래픽 템플릿 요소 검증 (본 프로젝트 적용)

```typescript
const TemplateElementSchema = z.object({
  id: z.string(),
  type: z.string(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  src: z.string().optional(),
  text: z.string().optional(),
  style: z.record(z.string(), z.unknown()).optional(),
}).passthrough(); // SVG 렌더링에 필요한 추가 필드 보존

// elements 안전 추출
const elements = parseTemplateElements(graphic.template_data);
```

### 사례 9: 설정 파일 (JSON/YAML) 로딩

```typescript
const AppConfigSchema = z.object({
  theme: z.enum(["dark", "light"]).default("dark"),
  language: z.string().default("ko"),
  features: z.object({
    aiAssistant: z.boolean().default(true),
    nrcsIntegration: z.boolean().default(false),
  }),
});

const rawConfig = JSON.parse(fs.readFileSync("config.json", "utf-8"));
export const appConfig = AppConfigSchema.parse(rawConfig);
```

### 사례 10: 타입 가드 함수 대체

```typescript
// ❌ 전통적 타입 가드 — 수동 유지보수 필요
function isUser(obj: unknown): obj is User {
  return typeof obj === "object" && obj !== null
    && "id" in obj && typeof obj.id === "string"
    && "name" in obj && typeof obj.name === "string";
}

// ✅ Zod — 스키마 하나로 타입 가드 + 검증 + 기본값 모두 해결
const isUser = (obj: unknown): obj is User => UserSchema.safeParse(obj).success;
```

---

## 5. 프로젝트 적용 현황

본 프로젝트(`WebCG-K`)에서는 `src/lib/schemas.ts`에 다음 스키마를 정의하여 **`as any`를 점진적으로 제거**하고 있습니다:

| 스키마 | 대상 | 적용 파일 |
|--------|------|-----------|
| `GenerationConfigSchema` | AI 모델 생성 파라미터 | `AdminAiTab.tsx` |
| `TemplateElementSchema` | 그래픽 요소 | `$bundleId.tsx` |
| `TemplateCanvasSchema` | 캔버스 크기 | `$bundleId.tsx` |
| `PlayheadStateSchema` | 플레이헤드 상태 | `render.tsx` |
| `TimelineBlockDataSchema` | 타임라인 블록 | `render.tsx`, `$sessionId.tsx` |

### 안전 파싱 헬퍼 함수

```typescript
import { parseGenerationConfig } from "../lib/schemas";
import { parseTemplateElements, parseCanvasSize } from "../lib/schemas";
import { parsePlayheadState, parseTimelineData } from "../lib/schemas";
```

---

## 6. 참고 자료

- [Zod 공식 문서](https://zod.dev)
- [Zod GitHub](https://github.com/colinhacks/zod)
- [TypeScript Handbook — Type Guards](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
