# CQRS 패턴 도입 — 의도(Command)와 상태(Query) 분리 설계

> **ADR (Architecture Decision Record)**
>
> **결정**: 오버레이 제어 시스템에 CQRS 패턴을 도입하여 `is_active`(운영자 의도)와 `animation_state`(렌더러 실제 상태)를 분리한다.
> **상태**: 제안됨 (Proposed)
> **날짜**: 2026-05-08

---

## 1. 문제 정의 (Why)

### 1.1 현재 아키텍처의 근본적 모호성

현재 `setPlayoutState()`는 하나의 액션에서 **의도와 상태를 동시에 설정**한다:

```typescript
// useOverlayStore.ts:176-189 — 현재 코드
case "program":
    updatePayload.is_active = true;       // 의도: "PGM에 올려라"
    updatePayload.animation_state = "in"; // 상태? 의도? 모호함
```

`animation_state` 필드는 이름은 "상태"지만, **Controller가 직접 설정**하므로 실제로는 "의도"에 가깝다. Renderer가 실제로 애니메이션을 완료했는지, 어떤 페이즈에 있는지는 아무도 모른다.

### 1.2 4개의 독립적 상태 머신

현재 시스템에는 **서로를 모르는** 4개의 애니메이션 상태 머신이 공존한다 (분석 문서 근본 원인 A):

| 위치 | 상태 표현 | 누가 설정하는가 |
|------|-----------|----------------|
| `overlay_state.animation_state` (DB) | `"idle"` / `"preview"` / `"in"` | **Controller** (`setPlayoutState`) |
| `render.tsx` `TrackState.phase` | `"enter"` / `"idle"` / `"exit"` | **Renderer** (Realtime 이벤트 핸들러) |
| `CompositorLayer` `AnimPhase` | `"entering"` / `"stable"` / `"leaving"` | **CompositorLayer** (자체 useEffect) |
| `AnimatedGraphicRenderer` `phase` prop | `"enter"` / `"exit"` / `"idle"` | **render.tsx** (prop drilling) |

이들은 각자 `useEffect` + `setTimeout` + `useRef`로 **수동 구현된 ad-hoc 상태 머신**이며, 서로의 상태를 알지 못한다.

### 1.3 3대 구체적 문제

**문제 A — Controller가 Renderer의 실제 상태를 모른다:**
운영자가 "PGM" 버튼을 눌렀을 때, Controller는 `is_active=true, animation_state="in"`을 즉시 쓴다. 하지만 Renderer가 실제로 fade-in을 완료했는지, 네트워크 지연으로 아직 시작도 안 했는지 알 수 없다. UI는 항상 "이미 송출 중"이라고 표시한다.

