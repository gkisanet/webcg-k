# WebCG-K → OGRAF v1 호환성 분석 및 마이그레이션 계획

## 📋 Executive Summary

WebCG-K 는 이미 **OGRAF(Graphic) 스펙의 핵심 철학과 80% 이상 부합**하는 아키텍처를 가지고 있습니다.  
하지만 **공식 OGRAF Manifest 포맷**, **Web Component 인터페이스**, **Server API** 측면에서 공식 호환성을 확보하려면 체계적인 단계적 확장이 필요합니다.

---

## 🔍 1. 현재 WebCG-K 아키텍처 vs OGRAF 스펙 비교 분석

### 1.1 Graphic 포맷 비교

| 항목 | WebCG-K 현재 상태 | OGRAF v1 요구사항 | 격차 (Gap) |
|------|------------------|-------------------|------------|
| **Manifest 파일** | `graphics` 테이블의 `template_data` JSON 저장 | `.ograf.json` 파일 + 명시적 스키마 참조 | ⚠️ 포맷 변환 필요 |
| **Graphic ID** | UUID (데이터베이스 기본키) | Reverse Domain Name 권장 (`com.company.graphic-id`) | ⚠️ 네이밍 컨벤션 추가 |
| **Entry Point** | `webcgkSrcdoc.ts` 의 인라인 HTML/CSS/JS | `main` 필드가 지정한 ES Module (`.mjs`) | ⚠️ 웹 컴포넌트 래퍼 필요 |
| **Web Component** | iframe 내 `window.webcgk` API | `HTMLElement` 상속 클래스 + 명시적 메서드 | 🔴 가장 큰 격차 |
| **Step Model** | 암묵적 (SHOW/HIDE 트리거) | `stepCount`, `playAction()`, `stopAction()` 명시 | ⚠️ 인터페이스 확장 |
| **Custom Actions** | `sendToParent()` 기반 커스텀 메시지 | `customActions` 배열 + `customAction()` 메서드 | ⚠️ 공식 액션 매핑 필요 |
| **Data Schema** | AI 생성 시 암묵적 JSON 구조 | `schema` 필드에 JSON Schema 정의 | ⚠️ 스키마 명시화 필요 |
| **Real-time 지원** | ✅ 실시간 렌더링 (iframe postMessage) | `supportsRealTime: true` | ✅ 이미 충족 |
| **Non-real-time** | ❌ 미지원 | `supportsNonRealTime`, `goToTime()`, `setActionsSchedule()` | 🔴 신규 구현 필요 |
| **Render Requirements** | 1920x1080 고정 | `renderRequirements` 배열 (해상도, 프레임레이트, 엔진) | ⚠️ 선언적 명세 추가 |
| **Vendor Extensions** | ❌ 미사용 | `v_` 접두사 필드 허용 | ✅ 쉽게 도입 가능 |

### 1.2 Server API 비교

| 항목 | WebCG-K 현재 상태 | OGRAF Server API | 격차 |
|------|------------------|------------------|------|
| **Graphics 관리** | Supabase 직접 호출 | RESTful `/graphics` 엔드포인트 | 🔴 API 레이어 필요 |
| **Renderer 등록** | URL 파라미터 기반 | `/renderers`, `/renderers/{id}` | 🔴 Renderer 리소스 모델 필요 |
| **Playout 제어** | Supabase Realtime CDC | `/renderers/{id}/target/graphicInstance/*` | 🔴 명령형 API 병행 필요 |
| **CORS** | 설정 안됨 | CORS 헤더 권장 | ⚠️ 보안 설정 추가 |

### 1.3 Renderer 아키텍처 비교

| 항목 | WebCG-K | OGRAF Renderer | 비고 |
|------|---------|----------------|------|
| **격리 방식** | iframe `sandbox` | Web Component Shadow DOM | 둘 다 유효한 격리 전략 |
| **통신 프로토콜** | `postMessage` (커스텀) | Web Component 메서드 호출 | OGRAF 은 직접 호출 |
| **타이밍** | SHOW/HIDE 즉시 반영 | `load().then(playAction())` | OGRAF 이 더 명시적 |
| **스케일링** | `ResizeObserver` 기반 자동 | `renderRequirements` 로 선언 | WebCG-K 가 더 동적 |

---

## 🎯 2. strategic 판단: "완전 호환" vs "부분 호환"

