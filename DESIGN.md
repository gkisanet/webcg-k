# WebCG-K DESIGN.md

> AI 코딩 에이전트가 일관된 UI를 생성하기 위한 단일 디자인 시스템 문서 (Single Source of Truth).
> 구조: Google Stitch DESIGN.md 표준 9개 섹션 | 철학: Framer의 Dark Void Canvas 차용, 방송 도메인 맞춤 커스터마이징.

---

## 1. Design Philosophy

WebCG-K는 **방송 콘솔의 다크 보이드(Dark Void Console)**를 지향합니다. 방송국 부조정실(MCR)의 어두운 조명 환경에서 장시간 사용하는 도구이므로, 눈의 피로를 최소화하는 절대적 다크 테마를 기본으로 합니다.

**핵심 원칙:**

- **Void Canvas**: 배경은 거의 순수한 검정(`#0d0d0d`)이며, 모든 UI 요소가 이 어둠 위에 떠 있는 것처럼 보여야 합니다. 밝은 배경 섹션은 존재하지 않습니다.
- **Cyan Accent Throughline**: 단일 액센트 컬러 `#00d4ff`(Cyan)이 인터랙티브 요소, 포커스 링, 플레이헤드 등 모든 곳에서 전기적 에너지를 전달합니다.
- **Glassmorphism as Depth**: 카드, 패널, 모달은 `rgba(255, 255, 255, 0.04~0.08)` 반투명 배경과 `blur(12px)` 블러로 레이어를 표현합니다. 하드 섀도우 대신 유리 효과가 깊이를 만듭니다.
- **Product-First UI**: 방송 그래픽 편집기, 타임라인, SVG 렌더러 등 **프로덕트 자체가 UI의 주인공**입니다. 장식적 일러스트레이션이나 불필요한 그래디언트는 사용하지 않습니다.
- **Broadcast Domain Colors**: PGM(빨강), PVW(앰버), On-Air(펄스 글로우) 등 방송 업계 표준 시맨틱 컬러를 존중합니다.
- **Tool Craftsmanship**: Penpot/Figma 스타일 디자인 도구의 정밀함 — 8px 그리드, 정확한 스페이싱, 체계적 타이포그래피 계층.

---

## 2. Color Palette

### 2.1. Primary

| Token | Value | Usage |
|-------|-------|-------|
| `--app-bg` | `#0d0d0d` | **메인 배경** — 거의 순수한 검정. 모든 것의 기반. |
| `--text-primary` | `#ffffff` | **주요 텍스트** — 제목, 레이블, 강조 텍스트. |
| `--accent-primary` | `#00d4ff` | **주 액센트** — CTA, 링크, 포커스 링, 플레이헤드, 선택 상태. 유일한 채도 높은 컬러. |

### 2.2. Surface & Background

| Token | Value | Usage |
|-------|-------|-------|
| `--app-bg-alt` | `#1a1a1a` | 헤더, 사이드바, 트랙 헤더 배경 |
| `--app-bg-secondary` | `#181818` | 모달, 카드, 팝업 배경 (`--app-bg-alt`보다 약간 어두움) |
| `--app-bg-muted` | `#252525` | Muted 영역, 호버 배경 |
| `--app-bg-raised` | `#2d2d2d` | 높인(raised) 요소 배경, 트랙 헤더 |
| `--surface-track` | `#1f1f1f` | 타임라인 트랙 배경 |
| `--surface-block` | `#3d3d3d` | 타임라인 블록 기본 |
| `--surface-block-hover` | `#4a4a4a` | 타임라인 블록 호버 |
| `--surface-block-selected` | `#5a5a5a` | 타임라인 블록 선택됨 |

### 2.3. Text Hierarchy

| Token | Value | Usage |
|-------|-------|-------|
| `--text-primary` | `#ffffff` | 제목, 레이블, 주요 콘텐츠 |
| `--text-secondary` | `#a3a3a3` | 설명 텍스트, 부가 정보 |
| `--text-tertiary` | `#737373` | 캡션, 플레이스홀더, 비활성 레이블 |
| `--text-muted` | `#525252` | 비활성 텍스트, 힌트 |

