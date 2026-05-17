# 🏗 아키텍처 및 원리 교과서 (docs/CONTEXT.md)

## 📐 WebCG-K 핵심 아키텍처 개요
WebCG-K는 방송사 내부망에서 무중단으로 동작하도록 설계된 **웹 기반 실시간 방송 그래픽 송출 시스템**입니다. 본 시스템은 저작(Dashboard), 송출 제어(Controller), 출력(Renderer)으로 이어지는 3단계 방송 그래픽 파이프라인을 구축하고 있습니다.

```mermaid
graph TD
    subgraph "1. 저작 레이어 (Authoring)"
        Dashboard["대시보드 (/dashboard)"]
        GfxEditor["벡터 그래픽 편집기<br/>(GraphicsEditor)"]
        AIWizard["AI CG 마법사<br/>(Gemini 2.0 Flash)"]
    end

    subgraph "2. 데이터 및 동기화 레이어 (Data & Sync)"
        SupabaseDB["Supabase Postgres DB"]
        RealtimeChannel["Supabase Realtime Channel<br/>(Broadcast vs DB CDC)"]
        MigrationEngine["단일 압축 마이그레이션<br/>(Squashed Migration)"]
    end

    subgraph "3. 송출 및 출력 레이어 (Playout & Output)"
        Controller["라이브 컨트롤러 (/controller)<br/>(타임라인 / 오버레이 송출제어)"]
        Renderer["OBS 브라우저 렌더러 (/render)<br/>(투명 4K 알파채널 그래픽 출력)"]
    end

    Dashboard -->|저장/조회| SupabaseDB
    GfxEditor -->|SVG JSON 데이터 저장| SupabaseDB
    AIWizard -->|HTML/CSS 템플릿 생성| SupabaseDB
    
    Controller -->|PGM Take: Broadcast| RealtimeChannel
    Controller -->|Overlay ON/OFF: DB UPDATE| SupabaseDB
    
    RealtimeChannel -->|즉시 송출 (~5ms)| Renderer
    SupabaseDB -->|CDC 감지 (~50ms)| Renderer
    MigrationEngine -->|테이블/스키마 빌드| SupabaseDB
```

---

## 🎨 그래픽 편집 엔진 비교: WebCG-K vs Excalidraw
WebCG-K의 벡터 그래픽 에디터(`Canvas.tsx`)와 화이트보드 협업 툴의 사실상 표준인 `Excalidraw`를 비교 분석하여 렌더링 성능, 좌표계 계산 및 수학적 완벽성을 분석합니다.

### 1. 코드량 및 스코프 차이
*   **WebCG-K (우리 프로젝트)**
    *   **전체 규모**: `src` 디렉터리 기준 약 **82,800 LOC** (TypeScript, TSX, CSS).
    *   **특징**: 단순히 드로잉 캔버스에 그치는 것이 아니라, 사용자 인증, 데이터베이스 RLS, Supabase Realtime 동기화 채널, 비디오 입력 오버레이, 타임라인 플레이헤드 컴파일러, NRCS(보도정보시스템) API 연동, AI 캐릭터 Rive 뷰모델, AI Cuesheet Wizard 등 **방송 방송 자동화 시스템 전체**를 포함하는 거대한 스케일입니다.
    *   **에디터 스코프**: 전체 시스템 중 `GraphicsEditor` 관련 핵심 모듈은 약 **8,000 ~ 10,000 LOC**로 구성되어 있습니다.
*   **Excalidraw (오픈소스)**
    *   **전체 규모**: 단일 패키지 및 모노레포 전체 기준 **100,000 LOC+**.
    *   **특징**: 오직 **'무한 캔버스 화이트보드'**라는 단일 목적에 극도로 집중되어 있습니다. 코어 패키지인 `@excalidraw/excalidraw` 및 기하학 연산 패키지 `@excalidraw/math` 등에 소스 코드가 고도로 집중되어 있어 캔버스 조작, 히트 테스팅, 자유곡선 단순화 등 수학적 완성도가 극에 달해 있습니다.

---

### 2. 렌더링 아키텍처 비교 (SVG DOM vs Canvas 2D)

```mermaid
grid
    column
        ### WebCG-K: SVG DOM 렌더링
        ```mermaid
        sequenceDiagram
            participant React as React State
            participant DOM as SVG DOM Tree
            participant GPU as Browser GPU
            React->>DOM: 1. 요소 위치 변경 (x, y)
            DOM->>DOM: 2. Layout & Recalculate (Thrashing)
            DOM->>GPU: 3. Paint (Reflow 발생)
        ```
        *   **장점**: CSS Variables 및 Keyframe 애니메이션 활용이 매우 자유로워 방송 자막의 미려한 효과(Fade, Slide)를 브라우저 네이티브로 연출 가능.
        *   **단점**: 드래그/리사이즈 중 수백 개의 SVG 노드가 실시간으로 DOM 변경을 트리거하여 렌더링 병목 발생.
    column
        ### Excalidraw: Dual-Canvas 렌더링
        ```mermaid
        sequenceDiagram
            participant Engine as State Array
            participant Back as Static Background Canvas
            participant Fore as Interactive Foreground Canvas
            Engine->>Fore: 1. 드래그 중인 핸들만 Pixel 재그리기 (O(1))
            Note over Back: 2. 정적 드로잉은 전혀 재그리지 않음
            Fore->>Fore: 3. 드래그 완료 시 Background Canvas에 병합
        ```
        *   **장점**: DOM 노드가 증가하지 않아 수천 개의 요소를 드래그해도 프레임 드랍(60fps)이 전혀 없음.
        *   **단점**: CSS 애니메이션을 직접 적용할 수 없어 모든 트랜지션을 JS `requestAnimationFrame` 루프를 통해 수동으로 렌더링해야 함.
```