### 옵션 A: **풀 OGRAF 호환 모드** (장기 목표)
- OGRAF Devtool 에서 WebCG-K 그래픽 바로 로드
- OGRAF Server 를 WebCG-K 백엔드로 대체 가능
- EBU 마켓플레이스에서 그래픽 유통 가능

**소요 예상**: 3~4 개월 (3 인 기준)

### 옵션 B: **OGRAF Export/Import 게이트웨이** (실용적 접근)
- WebCG-K 내부 포맷 유지
- OGRAF 패키지 내보내기/가져오기 기능만 구현
- 기존 워크플로우 변경 최소화

**소요 예상**: 3~4 주 (1 인 기준)

### 옵션 C: **하이브리드 런타임** (권장)
- Web Component 래퍼로 기존 iframe 래핑
- OGRAF Devtool 에서 "테스트 가능" 수준
- Server API 는 점진적 도입

**소요 예상**: 6~8 주 (1~2 인 기준)

---

## 📅 3. 단계적 마이그레이션 로드맵 (옵션 C 기준)

### Phase 0: 기초 준비 (Week 1)

#### 3.1.1 Manifest 스키마 정의
```typescript
// webcg-k/src/lib/ografTypes.ts
export interface OgrafManifest {
  $schema: "https://ograf.ebu.io/v1/specification/json-schemas/graphics/schema.json";
  id: string; // reverse-domain 권장
  version?: string;
  name: string;
  description?: string;
  author?: { name: string; email?: string; url?: string };
  main: string; // "./graphic.mjs"
  customActions?: Array<{
    id: string;
    name: string;
    description?: string;
    schema?: object | null;
  }>;
  supportsRealTime: boolean;
  supportsNonRealTime: boolean;
  stepCount?: number; // default: 1
  schema?: object; // data 바인딩 스키마
  renderRequirements?: Array<{
    resolution?: { width?: { exact?: number }; height?: { exact?: number } };
    frameRate?: { exact?: number };
    engine?: Array<{ type: string; version: { min: string } }>;
  }>;
  thumbnails?: Array<{ file: string; resolution?: { width: number; height: number } }>;
  // Vendor extensions
  v_webcgk?: {
    originalGraphicId: string; // DB graphics.id
    canvasSize: { width: number; height: number };
    elements: any[]; // WebCG-K element 포맷
  };
}
```

#### 3.1.2 기존 graphicService 확장
```typescript
// webcg-k/src/services/ografExportService.ts
import { supabase } from "../lib/supabase";
import type { OgrafManifest } from "../lib/ografTypes";

export async function exportGraphicAsOgraf(graphicId: string): Promise<{
  manifest: OgrafManifest;
  files: Array<{ path: string; content: string }>;
}> {
  const { data: graphic } = await supabase
    .from("graphics")
    .select("*")
    .eq("id", graphicId)
    .single();

  if (!graphic) throw new Error("Graphic not found");

  // OGRAF Manifest 생성
  const manifest: OgrafManifest = {
    $schema: "https://ograf.ebu.io/v1/specification/json-schemas/graphics/schema.json",
    id: `tv.webcg-k.${graphic.id}`, // reverse-domain 스타일
    name: graphic.name,
    description: graphic.description || undefined,
    main: "./graphic.mjs",
    supportsRealTime: true,
    supportsNonRealTime: false,
    stepCount: 1,
    schema: {
      type: "object",
      properties: {
        // AI cuesheet 에서 사용하는 replicant 데이터 스키마 추론
        title: { type: "string", title: "Title" },
        subtitle: { type: "string", title: "Subtitle" },
        timerDuration: { type: "number", title: "Timer Duration (sec)" },
      },
    },
    renderRequirements: [
      {
        resolution: {
          width: { exact: 1920 },
          height: { exact: 1080 },
        },
        frameRate: { ideal: 60 },
        engine: [
          { type: "Blink", version: { min: "100" } },
          { type: "WebKit", version: { min: "16" } },
        ],
      },
    ],
    v_webcgk: {
      originalGraphicId: graphic.id,
      canvasSize: graphic.template_data.canvas,
      elements: graphic.template_data.elements,
    },
  };

  // Web Component 래퍼 생성 (Phase 1 에서 상세 구현)
  const graphicMjs = generateWebComponentWrapper(graphic);

  return {
    manifest,
    files: [
      { path: `${graphic.id}.ograf.json`, content: JSON.stringify(manifest, null, 2) },
      { path: "graphic.mjs", content: graphicMjs },
    ],
  };
}
```