### 2.4. Border

| Token | Value | Usage |
|-------|-------|-------|
| `--border-default` | `#404040` | 일반 구분선, 스크롤바 |
| `--border-subtle` | `#2d2d2d` | 미묘한 구분선, 패널 경계 |
| `--border-primary` | `#333333` | 카드·모달 주 테두리 |

### 2.5. Glassmorphism System

> **Why Glass?** 순수한 검정 위에 불투명한 회색 패널을 올리면 "벽돌 위에 벽돌" 같은 밋밋한 계층이 됩니다. 반투명 glass는 뒤쪽의 context를 느끼게 하면서도 전경 UI의 독립성을 유지합니다.

| Token | Value | Usage |
|-------|-------|-------|
| `--glass-bg` | `rgba(255, 255, 255, 0.04)` | 기본 glass 배경 |
| `--glass-bg-strong` | `rgba(255, 255, 255, 0.06)` | 진한 glass (카드, 테이블 헤더) |
| `--glass-bg-hover` | `rgba(255, 255, 255, 0.08)` | 호버 상태 glass |
| `--glass-border` | `rgba(255, 255, 255, 0.08)` | glass 요소 테두리 |
| `--glass-border-hover` | `rgba(255, 255, 255, 0.15)` | glass 호버 테두리 |
| `--glass-blur` | `blur(12px)` | backdrop-filter 값 |
| `--glass-shadow` | `0 4px 24px rgba(0, 0, 0, 0.25)` | glass 기본 그림자 |
| `--glass-shadow-hover` | `0 8px 32px rgba(0, 0, 0, 0.35)` | glass 호버 그림자 |
| `--glass-glow` | `0 0 20px rgba(0, 212, 255, 0.08)` | cyan 글로우 (선택적) |

### 2.6. Semantic / Domain Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--accent-primary` | `#00d4ff` | Cyan — 주 인터랙티브, 플레이헤드 |
| `--accent-secondary` | `#7c3aed` | Purple — 보조 강조, 런다운 타입 레이블 |
| `--accent-success` | `#10b981` | Green — 성공, ON AIR, 재생 버튼 |
| `--accent-warning` | `#f59e0b` | Amber — 경고, PVW 모니터 테두리 |
| `--accent-danger` | `#ef4444` | Red — 위험, PGM 모니터 테두리, 삭제 |

### 2.7. Broadcast Domain

| Token | Value | Usage |
|-------|-------|-------|
| `--preview-border` | `#f59e0b` (Amber) | PVW(프리뷰) 모니터 테두리 |
| `--pgm-border` | `#ef4444` (Red) | PGM(프로그램) 모니터 테두리 |
| `--pgm-glow` | `rgba(239, 68, 68, 0.3)` | PGM 모니터 글로우 |
| `--playhead-color` | `#00d4ff` (Cyan) | 타임라인 플레이헤드 |
| `--playhead-glow` | `rgba(0, 212, 255, 0.4)` | 플레이헤드 글로우 |

---

## 3. Typography

### 3.1. Font Stack

```
Primary (Body/UI): "Inter", "Pretendard", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif
Monospace (Code):  "JetBrains Mono", source-code-pro, Menlo, Monaco, Consolas, "Courier New", monospace
```

- **Inter** — 라틴 문자 기본. 가독성 높은 UI 폰트.
- **Pretendard** — 한글 서브셋 (`unicode-range: U+AC00-D7A3`). Inter와 시각적 조화.
- **JetBrains Mono** — CSS 직접 입력, 코드 블록, 기술 레이블.
- **방송 그래픽 전용 폰트** — 14종 (Noto Sans KR, Gmarket Sans, S-Core Dream, Montserrat 등)은 그래픽 편집기 내부에서만 사용. UI 시스템 폰트와 분리.

### 3.2. Weight System (4-Weight)

