# 🧪 바이브 코더를 위한 React & Vitest 테스트 실전 입문서
> **"테스트 코드는 내가 짠 코드가 6개월 뒤의 나, 그리고 동료들에게 보내는 가장 확실한 러브레터이자 보험 증서입니다."**

바이브 코딩(Vibe Coding)은 직관적이고 빠르게 프로토타입을 만들 때 강력합니다. 하지만 코드베이스가 8만 라인을 넘어서는 순간, 한 곳을 고쳤을 때 엉뚱한 다른 곳이 깨지는 **"회귀(Regression) 공포"**가 시작됩니다. 이 공포를 완벽히 걷어내는 것이 바로 자동화 테스트입니다.

---

## 🚗 1. 파인만 기법으로 이해하는 테스트의 본질

### 1단계: 자동차 공장의 안전 검사소 (초보자 비유)
자동차가 조립 라인에서 완성될 때마다 엔지니어가 직접 문을 1,000번 열어보고, 시속 100km로 벽에 부딪혀보며 안전한지 확인(수동 테스트)한다고 상상해 보세요. 
- 시간도 오래 걸리고, 검사할 때마다 자동차가 부서집니다.
- **자동화 테스트**는 자동차가 라인을 통과할 때마다 자동으로 문을 1초에 1,000번 여닫아보고, 가상 벽 충돌 센서 데이터를 0.1초 만에 스캔하는 **"로봇 검사 장비"**를 공장에 설치하는 것과 같습니다.

### 2단계: 전문 용어로 이해하는 테스트 아키텍처
소프트웨어 테스트는 크게 3가지로 나뉩니다.

```
┌─────────────────────────────────────────────────────────┐
│              E2E Test (Playwright, Cypress)              │ <- 전체 공장 시연 (브라우저 열고 시나리오 테스트)
├─────────────────────────────────────────────────────────┤
│    Integration Test (React Testing Library + jsdom)     │ <- 엔진과 변속기 조립 검사 (컴포넌트 간 상호작용)
├─────────────────────────────────────────────────────────┤
│              Unit Test (Vitest, Jest)                   │ <- 나사 하나, 톱니바퀴 하나의 강도 검사 (함수/클래스)
└─────────────────────────────────────────────────────────┘
```

1. **단위 테스트 (Unit Test)**:
   - 하나의 함수, 클래스, 혹은 커스텀 훅(`useHistory` 등)이 입력값에 대해 올바른 출력값을 반환하는지 독립적으로 검사합니다.
   - 외부 의존성(DB, API)이 없고 실행 속도가 마이크로초(µs) 단위로 매우 빠릅니다.
2. **통합 테스트 (Integration Test)**:
   - 여러 모듈이나 컴포넌트(`Canvas` + `Toolbar` 등)가 결합했을 때 올바르게 상호작용하는지 검사합니다.
   - 브라우저를 띄우지 않고, **가상 브라우저 환경(jsdom)**에서 DOM 이벤트(클릭, 드래그)를 모사하여 검사합니다.
3. **E2E 테스트 (End-to-End Test)**:
   - 실제 크롬/사파리 브라우저를 실행하여 사용자가 로그인을 하고 오버레이를 편집하고 저장하는 전체 유저 시나리오를 검증합니다.

---

## 🛠 2. 우리 프로젝트의 3대 테스트 무기

우리 WebCG-K 프로젝트에는 이미 세계적인 표준 테스트 도구들이 설치되어 있습니다.

```
┌────────────────────────────────────────────────────────────────┐
│                   React Testing Library                        │ <- "사용자 관점의 렌더링 및 클릭/입력 에뮬레이터"
├────────────────────────────────────────────────────────────────┤
│                          jsdom                                 │ <- "Node.js 내부에 구현된 브라우저 메모리 모사 모듈"
├────────────────────────────────────────────────────────────────┤
│                         Vitest                                 │ <- "테스트 코드를 찾아 실행하는 초고속 실행 엔진"
└────────────────────────────────────────────────────────────────┘
```

1. **Vitest (Test Runner / Assertion)**:
   - 프로젝트 내의 `*.test.ts` 혹은 `*.test.tsx` 파일을 자동으로 찾아 실행해 주는 **엔진**입니다.
   - `expect(결과).toBe(예상값)`와 같이 코드의 동작을 확정짓는 **단언(Assertion)** 도구를 제공합니다.
2. **jsdom (Virtual Browser)**:
   - Node.js 환경에는 원래 `window`, `document`, `HTMLElement` 같은 웹 브라우저 API가 없습니다.
   - jsdom은 메모리 상에 가짜 브라우저 DOM을 구현하여, Node.js 환경에서도 React 컴포넌트를 그리고 테스트할 수 있게 돕는 **가상 비서**입니다.
3. **React Testing Library (RTL - Component Tester)**:
   - "구현 세부사항(컴포넌트 내부 State)"이 아니라 **"사용자가 화면에서 보는 것(DOM)"**을 기준으로 테스트하도록 유도하는 철학적 도구입니다.
   - *"이 컴포넌트의 state가 A인가?"*를 묻지 않고, *"사용자가 삭제 버튼을 눌렀을 때 화면에서 해당 요소가 사라졌는가?"*를 테스트합니다.

---

## 📝 3. 실전 코드 템플릿으로 배우는 작성법

### 예제 1: 순수 상태/로직 단위 테스트 (`useHistory.test.ts`)
React 컴포넌트 없이 pure 자바스크립트/타입스크립트 훅만 테스트하는 예제입니다. `@testing-library/react`의 `renderHook`을 사용합니다.