**문제 B — animation_state가 두 가지 의미로 사용된다:**
`previewOverlays` 필터는 `animation_state === "preview" OR is_active`로 작동한다. `animation_state="idle"`이면서 `is_active=true`인 불일치 상태가 발생할 수 있고(난점 #14), 이 경우 파생 상태의 정확성이 깨진다.

**문제 C — Renderer가 Controller에게 상태를 역으로 알려주는 채널이 없다:**
현재 Heartbeat는 "현재 표시 중인 item ID"만 보고한다. Renderer의 애니메이션 페이즈(`entering`/`stable`/`leaving`)는 Controller로 전달되지 않는다. Controller는 `animation_state`를 자신이 쓴 값 그대로 읽을 뿐이다.

---

## 2. CQRS 설계

### 2.1 핵심 아이디어

```
┌──────────────────────────────────────────────────────────────┐
│                     CQRS 패턴 적용                            │
│                                                              │
│  Command (의도)              Query (상태)                     │
│  ─────────────               ───────────                     │
│  "무엇을 원하는가"            "실제로 무엇이 일어나고 있는가"   │
│                                                              │
│  Controller WRITE            Renderer WRITE                  │
│  Controller READ (피드백)     Controller READ (피드백)         │
│  Renderer READ (액션 실행)    Renderer WRITE (상태 보고)       │
└──────────────────────────────────────────────────────────────┘
```

**Command 채널 — `is_active` (boolean)**
- **의미**: 운영자가 이 오버레이를 PGM에 표시하길 **의도**하는가
- **Writer**: Controller만 (`setPlayoutState`)
- **Reader**: Renderer (이 값을 보고 enter/exit 애니메이션 시작)

**Query 채널 — `render_state` (JSON object)**
- **의미**: Renderer가 **실제로** 현재 어떤 상태인가
- **Writer**: Renderer만 (`reportRenderState`)
- **Reader**: Controller (이 값을 읽어 UI에 실제 상태 표시)

> **왜 `animation_state`를 그대로 Query로 재활용하지 않는가?**
> 기존 `animation_state`는 `"preview"`라는 Controller 전용 개념이 섞여 있어 Renderer의 상태 표현으로 부적합하다. 새 `render_state` JSON 필드를 도입하여 Renderer 전용 상태 채널을 만든다.

### 2.2 데이터 흐름

```
시간 → ──────────────────────────────────────────────────────

[Controller]              [DB]                   [Renderer]
    │                       │                       │
    │  1. PGM 버튼 클릭      │                       │
    │  setPlayoutState()    │                       │
    │  is_active = true ──→ │                       │
    │                       │  Realtime ──────────→ │
    │                       │                       │ 2. is_active=true 감지
    │                       │                       │    fade-in 시작
    │                       │                       │    render_state = {
    │                       │                       │      phase: "entering",
    │                       │                       │      startedAt: ...
    │                       │                       │    }
    │                       │ ← reportRenderState ─ │
    │  Realtime ←────────── │                       │
    │  3. UI 업데이트        │                       │
    │  "진입 애니메이션 중"   │                       │
    │                       │                       │ 4. fade-in 완료
    │                       │                       │    render_state = {
    │                       │                       │      phase: "stable",
    │                       │                       │      settledAt: ...
    │                       │                       │    }
    │                       │ ← reportRenderState ─ │
    │  Realtime ←────────── │                       │
    │  5. UI 업데이트        │                       │
    │  "송출 중 (안정)"      │                       │
    │                       │                       │
    │  6. OFF 버튼 클릭      │                       │
    │  is_active = false ─→ │                       │
    │                       │  Realtime ──────────→ │
    │                       │                       │ 7. fade-out 시작
    │                       │                       │    render_state = {
    │                       │                       │      phase: "leaving"
    │                       │                       │    }
    │                       │ ← reportRenderState ─ │
    │  Realtime ←────────── │                       │
    │  8. UI 업데이트        │                       │
    │  "퇴장 애니메이션 중"   │                       │
    │                       │                       │ 9. fade-out 완료
    │                       │                       │    render_state = {
    │                       │                       │      phase: "idle"
    │                       │                       │    }
    │                       │ ← reportRenderState ─ │
    │  Realtime ←────────── │                       │
    │  10. UI 업데이트       │                       │
    │  "오프"                │                       │
```

### 2.3 타입 정의

```typescript
// ─── Command 필드 (Controller → Renderer) ─────────────────

/** is_active: 운영자의 PGM 송출 의도 (기존과 동일, 의미만 명확화) */
// boolean — true: "PGM에 표시하라", false: "표시 중단하라"

// ─── Query 필드 (Renderer → Controller) ────────────────────

interface RenderState {
  /** 현재 렌더링 페이즈 */
  phase: "idle" | "entering" | "stable" | "leaving";
  /** 마지막 페이즈 변경 시각 (ISO 8601) */
  phaseChangedAt: string;
  /** 애니메이션 시작 시각 (entering/leaving일 때만) */
  animationStartedAt?: string;
  /** 예상 애니메이션 완료 시각 */
  animationExpectedEndAt?: string;
  /** 현재 표시 중인 컨텍스트 */
  context: "pgm" | "none";
}
```

### 2.4 이전 `animation_state` 필드 처리

```
기존: animation_state = "idle" | "preview" | "in"
       ├── "preview" → Controller UI 상태 (PVW 패널 표시용)
       └── "in" → PGM에 올라가 있다는 의도 (is_active=true와 중복)

변경: 
  - "preview" 개념은 Controller 전용이므로 별도 필드로 분리하거나
    is_active=false + DB에 없어도 previewOverlays에 포함시키는 로직으로 대체
  - "in" → is_active=true 로 완전 대체
  - animation_state 필드는 점진적 제거 (마이그레이션 기간 동안 유지)
```

**실용적 접근 (점진적 마이그레이션):**
1. `render_state` JSON 필드를 DB에 추가 (nullable)
2. 기존 `animation_state`는 그대로 두고 Controller가 계속 쓸 수 있게 함
3. Renderer가 `render_state`를 쓰기 시작
4. Controller UI가 `render_state`를 읽기 시작
5. 충분히 안정화된 후 `animation_state`에서 `"in"` 제거 (is_active로 대체)
6. `"preview"`는 Controller 전용 프리뷰 상태로 분리

---

## 3. 영향받는 컴포넌트

### 3.1 useOverlayStore (핵심 변경)

```
변경 전:
  setPlayoutState("program") → is_active=true AND animation_state="in"

변경 후:
  setPlayoutState("program") → is_active=true ONLY (Command)
  
  추가: reportRenderState(overlayId, renderState) → render_state만 업데이트 (Query)
```

### 3.2 render.tsx (Renderer)

```
변경 전:
  Realtime "playout" 수신 → setTracks() 로컬 상태만 변경
  애니메이션 완료 → handleTrackExitComplete() 로컬 cleanup
  
변경 후:
  Realtime is_active=true 감지 → setTracks() + reportRenderState(phase: "entering")
  fade-in 완료 → reportRenderState(phase: "stable")
  Realtime is_active=false 감지 → reportRenderState(phase: "leaving")
  fade-out 완료 → reportRenderState(phase: "idle") + DB cleanup
```

### 3.3 CompositorLayer (Renderer)

```
변경 전:
  자체 AnimPhase 상태 머신, 외부에 상태 비공개
  
변경 후:
  entering 시작 → reportRenderState(phase: "entering")
  entering 완료 → reportRenderState(phase: "stable")
  leaving 시작 → reportRenderState(phase: "leaving")
  leaving 완료 → reportRenderState(phase: "idle")
```

### 3.4 Controller UI (OverlayCard / OverlayPanel)

```
변경 전:
  overlay.is_active → "PGM 송출 중" 표시
  overlay.animation_state → "preview"일 때 PVW 표시
  
변경 후:
  overlay.is_active → "PGM 의도 있음" (버튼 상태)
  overlay.render_state.phase → 실제 상태에 따른 UI 피드백:
    - "entering" → 초록색 점멸 "진입 중..."
    - "stable" → 초록색 고정 "송출 중"
    - "leaving" → 빨간색 점멸 "종료 중..."
    - "idle" → 회색 "오프"
```

---

## 4. 구현 단계

### Phase 4a: 타입 + DB 준비

1. `OverlayStateItem`에 `render_state?: RenderState | null` 추가
2. DB `overlay_state` 테이블에 `render_state` JSONB 컬럼 추가 (nullable)
3. `useOverlayStore`에 `reportRenderState()` 액션 추가
4. `loadOverlays()`가 `render_state`를 포함하도록 select 수정

### Phase 4b: Renderer가 상태 보고

1. `render.tsx`에서 `reportRenderState()` 호출 추가
   - `phase="enter"` → `phase: "entering"`
   - fade-in 완료(`onAnimationEnd`) → `phase: "stable"`
   - `phase="exit"` → `phase: "leaving"`
   - fade-out 완료(`handleTrackExitComplete`) → `phase: "idle"`
2. `CompositorLayer`에서 `reportRenderState()` 호출 추가
   - entering 타이머 시작 → `phase: "entering"`
   - entering → stable 전환 → `phase: "stable"`
   - leaving 타이머 시작 → `phase: "leaving"`
   - leaving cleanup 완료 → `phase: "idle"`

### Phase 4c: Controller UI 연동

1. OverlayCard에서 `render_state.phase`에 따른 시각적 피드백
2. OverlayPanel에서 실제 렌더링 상태 기반 필터링/정렬

### Phase 4d: animation_state 정리

1. `setPlayoutState`에서 `animation_state` 설정 제거 (is_active만 사용)
2. `previewOverlays` 필터를 `render_state` 기반으로 전환
3. 구버전 `animation_state` 필드 deprecated 마킹

---

## 5. 트레이드오프

| 장점 | 단점 |
|------|------|
| Controller가 실제 렌더링 상태를 알 수 있음 | DB 쓰기 2배 증가 (is_active + render_state) |
| 불가능한 상태 제거 (is_active=true + idle은 비정상) | Realtime 이벤트 2배 증가 |
| 디버깅 용이성 — 누가 무엇을 설정했는지 명확 | 마이그레이션 기간 동안 animation_state와 render_state 공존 |
| 장애 감지 — Renderer가 3초 내 render_state 미갱신 시 다운 감지 | |

---

## 6. 관련 문서

- `docs/ANIMATION_STATE_SYNC_ANALYSIS.md` — 17개 난점 종합 분석 (특히 #7, #10, #12, #14)
- `docs/HANDOVER.md` — Phase 4 작업 컨텍스트
- `webcg-k/src/hooks/useOverlayStore.ts` — SSOT 훅 (현재 구현)
- `webcg-k/src/routes/render.tsx` — OBS 렌더러
- `webcg-k/src/components/Compositor/CompositorLayer.tsx` — 오버레이 합성기