| Weight | Token/Value | Usage |
|--------|-------------|-------|
| Regular | `400` | Body 텍스트, 읽기용 |
| Medium | `500` | UI 요소, 네비게이션, 인터랙티브 |
| SemiBold | `600` | 강조 레이블, 섹션 타이틀, 버튼 |
| Bold | `700` | 페이지 제목, 중요 수치, 헤딩 |

### 3.3. Type Scale (8-Level Hierarchy)

| Role | Size | Weight | Line Height | Letter Spacing | CSS Example |
|------|------|--------|-------------|----------------|-------------|
| **Page Title** | 1.5rem (24px) | 600 | 1.33 | normal | `.page-title` |
| **Section Heading** | 1.125rem (18px) | 600 | 1.33 | normal | `.empty-state-title` |
| **Card Title** | 0.9375rem (15px) | 600 | 1.40 | normal | `.card-title` |
| **Body** | 0.875rem (14px) | 400–500 | 1.50 | normal | 기본 텍스트 |
| **Body Small** | 0.8125rem (13px) | 500 | 1.45 | normal | 설명, 서브텍스트 |
| **Caption** | 0.75rem (12px) | 500–600 | 1.33 | `0.03em` | 타임코드, 상태 |
| **Micro Label** | 0.6875rem (11px) | 600 | 1.20 | `0.05em` | uppercase 섹션 레이블 |
| **Tiny** | 0.625rem (10px) | 600 | 1.00 | `0.05em` | 단축키 힌트, 배지 |

### 3.4. Principles

- **font-smoothing 필수**: `-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;` — 다크 배경에서 서브픽셀 렌더링은 번짐을 유발합니다.
- **Uppercase + letter-spacing**: 섹션 레이블(`sidebar-nav-label`, `settings-title`, `stat-label`)은 `text-transform: uppercase; letter-spacing: 0.05em`으로 통일합니다.
- **tabular-nums**: 타임코드, 수치 표시, 줌 퍼센트 등 숫자가 변하는 곳은 `font-variant-numeric: tabular-nums`를 적용합니다.
- **Body text 400, UI text 500**: 읽기 전용 텍스트(설명, 본문)는 400, 클릭할 수 있는 텍스트(네비, 메뉴, 탭)는 500으로 구분합니다.

---

## 4. Component Styles

### 4.1. Buttons

WebCG-K는 **shadcn/ui `<Button>` 컴포넌트**를 기본으로 사용합니다. 도메인 특화 버튼만 커스텀합니다.

**shadcn/ui Default Variants (다크 테마 적용):**

| Variant | Background | Text | Radius | Usage |
|---------|-----------|------|--------|-------|
| `default` (Primary) | Cyan (`--primary`) | Dark (`--primary-foreground`) | `var(--radius)` | 주 CTA: "저장", "생성", "추가" |
| `secondary` | `--secondary` | `--secondary-foreground` | `var(--radius)` | 보조 액션 |
| `destructive` | Red (`--destructive`) | White | `var(--radius)` | "삭제", 위험 액션 |
| `outline` | Transparent | `--foreground` | `var(--radius)` | 테두리 버튼 |
| `ghost` | Transparent → hover `--accent` | `--accent-foreground` | `var(--radius)` | 아이콘 버튼, 네비 |

**도메인 특화 버튼:**

| Component | Style | Usage |
|-----------|-------|-------|
| `.controller-tab.active` | `bg: --accent-primary, color: white` | 컨트롤러 활성 탭 |
| `.rundown-item-play` | `bg: --accent-success, radius: 4px` | 재생 버튼 |
| `.live-badge` | `bg: --accent-danger, uppercase, pulse animation` | 라이브 상태 배지 |
| `.toggle-btn.active` | `gradient: accent-success` | 활성 토글 |

### 4.2. Cards & Containers

**표준 카드 (`.card`):**
```css
background: linear-gradient(135deg, var(--glass-bg-strong), var(--glass-bg));
backdrop-filter: var(--glass-blur);
border: 1px solid var(--glass-border);
border-radius: 12px;
```