---

### 3. 기술적 세부 비교 및 트레이드오프

| 비교 항목 | WebCG-K (SVG DOM) | Excalidraw (HTML5 Canvas) | 적용 가능한 멘토링 조언 (Trade-off) |
|---|---|---|---|
| **기본 렌더러** | `React` + `SVG DOM Elements` | `HTML5 Canvas 2D` + `Rough.js` | **방송 송출용 템플릿**에는 미려한 애니메이션이 필수적이므로 **SVG DOM**이 적합하나, 에디팅 단계의 성능 최적화를 위한 보완이 필요함. |
| **좌표 변환** | clientX 기준 상대적 스냅 계산 | 3x3 아핀 변환 행렬 (Matrix Zoom/Pan) | 화면 줌인/줌아웃 시 마우스 클릭 오차가 발생하지 않도록 **Affine Transformation(아핀 변환) 행렬** 기법을 적용할 수 있음. |
| **충돌 및 스냅** | 8px 임계값 기반 Bounding Box 루프 | `@excalidraw/math` 정밀 기하학 히트 테스트 | 회전된 도형(`rotation`)이나 타원 간의 정확한 충돌 감지를 위해 스냅 연산 함수를 유틸리티화하는 구조 개편 필요. |
| **동기화 지연** | Supabase Realtime (~5ms ~ 50ms) | WebSockets + Web Crypto API E2EE | 방송용 특성상 외부 NRCS 장비 및 자동화 기능과의 정합성이 중요하므로, DB 상태 일관성을 보장하는 Supabase CDC 아키텍처가 최적임. |

---

## 💾 데이터베이스 마이그레이션 단일화 아키텍처
*   **배경**: 누적된 65개의 파편화된 마이그레이션 파일은 로컬 및 배포 환경에서 초기 스키마 셋업 시 심각한 속도 지연과 순서 의존성 오류(FK, Trigger 타이밍 에러)를 유발할 위험이 큽니다.
*   **설계 (Why & How)**:
    1.  Supabase CLI의 `migration squash` 기능을 이용하여 65개 마이그레이션을 단 하나의 통합 SQL 초기 파일 `202605140001_overlay_blend_mode.sql`로 빌드합니다.
    2.  `pg_dump` 과정에서 설정되는 빈 검색 경로(`pg_catalog.set_config('search_path', '', false)`)로 인해 발생하는 초기 시딩(`seed.sql`) 오동작을 미연에 방지하기 위해, 압축 마이그레이션 파일 말미에 `RESET search_path;` 명령을 인젝션하여 세션 상태 안전성(Session Isolation)을 완벽하게 보장합니다.

---

## 🎯 우리 프로젝트에 적용할 3대 아키텍처 개선안 (ADR)

### [ADR-01] Dual-Layer Canvas 패턴 도입
*   **배경**: 현재 `Canvas.tsx`에서 마우스 드래그/리사이즈 시, 복잡한 SVG 자식 요소들 전체가 실시간으로 재랜더링되어 프레임 레이트 저하를 유발할 수 있습니다.
*   **해결안 (Why & How)**:
    *   **정적 레이어 (Background SVG)**: 렌더링 비용이 큰 원본 그래픽 요소들은 드래그 중 변경되지 않도록 메모이제이션 처리합니다.
    *   **상호작용 레이어 (Foreground SVG Overlay)**: 마우스 조작 중에만 나타나는 스냅 가이드라인, 리사이징 핸들러, 회전 가이드는 가벼운 Overlay 레이어에서 처리하여 React 렌더링 계산량을 최소화($O(N) \to O(1)$)합니다.

### [ADR-02] Unified Coordinate Transform (아핀 공간 분리)
*   **배경**: 현재 에디터 줌 기능은 CSS `transform: scale()`에 의존하여 캔버스가 확대/축소되었을 때 마우스 좌표계와 그래픽 좌표계가 간헐적으로 어긋나는 한계가 있습니다.
*   **해결안 (Why & How)**:
    *   Excalidraw의 `viewportCoordinate` 기법을 벤치마킹하여, 마우스 스크린 좌표를 물리적인 캔버스 내부 좌표로 완벽하게 투영하는 수학적 유틸리티 함수 `screenToCanvas(x, y, zoom, pan)`을 추상화하고 공유합니다.

### [ADR-03] Strict Immutability & Structural Sharing
*   **배경**: 벡터 요소 배열의 잦은 복사와 참조 오류는 React가 불필요하게 캔버스 하위 요소를 전체 렌더링하는 원인이 됩니다.
*   **해결안 (Why & How)**:
    *   그래픽 배열 상태 변화 시 얕은 복사(`...`) 대신 Structural Sharing(구조적 공유) 패턴을 보증하는 스토어 액션을 정의하여 React Reconciler가 바뀐 요소의 돔 노드만 타겟 업데이트할 수 있도록 보장합니다.
