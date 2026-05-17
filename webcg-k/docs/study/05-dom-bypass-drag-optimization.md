# DOM 직접 조작 드래그 최적화 — 심층 분석

> **주제**: 드래그 중 React reconciliation을 우회하고 DOM을 직접 조작하여 60fps 렌더링 달성
> **참고**: Figma, Excalidraw의 부드러운 드래그 렌더링 비결

---

## 1. 현재 드래그 이벤트 흐름

```
mouseMove (60fps, ~16ms 간격)
  ↓
getCanvasCoords(e)           ← sceneMath.ts (이미 최적화됨)
  ↓
snapping 계산                 ← collectSnapLines + snapBoundingBox
  ↓
onUpdate(id, { x, y })       ← GraphicsEditor 호출
  ↓
setElements(draft => {...})   ← Mutative create() → patches 생성
  ↓
React reconciliation          ← 전체 트리 재조정 (⚠️ 병목)
  ↓
SVG DOM 업데이트              ← 실제 페인트
  ↓
InteractionLayer 업데이트     ← selection box 이동
```

**문제**: 매 16ms마다 React reconciliation이 발생. 50개 요소가 있는 캔버스에서 모든 요소를 reconciliation.

**측정 지표** (예상):
- Reconciliation 시간: ~4-8ms (요소 50개 기준)
- 페인트 시간: ~2-3ms
- **총 프레임 예산 16ms 중 ~6-11ms 소비** → 60fps 달성 불가능 (드롭 프레임 발생)

---

## 2. 최적화 전략: Bypass React During Drag

### 핵심 아이디어

```
mouseDown: 드래그 시작 → dragRef 저장, dragGhost 표시
mouseMove: React 우회 → ghost DOM 직접 조작 (setProperty)
mouseUp:   React 커밋 → onUpdate() 1회 호출 → Store 1회 갱신
```

### 접근법 비교

#### 접근법 A: SVG DOM 직접 조작

```typescript
// mouseMove: React 우회
const node = svgRef.current.querySelector(`[data-id="${id}"]`);
node?.setAttribute('transform', `translate(${dx}, ${dy})`);

// mouseUp: transform 제거 후 React에 최종 위치 커밋
node?.removeAttribute('transform');  // 원래 위치로 복원
onUpdate(id, { x: finalX, y: finalY });  // React 1회 리렌더
```

**장점**: 진정한 60fps, SVG 네이티브 transform GPU 가속
**단점**: React가 관리하는 DOM을 외부 수정 → React-DOM 불일치 위험, SVG 노드 찾기 비용

#### 접근법 B: InteractionLayer Drag Ghost (권장)

Phase 3에서 만든 InteractionLayer 활용. 드래그 중 실제 요소 대신 HTML ghost를 표시.

```typescript
// InteractionLayer에 dragGhost 상태 + ref 추가
const ghostRef = useRef<HTMLDivElement>(null);

// mouseMove: ghost DOM 직접 조작 (React 완전 우회)
ghostRef.current.style.transform = 
  `translate(${newX * zoom}px, ${newY * zoom}px) rotate(${el.rotation}deg)`;
ghostRef.current.style.opacity = '0.6';  // 반투명

// mouseUp: ghost 숨김 + Store에 최종 좌표 1회 커밋
ghostRef.current.style.display = 'none';
onUpdate(id, { x: finalX, y: finalY });  // 단 1회 React 리렌더
```

**장점**:
- 실제 SVG 요소 건드리지 않음 → React-DOM 불일치 없음
- InteractionLayer는 HTML 기반 → CSS transform GPU 가속
- Ghost는 단일 div → DOM 조작 비용 0에 가까움
- `pointerEvents: "none"` → 드래그 중 이벤트 간섭 없음

**단점**:
- Ghost는 시각적 근사 (복잡한 SVG 필터/그라데이션 재현 어려움)
- 그룹 드래그 시 자식 요소들도 Ghost에 합성해야 함

---

## 3. WebCG-K 적용 가능성 평가

### ✅ 즉시 적용 가능

