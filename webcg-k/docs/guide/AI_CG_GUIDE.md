# AI CG 그래픽 생성 가이드

> WebCG-K에서 AI를 통해 방송 CG 그래픽을 생성하는 방법과 내부 구조체를 설명합니다.

---

## 1. CG 생성 워크플로우

### 1.1 UI를 통한 생성 (OverlayCreationWizard)

대시보드 → 오버레이 탭 → "+ 오버레이 만들기" 버튼을 클릭하면 4단계 위자드가 실행됩니다:

| Step | 이름 | 설명 |
|------|------|------|
| 1 | 그리드 선택 | 화면을 어떻게 분할할지 선택 (예: 4분할, 밴드+로케이터) |
| 2 | 영역 선택 | 선택한 그리드에서 CG를 배치할 Zone 클릭 (다중 선택 가능) |
| 3 | AI 프롬프트 | CG 디자인을 자연어로 요청 + 데이터소스 연결 |
| 4 | Variation 선택 | AI가 생성한 4가지 디자인 중 하나를 선택하여 저장 |

### 1.2 프롬프트를 통한 직접 생성

MCP 서버 없이 직접 CG를 생성하려면 **`generateCgVariations()` 함수**를 사용합니다.

```typescript
import { generateCgVariations } from "@/services/aiCgService";

const variations = await generateCgVariations(
  "서울 현재 날씨 CG를 만들어줘. 온도, 습도, 미세먼지 표시",
  { x: 0, y: 810, width: 1920, height: 270 },  // Lower Third 영역
  { temperature: 23, humidity: 45, dust: "좋음" } // 바인딩 데이터 (선택)
);
```

**매개변수:**
- `prompt` (string) — 원하는 CG에 대한 자연어 설명
- `bounds` (ZoneBounds) — CG가 배치될 영역 (px 단위)
- `dataContext` (선택) — 실시간 데이터 바인딩용 객체

**반환:** `CgVariation[]` — 최대 4개의 디자인 변형

---

## 2. 효과적인 프롬프트 작성법

### 2.1 기본 구조

```
[CG 유형] + [포함할 정보] + [스타일 지시]
```

### 2.2 좋은 프롬프트 예시

| 목적 | 프롬프트 | 핵심 |
|------|---------|------|
| **뉴스 Lower Third** | "기자 이름과 소속을 표시하는 뉴스 로어서드. 왼쪽에 파란색 강조바, 이름은 크게, '정치부 기자'는 작게" | 레이아웃 + 색상 + 계층 명시 |
| **속보 배너** | "화면 상단에 빨간색 속보 배너. '속보' 텍스트는 흰색 굵게, 내용 텍스트는 아래에 배치" | 위치 + 색상 + 텍스트 계층 |
| **날씨 CG** | "날씨 정보 CG. 왼쪽에 큰 온도 표시, 오른쪽에 습도와 미세먼지. 그라데이션 배경" | 데이터 레이아웃 + 시각 효과 |
| **스코어보드** | "축구 경기 스코어보드. 왼쪽 팀 vs 오른쪽 팀, 가운데 점수, 하단에 경기 시간" | 대칭 구조 명시 |
| **로고 워터마크** | "우측 상단에 채널 로고(텍스트 'KBS'). 반투명, 작은 크기" | 위치 + 투명도 |

### 2.3 프롬프트 팁

1. **위치를 명시하세요** — "왼쪽에", "상단에", "하단 1/4 영역에"
2. **계층 구조를 설명하세요** — "배경 위에 반투명 바, 그 위에 텍스트"
3. **색상 톤을 지정하세요** — "블루/화이트 톤", "어두운 배경에 밝은 텍스트"
4. **반복보다 구체적으로** — ❌ "예쁜 CG" → ✅ "그라데이션 배경에 글로우 효과가 있는 타이틀"
5. **데이터 바인딩 힌트** — 변하는 값은 데이터컨텍스트에 넣고 프롬프트에서 언급

### 2.4 나쁜 프롬프트 예시

| 프롬프트 | 문제 |
|---------|------|
| "CG 만들어줘" | 너무 모호 — 유형/레이아웃 지정 없음 |
| "멋진 애니메이션이 있는 CG" | 현재 구조체는 정적 — 애니메이션 미지원 |
| "유튜브 섬네일 만들어줘" | 방송 CG가 아닌 이미지 — 시스템 목적 불일치 |

---

## 3. GraphicElement 구조체 레퍼런스

### 3.1 기본 인터페이스

AI가 생성하는 모든 CG는 `GraphicElement[]` 배열로 표현됩니다.