**호버 상태:**
```css
border-color: var(--glass-border-hover);
box-shadow: var(--glass-shadow-hover);
transform: translateY(-1px);   /* 미묘한 떠오름 */
```

**카드 내부 구조:**
- `.card-header` — 1px glass border-bottom, padding `1rem 1.25rem`
- `.card-body` — padding `1.25rem`
- `.card-footer` — 1px glass border-top, `--glass-bg` 배경

### 4.3. Inputs & Forms

```css
background: var(--glass-bg);
border: 1px solid var(--glass-border);
border-radius: 6px;
color: var(--text-primary);
padding: 0.5rem 0.75rem;
font-size: 0.875rem;
```

**포커스 상태:**
```css
border-color: var(--accent-primary);
box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.1);   /* cyan focus ring */
outline: none;
```

### 4.4. Navigation (Sidebar)

- **배경**: Gradient glass (`rgba(26, 26, 26, 0.85)` → `rgba(13, 13, 13, 0.92)`) + backdrop-filter
- **활성 아이템**: Cyan-purple gradient bg (`rgba(0, 212, 255, 0.15)` → `rgba(124, 58, 237, 0.15)`) + 왼쪽 3px cyan bar
- **호버**: `--glass-bg-hover`
- **섹션 레이블**: 11px, uppercase, `letter-spacing: 0.05em`, `--text-tertiary`

### 4.5. Tables (Data Table)

```css
/* Container */
background: var(--glass-bg);
border: 1px solid var(--glass-border);
border-radius: 12px;

/* Header */
background: var(--glass-bg-hover);
font-size: 0.75rem;
font-weight: 600;
text-transform: uppercase;
letter-spacing: 0.05em;
color: var(--text-secondary);

/* Row hover */
background: var(--glass-bg-hover);

/* Selected row */
background-color: rgba(0, 212, 255, 0.1);
border-left: 3px solid var(--accent-primary);
```

### 4.6. Monitors (Broadcast Domain)

```css
/* Preview Monitor */
border: 3px solid var(--preview-border);     /* Amber */

/* Program Monitor */
border: 3px solid var(--pgm-border);         /* Red */
box-shadow: 0 0 20px var(--pgm-glow);        /* Red glow */

/* Monitor Label */
font-size: 0.75rem;
font-weight: 600;
text-transform: uppercase;
letter-spacing: 0.05em;
border-radius: 4px;
```

### 4.7. Timeline

- **트랙 배경**: `--surface-track` (`#1f1f1f`)
- **블록**: `--surface-block` → hover `--surface-block-hover` → selected `outline: 2px solid --accent-primary`
- **플레이헤드**: 2px `--playhead-color` + `box-shadow: 0 0 8px --playhead-glow` + 삼각형 헤드 (clip-path)
- **줌 컨트롤**: `--app-bg-muted` 배경, `--border-subtle` 테두리, 6px radius

---

## 5. Layout Principles

### 5.1. Application Zones

```
┌────────────────────────────────────────────────────┐
│  Dashboard         │        Controller              │
│  (저작 환경)        │        (송출 환경)               │
│                    │                                │
│  240px Sidebar     │  auto Header                   │
│  + 1fr Content     │  + Dual Monitors               │
│                    │  + Tab Bar                     │
│                    │  + Timeline/Overlay/Character   │
└────────────────────────────────────────────────────┘
```

- **Dashboard**: `grid-template-columns: 240px 1fr` — 좌측 고정 사이드바 + 우측 컨텐츠
- **Controller**: `grid-template-rows: auto 1fr auto` — 헤더 + 콘텐츠(모니터+탭) + 하단
- **Graphics Editor**: 3-Pane — 좌측 240px (레이어) + 중앙 (캔버스) + 우측 280px (속성)
- **Rundown Editor**: 3-Pane — 좌측 280px (라이브러리) + 중앙 (런다운) + 우측 320px (프리뷰)

