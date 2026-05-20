# 🎓 오버레이 렌더링 시스템 리팩토링 — 학습 가이드

> **난이도**: ⭐⭐⭐ (중급~고급)
> **선수 지식**: React Hook, useEffect, Supabase Realtime, iframe postMessage
> **학습 목표**: "같은 데이터를 여러 컴포넌트가 공유할 때 어떻게 설계하는가?"

---

## 📖 목차

1. [문제 이해 — 왜 리팩토링이 필요했나?](#1-문제-이해)
2. [핵심 개념 — Single Source of Truth](#2-핵심-개념)
3. [패턴 학습 — Optimistic Update](#3-패턴-학습)
4. [코드 해설 — useOverlayStore](#4-코드-해설-useoverlaystore)
5. [코드 해설 — CompositorLayer](#5-코드-해설-compositorlayer)
6. [변경 전후 비교 — 한눈에 보기](#6-변경-전후-비교)
7. [연습 문제](#7-연습-문제)

---

## 1. 문제 이해

### 🏠 일상 비유: "같은 신문을 3명이 각각 배달 시키는 집"

집에 아빠, 엄마, 나 — 3명이 살고 있다.
3명 모두 같은 조선일보를 읽고 싶다.

**리팩토링 전**: 3명이 각각 배달을 시킨다.
- 배달 트럭이 3번 온다 (네트워크 비용 3배)
- 각자 자기 신문만 보니까 "아빠가 읽은 페이지"를 엄마는 모른다 (상태 불일치)
- 한 명이 구독 해지하면 다른 사람 신문도 끊길 수 있다 (채널 충돌)

**리팩토링 후**: 1부만 시켜서 거실 탁자에 놓고 돌려 읽는다.
- 배달 1번 (네트워크 비용 1/3)
- 누가 읽든 같은 최신 판 (상태 일관성)
- 한 명이 안 읽어도 신문은 거실에 있다 (독립성)

### 🔧 실제 코드에서의 문제

```
Before (6~9개 Realtime 채널):

┌─ OverlayPanel ──────── Realtime ① ── SELECT * ──┐
│                                                   │
├─ OverlayPlayoutLayer (PVW) ── Realtime ② ── SELECT * ──┤
├─ OverlayPlayoutLayer (PGM) ── Realtime ③ ── SELECT * ──┤  같은 DB를
│                                                   │  6~9번 조회!
├─ PluginOverlayLayer (PVW) ── Realtime ④ ── SELECT * ──┤
├─ PluginOverlayLayer (PGM) ── Realtime ⑤ ── SELECT * ──┤
├─ PluginOverlayLayer (render) ── Realtime ⑥ ── SELECT * ──┘
```

```
After (1개 Realtime 채널):

                    ┌── OverlayPanel (카드 UI)
                    │
  Realtime ① ── useOverlayStore ── CompositorLayer (PVW)
                    │
                    ├── CompositorLayer (PGM)
                    │
                    └── CompositorLayer (render.tsx)
```

---

## 2. 핵심 개념

### 📌 Single Source of Truth (단일 진실점)

> **정의**: 어떤 데이터가 **딱 한 곳에서만 관리**되는 설계 원칙.

React에서 흔히 겪는 문제:

```tsx
// ❌ 나쁜 예: 같은 데이터를 여러 컴포넌트가 각자 관리
function ComponentA() {
  const [users, setUsers] = useState([]);
  useEffect(() => { fetchUsers().then(setUsers); }, []);
}

function ComponentB() {
  const [users, setUsers] = useState([]);  // 또 fetching!
  useEffect(() => { fetchUsers().then(setUsers); }, []);
}
```

```tsx
// ✅ 좋은 예: 한 곳에서 관리하고, 나머지는 참조만
function useUserStore() {
  const [users, setUsers] = useState([]);
  useEffect(() => { fetchUsers().then(setUsers); }, []);
  return { users };
}

function ComponentA() {
  const { users } = useUserStore();  // 같은 데이터 참조
}
```

### 📌 useMemo — 파생 상태 (Derived State)

> "원본 데이터에서 **계산으로 얻을 수 있는** 데이터는 별도 state로 만들지 않는다."

```tsx
// ❌ 나쁜 예: 필터링 결과를 별도 state로 관리
const [allOverlays, setAllOverlays] = useState([]);
const [activeOverlays, setActiveOverlays] = useState([]);  // 동기화 필요!

// ✅ 좋은 예: useMemo로 파생
const [allOverlays, setAllOverlays] = useState([]);
const activeOverlays = useMemo(
  () => allOverlays.filter(o => o.is_active),
  [allOverlays],  // allOverlays가 변할 때만 재계산
);
```

우리 코드에서:
```tsx
// useOverlayStore.ts
const svgOverlays = useMemo(
  () => overlays.filter(o => o.template?.plugin_type !== "html"),
  [overlays],
);
const htmlOverlays = useMemo(
  () => overlays.filter(o => o.template?.plugin_type === "html"),
  [overlays],
);
const programOverlays = useMemo(
  () => overlays.filter(o => o.is_active),
  [overlays],
);
```

**Why?** `overlays` 하나만 관리하면 `svgOverlays`, `htmlOverlays`, `programOverlays`는
자동으로 최신 상태를 유지한다. 별도 setState가 필요 없다.

---

## 3. 패턴 학습

### 📌 Optimistic Update (낙관적 업데이트)

> "서버 응답을 **기다리지 않고** 먼저 UI를 업데이트한다. 실패하면 되돌린다."

**일상 비유**: 카페에서 커피를 주문하고 자리에 앉는다. 주문이 실패하면 다시 카운터에 간다.
주문 성공 확인을 기다리며 카운터 앞에 서 있지 않는다.

```
기존 흐름 (비관적, Pessimistic):
  버튼 클릭 → DB UPDATE → (대기 1~3초) → Realtime 이벤트
  → DB SELECT → (대기 0.5초) → setState → UI 업데이트
  총: 1.5~3.5초 지연

개선 흐름 (낙관적, Optimistic):
  버튼 클릭 → ① setState (즉시 UI 반영, 0ms)
             → ② DB UPDATE (비동기, 백그라운드)
             → 실패 시: 원래 상태로 복원
  총: 즉시 반영
```

우리 코드에서:
```tsx
// useOverlayStore.ts — updateReplicantData
const updateReplicantData = useCallback(async (overlayId, data) => {
  // 1. 즉시 로컬 반영 (UI가 바로 바뀜)
  setOverlays(prev =>
    prev.map(o =>
      o.id === overlayId
        ? { ...o, replicant_data: data }
        : o,
    ),
  );

  // 2. DB 저장 (백그라운드, 실패해도 UI는 이미 업데이트됨)
  const { error } = await supabase
    .from("overlay_state")
    .update({ replicant_data: data })
    .eq("id", overlayId);

  if (error) {
    // 실패 시 DB에서 다시 로드하여 복원
    loadOverlays();
  }
}, []);
```

### 📌 채널명 충돌 문제 (Realtime Anti-Pattern)

```tsx
// ❌ 위험: 같은 채널명으로 여러 컴포넌트가 구독
// PVW 모니터에서:
supabase.channel(`overlay:${sessionId}`).subscribe();  // 채널 A

// PGM 모니터에서:
supabase.channel(`overlay:${sessionId}`).subscribe();  // 같은 이름!

// PVW가 언마운트되면:
channel.unsubscribe();  // PGM의 채널도 함께 끊김!
```

```tsx
// ✅ 안전: 고유 채널명 사용
supabase.channel(`overlay-pvw:${sessionId}:${randomId}`).subscribe();
supabase.channel(`overlay-pgm:${sessionId}:${randomId}`).subscribe();

// 하지만 더 좋은 해결: 구독 자체를 1개로 통합 (useOverlayStore)
```

---

## 4. 코드 해설 — useOverlayStore

파일: `src/hooks/useOverlayStore.ts`

### 구조 다이어그램

```
useOverlayStore(sessionId)
│
├── State
│   └── overlays: OverlayStateItem[]     ← 유일한 원본 상태
│
├── Derived (useMemo)
│   ├── svgOverlays      ← overlays에서 plugin_type !== "html" 필터
│   ├── htmlOverlays     ← overlays에서 plugin_type === "html" 필터
│   ├── previewOverlays  ← animation_state="preview" OR is_active
│   └── programOverlays  ← is_active=true만
│
├── Effects
│   └── Realtime 구독 1개  ← overlay_state 변경 → loadOverlays()
│
└── Actions
    ├── setPlayoutState()      ← OFF/PVW/PGM 전환
    ├── updateReplicantData()  ← 대시보드 값 변경 (즉시 반영!)
    ├── addOverlay()           ← 세션에 오버레이 추가
    ├── removeOverlay()        ← 세션에서 오버레이 제거
    └── executeAction()        ← 액션 버튼 실행
```

### 핵심 코드 라인별 해설

```tsx
// ─── 초기 로드 + Realtime 구독 ────────────────────
useEffect(() => {
    if (!sessionId) return;       // sessionId 없으면 아무것도 안 함

    setLoading(true);
    loadOverlays()                // 1. DB에서 최초 로드
      .then(() => setLoading(false));

    // 2. Realtime 구독 — 다른 사용자의 변경도 감지
    const channel = supabase
        .channel(`overlay-store:${sessionId}`)  // 고유한 채널명
        .on("postgres_changes", {
            event: "*",                         // INSERT/UPDATE/DELETE 모두
            table: "overlay_state",
            filter: `session_id=eq.${sessionId}`,
        }, () => {
            loadOverlays();                     // 변경 감지 → 다시 로드
        })
        .subscribe();

    return () => channel.unsubscribe();         // 컴포넌트 언마운트 시 정리
}, [sessionId]);
```

**Why `loadOverlays()` 재호출?**
Realtime 이벤트의 `payload.new`에는 `template` JOIN 데이터가 없다.
`overlay_state`에 FK로 연결된 `overlay_templates` 정보가 필요하므로,
이벤트 payload 직접 사용 대신 JOIN 포함 SELECT를 다시 실행한다.

---

## 5. 코드 해설 — CompositorLayer

파일: `src/components/Compositor/CompositorLayer.tsx`

### "왜 SVG와 HTML iframe을 하나로 합쳤나?"

두 렌더러의 공통점:
1. **위치 계산**: `zone_bounds` → CSS `%` 변환 (동일 로직)
2. **애니메이션**: entering → stable → leaving 페이즈 (동일 패턴)
3. **z-index**: `template.layer` 기반 정렬 (동일)

차이점은 **렌더링 방식**뿐:
- SVG: `<GraphicPreviewRenderer elements={...} />`
- HTML: `<iframe srcDoc={...} />`

```
CompositorLayer
│
├── 공통 로직
│   ├── 위치 계산: getPositionStyle(zone_bounds)
│   ├── 애니메이션: getAnimation(phase, animConfig)
│   └── 페이즈 관리: entering → stable → leaving
│
├── SvgOverlayLayer     ← plugin_type !== "html"
│   └── <GraphicPreviewRenderer />
│
└── HtmlIframeLayer      ← plugin_type === "html"
    └── <iframe srcDoc={...} />
        ├── 1920×1080 고정 크기
        ├── ResizeObserver → CSS transform: scale()
        └── postMessage(REPLICANT_UPDATE)
```

### 애니메이션 페이즈 생명주기

```
오버레이가 programOverlays에 추가됨
  → entering (fadeIn 애니메이션 재생)
  → setTimeout(duration)
  → stable (정적 표시)

오버레이가 programOverlays에서 제거됨
  → leaving (fadeOut 애니메이션 재생)
  → setTimeout(duration)
  → 컴포넌트 언마운트
```

### iframe 비율 유지 — "왜 1920×1080 고정 + scale?"

```
에디터에서 디자인 시:    1920px × 1080px (원본 크기)
PVW 모니터 크기:        ~400px × ~225px

방법 1 (❌): width: 100%, height: 100%
  → CSS가 400px 기준으로 레이아웃 → 비율 왜곡!

방법 2 (✅): 1920×1080 고정 + transform: scale(0.208)
  → CSS는 항상 1920px 기준 → 에디터와 동일 비율
  → 눈에 보이는 크기만 축소 (내부 레이아웃 보존)
```

```tsx
// ResizeObserver로 컨테이너 크기 감시
const observer = new ResizeObserver((entries) => {
  const { width, height } = entries[0].contentRect;
  // 컨테이너에 맞는 축소 비율 계산
  setScale(Math.min(width / 1920, height / 1080));
});

// iframe에 scale 적용
<iframe
  style={{
    width: "1920px",         // 원본 크기 고정
    height: "1080px",
    transformOrigin: "top left",
    transform: `scale(${scale})`,  // 축소만
  }}
/>
```

---

## 6. 변경 전후 비교

### 파일 구조

```
Before (3개 독립 컴포넌트):
  src/components/Controller/OverlayPlayoutLayer.tsx  (380줄, SVG 전용)
  src/components/Overlay/PluginOverlayLayer.tsx       (357줄, HTML 전용)
  src/components/Controller/OverlayPanel.tsx          (자체 Realtime 구독)

After (1개 훅 + 1개 통합 렌더러):
  src/hooks/useOverlayStore.ts                        (단일 진실점)
  src/components/Compositor/CompositorLayer.tsx        (SVG + HTML 통합)
  src/components/Controller/OverlayPanel.tsx           (store 사용, 자체 구독 제거)
```

### 컨트롤러 페이지 (PVW/PGM 모니터)

```tsx
// Before: 모니터마다 2개씩, 총 4개 컴포넌트
<OverlayPlayoutLayer sessionId={sessionId} mode="preview" />
<PluginOverlayLayer sessionId={sessionId} mode="preview" />
// ...
<OverlayPlayoutLayer sessionId={sessionId} mode="pgm" />
<PluginOverlayLayer sessionId={sessionId} mode="program" />

// After: 모니터마다 1개씩, 총 2개 (데이터는 store에서 공유)
<CompositorLayer overlays={previewOverlays} />
// ...
<CompositorLayer overlays={programOverlays} />
```

### 데이터 전달 속도

```
Before: 대시보드 값 변경 → DB UPDATE → Realtime (1~3초) → DB SELECT → setState
        → replicantJson 변경 → useEffect → postMessage
        = 총 1.5~4초

After:  대시보드 값 변경 → setOverlays (즉시) → replicantJson 변경 → postMessage
        + DB UPDATE (백그라운드)
        = 즉시 반영
```

---

## 7. 연습 문제

### Q1. 왜 `useOverlayStore`를 React Context 대신 일반 Hook으로 만들었나?

<details>
<summary>정답 보기</summary>

컨트롤러 페이지(`$sessionId.tsx`)와 렌더러 페이지(`render.tsx`)는 **완전히 다른 페이지**이므로
React Context를 공유할 수 없다. 각 페이지에서 독립적으로 `useOverlayStore`를 호출하고,
각각이 자체 Realtime 채널을 구독한다.

같은 페이지 내에서는 컨트롤러 레벨에서 한 번만 호출하고 props로 전달하여 중복 구독을 방지한다.

결과: 컨트롤러 1개 + 렌더러 1개 = **총 2개** Realtime 채널 (기존 6~9개에서 대폭 감소).

</details>

### Q2. `removeOverlay()`에서 왜 DB 삭제 전에 로컬 상태를 먼저 변경하나?

<details>
<summary>정답 보기</summary>

**Optimistic Update** 패턴.
DB 삭제는 네트워크 왕복이 필요하므로 0.5~2초 걸릴 수 있다.
그 사이에 삭제된 오버레이가 UI에 남아있으면 사용자가 "안 지워지네?" 하고 다시 클릭할 수 있다.

```tsx
// 1. 먼저 UI에서 즉시 제거 (사용자 체감: 즉시 삭제)
setOverlays(prev => prev.filter(o => o.id !== overlayId));

// 2. 그 다음 DB에서 실제 삭제 (백그라운드)
const { error } = await supabase.from("overlay_state").delete().eq("id", overlayId);

// 3. 만약 DB 삭제가 실패하면? → 다시 로드하여 원래 상태로 복원
if (error) loadOverlays();
```

</details>

### Q3. `CompositorLayer`에서 `leaving` 페이즈는 왜 필요한가?

<details>
<summary>정답 보기</summary>

오버레이가 `programOverlays`에서 빠지면 React는 즉시 컴포넌트를 언마운트한다.
하지만 **fadeOut 애니메이션**을 보여주려면, 컴포넌트가 **사라지기 전에 잠깐 남아있어야** 한다.

```
is_active = false → programOverlays에서 제거
  → BUT! 바로 언마운트하면 "뿅" 사라짐
  → leaving 페이즈로 전환 → fadeOut 애니메이션 재생
  → setTimeout(outDuration) → 애니메이션 끝
  → 그제서야 진짜 언마운트
```

이것이 `leavingOverlays` Map이 필요한 이유다.
`programOverlays`에서는 이미 빠졌지만, `leavingOverlays`에 보존하여
fadeOut 애니메이션이 완료될 때까지 렌더링을 유지한다.

</details>

---

## 🔗 관련 파일

| 파일 | 역할 |
|------|------|
| [`useOverlayStore.ts`](../../src/hooks/useOverlayStore.ts) | 단일 진실점 Hook |
| [`CompositorLayer.tsx`](../../src/components/Compositor/CompositorLayer.tsx) | 통합 렌더러 |
| [`OverlayPanel.tsx`](../../src/components/Controller/OverlayPanel.tsx) | 컨트롤러 UI |
| [`$sessionId.tsx`](../../src/routes/controller/$sessionId.tsx) | 컨트롤러 페이지 (store 호출) |
| [`render.tsx`](../../src/routes/render.tsx) | OBS 렌더러 (독립 store) |