```typescript
interface GraphicElement {
  // ─── 필수 프로퍼티 ─────────────────────────
  id: string;              // 고유 ID (예: "el-1", "bg-rect")
  type: "rect" | "ellipse" | "text" | "image" | "group";
  name: string;            // 한글 이름 (예: "배경 사각형")
  x: number;               // X 좌표 (px, 캔버스 좌상단 기준)
  y: number;               // Y 좌표
  width: number;            // 너비 (px)
  height: number;           // 높이 (px)
  rotation: number;         // 회전 각도 (도)
  opacity: number;          // 투명도 (0.0~1.0)
  visible: boolean;         // 표시 여부
  zIndex: number;           // 렌더 순서 (0=최하단)
  parentId: string | null;  // 부모 그룹 ID (null=최상위)
  
  // ─── 스타일 프로퍼티 ───────────────────────
  fill?: Fill;              // 채우기 (색상/그라데이션)
  stroke?: Stroke;          // 외곽선
  borderRadius?: number;    // 모서리 둥글기 (px)
  customCSS?: string;       // 커스텀 CSS (고급)
  
  // ─── 텍스트 전용 프로퍼티 ─────────────────
  content?: string;         // 텍스트 내용
  fontFamily?: string;      // 폰트 (예: "Pretendard", "sans-serif")
  fontSize?: number;        // 글자 크기 (px)
  fontWeight?: number;      // 굵기 (400=보통, 700=굵게)
  lineHeight?: number;      // 줄간격 배수 (1.2, 1.5 등)
  letterSpacing?: number;   // 자간 (px)
  textAlign?: "left" | "center" | "right" | "justify";
  verticalAlign?: "top" | "middle" | "bottom";
  
  // ─── 이미지 전용 프로퍼티 ─────────────────
  src?: string;             // 이미지 URL
  objectFit?: "cover" | "contain" | "fill";
  
  // ─── 그룹 전용 프로퍼티 ───────────────────
  children?: string[];      // 자식 요소 ID 목록
  
  // ─── 효과 프로퍼티 ────────────────────────
  shadowEnabled?: boolean;
  shadowColor?: string;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowBlur?: number;
}
```

### 3.2 Fill (채우기) 옵션

```typescript
interface Fill {
  type?: "solid" | "linear" | "radial" | "none";
  color?: string;           // HEX (예: "#1a1a2e")
  opacity?: number;         // 0.0~1.0
  // 그라데이션 전용
  gradientAngle?: number;   // 각도 (0~360)
  gradientStops?: Array<{
    offset: number;         // 위치 (0~100)
    color: string;
    opacity?: number;
  }>;
}
```

### 3.3 Stroke (외곽선) 옵션

```typescript
interface Stroke {
  color: string;
  width: number;
  style: "solid" | "dashed" | "dotted";
  opacity?: number;
}
```

### 3.4 요소 타입별 가이드

| type | 용도 | 필수 프로퍼티 | 예시 |
|------|------|-------------|------|
| `rect` | 배경, 바, 카드 | fill, borderRadius | 하단 바, 카드 배경 |
| `ellipse` | 원형 배지, 로고 배경 | fill | 채널 아이콘 배경 |
| `text` | 제목, 이름, 수치 | content, fontSize, fontFamily | 기자 이름, 온도 |
| `image` | 로고, 아이콘 | src, objectFit | 채널 로고 |
| `group` | 요소 묶음 | children | 이름+직함 그룹 |

---

## 4. CG 패턴 레시피 (복사해서 사용)

### 4.1 뉴스 Lower Third

```json
[
  {
    "id": "bg-bar",
    "type": "rect",
    "name": "배경 바",
    "x": 0, "y": 830,
    "width": 700, "height": 100,
    "rotation": 0, "opacity": 0.95,
    "visible": true, "zIndex": 0, "parentId": null,
    "fill": { "type": "solid", "color": "#0d47a1", "opacity": 0.95 },
    "borderRadius": 0
  },
  {
    "id": "accent-line",
    "type": "rect",
    "name": "강조선",
    "x": 0, "y": 830,
    "width": 6, "height": 100,
    "rotation": 0, "opacity": 1,
    "visible": true, "zIndex": 1, "parentId": null,
    "fill": { "type": "solid", "color": "#42a5f5", "opacity": 1 }
  },
  {
    "id": "reporter-name",
    "type": "text",
    "name": "기자 이름",
    "x": 30, "y": 845,
    "width": 400, "height": 40,
    "rotation": 0, "opacity": 1,
    "visible": true, "zIndex": 2, "parentId": null,
    "content": "홍길동",
    "fontSize": 32, "fontWeight": 700,
    "fontFamily": "Pretendard",
    "textAlign": "left",
    "fill": { "type": "solid", "color": "#ffffff" }
  },
  {
    "id": "reporter-title",
    "type": "text",
    "name": "직함",
    "x": 30, "y": 888,
    "width": 400, "height": 30,
    "rotation": 0, "opacity": 0.8,
    "visible": true, "zIndex": 2, "parentId": null,
    "content": "정치부 기자",
    "fontSize": 18, "fontWeight": 400,
    "fontFamily": "Pretendard",
    "textAlign": "left",
    "fill": { "type": "solid", "color": "#bbdefb" }
  }
]
```