### 5.2. Spacing System (8px Base)

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | 2px | 인라인 갭, 미세 조정 |
| `--space-2` | 4px | 아이콘-텍스트 갭, 미니 패딩 |
| `--space-3` | 8px | 기본 단위, 컴포넌트 내부 갭 |
| `--space-4` | 12px | 카드 내부 패딩, 작은 마진 |
| `--space-5` | 16px | 표준 패딩, 그리드 갭 |
| `--space-6` | 24px | 섹션 간 마진 |
| `--space-7` | 32px | 페이지 패딩 |
| `--space-8` | 48px | 대형 섹션 간격 |

### 5.3. Grid & Container

- **최소 해상도**: 1280px (방송 장비 표준)
- **대시보드 컨텐츠**: `padding: 2rem` (32px)
- **카드 그리드**: `grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1.5rem`
- **통계 카드 그리드**: `grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem`

### 5.4. 3-Pane Panels

좌측/우측 패널은 **glass gradient + backdrop-filter + border** 조합:
```css
background: linear-gradient(180deg, rgba(26, 26, 26, 0.85) 0%, rgba(13, 13, 13, 0.9) 100%);
backdrop-filter: var(--glass-blur);
border-right: 1px solid var(--glass-border);   /* 또는 border-left */
```

---

## 6. Depth & Elevation

### 6.1. Elevation Levels

| Level | Treatment | Usage |
|-------|-----------|-------|
| **Level 0** (Flat) | 그림자 없음, `--app-bg` | 페이지 배경, 빈 영역 |
| **Level 1** (Glass) | `1px solid var(--glass-border)` + `var(--glass-bg)` | 카드, 패널, 테이블 컨테이너 |
| **Level 2** (Raised) | `var(--glass-shadow)` + glass border | 호버 카드, 떠오른 요소 |
| **Level 3** (Float) | `0 8px 24px rgba(0,0,0,0.5)` + `blur(16px)` backdro | 모달, 드롭다운, 컨텍스트 메뉴 |
| **Focus** | `0 0 0 3px rgba(0, 212, 255, 0.1)` | 포커스 링 (접근성) |
| **Glow** | `0 0 20px rgba(0, 212, 255, 0.2)` | 활성/선택된 특수 요소 |

### 6.2. Shadow Philosophy

WebCG-K의 깊이 시스템은 Framer와 유사하게 **전통적 라이트테마 섀도우를 반전**합니다:

- **Glass border**가 주요 깊이 표현 수단 — `rgba(255, 255, 255, 0.08~0.15)` 테두리가 요소의 경계를 정의
- **어두운 ambient shadow** — `rgba(0, 0, 0, 0.25~0.5)`로 깊은 그림자, 밝은 그림자 사용 금지
- **Cyan glow** — 선택/활성 상태만 사용. 장식용 글로우 남용 금지
- **translateY(-1px ~ -4px)** — 호버 시 미묘한 떠오름으로 인터랙티브 피드백

---

## 7. Motion & Animation

### 7.1. Transition Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--transition-fast` | `100ms ease` | 호버 배경색, 포커스 링 |
| `--transition-normal` | `200ms ease` | 카드 호버, 패널 전환 |
| `--transition-slow` | `300ms ease` | 설정 패널 슬라이드, 모달 |

### 7.2. Standard Patterns

**Hover Lift (카드):**
```css
transition: all var(--transition-normal);
/* hover */
transform: translateY(-1px);   /* 가벼운 리프트 */
border-color: var(--glass-border-hover);
box-shadow: var(--glass-shadow-hover);
```

**Hover Grow (라이브러리 아이템):**
```css
/* hover */
transform: translateY(-2px);
```

**Pulse Glow (라이브 배지):**
```css
@keyframes pulseGlow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
  50%      { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
}
animation: pulseGlow 2s ease-in-out infinite;
```

**Shimmer (로딩 스켈레톤):**
```css
background: linear-gradient(90deg, var(--app-bg-alt) 25%, var(--app-bg-muted) 50%, var(--app-bg-alt) 75%);
background-size: 200% 100%;
animation: shimmer 1.5s infinite;
```

