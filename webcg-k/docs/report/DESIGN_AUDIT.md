# WebCG-K 디자인 개선 및 한계점 파악 보고서

> **작성일**: 2026-02-13  
> **범위**: UI/UX 디자인 감사, 사내망(에어갭) 환경 대응, 폰트 및 아이콘 에셋 관리 전략

---

## 목차

1. [현재 상태 진단](#1-현재-상태-진단)
2. [핵심 한계점 분석](#2-핵심-한계점-분석)
3. [사내망(에어갭) 환경 대응 전략](#3-사내망에어갭-환경-대응-전략)
4. [폰트 관리 — 구매 폰트 공유 및 적용](#4-폰트-관리--구매-폰트-공유-및-적용)
5. [아이콘 에셋 관리 — 날씨 아이콘 등](#5-아이콘-에셋-관리--날씨-아이콘-등)
6. [접근성(A11Y) 감사](#6-접근성a11y-감사)
7. [성능 감사](#7-성능-감사)
8. [개선 로드맵](#8-개선-로드맵)
9. [shadcn/ui 도입 분석](#9-shadcnui-도입-분석)

---

## 1. 현재 상태 진단

### 1.1 폰트 시스템

| 항목 | 현재 설정 | 문제점 |
|------|-----------|--------|
| UI 폰트 | `Inter` (Google Fonts CDN) | **인터넷 필수** — `__root.tsx`에서 `fonts.googleapis.com` CDN 링크로 로딩 |
| 코드 폰트 | `JetBrains Mono` (선언만) | **폰트 파일 미포함** — fallback만 동작 |
| `@font-face` | 미사용 | 로컬 폰트 파일 번들링 없음 |
| `public/fonts/` | 미존재 | 폰트 에셋 디렉토리 자체가 없음 |
| 한글 폰트 | 미지원 | Pretendard 등 한글 전용 폰트 미적용 |

**현재 코드 (`__root.tsx` L39~L46)**:
```tsx
// ❌ 인터넷 연결 필수 — 사내망 불가
{
    rel: "preconnect",
    href: "https://fonts.googleapis.com",
},
{
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
},
```

### 1.2 아이콘 시스템

| 항목 | 현재 설정 | 문제점 |
|------|-----------|--------|
| 날씨 아이콘 | 유니코드 이모지 (`☀️`, `🌧` 등) | OS/브라우저별 렌더링 불일치, 방송 품질 부적합 |
| UI 아이콘 | 인라인 SVG (하드코딩) | 일관성 없음, 재사용 어려움 |
| 아이콘 라이브러리 | 미사용 | 체계적 아이콘 세트 부재 |
| 날씨 코드 매핑 | `WEATHER_CODE_MAP` (이모지) | SVG/PNG 전문 아이콘 미사용 |

**현재 코드 (`dataProviders.ts`)**:
```typescript
// ❌ 이모지 — 방송 그래픽에 부적합
const WEATHER_CODE_MAP = {
    0: { description: "맑음", icon: "☀️" },
    1: { description: "대체로 맑음", icon: "🌤" },
    // ...
};
```

### 1.3 디자인 시스템

| 항목 | 현재 상태 |
|------|-----------|
| 테마 | 다크모드 단일 |
| 스타일링 | Glassmorphism + CSS Variables + Tailwind |
| 반응형 | 미지원 (데스크탑 전용) |
| 컬러 토큰 | CSS Custom Properties 부분 적용 (하드코딩 잔존) |

---

## 2. 핵심 한계점 분석

### 🔴 Critical (즉시 해결 필요)

1. **인터넷 의존성**: Google Fonts CDN에 의존 → 사내망에서 폰트 미로딩 시 시스템 폰트 fallback → **UI 품질 저하**
2. **날씨 이모지 불일치**: OS별 이모지 렌더링 차이 → **4K 방송 송출 시 아이콘 깨짐/불일치**
3. **외부 API 의존성**: Open-Meteo, USGS 등 **인터넷망 전용 API** → 사내망에서 데이터 소스 작동 불가

### 🟡 Warning (개선 권장)

4. **한글 폰트 부재**: Inter는 라틴 전용 → 한글은 OS 기본 폰트 렌더링 → **글자 크기/행간 불일치**
5. **아이콘 비체계**: 인라인 SVG 하드코딩 → 디자인 일관성 부족
6. **라이트 모드 미지원**: 일부 사용 환경에서 필요할 수 있음
7. **모바일 반응형 미지원**: 필드 모바일 확인 불가

### 🟢 Note (장기 개선)

8. `backdrop-filter: blur()` GPU 부하 — 저사양 디바이스 FPS 저하 가능
9. 타이포그래피 스케일 미정의 — 폰트 크기가 컴포넌트마다 ad-hoc

---

## 3. 사내망(에어갭) 환경 대응 전략

> [!IMPORTANT]
> 사내망 = **인터넷 연결 없음**. 모든 외부 CDN, API, 웹 폰트 서비스가 차단됩니다.

### 3.1 영향받는 기능 목록

| 기능 | 외부 의존 | 사내망 영향 | 대응 방안 |
|------|-----------|-------------|-----------|
| UI 폰트 (Inter) | Google Fonts CDN | ❌ 로딩 불가 | **로컬 번들링** |
| 코드 폰트 (JetBrains Mono) | 선언만 존재 | ❌ fallback | **로컬 번들링** |
| 날씨 데이터 | Open-Meteo API | ❌ 호출 불가 | **프록시 or Mock** |
| 지진 데이터 | USGS API | ❌ 호출 불가 | **프록시 or Mock** |
| AI CG 생성 | Gemini/DeepSeek API | ❌ 호출 불가 | **사내 LLM or 사전생성** |
| TanStack Devtools | npm 패키지 | ✅ 빌드 포함 | 영향 없음 |
| Supabase | 로컬 Docker | ✅ 사내 호스팅 가능 | 영향 없음 |

### 3.2 네트워크 아키텍처 제안

```
┌──────────────────────────────────────────────────┐
│                   사내망 (Air-Gap)                 │
│                                                    │
│  ┌──────────┐    ┌──────────┐    ┌──────────────┐ │
│  │ WebCG-K  │───▶│ Supabase │    │ 정적 에셋    │ │
│  │ Frontend │    │ (Docker) │    │ 서버 (Nginx) │ │
│  └──────────┘    └──────────┘    └──────────────┘ │
│       │                               ▲           │
│       │  폰트/아이콘 로딩              │           │
│       └───────────────────────────────┘           │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │ 옵션: 데이터 프록시 서버 (사내 API Gateway)   │ │
│  │ - 기상청 OpenAPI → 사내 캐시                  │ │
│  │ - 수동 데이터 입력 UI                         │ │
│  └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

---

## 4. 폰트 관리 — 구매 폰트 공유 및 적용

### 4.1 현재 문제

```
사내망 사용자 → WebCG-K 접속
  → __root.tsx에서 fonts.googleapis.com 호출
  → ❌ 연결 불가
  → OS 기본 폰트 (맑은 고딕/돋움) fallback
  → UI 레이아웃 깨짐, 디자인 의도 미반영
```

### 4.2 해결 방법: 로컬 폰트 번들링 (`@font-face`)

> [!TIP]
> **핵심 원칙**: 모든 폰트 파일을 프로젝트에 직접 포함시켜 CDN 의존성을 완전히 제거합니다.

#### Step 1: 폰트 파일 준비 및 디렉토리 구조

```
webcg-k/
├── public/
│   └── fonts/
│       ├── inter/                    ← Google Fonts (OFL 라이선스, 무료)
│       │   ├── Inter-Regular.woff2
│       │   ├── Inter-Medium.woff2
│       │   ├── Inter-SemiBold.woff2
│       │   └── Inter-Bold.woff2
│       │
│       ├── pretendard/               ← 한글 폰트 (OFL 라이선스, 무료)
│       │   ├── Pretendard-Regular.subset.woff2
│       │   ├── Pretendard-Medium.subset.woff2
│       │   ├── Pretendard-SemiBold.subset.woff2
│       │   └── Pretendard-Bold.subset.woff2
│       │
│       ├── jetbrains-mono/           ← 코드 폰트 (Apache 2.0 라이선스, 무료)
│       │   ├── JetBrainsMono-Regular.woff2
│       │   └── JetBrainsMono-Bold.woff2
│       │
│       └── custom/                   ← 구매 폰트 (사내 라이선스)
│           ├── NotoSansKR-Regular.woff2
│           ├── NotoSansKR-Bold.woff2
│           ├── SpoqaHanSansNeo-Regular.woff2
│           └── LICENSE.txt           ← 라이선스 증빙 필수
```

#### Step 2: CSS `@font-face` 선언 (예시)

새 파일 `webcg-k/src/fonts.css`:

```css
/* ============================================
   WebCG-K Font Declarations
   사내망 환경용 로컬 폰트 번들
   모든 폰트는 /public/fonts/ 에서 로딩
   ============================================ */

/* --- Inter (UI 기본 폰트) --- */
@font-face {
    font-family: "Inter";
    font-style: normal;
    font-weight: 400;
    font-display: swap;
    src: url("/fonts/inter/Inter-Regular.woff2") format("woff2");
}

@font-face {
    font-family: "Inter";
    font-style: normal;
    font-weight: 500;
    font-display: swap;
    src: url("/fonts/inter/Inter-Medium.woff2") format("woff2");
}

@font-face {
    font-family: "Inter";
    font-style: normal;
    font-weight: 600;
    font-display: swap;
    src: url("/fonts/inter/Inter-SemiBold.woff2") format("woff2");
}

@font-face {
    font-family: "Inter";
    font-style: normal;
    font-weight: 700;
    font-display: swap;
    src: url("/fonts/inter/Inter-Bold.woff2") format("woff2");
}

/* --- Pretendard (한글 폰트) --- */
@font-face {
    font-family: "Pretendard";
    font-style: normal;
    font-weight: 400;
    font-display: swap;
    src: url("/fonts/pretendard/Pretendard-Regular.subset.woff2") format("woff2");
    unicode-range: U+AC00-D7A3, U+3130-318F; /* 한글 음절 + 자모 */
}

@font-face {
    font-family: "Pretendard";
    font-style: normal;
    font-weight: 700;
    font-display: swap;
    src: url("/fonts/pretendard/Pretendard-Bold.subset.woff2") format("woff2");
    unicode-range: U+AC00-D7A3, U+3130-318F;
}

/* --- JetBrains Mono (코드 폰트) --- */
@font-face {
    font-family: "JetBrains Mono";
    font-style: normal;
    font-weight: 400;
    font-display: swap;
    src: url("/fonts/jetbrains-mono/JetBrainsMono-Regular.woff2") format("woff2");
}

@font-face {
    font-family: "JetBrains Mono";
    font-style: normal;
    font-weight: 700;
    font-display: swap;
    src: url("/fonts/jetbrains-mono/JetBrainsMono-Bold.woff2") format("woff2");
}
```

#### Step 3: `__root.tsx` 수정

```diff
// __root.tsx 변경사항
  links: [
      {
          rel: "stylesheet",
          href: appCss,
      },
-     {
-         rel: "preconnect",
-         href: "https://fonts.googleapis.com",
-     },
-     {
-         rel: "stylesheet",
-         href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
-     },
+     {
+         rel: "stylesheet",
+         href: fontCss,      // import fontCss from "../fonts.css?url";
+     },
  ],
```

#### Step 4: `styles.css` 폰트 스택 수정

```diff
body {
-   font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto",
-       "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue",
-       sans-serif;
+   font-family: "Inter", "Pretendard", -apple-system, BlinkMacSystemFont,
+       "Segoe UI", system-ui, sans-serif;
}
```

### 4.3 구매 폰트의 사내 공유 프로세스

> [!WARNING]
> 상용 폰트는 **라이선스 유형에 따라 배포 방식이 제한됩니다**. 반드시 라이선스 조건을 확인하세요.

#### 라이선스 유형별 적용 방법

| 라이선스 유형 | 설명 | WebCG-K 적용 가능 여부 |
|--------------|------|----------------------|
| **OFL (SIL Open Font License)** | 무료, 재배포 가능 | ✅ `public/fonts/`에 직접 포함 |
| **Apache 2.0** | 무료, 재배포 가능 | ✅ `public/fonts/`에 직접 포함 |
| **데스크탑 라이선스** | PC 설치용 | ❌ 웹앱 `@font-face` 사용 **불가** |
| **웹 라이선스 (Webfont)** | 서버 호스팅 허용 | ✅ `public/fonts/`에 포함 가능 |
| **앱 임베드 라이선스** | 앱 내 임베딩 허용 | ✅ 가능 (수량/도메인 제한 확인 필요) |

#### 사내 폰트 공유 절차

```
1. 폰트 구매 (웹 라이선스)
   └─ 예: 산돌구름, 윤디자인, Adobe Fonts 등

2. 폰트 파일 변환
   └─ TTF/OTF → WOFF2 변환 (오프라인 도구: fonttools / woff2_compress)
   └─ 서브셋팅: 한글 완성형(KS X 1001) + ASCII만 추출 → 파일 크기 대폭 감소

3. 프로젝트에 포함
   └─ webcg-k/public/fonts/custom/{폰트명}/
   └─ LICENSE.txt 함께 배치

4. @font-face 선언 추가
   └─ fonts.css에 선언

5. 빌드 & 배포
   └─ npm run build → dist/fonts/ 에 자동 포함
   └─ 사내 서버 배포 시 폰트 파일 포함
```

#### 오프라인 폰트 변환 도구

```bash
# pyftsubset을 이용한 서브셋팅 + WOFF2 변환 (Python, 오프라인 가능)
pip install fonttools brotli

# 한글 완성형 + ASCII + 특수문자만 추출
pyftsubset NotoSansKR-Regular.otf \
    --unicodes="U+0020-007E,U+AC00-D7A3,U+3130-318F,U+2000-206F" \
    --flavor=woff2 \
    --output-file=NotoSansKR-Regular.subset.woff2
```

### 4.4 그래픽 편집기에서의 폰트 관리

> [!IMPORTANT]
> 방송 그래픽 자막에 사용되는 폰트는 **UI 폰트와 별개로** 관리해야 합니다.

#### 현재: 그래픽 편집기의 폰트 선택

그래픽 편집기(`GraphicsEditor`)의 텍스트 요소에서 폰트를 선택할 때, 사용 가능한 폰트 목록을 시스템에 등록된 폰트와 동기화해야 합니다.

#### 제안: 폰트 레지스트리 시스템

```typescript
// lib/fontRegistry.ts — 사용 가능한 폰트 목록 관리
export interface FontEntry {
    family: string;        // CSS font-family 이름
    label: string;         // UI 표시명 (한글)
    weights: number[];     // 사용 가능한 weight 목록
    category: "system" | "custom" | "broadcast"; // 용도별 분류
    license: string;       // 라이선스 정보
    previewText?: string;  // 미리보기 텍스트
}

// 사내 폰트 레지스트리
export const FONT_REGISTRY: FontEntry[] = [
    {
        family: "Inter",
        label: "Inter",
        weights: [400, 500, 600, 700],
        category: "system",
        license: "OFL",
    },
    {
        family: "Pretendard",
        label: "프리텐다드",
        weights: [400, 500, 600, 700],
        category: "system",
        license: "OFL",
    },
    {
        family: "NotoSansKR",
        label: "본고딕 (Noto Sans KR)",
        weights: [400, 700],
        category: "broadcast",
        license: "OFL",
    },
    // 구매 폰트 추가
    {
        family: "SpoqaHanSansNeo",
        label: "스포카 한 산스 네오",
        weights: [400, 700],
        category: "broadcast",
        license: "OFL",
    },
];
```

#### 폰트 관리 Admin UI 확장 (미래)

```
관리자 페이지 → 폰트 관리 탭
├── 등록된 폰트 목록 (FONT_REGISTRY 기반)
├── 폰트 업로드 (.woff2 파일)
│   └── Supabase Storage의 fonts 버킷에 저장
│   └── 자동 @font-face 생성 (dynamic <style> 주입)
├── 폰트 미리보기 (가나다라 + ABCDE)
└── 라이선스 정보 표시
```

---

## 5. 아이콘 에셋 관리 — 날씨 아이콘 등

### 5.1 현재 문제 상세

`dataProviders.ts`의 `WEATHER_CODE_MAP`은 **유니코드 이모지**만 사용:

```typescript
// ❌ 문제점:
// 1. Windows vs macOS vs Linux에서 이모지 렌더링이 다름
// 2. 4K 방송 송출 시 이모지가 저해상도로 렌더링
// 3. SVG CG 내에서 이모지는 <text>로 삽입 → 크기/색상 제어 불가
// 4. 일부 브라우저에서 이모지 칼러 지원 불완전

{ description: "맑음", icon: "☀️" }   // → OS별 다른 모양
{ description: "뇌우", icon: "⛈" }   // → 방송 품질 부적합
```

### 5.2 해결 방법: SVG 아이콘 로컬 호스팅

#### Step 1: 아이콘 세트 선정

| 아이콘 세트 | 형식 | 라이선스 | 사내망 호환 | 추천 |
|------------|------|---------|------------|------|
| **[Meteocons](https://bas.dev/work/meteocons)** | 애니메이션 SVG | MIT | ✅ | ⭐⭐⭐ |
| **[Weather Icons](https://erikflowers.github.io/weather-icons/)** | SVG/Font | SIL OFL | ✅ | ⭐⭐ |
| **[Lucide](https://lucide.dev/)** | SVG | ISC | ✅ | UI 아이콘용 |
| OpenWeather Icons | PNG | 별도 API 필요 | ❌ | 비추천 |

> [!TIP]
> **Meteocons** 추천 — 애니메이션 SVG로 방송 그래픽 품질에 적합하며, MIT 라이선스로 재배포 자유. 파일 다운로드 후 오프라인 사용 가능.

#### Step 2: 디렉토리 구조

```
webcg-k/
├── public/
│   └── icons/
│       ├── weather/                  ← 날씨 아이콘 (SVG)
│       │   ├── clear-day.svg         ← 맑음 (낮)
│       │   ├── clear-night.svg       ← 맑음 (밤)
│       │   ├── partly-cloudy-day.svg ← 부분 흐림
│       │   ├── cloudy.svg            ← 흐림
│       │   ├── fog.svg               ← 안개
│       │   ├── drizzle.svg           ← 이슬비
│       │   ├── rain.svg              ← 비
│       │   ├── snow.svg              ← 눈
│       │   ├── thunderstorm.svg      ← 뇌우
│       │   └── ...
│       │
│       ├── ui/                       ← UI 범용 아이콘 (Lucide SVG export)
│       │   ├── play.svg
│       │   ├── pause.svg
│       │   └── ...
│       │
│       └── data-source/              ← 데이터 소스별 아이콘
│           ├── earthquake.svg
│           ├── wildfire.svg
│           └── api.svg
```

#### Step 3: `WEATHER_CODE_MAP` 개선

```typescript
// ✅ 개선안: 이모지 → SVG 경로로 변경
const WEATHER_ICON_BASE = "/icons/weather";

const WEATHER_CODE_MAP: Record<number, {
    description: string;
    icon: string;         // 이모지 fallback (텍스트 전용 환경용)
    svgIcon: string;      // SVG 파일 경로
    animated?: boolean;   // 애니메이션 SVG 여부
}> = {
    0:  { description: "맑음",       icon: "☀️", svgIcon: `${WEATHER_ICON_BASE}/clear-day.svg`, animated: true },
    1:  { description: "대체로 맑음", icon: "🌤", svgIcon: `${WEATHER_ICON_BASE}/partly-cloudy-day.svg`, animated: true },
    2:  { description: "부분 흐림",   icon: "⛅", svgIcon: `${WEATHER_ICON_BASE}/partly-cloudy-day.svg` },
    3:  { description: "흐림",       icon: "☁️", svgIcon: `${WEATHER_ICON_BASE}/cloudy.svg` },
    45: { description: "안개",       icon: "🌫", svgIcon: `${WEATHER_ICON_BASE}/fog.svg`, animated: true },
    51: { description: "약한 이슬비", icon: "🌦", svgIcon: `${WEATHER_ICON_BASE}/drizzle.svg`, animated: true },
    61: { description: "약한 비",    icon: "🌧", svgIcon: `${WEATHER_ICON_BASE}/rain.svg`, animated: true },
    71: { description: "약한 눈",    icon: "🌨", svgIcon: `${WEATHER_ICON_BASE}/snow.svg`, animated: true },
    95: { description: "뇌우",      icon: "⛈",  svgIcon: `${WEATHER_ICON_BASE}/thunderstorm.svg`, animated: true },
    // ... 전체 WMO 코드 매핑
};
```

#### Step 4: AI CG 생성 시 아이콘 활용

```typescript
// aiCgService.ts — 시스템 프롬프트에 아이콘 URL 컨텍스트 주입
const systemPrompt = `
...
날씨 아이콘은 반드시 SVG <image> 요소를 사용하세요.
사용 가능한 아이콘 경로:
- 맑음: /icons/weather/clear-day.svg
- 흐림: /icons/weather/cloudy.svg
- 비: /icons/weather/rain.svg
- 눈: /icons/weather/snow.svg
- 뇌우: /icons/weather/thunderstorm.svg

예시:
<image href="/icons/weather/clear-day.svg" x="50" y="50" width="120" height="120" />
`;
```

### 5.3 Supabase Storage 기반 아이콘 관리 (대안)

Supabase Storage를 활용하면 **관리자 UI에서 아이콘을 업로드/교체**할 수 있습니다:

```
Supabase Storage
├── buckets/
│   ├── images        ← 기존 이미지 버킷
│   ├── fonts         ← 폰트 파일 버킷 (신규)
│   └── icons         ← 아이콘 버킷 (신규)
│       ├── weather/clear-day.svg
│       ├── weather/rain.svg
│       └── ...
```

**장점**: 재빌드 없이 아이콘 교체 가능, Admin UI로 관리  
**단점**: Supabase 서버 가용성에 의존, 초기 로딩 시 네트워크 요청 필요

> [!NOTE]
> 사내망 환경에서는 **`public/` 정적 배포**(빌드 포함)를 우선하고, 자주 변경되는 에셋만 Supabase Storage를 사용하는 **하이브리드 전략**이 최적입니다.

---

## 6. 접근성(A11Y) 감사

| 항목 | 현재 상태 | 권장 수준 | 우선순위 |
|------|-----------|-----------|----------|
| 색상 대비 | `--text-secondary: #a3a3a3` on `#1a1a1a` = 6.3:1 | AA (4.5:1) | ✅ 충족 |
| 색상 대비 | `--text-tertiary: #737373` on `#1a1a1a` = 3.5:1 | AA (4.5:1) | ⚠️ 미충족 |
| 키보드 내비게이션 | 타임라인/편집기 일부 지원 | 전체 컴포넌트 | 🟡 중 |
| ARIA 레이블 | 아이콘 버튼에 미적용 | 모든 인터랙티브 요소 | 🟡 중 |
| 포커스 표시기 | `:focus` 스타일 일부 누락 | 모든 포커스 가능 요소 | 🟡 중 |
| 스크린 리더 | 미테스트 | NVDA/VoiceOver 호환 | 🔵 낮 |

---

## 7. 성능 감사

### 7.1 CSS 성능 우려

| 항목 | 영향 | 완화 방법 |
|------|------|-----------|
| `backdrop-filter: blur(12px)` | GPU 렌더링 부하 (특히 겹칠 때) | 레이어 수 제한, will-change 명시적 사용 |
| Glassmorphism 중첩 | 복합 레이어 생성 → 리페인트 증가 | 최대 2겹 이내로 제한 |
| `transition: all` | 불필요한 속성까지 애니메이션 | 특정 속성만 명시 |

### 7.2 폰트 로딩 성능

| 방법 | FOUT/FOIT | 파일 크기 | 사내망 |
|------|-----------|-----------|--------|
| Google Fonts CDN | FOUT (swap) | 외부 | ❌ |
| 로컬 WOFF2 (서브셋) | FOUT (swap) | ~50KB/weight | ✅ |
| 로컬 WOFF2 (풀) | FOUT (swap) | ~300KB/weight | ✅ |
| system-ui 전용 | 없음 | 0KB | ✅ |

> [!TIP]
> **서브셋팅**으로 한글 완성형(KS X 1001, 2,350자) + ASCII만 추출하면 WOFF2 기준 약 50~80KB로 축소됩니다.

---

## 8. 개선 로드맵

### Phase A: 사내망 대응 (즉시, 필수)

- [ ] **A-1**: `public/fonts/` 디렉토리 생성, Inter + Pretendard + JetBrains Mono WOFF2 파일 배치
- [ ] **A-2**: `fonts.css` 파일 생성 (`@font-face` 선언)
- [ ] **A-3**: `__root.tsx`에서 Google Fonts CDN 링크 제거, 로컬 `fonts.css` 임포트로 교체
- [ ] **A-4**: `styles.css` `font-family` 스택에 Pretendard 추가
- [ ] **A-5**: 빌드 후 사내망 테스트 (폰트 정상 로딩 확인)

### Phase B: 아이콘 시스템 구축 (1주)

- [ ] **B-1**: Meteocons SVG 아이콘 다운로드 → `public/icons/weather/` 배치
- [ ] **B-2**: `WEATHER_CODE_MAP` 확장 — `svgIcon` 필드 추가
- [ ] **B-3**: AI CG 시스템 프롬프트에 SVG 아이콘 경로 컨텍스트 주입
- [ ] **B-4**: 오버레이 렌더러에서 SVG `<image>` 아이콘 렌더링 검증

### Phase C: 구매 폰트 시스템화 (2주)

- [ ] **C-1**: `lib/fontRegistry.ts` 생성 — 폰트 레지스트리 인터페이스
- [ ] **C-2**: 그래픽 편집기 텍스트 패널에 폰트 선택 드롭다운 연동
- [ ] **C-3**: 구매 폰트 WOFF2 변환 절차 문서화 (오프라인 스크립트 포함)
- [ ] **C-4**: (선택) Admin 폰트 관리 페이지 UI

### Phase D: 디자인 품질 개선 (장기)

- [ ] **D-1**: 타이포그래피 스케일 정의 (h1~h6, body, caption, code)
- [ ] **D-2**: `--text-tertiary` 색상 대비 AA 기준 충족 조정
- [ ] **D-3**: 포커스 표시기 전역 적용
- [ ] **D-4**: 번들 사이즈 분석 (`npx vite-bundle-visualizer`)

### Phase E: 사내망 데이터 소스 대응 (장기)

- [ ] **E-1**: 기상청 API 프록시 서버 또는 수동 데이터 입력 UI
- [ ] **E-2**: 지진 데이터 사내 캐시 또는 mock 모드 설정
- [ ] **E-3**: AI CG 생성 — 사내 LLM(Ollama 등) 연동 또는 사전 생성 갤러리 활용

---

## 9. shadcn/ui 도입 분석

> **결론**: shadcn/ui 도입은 WebCG-K의 **유지보수성, 접근성, 테마 확장성**을 크게 개선합니다.
> 방송 전용 커스텀 UI는 건드리지 않고, 대시보드/관리 영역의 기본 UI 컴포넌트를 교체합니다.

### 9.1 현재 상태 vs shadcn/ui

| 항목 | 현재 WebCG-K | shadcn/ui 도입 시 |
|------|-------------|------------------|
| **CSS 코드량** | **8,146줄** (8개 CSS 파일) | 공통 UI 30~40% 감소 |
| **컴포넌트 수** | 60개 TSX (전부 수동 구현) | 기본 UI를 shadcn으로 대체 |
| **디자인 시스템** | 수동 CSS Variables + Glassmorphism | CSS Variables 테마 + Tailwind 유틸리티 |
| **컴포넌트 라이브러리** | 없음 | Radix UI 기반 접근성 보장 |
| **Tailwind** | v4 설치됨, `@import` 선언만 | 적극 활용 |
| **A11Y** | 부분적 | **Radix 기반 자동 보장** |

### 9.2 도입 장점

1. **유지보수 코드량 감소**: `.btn`, `.input`, `select` 등 수동 CSS → shadcn 컴포넌트로 교체
2. **접근성(A11Y) 자동 해결**: ARIA, 포커스 관리, 키보드 내비게이션이 Radix 프리미티브로 내장
3. **다크/라이트 모드 전환 용이**: CSS Variables 테마 시스템이 기존 `--bg-*`, `--text-*`와 호환
4. **소스 코드 완전 소유**: npm 패키지가 아닌 소스 복사 방식 → 사내망 환경 문제 없음, 커스텀 자유
5. **타입 안전한 컴포넌트 API**: `<Button variant="destructive">` 등 일관된 인터페이스

### 9.3 교체 영역 분석

#### ✅ 교체 가능 (~40%)

| 현재 구현 | shadcn 대체 |
|---------|-----------|
| `.btn`, `.btn-primary/secondary/danger` | `<Button variant="...">` |
| `.input`, `select` 전역 다크모드 | `<Input>`, `<Select>` |
| 모달 (z-index 수동 관리) | `<Dialog>` (Radix 포탈) |
| 드롭다운 메뉴 | `<DropdownMenu>` |
| 토글 (ON/OFF) | `<Switch>` |
| 탭 (`.controller-tab`) | `<Tabs>` |
| TanStack Table 래퍼 | `<DataTable>` |
| 슬라이더 (opacity, temperature) | `<Slider>` |
| 토스트 알림 | `<Sonner>` |

#### ❌ 교체 불가 (~60%) — 방송 전용 커스텀

| 컴포넌트 | 이유 |
|---------|------|
| `Timeline` / `TrackRow` / `DraggableBlock` | 방송 전용 커스텀 UI |
| `GraphicsEditor` (Canvas, 레이어) | SVG 편집기 |
| `GridSplitEditor` (BSP 분할) | 완전 커스텀 |
| `OverlayPlayoutLayer` (렌더러) | 방송 송출 전용 |
| `PGMMonitor` / `PreviewMonitor` | 방송 모니터 UI |

### 9.4 점진적 도입 전략

```
Phase 1 (현재): shadcn init + 기본 컴포넌트 (Button, Input, Dialog, Select, Label)
Phase 2 (이후): 대시보드 교체 (Sidebar, Table, Tabs, Select)
Phase 3 (이후): Admin/설정 (Slider, Switch, Toast)
Phase 4 (이후): Glassmorphism 테마를 shadcn CSS Variables로 통합
```

> [!NOTE]
> 전면 교체(Big Bang)가 아닌, **새 기능부터 shadcn 사용 + 기존 기본 UI 점진 교체** 방식을 채택합니다.

---

## 부록: 실무 체크리스트

### 사내망 배포 전 최소 확인 항목

```
□ 모든 폰트가 public/fonts/에 WOFF2로 포함되어 있는가?
□ __root.tsx에서 외부 CDN 참조가 완전히 제거되었는가?
□ npm run build 후 dist/ 안에 fonts/ 디렉토리가 생성되는가?
□ 날씨 아이콘이 public/icons/weather/에 SVG로 포함되어 있는가?
□ dataProviders.ts에서 외부 API 호출 실패 시 graceful fallback이 작동하는가?
□ 구매 폰트의 라이선스 증빙(LICENSE.txt)이 프로젝트에 포함되어 있는가?
□ Supabase가 사내 Docker로 정상 구동되는가?
```