### 4.2 속보 배너

```json
[
  {
    "id": "banner-bg",
    "type": "rect",
    "name": "속보 배경",
    "x": 0, "y": 0,
    "width": 1920, "height": 80,
    "rotation": 0, "opacity": 0.95,
    "visible": true, "zIndex": 0, "parentId": null,
    "fill": { "type": "solid", "color": "#b71c1c" }
  },
  {
    "id": "flash-badge",
    "type": "rect",
    "name": "속보 배지",
    "x": 20, "y": 15,
    "width": 100, "height": 50,
    "rotation": 0, "opacity": 1,
    "visible": true, "zIndex": 1, "parentId": null,
    "fill": { "type": "solid", "color": "#ffffff" },
    "borderRadius": 4
  },
  {
    "id": "flash-text",
    "type": "text",
    "name": "속보 라벨",
    "x": 20, "y": 20,
    "width": 100, "height": 50,
    "rotation": 0, "opacity": 1,
    "visible": true, "zIndex": 2, "parentId": null,
    "content": "속 보",
    "fontSize": 28, "fontWeight": 900,
    "textAlign": "center",
    "fill": { "type": "solid", "color": "#b71c1c" }
  },
  {
    "id": "headline",
    "type": "text",
    "name": "속보 내용",
    "x": 140, "y": 20,
    "width": 1760, "height": 50,
    "rotation": 0, "opacity": 1,
    "visible": true, "zIndex": 2, "parentId": null,
    "content": "서울 강남역 일대 호우경보 발령",
    "fontSize": 30, "fontWeight": 700,
    "textAlign": "left",
    "fill": { "type": "solid", "color": "#ffffff" }
  }
]
```

---

## 5. 내부 처리 파이프라인

### 5.1 전체 흐름

```
사용자 프롬프트
    ↓
generateCgVariations(prompt, bounds, data?)
    ↓
시스템 프롬프트 + 사용자 프롬프트 → AI API (Gemini/DeepSeek/Groq)
    ↓
AI 응답 (JSON 문자열)
    ↓
parseElementsFromResponse() → GraphicElement[] 정규화
    ↓
CgVariation[] (4개 디자인) → UI에서 선택
    ↓
overlay_templates 테이블에 저장
    ↓
OverlayPlayoutLayer → GraphicPreviewRenderer (SVG)로 렌더링
```

### 5.2 AI 시스템 프롬프트 (현재)

AI에게 전달되는 시스템 프롬프트의 핵심 규칙:

1. **순수 JSON만 출력** — 마크다운/설명 텍스트 없이
2. **GraphicElement 인터페이스 준수** — 위 Section 3의 구조
3. **한국어 텍스트** — 모든 content는 한국어
4. **프로페셔널 품질** — 방송 수준 디자인
5. **시인성 높은 색상** — 풍부하고 대비가 강한 조합

### 5.3 관리자 설정

관리자 페이지(대시보드 → Admin)에서 AI 모델과 프롬프트 제어:
- **모델 전환**: Gemini, DeepSeek, Groq, GitHub, OpenRouter
- **시스템 프롬프트 커스텀**: 기본 프롬프트를 덮어쓸 수 있음
- **API 키 관리**: DB 저장 또는 .env 환경변수
- **생성 설정**: temperature, maxOutputTokens, topP, topK

---

## 6. 현재 한계 및 향후 고도화

### 현재 한계

| 한계 | 설명 |
|------|------|
| **정적 레이아웃만 생성** | 애니메이션/모션 없이 텍스트+도형 조합 |
| **SVG 렌더러** | CSS animation 미지원 — fadeIn/Out 2종만 가능 |
| **데이터 바인딩 미완** | 데이터가 변경되어도 자동 갱신 안됨 |
| **폰트 제한** | 커스텀 폰트는 시스템에 미리 등록 필요 |

### Phase 34 고도화 로드맵

| 단계 | 내용 | 상태 |
|------|------|------|
| 34-A | GraphicElement에 animation 프로퍼티 추가 | 🔜 예정 |
| 34-B | SVG → DOM/CSS 애니메이션 렌더러 전환 | 🔜 예정 |
| 34-C | AI 프롬프트에 애니메이션 시맨틱 추가 | 🔜 예정 |
| 34-D | 콘텐츠 시퀀싱 (틱커/크롤) 구현 | 🔜 예정 |