```typescript
// src/components/GraphicsEditor/hooks/__tests__/useHistory.test.ts
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHistory } from "../useHistory";

describe("useHistory Hook 단위 테스트", () => {
    it("초기 상태가 올바르게 설정되어야 한다", () => {
        const initial = [{ id: "1", name: "사각형" }];
        // 1. Hook 렌더링
        const { result } = renderHook(() => useHistory(initial));

        // 2. 현재 상태 검증
        expect(result.current.state).toEqual(initial);
        expect(result.current.canUndo).toBe(false);
        expect(result.current.canRedo).toBe(false);
    });

    it("상태를 업데이트하면 히스토리에 저장되어야 하고 Undo가 가능해야 한다", () => {
        const { result } = renderHook(() => useHistory<string>("A"));

        // 3. 상태 변경 실행 (React State를 바꿀 때는 반드시 act로 감싸야 함)
        act(() => {
            result.current.setState("B");
        });

        expect(result.current.state).toBe("B");
        expect(result.current.canUndo).toBe(true);

        // 4. 실행 취소(Undo)
        act(() => {
            result.current.undo();
        });

        expect(result.current.state).toBe("A");
        expect(result.current.canRedo).toBe(true);
    });
});
```

---

### 예제 2: 컴포넌트 렌더링 및 조작 테스트 (`Canvas.test.tsx`)
가상 DOM에 컴포넌트를 그리고 사용자의 드래그 이벤트를 흉내 내는 통합 테스트 예제입니다.

```tsx
// src/components/GraphicsEditor/Canvas/__tests__/Canvas.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Canvas } from "../Canvas";
import type { GraphicElement } from "@/routes/dashboard/studio/graphics/$graphicId";

describe("Canvas 컴포넌트 통합 테스트", () => {
    const mockElements: GraphicElement[] = [
        {
            id: "el-rect-1",
            type: "rect",
            name: "사각형 1",
            x: 100,
            y: 100,
            width: 150,
            height: 100,
            rotation: 0,
            opacity: 1,
            visible: true,
            locked: false,
            zIndex: 1,
            parentId: null,
        }
    ];

    it("도형 요소가 가상 DOM 내에 올바르게 SVG로 렌더링되어야 한다", () => {
        // 1. 콜백 함수 모킹(가짜 함수 제공)
        const handleSelect = vi.fn();
        const handleUpdate = vi.fn();

        // 2. 컴포넌트 가상 DOM에 렌더링
        render(
            <Canvas
                elements={mockElements}
                selectedIds={[]}
                onSelect={handleSelect}
                onUpdate={handleUpdate}
                gridTemplateId={null}
                onGridTemplateChange={vi.fn()}
                canvasWidth={1920}
                canvasHeight={1080}
                zoom={1}
                activeTool="select"
                onAddElement={vi.fn()}
            />
        );

        // 3. 사용자가 보게 될 라벨 텍스트가 화면에 존재하는지 검증
        const label = screen.getByText("사각형 1");
        expect(label).toBeInTheDocument();
    });

    it("도형 요소를 클릭하면 선택(onSelect) 콜백이 트리거되어야 한다", () => {
        const handleSelect = vi.fn();
        render(
            <Canvas
                elements={mockElements}
                selectedIds={[]}
                onSelect={handleSelect}
                onUpdate={vi.fn()}
                gridTemplateId={null}
                onGridTemplateChange={vi.fn()}
                canvasWidth={1920}
                canvasHeight={1080}
                zoom={1}
                activeTool="select"
                onAddElement={vi.fn()}
            />
        );

        // 4. 요소를 찾아 마우스 다운 클릭 시뮬레이션
        const elementWrapper = screen.getByText("사각형 1").closest("g");
        expect(elementWrapper).not.toBeNull();

        fireEvent.mouseDown(elementWrapper!);

        // 5. 콜백이 특정 인자("el-rect-1")를 물고 호출되었는지 검증
        expect(handleSelect).toHaveBeenCalledWith(["el-rect-1"]);
    });
});
```

---

## 🏃 4. 실전 테스트 실행 워크플로우

터미널에서 테스트를 돌리고 디버깅하는 방법은 매우 간단합니다.

### 1단계: 테스트 실행
프로젝트 루트에서 다음 명령어를 실행합니다:

```bash
# webcg-k 하위 서브폴더로 이동 후 실행
cd webcg-k
npm run test
```

### 2단계: Watch 모드 (실시간 탐지)
Vitest의 최고 강점은 초고속 **Watch 모드**입니다. 테스트 파일이나 원본 소스 코드를 수정하고 저장할 때마다, 연관된 테스트만 순식간에(10ms 내외) 다시 실행하여 즉각적인 피드백을 줍니다.

```bash
# 실시간 watch 모드로 실행 (코드 수정 시 자동 재실행)
npx vitest
```

### 3단계: 디버깅 꿀팁 (`screen.debug()`)
테스트를 짜다가 *"컴포넌트가 지금 가상 DOM에 어떻게 그려져 있지?"* 궁금하다면 `screen.debug()`를 호출해 보세요. 터미널 창에 현재 그려진 HTML 구조가 컬러풀하게 출력되어 문제 해결을 직관적으로 돕습니다.

```typescript
import { render, screen } from "@testing-library/react";

it("디버그 팁", () => {
    render(<MyComponent />);
    screen.debug(); // <--- 터미널에 현재 DOM 트리 출력!
});
```

---

## 💡 수석 아키텍트의 조언: "Vibe Coding + Test 안전망"의 조합
바이브 코딩은 개발의 재미와 속도를 높여주는 훌륭한 날개입니다. 여기에 **"핵심 비즈니스 로직(Element 수학 공식, Undo/Redo)은 테스트로 묶는다"**는 원칙만 더해진다면, 당신은 언제든지 100만 유저가 쓰는 서비스를 대담하게 리팩토링할 수 있는 **진정한 시니어 개발자**로 성장하게 될 것입니다!