| 요소 타입 | Ghost 구현 방법 | 난이도 |
|----------|---------------|--------|
| **rect** | HTML div: `background + border + borderRadius` | 하 |
| **ellipse** | HTML div: `borderRadius: 50%` | 하 |
| **text** | HTML span: `fontFamily, fontSize, color` | 중 |
| **html_plugin** | 이미 HTML div → 원본 iframe 그대로 사용 가능 | 하 |

### ⚠️ 조건부 적용

| 요소 타입 | 제한 사항 | 해결 방안 |
|----------|---------|----------|
| **image** | src 복제 필요 | Ghost div에 `backgroundImage: url(${el.src})` |
| **group** | 자식 요소 합성 | Ghost div 내에 자식 Ghost 중첩 |
| **SVG 필터 적용 요소** | CSS로 동등 효과 구현 | 그림자 → `box-shadow`, glow → 생략 가능 |

### ❌ 제한 사항

- 복잡한 SVG 필터 체인(inner shadow + glow + drop shadow)은 CSS로 완벽 재현 불가
- Ghost는 드래그 중 시각적 피드백이므로 100% 정밀도는 불필요

---

## 4. 구현 로드맵

### Step 1: InteractionLayer에 DragGhost 추가

```typescript
// InteractionLayer.tsx에 추가
interface DragGhostData {
  id: string;
  x: number; y: number;
  width: number; height: number;
  rotation: number;
  fill?: string;
  type: "rect" | "ellipse" | "text";
  content?: string;
  fontFamily?: string;
  fontSize?: number;
  src?: string;  // image
}

// 드래그 중인 요소의 Ghost를 HTML div로 렌더링
// ref로 직접 DOM 조작
export const dragGhostRef = { current: null as HTMLDivElement | null };
```

### Step 2: Canvas.tsx mouseMove에서 React 우회 로직 추가

```typescript
// mouseMove 내부
if (dragging && dragGhostRef.current) {
  const dx = coords.x - dragging.startX;
  const dy = coords.y - dragging.startY;
  const newX = dragging.elStartX + dx;
  const newY = dragging.elStartY + dy;

  // 각종 스냅 계산 (React state 건드리지 않음)
  const snapLines = collectSnapLines(...);
  const snap = snapBoundingBox(...);
  const finalX = snap.snappedX ?? newX;
  const finalY = snap.snappedY ?? newY;

  // Ghost DOM 직접 조작 (React 우회)
  dragGhostRef.current.style.transform = 
    `translate(${finalX * scale}px, ${finalY * scale}px) rotate(${el.rotation}deg)`;
  
  // 스냅 가이드도 직접 DOM 조작
  updateSnapGuidesDOM(snap.activeVertical, snap.activeHorizontal);

  return; // ← React state update 스킵
}

// mouseUp
if (dragGhostRef.current) {
  dragGhostRef.current.style.display = "none";
  onUpdate(dragging.id, { 
    x: Math.round(finalX), 
    y: Math.round(finalY) 
  }); // ← 여기서만 React state 업데이트 (1회)
}
```

### Step 3: 성능 측정

```javascript
// Chrome DevTools Performance 탭에서:
// Before: mouseMove 이벤트당 6-11ms → 60fps 불가
// After:  mouseMove 이벤트당 0.5-1ms → 60fps 충분히 가능
// mouseUp: 단 1회 React reconciliation 4-8ms → 사용자 체감 없음
```

---

## 5. 결론

**적용 가능**: ✅ WebCG-K에 충분히 적용 가능

**권장 접근법**: 접근법 B (InteractionLayer Drag Ghost)

**이유**:
1. Phase 3에서 구축한 InteractionLayer가 이 최적화의 기반 인프라를 이미 제공
2. HTML div 기반 Ghost는 CSS transform으로 GPU 가속 → 0.1ms 수준의 DOM 조작
3. React reconciliation을 mouseUp 1회로 제한 → 드래그 중 60fps 보장
4. SVG 요소/React 상태를 건드리지 않아 버그 위험 최소화
5. 대부분의 방송 그래픽 요소(rect, text)는 HTML로 Ghost 재현이 간단

**예상 성능 개선**:
- 드래그 중 React reconciliation: 60회/초 → **0회/초**
- 드래그 중 DOM 업데이트: 60회 전체 SVG → **1회 HTML div만**
- 프레임 드롭: 현재 60fps 불가 → **안정적 60fps**
