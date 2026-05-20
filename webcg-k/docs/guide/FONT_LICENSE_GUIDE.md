# WebCG-K 폰트 관리 및 번들링 가이드

> **작성일**: 2026-02-19  
> **범위**: 방송 그래픽 시스템에서 사용되는 폰트의 관리, 번들링, 라이선스 지침  
> **대상**: 폰트 관리가 처음인 분도 따라할 수 있도록 작성

---

## 📋 목차

1. [번들링이란?](#1-번들링이란)
2. [현재 프로젝트에 번들링된 폰트 목록](#2-현재-프로젝트에-번들링된-폰트-목록)
3. [폰트 번들링 절차 (처음부터 끝까지)](#3-폰트-번들링-절차-처음부터-끝까지)
4. [각 폰트별 입수 경로 및 설치 방법](#4-각-폰트별-입수-경로-및-설치-방법)
5. [@font-face 등록 방법](#5-font-face-등록-방법)
6. [fontRegistry에 폰트 등록하기](#6-fontregistry에-폰트-등록하기)
7. [라이선스 유형별 적용 가능 여부](#7-라이선스-유형별-적용-가능-여부)
8. [구매 폰트 도입 절차](#8-구매-폰트-도입-절차)
9. [오프라인 폰트 변환 (서브셋팅)](#9-오프라인-폰트-변환-서브셋팅)
10. [주요 폰트 파운드리 정보](#10-주요-폰트-파운드리-정보)

---

## 1. 번들링이란?

**"폰트 번들링"**이란, 웹 페이지에서 사용할 폰트 파일을 **프로젝트 안에 직접 넣어두는 것**을 말합니다.

### 왜 번들링이 필요한가?

일반적인 웹사이트는 Google Fonts 같은 **외부 서버(CDN)**에서 폰트를 받아옵니다:

```html
<!-- ❌ CDN 방식 — 인터넷이 필요 -->
<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">
```

하지만 우리 프로젝트는 **사내망(에어갭) 환경**에서 동작해야 합니다. 인터넷이 없으면 폰트를 받아올 수 없어서 글자가 기본 시스템 폰트(돋움, 굴림 등)로 표시됩니다.

그래서 폰트 파일을 프로젝트 폴더에 **직접 넣어두고**, CSS에서 그 파일을 참조하는 방식을 사용합니다:

```css
/* ✅ 번들링 방식 — 인터넷 불필요 */
@font-face {
  font-family: "Inter";
  src: url("/fonts/inter/Inter-Regular.woff2") format("woff2");
}
```

### 폰트 파일 형식

| 형식 | 확장자 | 특징 |
|------|--------|------|
| **WOFF2** | `.woff2` | 🏆 **최우선 사용**. 가장 높은 압축률(Brotli), 모든 최신 브라우저 지원 |
| **WOFF** | `.woff` | WOFF2를 구할 수 없을 때 대안. WOFF2보다 용량이 20~30% 더 큼 |
| **TTF** | `.ttf` | 무압축. 원본 폰트 파일 형식. 웹에서는 가급적 사용하지 않음 |
| **OTF** | `.otf` | TTF와 비슷하지만 OpenType 기능 지원. 역시 웹에서는 비권장 |

> [!TIP]
> **항상 WOFF2를 최우선으로** 사용하세요. 용량이 작아 페이지 로딩이 빠릅니다.  
> WOFF2를 구할 수 없으면 WOFF를 사용합니다.

---

## 2. 현재 프로젝트에 번들링된 폰트 목록

### 🇰🇷 한글 폰트 (7종)

| 폰트 | 용도 | 라이선스 | 굵기(Weight) | 형식 | 파일 크기/개 |
|------|------|---------|-------------|------|-------------|
| **Pretendard** | UI 기본 (한글) | OFL | 400, 500, 600, 700 | WOFF2 | ~260KB |
| **Spoqa Han Sans Neo** | 데이터/숫자 화면 | OFL | 400, 500, 700 | WOFF2 | ~175KB |
| **SUIT** | 세련된 UI | OFL | 100~900 (9단계) | WOFF2 | ~165KB |
| **Noto Sans KR** | 범용 본고딕 | OFL | 400, 500, 600, 700 | WOFF2 | ~540KB |
| **Gmarket Sans** | CG 타이틀/자막 | 무료(상업용) | 300, 500, 700 | WOFF | ~590KB |
| **Nanum Square Neo** | 뉴스/인포그래픽 | OFL | 300, 400, 700, 800, 900 | WOFF2 | ~370KB |
| **에스코어 드림 (S-Core Dream)** | 제목용 고딕 | 무료(상업용) | 300~900 (7단계) | WOFF | ~355KB |

### 🇺🇸 영문 폰트 (5종 + 기존 2종)

| 폰트 | 용도 | 라이선스 | 굵기(Weight) | 형식 | 파일 크기/개 |
|------|------|---------|-------------|------|-------------|
| **Inter** | UI 기본 (영문) | OFL | 400, 500, 600, 700 | WOFF2 | ~23KB |
| **JetBrains Mono** | 코드/모노스페이스 | Apache 2.0 | 400, 700 | WOFF2 | ~20KB |
| **Roboto** | 구글 기본 | Apache 2.0 | 400, 500, 700 | WOFF2 | ~20KB |
| **Roboto Condensed** | 좁은 공간용 | Apache 2.0 | 400, 700 | WOFF2 | ~20KB |
| **Montserrat** | 세련된 타이틀 | OFL | 400, 500, 600, 700 | WOFF2 | ~18KB |
| **Oswald** | 스포츠/뉴스 티커 | OFL | 400, 500, 600, 700 | WOFF2 | ~12KB |
| **Poppins** | 둥근 친근한 느낌 | OFL | 400, 500, 600, 700 | WOFF2 | ~7KB |

### 📊 파일 위치

모든 번들 폰트는 아래 경로에 위치합니다:

```
webcg-k/public/fonts/
├── inter/                    ← UI 기본 영문
├── pretendard/               ← UI 기본 한글
├── jetbrains-mono/           ← 코드 전용
├── spoqa-han-sans-neo/       ← 데이터/숫자
├── suit/                     ← 세련된 UI
├── noto-sans-kr/             ← 범용 본고딕
├── gmarket-sans/             ← CG 타이틀
├── nanum-square-neo/         ← 뉴스/인포그래픽
├── scdream/                  ← 제목용 고딕
├── roboto/                   ← 구글 기본
├── roboto-condensed/         ← 좁은 공간용
├── montserrat/               ← 세련된 타이틀
├── oswald/                   ← 스포츠/티커
└── poppins/                  ← 둥근 친근한
```

---

## 3. 폰트 번들링 절차 (처음부터 끝까지)

새로운 폰트를 프로젝트에 추가하려면 아래 **4단계**를 따릅니다.

### 전체 흐름도

```
[1단계] 폰트 파일 구하기 (WOFF2)
          ↓
[2단계] public/fonts/ 폴더에 파일 배치
          ↓
[3단계] CSS에 @font-face 등록
          ↓
[4단계] fontRegistry.ts에 시스템 폰트로 등록
```

### 1단계: 폰트 파일 구하기

폰트 파일을 구하는 방법은 크게 3가지입니다:

#### 방법 A: npm 패키지에서 추출 (가장 편리)

```bash
# 1. 패키지 설치
npm install --save-dev @fontsource/montserrat

# 2. 설치된 파일 경로 확인
find node_modules/@fontsource/montserrat/files -name "*latin-400*normal*woff2"
#    → node_modules/@fontsource/montserrat/files/montserrat-latin-400-normal.woff2

# 3. public/fonts/로 복사
mkdir -p public/fonts/montserrat
cp node_modules/@fontsource/montserrat/files/montserrat-latin-400-normal.woff2 \
   public/fonts/montserrat/Montserrat-Regular.woff2
```

> [!NOTE]
> **`@fontsource`** 패키지는 Google Fonts에 있는 거의 모든 폰트를 npm으로 제공합니다.  
> 영문 폰트는 `latin` subset만 복사하면 됩니다. (한글 폰트는 `korean` subset)

#### 방법 B: GitHub 릴리즈에서 다운로드 (한글 폰트)

```bash
# 예: SUIT 폰트 (GitHub 릴리즈 → ZIP 파일)
curl -sL -o /tmp/suit.zip \
  "https://github.com/sun-typeface/SUIT/releases/latest/download/SUIT-woff2.zip"

# ZIP 해제 후 필요한 파일만 복사
python3 -c "import zipfile; zipfile.ZipFile('/tmp/suit.zip').extractall('/tmp/suit')"
cp /tmp/suit/*.woff2 public/fonts/suit/
```

#### 방법 C: CDN URL에서 직접 다운로드 (눈누/네이버)

```bash
# 예: 에스코어 드림 (눈누 CDN)
curl -o public/fonts/scdream/SCDream5-Medium.woff \
  "https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_six@1.2/S-CoreDream-5Medium.woff"

# 예: Nanum Square Neo (네이버 CDN)
curl -o public/fonts/nanum-square-neo/NanumSquareNeo-Regular.woff2 \
  "https://hangeul.pstatic.net/hangeul_static/webfont/NanumSquareNeo/NanumSquareNeoTTF-bRg.woff2"
```

> [!TIP]
> **눈누(noonnu.cc)** 에서 한글 폰트를 검색하면, `@font-face` CSS 코드와 함께 CDN URL을 제공합니다.  
> 그 URL에서 직접 WOFF/WOFF2 파일을 다운로드할 수 있습니다.

### 2단계: 파일 배치

다운로드한 파일을 `public/fonts/[폰트이름]/` 폴더에 넣습니다.

```bash
mkdir -p public/fonts/새폰트이름
cp 다운로드한파일.woff2 public/fonts/새폰트이름/
```

**파일명 규칙** (권장):
```
폰트이름-Weight.woff2
예: Montserrat-Regular.woff2     ← Weight 400
    Montserrat-Medium.woff2      ← Weight 500
    Montserrat-SemiBold.woff2    ← Weight 600
    Montserrat-Bold.woff2        ← Weight 700
```

### 3단계: CSS에 @font-face 등록

`src/fonts.css` 파일에 아래 형식으로 추가합니다:

```css
/* ────────────────────────────────────────────────
 * Montserrat — 세련된 타이틀용 산세리프
 * 라이선스: OFL (SIL Open Font License)
 * ──────────────────────────────────────────────── */

/* Montserrat Regular (400) */
@font-face {
  font-family: "Montserrat";         /* ① CSS에서 사용할 이름 */
  font-style: normal;                /* ② normal 또는 italic */
  font-weight: 400;                  /* ③ 숫자 100~900 */
  font-display: swap;                /* ④ 폰트 로딩 전 시스템 폰트로 표시 */
  src: url("/fonts/montserrat/Montserrat-Regular.woff2") format("woff2");
  /*    ⑤ 파일 경로 (public/ 기준 상대경로)    ⑥ 파일 형식 */
}

/* Montserrat Bold (700) */
@font-face {
  font-family: "Montserrat";
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("/fonts/montserrat/Montserrat-Bold.woff2") format("woff2");
}
```

**각 항목 설명:**

| 번호 | 속성 | 설명 |
|------|------|------|
| ① | `font-family` | CSS에서 이 폰트를 부를 때 쓰는 이름. 같은 이름이면 같은 폰트 패밀리로 묶임 |
| ② | `font-style` | `normal` (일반) 또는 `italic` (기울임) |
| ③ | `font-weight` | 100(Thin) ~ 900(Black). 400=Regular, 500=Medium, 700=Bold |
| ④ | `font-display` | `swap` = 폰트 로딩 전에 시스템 폰트로 먼저 텍스트를 보여줌 (깜빡임 방지) |
| ⑤ | `src: url(...)` | 폰트 파일의 경로. `public/` 폴더가 루트(`/`)가 됨 |
| ⑥ | `format(...)` | `"woff2"` 또는 `"woff"` — 브라우저에게 파일 형식을 알려줌 |

> [!IMPORTANT]
> **한글 폰트**는 `unicode-range`를 추가하면 성능이 개선됩니다.  
> 영문 입력 시에는 한글 폰트 파일을 다운로드하지 않아 로딩이 빨라집니다.
>
> ```css
> @font-face {
>   font-family: "Pretendard";
>   font-weight: 400;
>   src: url("/fonts/pretendard/Pretendard-Regular.subset.woff2") format("woff2");
>   unicode-range: U+AC00-D7A3, U+3130-318F;  /* 한글 완성형 + 자모 */
> }
> ```

### 4단계: fontRegistry에 등록

`src/lib/fontRegistry.ts`의 `SYSTEM_FONTS` 배열에 폰트 정보를 추가합니다:

```typescript
{
  family: "Montserrat",         // CSS font-family 이름 (3단계 ①과 동일)
  label: "Montserrat",          // 폰트 관리 UI에 표시될 이름
  weights: [400, 500, 600, 700],// 등록한 weight 목록
  category: "broadcast",        // "system" | "broadcast" | "custom"
  license: "OFL",               // 라이선스 유형
  previewText: "ABCDE 12345",  // 미리보기 텍스트
},
```

**카테고리(category) 구분:**

| 값 | 의미 | 대상 |
|---|---|---|
| `system` | UI 시스템 폰트 | Inter, Pretendard, JetBrains Mono |
| `broadcast` | 방송 그래픽용 | Gmarket Sans, Oswald 등 제목/자막용 |
| `custom` | 사용자 업로드 | 대시보드에서 업로드한 폰트 |

---

## 4. 각 폰트별 입수 경로 및 설치 방법

### 한글 폰트

| 폰트 | 입수 방법 | 출처 URL |
|------|----------|----------|
| Pretendard | npm: `pretendard` | [GitHub](https://github.com/orioncactus/pretendard) |
| Spoqa Han Sans Neo | npm: `spoqa-han-sans` (Subset 사용) | [GitHub](https://github.com/spoqa/spoqa-han-sans) |
| SUIT | GitHub 릴리즈 ZIP 다운로드 | [GitHub](https://github.com/sun-typeface/SUIT) |
| Noto Sans KR | npm: `@fontsource/noto-sans-kr` 또는 [gwfh](https://gwfh.mranftl.com/) | [Google Fonts](https://fonts.google.com/noto/specimen/Noto+Sans+KR) |
| Gmarket Sans | 눈누 CDN 다운로드 | [눈누](https://noonnu.cc/font_page/366) |
| Nanum Square Neo | 네이버 CDN 다운로드 | [네이버 한글](https://hangeul.naver.com/font) |
| S-Core Dream | 눈누 CDN 다운로드 | [눈누](https://noonnu.cc/font_page/6) |

### 영문 폰트

| 폰트 | 입수 방법 | npm 패키지명 |
|------|----------|-------------|
| Inter | npm: `@fontsource/inter` | `@fontsource/inter` |
| Roboto | npm: `@fontsource/roboto` | `@fontsource/roboto` |
| Roboto Condensed | npm: `@fontsource/roboto-condensed` | `@fontsource/roboto-condensed` |
| Montserrat | npm: `@fontsource/montserrat` | `@fontsource/montserrat` |
| Oswald | npm: `@fontsource/oswald` | `@fontsource/oswald` |
| Poppins | npm: `@fontsource/poppins` | `@fontsource/poppins` |

> [!TIP]
> **폰트 파일 용량 참고**:  
> - 영문 폰트 WOFF2: 7~23KB/weight (매우 가벼움)  
> - 한글 폰트 WOFF2 서브셋: 160~550KB/weight (글자 수가 많아 더 큼)  
> - 한글 폰트 WOFF(비압축): 350~615KB/weight (WOFF2보다 약 2배)

---

## 5. @font-face 등록 방법

`src/fonts.css`에 등록하는 전체 예시입니다.  
Weight에 해당하는 숫자값 참고표:

| 숫자 | 이름 | 설명 |
|------|------|------|
| 100 | Thin | 가장 얇은 |
| 200 | ExtraLight | 매우 얇은 |
| 300 | Light | 가벼운 |
| **400** | **Regular** | **기본 굵기** |
| **500** | **Medium** | **약간 굵은** |
| **600** | **SemiBold** | **중간 굵은** |
| **700** | **Bold** | **굵은** |
| 800 | ExtraBold / Heavy | 매우 굵은 |
| 900 | Black | 가장 굵은 |

---

## 6. fontRegistry에 폰트 등록하기

`src/lib/fontRegistry.ts`의 `SYSTEM_FONTS` 배열에 추가하면, 대시보드 "폰트" 메뉴와 그래픽 편집기의 폰트 선택 목록에 자동으로 표시됩니다.

등록하지 않아도 CSS에 `@font-face`만 있으면 **코드에서는** 사용 가능하지만, **UI 목록에는 나타나지 않습니다**.

---

## 7. 라이선스 유형별 적용 가능 여부

| 라이선스 | 설명 | `@font-face` 사용 | 프로젝트 포함 | WebCG-K 적용 |
|---|---|---|---|---|
| **OFL (SIL Open Font License)** | 무료, 재배포/수정 가능 | ✅ | ✅ | ✅ 적극 권장 |
| **Apache 2.0** | 무료, 모든 용도 허용 | ✅ | ✅ | ✅ 적극 권장 |
| **웹 라이선스 (Webfont)** | 서버 호스팅 허용 | ✅ | ✅ | ✅ 가능 (도메인/PV 제한 확인) |
| **앱 임베드 라이선스** | 앱 내 임베딩 허용 | ✅ | ✅ | ✅ 가능 (수량 제한 확인) |
| **데스크탑 라이선스** | PC 설치 전용 | ❌ | ❌ | ❌ **사용 불가** |
| **개인 사용 전용** | 비상업 용도만 | ❌ | ❌ | ❌ **사용 불가** |

> [!CAUTION]
> **데스크탑 라이선스**는 PC에 설치해서 사용하는 용도입니다.  
> `@font-face`로 웹앱에 포함하면 **라이선스 위반**입니다.  
> 반드시 **웹 라이선스** 또는 **앱 임베드 라이선스**를 별도 구매해야 합니다.

---

## 8. 구매 폰트 도입 절차

```
1. 라이선스 확인
   └─ "웹 라이선스" 또는 "앱 임베드 라이선스"인지 확인
   └─ 도메인 제한, PV 제한, 동시 사용자 수 제한 확인
   └─ 데스크탑 전용이면 ❌ 웹앱 사용 불가

2. 폰트 파일 변환 (WOFF2 최적화)
   └─ OTF/TTF → WOFF2 변환 (fonttools + brotli)
   └─ 서브셋팅: 한글 완성형(2,350자) + ASCII + 특수문자만 추출
   └─ 결과: ~50~100KB/weight (원본 대비 70~80% 감소)

3. 업로드
   └─ 대시보드 → 폰트 → "폰트 업로드" 버튼
   └─ 패밀리 이름, 표시 이름, weight, 라이선스 유형 입력
   └─ 라이선스 메모에 구매처/수량/만료일 기재

4. 사용
   └─ 그래픽 편집기에서 폰트 선택 시 자동 표시
   └─ 렌더러에서 동적 @font-face로 자동 적용
```

---

## 9. 오프라인 폰트 변환 (서브셋팅)

사내망 환경에서는 인터넷 도구를 사용할 수 없으므로, Python 기반 오프라인 변환을 사용합니다:

```bash
# 설치 (최초 1회)
pip install fonttools brotli

# 한글 완성형 + ASCII + 특수문자 추출 → WOFF2 변환
pyftsubset NotoSansKR-Regular.otf \
    --unicodes="U+0020-007E,U+AC00-D7A3,U+3130-318F,U+2000-206F,U+3000-303F" \
    --flavor=woff2 \
    --output-file=NotoSansKR-Regular.subset.woff2

# Weight별 반복
for weight in Regular Medium Bold; do
    pyftsubset "NotoSansKR-${weight}.otf" \
        --unicodes="U+0020-007E,U+AC00-D7A3,U+3130-318F,U+2000-206F,U+3000-303F" \
        --flavor=woff2 \
        --output-file="NotoSansKR-${weight}.subset.woff2"
done
```

**유니코드 범위 설명:**

| 범위 | 의미 |
|------|------|
| `U+0020-007E` | 기본 ASCII (영문, 숫자, 특수문자) |
| `U+AC00-D7A3` | 한글 완성형 11,172자 (가~힣) |
| `U+3130-318F` | 한글 자모 (ㄱ~ㅎ, ㅏ~ㅣ) |
| `U+2000-206F` | 일반 구두점 (—, …, ' 등) |
| `U+3000-303F` | CJK 기호 (、。「」 등) |

---

## 10. 주요 폰트 파운드리 정보

| 파운드리 | 웹 라이선스 | 구매 링크 |
|---|---|---|
| **산돌구름** | 월정액 구독, 웹폰트 포함 | sandoll.co.kr |
| **윤디자인** | 웹 라이선스 별도 구매 | yoondesign.com |
| **모리사와 (폰트플러스)** | 웹폰트 전용 서비스 | fontplus.jp |
| **어도비 (Adobe Fonts)** | CC 구독 포함 (서버 호스팅 불가 ⚠️) | fonts.adobe.com |
| **길형진 (Pretendard 등)** | OFL 무료 | cactus.tistory.com |
| **눈누 (Noonnu)** | 한국 무료 폰트 검색 포털 | noonnu.cc |
| **네이버 한글** | 나눔 시리즈 무료 | hangeul.naver.com |

> [!WARNING]
> **Adobe Fonts**는 자체 CDN 서비스만 허용하며, 폰트 파일을 다운로드하여 자체 서버에 호스팅하는 것은 **라이선스 위반**입니다. 사내망에서는 사용 불가합니다.

---

## 라이선스 관리 체크리스트

```
□ 폰트 도입 전 라이선스 유형 확인 (웹 라이선스인지?)
□ 라이선스 증빙 파일(LICENSE.txt, 구매 영수증) 보관
□ 폰트 업로드 시 라이선스 유형 정확히 선택
□ Commercial 폰트의 만료일/갱신일 관리
□ 프로젝트 배포 시 라이선스 위반 여부 최종 확인
□ Unknown 라이선스 폰트는 상용 배포 전 반드시 확인
```