---

### Phase 1: Web Component 래퍼 구현 (Week 2-3)

#### 3.2.1 OGRAF 호환 Web Component 어댑터
```javascript
// graphic.mjs 템플릿 (자동 생성됨)
/**
 * OGRAF Web Component Wrapper for WebCG-K Graphic
 * Auto-generated by WebCG-K OGRAF Exporter
 */

class WebCGKGraphic extends HTMLElement {
  #currentStep = undefined;
  #data = {};
  #shadowRoot = null;
  #iframe = null;

  constructor() {
    super();
    this.#shadowRoot = this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    // OGRAF spec: Don't paint pixels until load() is called
  }

  async load(params) {
    const { data, renderType, renderCharacteristics } = params;

    if (renderType !== "realtime") {
      return { statusCode: 400, statusMessage: "Only realtime supported" };
    }

    // WebCG-K srcdoc 생성 로직 재사용
    const srcdoc = buildPluginSrcdoc({
      html: window.__WEBGK_GRAPHIC__.html,
      css: window.__WEBGK_GRAPHIC__.css,
      js: window.__WEBGK_GRAPHIC__.js,
      width: 1920,
      height: 1080,
      autoShow: false,
    });

    this.#iframe = document.createElement("iframe");
    this.#iframe.srcdoc = srcdoc;
    this.#iframe.style.cssText = "width:1920px;height:1080px;border:none;background:transparent;";
    this.#iframe.sandbox = "allow-scripts allow-same-origin";
    this.#shadowRoot.appendChild(this.#iframe);

    // 데이터 초기화
    this.#data = data || {};

    // iframe 로드 대기
    await new Promise((resolve) => {
      this.#iframe.onload = resolve;
    });

    // INIT 메시지 전송
    this.#iframe.contentWindow.postMessage({ type: "INIT", payload: data }, "*");

    return { statusCode: 200 };
  }

  async dispose(params) {
    if (this.#iframe) {
      this.#iframe.contentWindow.postMessage({ type: "HIDE" }, "*");
      this.#shadowRoot.removeChild(this.#iframe);
      this.#iframe = null;
    }
    return { statusCode: 200 };
  }

  async playAction(params) {
    const { delta = 1, goto, skipAnimation = false } = params;

    // Step 계산 (OGRAF spec 준수)
    let targetStep;
    if (goto !== undefined) {
      targetStep = goto;
    } else {
      const current = this.#currentStep ?? -1;
      targetStep = current + delta;
    }

    // OGRAF spec: stepCount 이상이면 end 로 간주
    const stepCount = 1; // WebCG-K 는 단일 스텝
    if (targetStep >= stepCount) {
      // End 로 전환 (HIDE)
      this.#iframe?.contentWindow.postMessage({ type: "HIDE" }, "*");
      this.#currentStep = undefined;
      return { statusCode: 200, currentStep: undefined };
    }

    // Step 0 으로 진입 (SHOW)
    this.#iframe?.contentWindow.postMessage({ type: "SHOW" }, "*");
    this.#currentStep = 0;
    return { statusCode: 200, currentStep: 0 };
  }

  async stopAction(params) {
    this.#iframe?.contentWindow.postMessage({ type: "HIDE" }, "*");
    this.#currentStep = undefined;
    return { statusCode: 200, currentStep: undefined };
  }

  async updateAction(params) {
    const { actionId, data } = params;
    
    // 데이터 갱신 → iframe 에 REPLICANT_UPDATE 전송
    this.#data = { ...this.#data, ...data };
    this.#iframe?.contentWindow.postMessage(
      { type: "REPLICANT_UPDATE", payload: this.#data },
      "*"
    );
    return { statusCode: 200 };
  }

  async customAction(params) {
    const { actionId, payload } = params;

    // WebCG-K custom action 매핑
    // 예: actionId="highlight" → iframe 에 커스텀 이벤트
    this.#iframe?.contentWindow.postMessage(
      { source: "ograf-custom-action", type: actionId, payload },
      "*"
    );

    return { statusCode: 200, result: { executed: actionId } };
  }

  // Non-real-time support (Phase 2)
  async goToTime(params) {
    return { statusCode: 501, statusMessage: "Not implemented" };
  }

  async setActionsSchedule(params) {
    return { statusCode: 501, statusMessage: "Not implemented" };
  }
}

export default WebCGKGraphic;
```

