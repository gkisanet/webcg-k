# shadcn/ui + Tailwind CSS v4 — WebCG-K 통합 가이드

> **최종 수정일**: 2026-02-13  
> **작성 목적**: 유지보수 시 참고할 수 있는 개념 설명, 설정 과정, 충돌 해결 사례, Phase 진행 가이드

---

## 목차

1. [핵심 개념](#1-핵심-개념)
2. [프로젝트 설정 구조](#2-프로젝트-설정-구조)
3. [CSS 변수 아키텍처](#3-css-변수-아키텍처)
4. [충돌 사례와 해결 (실전 경험)](#4-충돌-사례와-해결-실전-경험)
5. [Button 컴포넌트 사용법](#5-button-컴포넌트-사용법)
6. [새 shadcn 컴포넌트 추가하기](#6-새-shadcn-컴포넌트-추가하기)
7. [Phase별 진행 가이드](#7-phase별-진행-가이드)
8. [트러블슈팅 체크리스트](#8-트러블슈팅-체크리스트)

---

## 1. 핵심 개념

### 비유로 이해하기

| 도구 | 비유 | 설명 |
|------|------|------|
| **Tailwind CSS** | **LEGO 블록** | 미리 만들어진 작은 스타일 조각(`bg-red`, `p-4`)을 조합해서 UI를 만듦 |
| **shadcn/ui** | **IKEA형 조립 가구** | 완성된 컴포넌트(Button, Dialog)를 받되, **설계도(소스코드)가 함께 온다** → 원하면 나사 위치를 바꿀 수 있음 |
| **Radix UI** | **가구의 뼈대** | 버튼·드롭다운의 접근성(ARIA)과 키보드 동작을 자동 처리하는 headless 엔진 |

> 일반적인 npm 패키지(Bootstrap, MUI)는 "완제품"이라 수정이 어렵지만, shadcn은 **소스코드 자체를 프로젝트에 복사**하므로 자유롭게 수정할 수 있습니다.

### 1.1 Tailwind CSS v4와 v3의 차이

Tailwind CSS v4는 v3과 근본적으로 다르게 동작한다:

| 항목 | v3 | v4 (현재 사용) |
|---|---|---|
| **설정 파일** | `tailwind.config.js` (JS) | `@theme inline` (CSS 내) |
| **색상 매핑** | `theme.extend.colors` 객체 | `@theme { --color-*: var(--*) }` CSS 변수 |
| **유틸리티 생성** | JS 설정에서 생성 | CSS 테마 변수에서 자동 생성 |
| **다크 모드** | `darkMode: 'class'` | `@custom-variant dark (...)` |

> [!IMPORTANT]
> v4에서 `bg-primary` 같은 유틸리티 클래스는 `@theme` 블록의 `--color-primary`를 참조한다.
> 따라서 **CSS 변수명에 `--bg-primary`, `--text-primary` 등을 사용하면 Tailwind 유틸리티와 충돌**한다.

### 1.2 shadcn/ui란?

shadcn/ui는 **복사-붙여넣기 방식**의 컴포넌트 라이브러리다:
- npm 패키지가 아닌, 프로젝트에 직접 소스코드를 복사하는 방식
- `src/components/ui/` 디렉토리에 컴포넌트 소스가 존재
- 수정 가능 — 프로젝트에 맞게 커스터마이징 가능

#### 의존성 스택

```
shadcn/ui
├── Radix UI (@radix-ui/*) — 접근성 기반 headless 컴포넌트
├── class-variance-authority (cva) — variant 기반 className 생성
├── clsx — 조건부 className 합성
├── tailwind-merge — Tailwind 클래스 충돌 해결
└── Tailwind CSS v4 — 실제 스타일 렌더링
```

### 1.3 색상 흐름 (Color Pipeline)

```
:root (CSS 변수 정의)
  --primary: oklch(0.75 0.15 200)    ← ① 색상값 정의
       │
       ▼
@theme inline (Tailwind 테마 등록)
  --color-primary: var(--primary)    ← ② Tailwind가 인식
       │
       ▼
Tailwind 유틸리티 클래스 자동 생성
  bg-primary → background-color: var(--color-primary)  ← ③ 사용 가능
  text-primary → color: var(--color-primary)
       │
       ▼
shadcn Button (cva로 variant 적용)
  variant="default" → className="bg-primary text-primary-foreground"  ← ④ 최종
```

---

## 2. 프로젝트 설정 구조

### 2.1 파일 맵

```
webcg-k/
├── components.json              ← shadcn CLI 설정
├── src/
│   ├── styles.css               ← 전역 CSS + shadcn 변수 + @theme
│   ├── lib/
│   │   └── utils.ts             ← cn() 유틸리티
│   └── components/
│       └── ui/                  ← shadcn 컴포넌트 (수정 가능)
│           ├── button.tsx
│           ├── input.tsx
│           ├── dialog.tsx
│           ├── select.tsx
│           └── label.tsx
```

### 2.2 `components.json` (shadcn CLI 설정)

```json
{
  "style": "new-york",          // shadcn 스타일 프리셋
  "rsc": false,                 // React Server Components 미사용
  "tsx": true,
  "tailwind": {
    "css": "src/styles.css",    // CSS 파일 위치
    "baseColor": "neutral",     // 기본 색상 팔레트
    "cssVariables": true        // CSS 변수 사용
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui"     // 컴포넌트 설치 위치
  }
}
```

### 2.3 `cn()` 유틸리티

```ts
// src/lib/utils.ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

**역할**: 조건부 className 합성 + Tailwind 클래스 충돌 자동 해결

```tsx
// "px-4"와 "px-2"가 충돌하면 마지막 "px-2"만 적용
cn("px-4 py-2", condition && "px-2", className)
// → "py-2 px-2" (px-4 자동 제거)
```

### 2.4 `styles.css` 구조 (현재 상태)

```
styles.css 구조 (2610줄)
│
├── [1-3]    @import — Tailwind, tw-animate, shadcn
├── [5]      @custom-variant dark — 다크모드
├── [13-129] :root — CSS 변수 정의
│   ├── [15-71]   프로젝트 커스텀 변수 (--app-bg, --glass-*, --accent-*)
│   └── [74-129]  shadcn 변수 (--primary, --secondary 등) ← 다크 테마 커스텀
├── [131-2525] 기존 CSS 규칙 (레이아웃, 컴포넌트 등)
├── [2527-2566] @theme inline — Tailwind v4 테마 등록
├── [2568-2600] .dark {} — (미사용, 백업용)
└── [2602-2610] @layer base — 기본 스타일
```

---

## 3. CSS 변수 아키텍처

### 3.1 변수명 규칙 ⚠️ 매우 중요

> [!CAUTION]
> **Tailwind v4는 CSS 변수명에서 유틸리티 클래스를 자동 생성한다.**
> 예를 들어 `--bg-primary` 변수가 존재하면 Tailwind가 `bg-primary` 유틸리티를 생성할 때 이 변수를 참조할 수 있다.
> **반드시 프로젝트 커스텀 변수는 충돌하지 않는 접두사를 사용해야 한다.**

#### 현재 프로젝트의 변수명 네이밍

| 예약된 이름 (사용 금지) | 프로젝트 대체명 | 용도 |
|---|---|---|
| ~~`--bg-primary`~~ | `--app-bg` | 앱 배경색 #0d0d0d |
| ~~`--bg-secondary`~~ | `--app-bg-alt` | 보조 배경색 #1a1a1a |
| ~~`--bg-tertiary`~~ | `--app-bg-muted` | 약한 배경색 #252525 |
| ~~`--bg-elevated`~~ | `--app-bg-raised` | 높은 배경색 #2d2d2d |

#### 안전한 커스텀 변수 접두사

```
✅ --app-*       →  앱 레이아웃 색상
✅ --glass-*     →  Glassmorphism 토큰
✅ --accent-*    →  강조 색상
✅ --surface-*   →  서페이스 색상
✅ --text-*      →  텍스트 색상 (단, Tailwind의 text-primary 등과 직접 충돌 주의)
✅ --border-*    →  보더 색상

❌ --bg-*        →  Tailwind bg-* 유틸리티와 충돌
❌ --color-*     →  @theme에서 사용하는 예약 접두사
❌ --primary     →  shadcn 예약
❌ --secondary   →  shadcn 예약
❌ --destructive →  shadcn 예약
```

### 3.2 shadcn 색상 변수 — WebCG-K 다크 테마 매핑

`:root`에서 직접 다크 테마 값을 정의한다 (`.dark` 클래스 미사용):

| shadcn 변수 | oklch 값 | 근사 HEX | 용도 |
|---|---|---|---|
| `--primary` | `oklch(0.75 0.15 200)` | `≈ #00d4ff` | 주요 액션 (Cyan) |
| `--primary-foreground` | `oklch(0.13 0 0)` | `≈ #0d0d0d` | Primary 위 텍스트 (어두움) |
| `--secondary` | `oklch(0.269 0 0)` | `≈ #2d2d2d` | 보조 액션 |
| `--secondary-foreground` | `oklch(0.92 0 0)` | `≈ #e8e8e8` | Secondary 위 텍스트 (밝음) |
| `--destructive` | `oklch(0.577 0.245 27.325)` | `≈ #ef4444` | 삭제/위험 |
| `--accent` | `oklch(0.32 0 0)` | `≈ #3a3a3a` | hover 배경 |
| `--background` | `oklch(0.145 0 0)` | `≈ #0d0d0d` | 페이지 배경 |
| `--foreground` | `oklch(0.985 0 0)` | `≈ #ffffff` | 기본 텍스트 |
| `--border` | `oklch(0.3 0 0)` | `≈ #3a3a3a` | 보더 |
| `--ring` | `oklch(0.75 0.15 200)` | `≈ #00d4ff` | 포커스 링 (Cyan) |

### 3.3 `.dark` 클래스에 관하여

현재 프로젝트는 **항상 다크 모드**(`html { color-scheme: dark }`)이며, `<html>` 태그에 `.dark` 클래스를 적용하지 않는다.
따라서 `.dark { ... }` 블록의 변수는 사실상 **미사용 상태**이며, `:root`에서 직접 다크 값을 정의한다.

만약 라이트/다크 모드 전환이 필요해지면:
1. `:root`를 라이트 모드 기본값으로 변경
2. `.dark`에 현재 `:root` 값 복사
3. `<html>`에 `.dark` 클래스 토글 로직 추가

---

## 4. 충돌 사례와 해결 (실전 경험)

### 4.1 사건 요약

**증상**: shadcn `<Button>` 컴포넌트가 배경과 동색이라 보이지 않음

**원인 분석 (3단계)**:

```
1단계: shadcn init으로 :root에 라이트 모드 기본값 자동 생성
   --primary: oklch(0.205 0 0)   ← 거의 검정
   --primary-foreground: oklch(0.985 0 0)  ← 거의 흰색
   → 문제: 앱은 다크 배경인데 버튼도 검정 배경

2단계: :root 변수를 다크 테마에 맞게 재정의
   --primary: oklch(0.75 0.15 200)  ← Cyan
   → 여전히 안 보임!

3단계: 근본 원인 발견
   styles.css에 .bg-primary { background-color: var(--bg-primary) } 규칙 존재
   → Tailwind의 bg-primary 유틸리티를 오버라이드
   → --bg-primary = #0d0d0d (배경색과 동일)
   → 해결: --bg-primary를 --app-bg로 리네임 + .bg-primary 규칙 삭제
```

### 4.2 해결 과정

```diff
# Step 1: :root 변수를 다크 테마에 맞게 설정
- --primary: oklch(0.205 0 0);         /* 라이트 모드 기본값 */
+ --primary: oklch(0.75 0.15 200);     /* Cyan 액센트 */

# Step 2: 충돌하는 커스텀 변수 리네임 (19개 파일, sed 일괄)
- --bg-primary: #0d0d0d;
+ --app-bg: #0d0d0d;

# Step 3: Tailwind 유틸리티를 오버라이드하던 CSS 규칙 삭제
- .bg-primary { background-color: var(--app-bg); }
- .bg-secondary { background-color: var(--app-bg-alt); }
+ /* Tailwind v4가 @theme의 --color-primary/secondary로 자동 생성 */
```

### 4.3 교훈

> [!WARNING]
> **새 CSS 변수를 추가할 때 반드시 Tailwind 예약 접두사와 충돌하지 않는지 확인하라.**
> - `bg-*`, `text-*`, `border-*` 등은 Tailwind 유틸리티 접두사
> - `--bg-anything`이라는 변수가 존재하면 `bg-anything` 유틸리티에 영향을 줄 수 있다

---

## 5. Button 컴포넌트 사용법

### 5.1 기본 사용

```tsx
import { Button } from "@/components/ui/button"

// 기본 (Primary — Cyan 배경)
<Button onClick={handleClick}>저장</Button>

// Secondary (어두운 회색 배경 + 밝은 텍스트)
<Button variant="secondary">취소</Button>

// Destructive (빨간 배경 — 삭제 등)
<Button variant="destructive">삭제</Button>

// Outline (투명 배경 + 보더)
<Button variant="outline">편집</Button>

// Ghost (배경 없음, hover 시 배경 표시)
<Button variant="ghost">닫기</Button>

// 크기
<Button size="sm">작은 버튼</Button>
<Button size="lg">큰 버튼</Button>
<Button size="icon"><PlusIcon /></Button>
```

### 5.2 Link와 함께 사용 (asChild 패턴)

```tsx
import { Link } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"

// Button 스타일의 Link
<Button asChild>
  <Link to="/dashboard/graphics/new">새 그래픽</Link>
</Button>

// Secondary 스타일 Link
<Button variant="secondary" asChild>
  <Link to="/dashboard">돌아가기</Link>
</Button>
```

### 5.3 매핑 규칙 (레거시 btn → shadcn Button)

| 기존 CSS 클래스 | shadcn Button |
|---|---|
| `btn btn-primary` | `<Button>` (default) |
| `btn btn-secondary` | `<Button variant="secondary">` |
| `btn btn-danger` | `<Button variant="destructive">` |
| `btn btn-accent` | `<Button variant="outline">` |
| `btn btn-sm` | `<Button size="sm">` |
| `Link className="btn btn-primary"` | `<Button asChild><Link /></Button>` |

### 5.4 커스텀 스타일 추가

```tsx
// className prop으로 추가 스타일 (cn()으로 자동 병합)
<Button className="w-full mt-4">전체 너비 버튼</Button>

// 동적 variant
<Button variant={isActive ? "default" : "secondary"}>
  {isActive ? "활성" : "비활성"}
</Button>
```

---

## 6. 새 shadcn 컴포넌트 추가하기

### 6.1 CLI로 추가 (권장)

```bash
cd webcg-k
npx shadcn@latest add <component-name>
```

예시:
```bash
npx shadcn@latest add slider        # Phase 3
npx shadcn@latest add switch        # Phase 3
npx shadcn@latest add toast         # Phase 3
npx shadcn@latest add tabs          # 추후 필요 시
npx shadcn@latest add dropdown-menu # 추후 필요 시
```

### 6.2 추가 후 확인사항

1. **파일 위치**: `src/components/ui/<component>.tsx`에 생성됐는지 확인
2. **import 경로**: `@/components/ui/<component>`로 import
3. **CSS 변수**: 새 컴포넌트가 사용하는 CSS 변수가 `:root`에 정의되어 있는지 확인
4. **빌드 검증**: `npm run build` 실행하여 에러 없는지 확인

### 6.3 컴포넌트 커스터마이징

shadcn 컴포넌트는 **직접 소스를 수정**할 수 있다:

```tsx
// src/components/ui/button.tsx의 variants 수정 예시
const buttonVariants = cva("...", {
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground ...",
      // 커스텀 variant 추가 가능
      cyan: "bg-[#00d4ff] text-black hover:bg-[#00bfe0]",
    },
    size: {
      // 커스텀 사이즈 추가 가능
      "icon-xs": "size-6 rounded-md",
    },
  },
})
```

---

## 7. Phase별 진행 가이드

### Phase 2 ✅ — 완료 (2026-02-13)

- btn 클래스 → shadcn Button 교체 (40곳, 11개 파일)
- CSS 변수 충돌 해결 (--bg-primary → --app-bg 리네임)
- .bg-primary / .bg-secondary CSS 규칙 삭제

### Phase 3 ✅ — 완료 (2026-02-13)

- `npx shadcn@latest add slider` 실행
- **admin.tsx**: `<button>` 20개 → Button, `<input>` 10개 → Input, `<input type=range>` 2개 → Slider
- **SettingsPanel.tsx**: `<input type=range>` → Slider, `<button>` 5개 → Button
- 빌드 검증 통과

3. **주의사항**
   - Toast는 기존 alert/confirm 대체 — `<Toaster />` 프로바이더 필요
   - Switch는 기존 체크박스 커스텀 스타일 대체

### Phase 4 — Glassmorphism ↔ shadcn 통합

**목표**: 두 테마 시스템을 하나로 통합

1. **glass-* 토큰을 shadcn 변수로 통합**
   ```css
   :root {
     --card: rgba(255, 255, 255, 0.04);  /* 기존 --glass-bg 대체 */
   }
   ```

2. **레거시 CSS 클래스 정리**
   - `.btn`, `.btn-primary`, `.btn-secondary` 등 더 이상 사용하지 않는 클래스 삭제
   - `.bg-primary`, `.bg-secondary` 충돌 규칙은 이미 삭제됨

3. **확인**
   - 모든 페이지에서 시각적 일관성 확인
   - Glassmorphism 효과(blur, 투명도)가 유지되는지 확인

---

## 8. 트러블슈팅 체크리스트

### 버튼이 보이지 않을 때

```
□ :root에서 --primary 값이 다크 테마에 맞는 밝은 색인지 확인
□ .bg-primary { ... } 같은 수동 CSS 규칙이 Tailwind 유틸리티를 오버라이드하는지 확인
□ 브라우저 DevTools에서 계산된 배경색 확인: 
  document.querySelector('[data-slot="button"]').style.backgroundColor
□ CSS 변수 값 확인:
  getComputedStyle(document.documentElement).getPropertyValue('--primary')
```

### 새 변수 추가 시 체크리스트

```
□ 변수명이 Tailwind 유틸리티 접두사(bg-, text-, border-)와 충돌하지 않는지 확인
□ --app-*, --glass-*, --surface-* 등 안전한 접두사 사용
□ @theme inline 블록에 등록이 필요한지 확인 (Tailwind 유틸리티로 사용할 경우만)
```

### `npx shadcn add` 실행 후 스타일이 깨질 때

```
□ styles.css에 새 변수가 자동 추가됐는지 확인
□ 추가된 변수가 라이트 모드 기본값인 경우 → :root에서 다크 테마 값으로 수정
□ npm run build로 빌드 에러 확인
□ 브라우저 캐시 클리어 (Vite HMR이 간혹 캐시 문제 발생)
```

### oklch 색상 참고

```
oklch(밝기 채도 색조)
  밝기: 0 (검정) ~ 1 (흰색)
  채도: 0 (무채색) ~ 0.4+ (고채도)
  색조: 0~360 (0=빨강, 120=초록, 200=시안, 270=파랑)

예시:
  oklch(0.75 0.15 200) = 밝은 Cyan (#00d4ff 근사)
  oklch(0.13 0 0)      = 거의 검정
  oklch(0.985 0 0)     = 거의 흰색
  oklch(0.269 0 0)     = 어두운 회색 (#2d2d2d)
```

---

## 부록: 현재 설치된 shadcn 컴포넌트

| 컴포넌트 | 파일 | Phase | 용도 |
|---|---|---|---|
| Button | `ui/button.tsx` | 1 | 모든 버튼 |
| Input | `ui/input.tsx` | 1 | 텍스트 입력 |
| Dialog | `ui/dialog.tsx` | 1 | 모달 |
| Select | `ui/select.tsx` | 1 | 드롭다운 |
| Label | `ui/label.tsx` | 1 | 폼 라벨 |
| Slider | `ui/slider.tsx` | 3 | 레인지 슬라이더 (Temperature, Top P, Fade Duration) |