**Spin (로딩 스피너):**
```css
border: 3px solid var(--border-default);
border-top-color: var(--accent-primary);
animation: spin 1s linear infinite;
```

**Slide In (설정 패널):**
```css
transform: translateX(100%);
transition: transform var(--transition-normal);
/* open */
transform: translateX(0);
```

### 7.3. Principles

- **절제**: 애니메이션은 의미가 있을 때만. 모든 hover에 scale을 넣지 마세요.
- **일관성**: 카드 lift = `-1px`, 아이템 lift = `-2px`. 그 이상은 과합니다.
- **성능**: `transform`과 `opacity`만 animate. `height`, `width`, `top`, `left` 직접 애니메이션 금지.
- **감속**: `ease` 또는 `cubic-bezier(0.33, 1, 0.68, 1)` — 자연스러운 감속.

---

## 8. Responsive Behavior

### 8.1. Design Constraints

WebCG-K는 **방송 장비 환경 전용**입니다:
- **최소 지원 해상도**: 1280 × 720px
- **권장 해상도**: 1920 × 1080px 이상
- **터치 지원**: 불필요 (마우스 + 키보드 환경)
- **모바일 미지원**: 반응형 모바일 레이아웃 불필요

### 8.2. Breakpoints

| Name | Width | Key Changes |
|------|-------|-------------|
| Minimum | 1280px | 사이드바 축소, 단일 모니터 |
| Standard | 1920px | 풀 레이아웃, 듀얼 모니터 |
| Ultra-wide | 2560px+ | 확대된 여백, 더 큰 미리보기 |

### 8.3. Panel Behavior

- **사이드바 (240px)**: 고정. 1280px 미만에서만 오버레이 모드 고려.
- **속성 패널 (280–320px)**: 고정. 숨김 토글 가능.
- **모니터 영역**: `max-height: 60vh` — 뷰포트의 60% 초과 금지.
- **그래픽 편집기 캔버스**: `aspect-ratio: 16/9` 유지, 가용 공간에 맞춰 스케일.

---

## 9. Do / Don't

### ✅ Do