---

### Phase 2: Server API 게이트웨이 (Week 4-5)

#### 3.3.1 OGRAF Server API 호환 Express 라우터
```typescript
// webcg-k/src/server/ografApi.ts (Node.js/Express 가정)
import express from "express";
import { supabase } from "../lib/supabaseClient"; // 서버 사이드 클라이언트

const router = express.Router();

// GET / - Server information
router.get("/", async (req, res) => {
  res.json({
    name: "WebCG-K OGRAF Gateway",
    description: "WebCG-K backend with OGRAF Server API compatibility layer",
    author: { name: "WebCG-K Team" },
    version: "1.0.0",
  });
});

// GET /graphics - List graphics
router.get("/graphics", async (req, res) => {
  const { data, error } = await supabase
    .from("graphics")
    .select("id, name, description, template_data, created_at");

  if (error) return res.status(500).json({ error: error.message });

  res.json({
    graphics: data.map((g) => ({
      id: `tv.webcg-k.${g.id}`,
      name: g.name,
      description: g.description,
      version: "1.0",
    })),
  });
});

// GET /graphics/:graphicId - Get graphic manifest
router.get("/graphics/:graphicId", async (req, res) => {
  const grafId = req.params.graphicId.replace("tv.webcg-k.", "");
  
  const { data: graphic } = await supabase
    .from("graphics")
    .select("*")
    .eq("id", grafId)
    .single();

  if (!graphic) return res.status(404).json({ error: "Graphic not found" });

  const manifest = await buildOgrafManifest(graphic); // Phase 1 함수 재사용

  res.json({
    graphic: manifest,
    metadata: {
      createdAt: graphic.created_at,
      updatedAt: graphic.updated_at,
    },
  });
});

// POST /renderers/:rendererId/target/graphicInstance/load
router.post("/renderers/:rendererId/target/graphicInstance/load", async (req, res) => {
  const { rendererId } = req.params;
  const { renderTarget, graphicId, params } = req.body;

  // WebCG-K cuesheet/cuesheet_blocks 테이블에 인스턴스 생성
  const instanceId = crypto.randomUUID();
  
  // Supabase 에 graphic instance 기록 (선택)
  // 실제 playout 은 기존 Supabase Realtime 파이프라인 사용

  res.json({
    graphicInstanceId: instanceId,
    statusCode: 200,
  });
});

// PUT /renderers/:rendererId/target/graphicInstance/clear
router.put("/renderers/:rendererId/target/graphicInstance/clear", async (req, res) => {
  const { filters } = req.body;
  
  // WebCG-K overlayState 정리 로직 호출
  // existing clear logic...

  res.json({ clearedCount: 1 });
});

export default router;
```

---

### Phase 3: OGRAF Devtool 테스트 (Week 6)

#### 3.4.1 Devtool 호환성 체크리스트
- [ ] OGRAF Devtool 로컬 폴더 로드 시 WebCG-K 그래픽 인식
- [ ] Manifest validation 통과 (JSON Schema 검증)
- [ ] Real-time playout 테스트 (playAction → SHOW, stopAction → HIDE)
- [ ] Custom Action 트리거 테스트
- [ ] Data binding (`updateAction`) 실시간 갱신 확인

#### 3.4.2 테스트용 샘플 그래픽 패키지
```bash
webcg-k-ograf-export/
├── lower-third-name.ograf.json
├── graphic.mjs
└── assets/
    └── logo.png
```

---

## 🔧 4. 기술적 결정 사항 (Architecture Decision Records)

### ADR-001: iframe 기반 Web Component 래핑
**결정**: 기존 `webcgkSrcdoc` 인프라를 재사용하기 위해 Shadow DOM 내부에 iframe 을 삽입하는 방식 채택

**이유**:
1. 기존 4 개 렌더러 경로 (Preview, Canvas, Compositor, Animated) 모두 동일한 `buildPluginSrcdoc` 사용
2. WebCG-K 의 `window.webcgk` API 를 그대로 활용 가능
3. Sandbox 격리 보안 유지

**Trade-off**:
- ✅ 기존 코드 변경 최소화
- ⚠️ iframe 중첩으로 인한 미세한 성능 오버헤드 (1~2ms)

### ADR-002: Hybrid Server API
**결정**: Supabase Realtime CDC 를 주력으로 유지하되, OGRAF Server API 를 게이트웨이로 제공

**이유**:
1. WebCG-K 의 핵심 강점인 실시간 동기화 (CDC) 를 훼손하지 않음
2. OGRAF Controller (automation systems) 와의 연동만 필요시 게이트웨이 경유
3. 점진적 마이그레이션 가능

### ADR-003: Vendor Extension 적극 활용
**결정**: `v_webcgk` 네임스페이스에 WebCG-K 고유 메타데이터 저장

**예시**:
```json
{
  "$schema": "https://ograf.ebu.io/v1/specification/json-schemas/graphics/schema.json",
  "id": "tv.webcg-k.abc123",
  "v_webcgk": {
    "originalGraphicId": "abc123",
    "gridTemplateId": "grid-001",
    "aiGeneratedAt": "2025-01-15T10:30:00Z",
    "elements": [...]
  }
}
```

---

## 📊 5. 예상 효과 및 리스크

### 5.1 기대 효과
| 항목 | 현재 | OGRAF 호환 후 |
|------|------|--------------|
| **그래픽 유통** | WebCG-K 전용 | EBU 마켓플레이스 가능 |
| **Renderer interoperability** | WebCG-K Renderer 만 | OGRAF 호환 모든 Renderer |
| **Controller 연동** | WebCG-K UI 만 | MOS 게이트웨이, automation 시스템 |
| **Devtool 생태계** | 자체 디버거 | OGRAF Devtool 공식 지원 |

### 5.2 리스크 및 완화 방안
| 리스크 | 영향도 | 완화 방안 |
|--------|--------|-----------|
| **Web Component 성능 저하** | 중 | Shadow DOM + iframe 최적화, 벤치마크 필수 |
| **OGRAF 스펙 변경** | 하 | `v_` 네임스페이스로 흡수 |
| **마이그레이션 비용** | 중 | Phase 2 까지 MVP 로 제한 |
| **Supabase 의존도 증가** | 상 | Server API 게이트웨이로 추상화 |

---

## ✅ 6. 즉시 착수 가능한 태스크 (Week 1)

### 6.1 코드 베이스 분석 완료 후 첫 번째 PR
- [ ] `src/lib/ografTypes.ts` 신규 파일 생성
- [ ] `src/services/ografExportService.ts` 스켈레톤 구현
- [ ] 기존 `graphicService.ts` 에 `exportToOgraf()` 함수 추가
- [ ] 유닛 테스트 3 개 작성 (Manifest 생성, Web Component 래퍼, 파일 번들링)

### 6.2 문서화
- [ ] `webcg-k/docs/OGRAF_COMPATIBILITY.md` 생성
- [ ] Export 기능 사용 가이드 작성
- [ ] OGRAF Devtool 테스트 절차 문서화

---

## 🎓 7. 교육적 가치 (Educational Takeaways)

이 마이그레이션 과정에서 학습할 수 있는 핵심 개념:

1. **산업 표준 스펙 분석 능력**: EBU 같은 국제 표준 문서를 읽고 구현으로 연결
2. **Adapter Pattern 실무 적용**: 레거시 시스템을 표준 인터페이스로 래핑
3. **Web Components 심화 이해**: Custom Elements, Shadow DOM, Lifecycle
4. **Hybrid Architecture 설계**: 기존 강점을 해치지 않으면서 외부 표준 수용
5. **Vendor Extension 전략**: 표준 호환성과 독자적 기능 확장 균형

---

## 📚 참고 자료

- [OGRAF Graphics Specification](https://ograf.ebu.io/v1/specification/docs/Specification.html)
- [OGRAF Server API (OpenAPI)](https://ograf.ebu.io/v1/specification/open-api/docs/index.html)
- [OGRAF GitHub Repository](https://github.com/ebu/ograf)
- [OGRAF Devtool](https://github.com/SuperFlyTV/ograf-devtool)
- [OGRAF Simple Rendering System](https://github.com/SuperFlyTV/ograf-server)
- [EBU HTML Graphics Working Group](https://tech.ebu.ch/groups/html_graphics)

---

*문서 작성일: 2025-01-30*  
*작성자: WebCG-K Architecture Team*