- **Glass system 사용**: 모든 카드, 패널에 `--glass-*` 토큰을 사용하세요. 하드코딩된 `rgba` 값 금지.
- **Cyan accent 단일 사용**: `--accent-primary` (#00d4ff)만 인터랙티브 액센트로 사용. 추가 액센트 컬러를 도입하지 마세요.
- **시맨틱 토큰 참조**: `var(--text-secondary)` 사용, `#a3a3a3` 하드코딩 금지.
- **8px 그리드 준수**: spacing은 8의 배수 (4, 8, 12, 16, 24, 32px). 5px, 7px, 15px 등 임의 값 금지.
- **Border radius 체계 준수**: 아래 5단계만 사용.
- **Uppercase + letter-spacing**: 섹션 레이블에는 반드시 `text-transform: uppercase; letter-spacing: 0.05em`.
- **shadcn/ui 컴포넌트 우선**: Button, Dialog, Select 등은 shadcn/ui를 그대로 사용.

### ❌ Don't

- **밝은 배경 사용 금지**: `#ffffff`, `#f5f5f5` 등 밝은 배경을 UI 크롬에 사용하지 마세요. (방송 그래픽 내부는 예외)
- **3가지 이상의 채도 높은 컬러 혼용 금지**: cyan + red + green이 동시에 눈에 띄면 크리스마스트리가 됩니다.
- **Heavy shadow 금지**: `box-shadow: 0 10px 30px rgba(0,0,0,0.8)` 같은 무거운 그림자는 glass 시스템과 충돌합니다.
- **Positive letter-spacing on body text 금지**: 본문에 `letter-spacing > 0`은 가독성을 해칩니다. uppercase 레이블만 예외.
- **px → rem 혼용 최소화**: UI 요소는 `rem` 기준. px은 border-width, box-shadow 등 고정 값에만.
- **임의 transition duration 금지**: `0.15s`, `0.2s` 대신 `var(--transition-fast)`, `var(--transition-normal)` 사용.
- **장식적 gradient/illustration 금지**: SVG 렌더러 출력과 UI 장식이 구분되지 않으면 혼란을 줍니다.

### Border Radius Scale

| Level | Value | Usage |
|-------|-------|-------|
| **Micro** | `3px–4px` | 배지, 태그, 키보드 힌트, 모니터 레이블 |
| **Small** | `6px` | 입력 필드, 줌 컨트롤, 인라인 요소 |
| **Medium** | `8px` | 버튼, 사이드바 아이템, 모니터, 라이브러리 아이템 |
| **Large** | `12px` | 카드, 테이블 컨테이너, 미리보기 패널 |
| **XL** | `16px` | 빈 상태 아이콘, 큰 장식 요소 |
| **Pill** | `100px` / `9999px` | 런다운 카운트 배지, 뷰 모드 카운트 |

---

## Quick Color Reference

```
Background:           #0d0d0d
Surface Alt:          #1a1a1a
Text Primary:         #ffffff
Text Secondary:       #a3a3a3
Text Tertiary:        #737373
Accent Cyan:          #00d4ff
Accent Purple:        #7c3aed
Success Green:        #10b981
Warning Amber:        #f59e0b
Danger Red:           #ef4444
Glass Border:         rgba(255, 255, 255, 0.08)
Glass Background:     rgba(255, 255, 255, 0.04)
Focus Ring:           0 0 0 3px rgba(0, 212, 255, 0.1)
```

---

## Example Component Prompts

AI 에이전트에게 새 컴포넌트를 요청할 때 아래와 같이 프롬프트를 작성하면 이 DESIGN.md와 일관된 결과를 얻습니다:

- "새 대시보드 카드를 만들어줘. glass 배경(`--glass-bg-strong`), `--glass-border` 테두리, 12px radius. 제목은 15px SemiBold 600, 본문은 14px Regular 400 `--text-secondary`. 호버 시 `translateY(-1px)` + `--glass-shadow-hover`."

- "타임라인에 새 트랙 타입을 추가해줘. 배경색 `--surface-track`, 높이 `--track-height`, 하단 1px `--border-subtle`. 트랙 헤더는 120px 고정 너비, `--app-bg-raised` 배경, 0.75rem uppercase 레이블."

- "설정 모달을 만들어줘. 배경 `linear-gradient(180deg, rgba(26,26,26,0.9) 0%, rgba(13,13,13,0.95) 100%)` + `backdrop-filter: blur(16px)`. 테두리 `--glass-border`. 닫기 버튼은 shadcn ghost variant."

- "상태 배지를 만들어줘. 성공: `rgba(16, 185, 129, 0.15)` 배경 + `#10b981` 텍스트. 위험: `rgba(239, 68, 68, 0.15)` 배경 + `#ef4444` 텍스트. 4px radius, 0.75rem SemiBold."

---

## Iteration Guide

이 디자인 시스템으로 생성된 화면을 수정/개선할 때 순서:

1. **토큰 확인**: 새로 사용하려는 색상/사이즈가 이 문서의 토큰 테이블에 있는지 확인. 없으면 하드코딩하지 말고 토큰 추가를 먼저 논의.
2. **Glass 계층 확인**: 카드-위의-카드(nested glass) 상황에서 `--glass-bg` vs `--glass-bg-strong` 차이로 계층 표현.
3. **Hover 일관성**: 모든 인터랙티브 요소에 `var(--transition-fast)` 이상의 transition. 호버 없는 클릭 가능 요소는 금지.
4. **Focus 접근성**: 모든 인터랙티브 요소에 cyan focus ring (`0 0 0 3px rgba(0, 212, 255, 0.1)`) 적용 확인.
5. **방송 컬러 확인**: PGM=Red, PVW=Amber, Play=Green, 삭제=Red. 이 매핑은 불변.
