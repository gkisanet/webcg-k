# WebCG-K Font Management & Bundling Guide

> **Date**: 2026-02-19  
> **Scope**: Management, bundling, and licensing guidelines for fonts utilized within broadcast graphics playouts.  
> **Target**: Comprehensive and practical breakdown for both developers and operators.

---

## 📋 Table of Contents

1. [What is Font Bundling?](#1-what-is-font-bundling)
2. [Bundled Fonts Registry](#2-bundled-fonts-registry)
3. [Step-by-Step Font Bundling Guide](#3-step-by-step-font-bundling-guide)
4. [Acquisition & Downstream Setup](#4-acquisition--downstream-setup)
5. [Writing @font-face Definitions](#5-writing-font-face-definitions)
6. [Registering Fonts in fontRegistry.ts](#6-registering-fonts-in-fontregistryts)
7. [Font License Matrix](#7-font-license-matrix)
8. [Workflow for Paid Commercial Fonts](#8-workflow-for-paid-commercial-fonts)
9. [Offline Font Optimization (Subsetting)](#9-offline-font-optimization-subsetting)
10. [Major Font Foundries & Registries](#10-major-font-foundries--registries)

---

## 1. What is Font Bundling?

**"Font Bundling"** refers to storing font asset files directly within the local workspace directory, rather than fetching them from external CDNs at runtime.

### Why Bundle Fonts?

Typical public web applications fetch assets dynamically from public content delivery networks (CDNs) like Google Fonts:

```html
<!-- ❌ CDN Playout Pathway — Requires active Internet connectivity -->
<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">
```

However, the WebCG-K broadcast environment operates under strict **internal intranet networks (air-gapped environments)**. 
Without public Internet access, CDN requests fail, reverting on-screen text to standard default system typography (e.g., Arial, Times New Roman), which ruins designed templates.

By keeping copy-on-write assets saved within local assets folders, we ensure stable rendering regardless of network states:

```css
/* ✅ Bundled Playout Pathway — Zero network queries required */
@font-face {
  font-family: "Inter";
  src: url("/fonts/inter/Inter-Regular.woff2") format("woff2");
}
```

### Font Format Specifications

| Format | Extension | Attributes |
|------|--------|------|
| **WOFF2** | `.woff2` | 🏆 **Optimal Choice**. Employs high-performance Brotli compression; natively supported by all modern Chromium engines. |
| **WOFF** | `.woff` | Fallback option if WOFF2 assets are unavailable. File sizes are typically 20-30% larger than WOFF2. |
| **TTF** | `.ttf` | Raw uncompressed assets. Vector masters. Avoid using TTF assets on rendering layers due to overhead. |
| **OTF** | `.otf` | Similar to TTF but supports advanced OpenType curves. Avoid deploying OTF files on rendering layers due to file size. |

> [!TIP]
> **Prioritize WOFF2 assets.** 
> Smaller file sizes lead to faster viewport loads. If a font is only available in WOFF format, use WOFF, but try to avoid raw TTF and OTF formats on playout overlays.

---

## 2. Bundled Fonts Registry

### 🇰🇷 Korean Fonts (7 Styles)

| Style | Purpose | License | Weights | Format | Avg. File Size |
|------|------|---------|-------------|------|-------------|
| **Pretendard** | UI Default (Korean) | SIL OFL | 400, 500, 600, 700 | WOFF2 | ~260 KB |
| **Spoqa Han Sans Neo** | Data and Tickers | SIL OFL | 400, 500, 700 | WOFF2 | ~175 KB |
| **SUIT** | High-contrast Modern UI | SIL OFL | 100 to 900 (9 Steps) | WOFF2 | ~165 KB |
| **Noto Sans KR** | General Typography | SIL OFL | 400, 500, 600, 700 | WOFF2 | ~540 KB |
| **Gmarket Sans** | CG Titles / Subtitles | Free (Commercial) | 300, 500, 700 | WOFF | ~590 KB |
| **Nanum Square Neo** | News Infographics | SIL OFL | 300, 400, 700, 800, 900 | WOFF2 | ~370 KB |
| **S-Core Dream** | Heading Gothic | Free (Commercial) | 300 to 900 (7 Steps) | WOFF | ~355 KB |

### 🇺🇸 English Fonts (7 Styles)

| Style | Purpose | License | Weights | Format | Avg. File Size |
|------|------|---------|-------------|------|-------------|
| **Inter** | UI Default (English) | SIL OFL | 400, 500, 600, 700 | WOFF2 | ~23 KB |
| **JetBrains Mono** | Code & Variables | Apache 2.0 | 400, 700 | WOFF2 | ~20 KB |
| **Roboto** | Standard Sans-Serif | Apache 2.0 | 400, 500, 700 | WOFF2 | ~20 KB |
| **Roboto Condensed** | High-density Tickers | Apache 2.0 | 400, 700 | WOFF2 | ~20 KB |
| **Montserrat** | Editorial Titles | SIL OFL | 400, 500, 600, 700 | WOFF2 | ~18 KB |
| **Oswald** | Sports Tickers | SIL OFL | 400, 500, 600, 700 | WOFF2 | ~12 KB |
| **Poppins** | Rounded Typography | SIL OFL | 400, 500, 600, 700 | WOFF2 | ~7 KB |

### 📊 Directory Assets Map

All bundled font assets are located in the following path:

```
webcg-k/public/fonts/
├── inter/                    ➔ UI Default English
├── pretendard/               ➔ UI Default Korean
├── jetbrains-mono/           ➔ Monospace editor assets
├── spoqa-han-sans-neo/       ➔ Data and numbers
├── suit/                     ➔ High-contrast Modern UI
├── noto-sans-kr/             ➔ General typography
├── gmarket-sans/             ➔ Title graphics
├── nanum-square-neo/         ➔ News and labels
├── scdream/                  ➔ Heading Gothic
├── roboto/                   ➔ Standard Sans-Serif
├── roboto-condensed/         ➔ High-density tickers
├── montserrat/               ➔ Editorial titles
├── oswald/                   ➔ Sports tickers
└── poppins/                  ➔ Rounded friendly typography
```

---

## 3. Step-by-Step Font Bundling Guide

Follow this **4-stage process** to add new fonts to the WebCG-K workspace:

### Process Flow

```
[Stage 1] Acquire WOFF2 asset files
            │
            ▼
[Stage 2] Save files in public/fonts/ directories
            │
            ▼
[Stage 3] Write @font-face declarations in CSS
            │
            ▼
[Stage 4] Add the font configuration to fontRegistry.ts
```

### Stage 1: Acquire the Font Files

You can acquire font assets using one of three methods:

#### Method A: Extracting from npm Packages (Recommended)

```bash
# 1. Install target package
npm install --save-dev @fontsource/montserrat

# 2. Locate the output WOFF2 files
find node_modules/@fontsource/montserrat/files -name "*latin-400*normal*woff2"
# ➔ node_modules/@fontsource/montserrat/files/montserrat-latin-400-normal.woff2

# 3. Copy files to public/fonts/ directories
mkdir -p public/fonts/montserrat
cp node_modules/@fontsource/montserrat/files/montserrat-latin-400-normal.woff2 \
   public/fonts/montserrat/Montserrat-Regular.woff2
```

> [!NOTE]
> The `@fontsource` library publishes Google Fonts as npm packages. 
> For English fonts, copy only the `latin` subset; for Korean fonts, target the `korean` subset.

#### Method B: Downloading GitHub Release ZIPs

```bash
# Example: Fetching SUIT fonts from a GitHub release
curl -sL -o /tmp/suit.zip \
  "https://github.com/sun-typeface/SUIT/releases/latest/download/SUIT-woff2.zip"

# Unpack ZIP and copy WOFF2 files
python3 -c "import zipfile; zipfile.ZipFile('/tmp/suit.zip').extractall('/tmp/suit')"
cp /tmp/suit/*.woff2 public/fonts/suit/
```

#### Method C: Downloading from CDN Endpoints

```bash
# Fetching S-Core Dream from Noonnu CDN
curl -o public/fonts/scdream/SCDream5-Medium.woff \
  "https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_six@1.2/S-CoreDream-5Medium.woff"

# Fetching Nanum Square Neo from Naver CDN
curl -o public/fonts/nanum-square-neo/NanumSquareNeo-Regular.woff2 \
  "https://hangeul.pstatic.net/hangeul_static/webfont/NanumSquareNeo/NanumSquareNeoTTF-bRg.woff2"
```

### Stage 2: Save the Files

Save the files in `public/fonts/[font-name]/` directories.

```bash
mkdir -p public/fonts/new-font-family
cp target-file.woff2 public/fonts/new-font-family/
```

**Recommended Naming Conventions:**
```
[FontName]-[WeightName].woff2
Examples: Montserrat-Regular.woff2     ➔ Weight 400
          Montserrat-Medium.woff2      ➔ Weight 500
          Montserrat-SemiBold.woff2    ➔ Weight 600
          Montserrat-Bold.woff2        ➔ Weight 700
```

### Stage 3: Write `@font-face` Definitions in CSS

Add the `@font-face` blocks to `src/styles.css`:

```css
/* ────────────────────────────────────────────────
 * Montserrat — Elegant Editorial Sans-Serif
 * License: SIL Open Font License (OFL)
 * ──────────────────────────────────────────────── */

/* Montserrat Regular (400) */
@font-face {
  font-family: "Montserrat";         /* ① Name reference used in CSS layouts */
  font-style: normal;                /* ② Font-style: normal or italic */
  font-weight: 400;                  /* ③ Numeric scale: 100 to 900 */
  font-display: swap;                /* ④ swap avoids FOUT (Flash of Unstyled Text) */
  src: url("/fonts/montserrat/Montserrat-Regular.woff2") format("woff2");
  /*    ⑤ Relative filepath resolved from public/  ⑥ Format wrapper */
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

#### Properties Breakdown

| Index | CSS Property | Description |
|------|------|------|
| ① | `font-family` | The font family name referenced in CSS properties. Under the same family name, different weights are grouped together. |
| ② | `font-style` | `normal` or `italic`. |
| ③ | `font-weight` | Numeric scales from 100 (Thin) to 900 (Black). Standard values: 400 (Regular), 500 (Medium), 700 (Bold). |
| ④ | `font-display` | Setting to `swap` instructs Chromium to render fallback system fonts until target web fonts load, keeping text visible. |
| ⑤ | `src: url(...)` | Absolute font path relative to the `public/` directory root (`/`). |
| ⑥ | `format(...)` | Declares file types (`"woff2"` or `"woff"`) so browsers can verify compatibility before downloading. |

> [!IMPORTANT]
> To optimize Korean fonts, declare `unicode-range` selectors in the `@font-face` definitions. 
> This restricts font downloads to pages rendering Korean characters, improving load speeds.
>
> ```css
> @font-face {
>   font-family: "Pretendard";
>   font-weight: 400;
>   src: url("/fonts/pretendard/Pretendard-Regular.subset.woff2") format("woff2");
>   unicode-range: U+AC00-D7A3, U+3130-318F; /* Korean syllables and Jamo */
> }
> ```

### Stage 4: Register in `fontRegistry.ts`

Add the font metadata to the `SYSTEM_FONTS` array in `src/lib/fontRegistry.ts`:

```typescript
{
  family: "Montserrat",         // CSS font-family name (must match Stage 3)
  label: "Montserrat",          // Display name shown in UI dropdowns
  weights: [400, 500, 600, 700],// Array of registered weights
  category: "broadcast",        // Category: "system" | "broadcast" | "custom"
  license: "OFL",               // Font license type
  previewText: "ABCDE 12345",   // Preview text string
}
```

#### Category Definitions

| Category | Description | Target Fonts |
|---|---|---|
| `system` | Core application UI elements | Inter, Pretendard, JetBrains Mono |
| `broadcast` | Broadcast graphics and overlays | Gmarket Sans, Oswald (for titles, subtitles, and tickers) |
| `custom` | User-uploaded assets | Dynamic font assets uploaded by operators in the admin dashboard |

---

## 4. Acquisition & Downstream Setup

### Korean Fonts Setup

| Font Name | Acquisition | Primary Source URL |
|------|----------|----------|
| **Pretendard** | npm: `pretendard` | [GitHub Releases](https://github.com/orioncactus/pretendard) |
| **Spoqa Han Sans Neo** | npm: `spoqa-han-sans` (Extract WOFF2 Subsets) | [GitHub Source](https://github.com/spoqa/spoqa-han-sans) |
| **SUIT** | Fetch releases ZIP | [GitHub Releases](https://github.com/sun-typeface/SUIT) |
| **Noto Sans KR** | npm: `@fontsource/noto-sans-kr` or [Google Web Fonts Helper](https://gwfh.mranftl.com/) | [Google Fonts spec](https://fonts.google.com/noto/specimen/Noto+Sans+KR) |
| **Gmarket Sans** | Download assets from Noonnu | [Noonnu Portal](https://noonnu.cc/font_page/366) |
| **Nanum Square Neo** | Download Naver CDN files | [Naver Hangeul spec](https://hangeul.naver.com/font) |
| **S-Core Dream** | Download assets from Noonnu | [Noonnu Portal](https://noonnu.cc/font_page/6) |

### English Fonts Setup

| Font Name | Acquisition | npm Package |
|------|----------|-------------|
| **Inter** | npm: `@fontsource/inter` | `@fontsource/inter` |
| **Roboto** | npm: `@fontsource/roboto` | `@fontsource/roboto` |
| **Roboto Condensed** | npm: `@fontsource/roboto-condensed` | `@fontsource/roboto-condensed` |
| **Montserrat** | npm: `@fontsource/montserrat` | `@fontsource/montserrat` |
| **Oswald** | npm: `@fontsource/oswald` | `@fontsource/oswald` |
| **Poppins** | npm: `@fontsource/poppins` | `@fontsource/poppins` |

> [!TIP]
> **Average Font File Sizes**:  
> - **English WOFF2**: 7 to 23 KB per weight (highly optimized).
> - **Korean WOFF2 Subsets**: 160 to 550 KB per weight (larger due to the larger character set).
> - **Korean WOFF (Uncompressed)**: 350 to 615 KB per weight (about twice the size of WOFF2).

---

## 5. Writing `@font-face` Definitions

Declare corresponding numeric font weights according to standard scales:

| Font Weight (Value) | Label | Description |
|------|------|-------------|
| 100 | Thin | Hairline style |
| 200 | ExtraLight | Ultra-light weight |
| 300 | Light | Light weight |
| **400** | **Regular** | **Standard body text** |
| **500** | **Medium** | **Medium weight** |
| **600** | **SemiBold** | **Medium-bold weight** |
| **700** | **Bold** | **Standard bold headings** |
| 800 | ExtraBold / Heavy | Ultra-bold weight |
| 900 | Black | Heaviest weight |

---

## 6. Registering Fonts in `fontRegistry.ts`

Adding a font to the `SYSTEM_FONTS` array in `src/lib/fontRegistry.ts` automatically lists it in the graphic editor's font selectors.

Declaring `@font-face` blocks in CSS only enables them in code; they will not display in the editor's UI selectors until they are registered in `fontRegistry.ts`.

---

## 7. Font License Matrix

| License Type | Scope | `@font-face` Support | Package Embedding | Playout Suitability |
|---|---|---|---|---|
| **SIL Open Font License (OFL)** | Free to distribute, modify, and bundle commercially. | ✅ Allowed | ✅ Allowed | ✅ **Highly Recommended** |
| **Apache 2.0** | Free to use and distribute for all use cases. | ✅ Allowed | ✅ Allowed | ✅ **Highly Recommended** |
| **Webfont License** | Explicit authorization to host fonts on web servers. | ✅ Allowed | ✅ Allowed | ✅ **Suitable** (Check pageview/domain limits) |
| **App Embedding License** | Explicit authorization to bundle fonts inside applications. | ✅ Allowed | ✅ Allowed | ✅ **Suitable** (Check installation count limits) |
| **Desktop License** | Restricts usage to local workstations. | ❌ Forbidden | ❌ Forbidden | ❌ **Strictly Prohibited** |
| **Personal Use Only** | Restricts usage to non-commercial projects. | ❌ Forbidden | ❌ Forbidden | ❌ **Strictly Prohibited** |

> [!CAUTION]
> **Desktop licenses only authorize using the font on local computers (e.g. inside Microsoft Word or Photoshop).**
> Deploying desktop-only fonts in web applications via `@font-face` **violates licensing terms**. 
> Commercial paid fonts require explicit Webfont or App Embedding licenses.

---

## 8. Workflow for Paid Commercial Fonts

```
1. License Evaluation
   └─ Ensure you have "Webfont" or "App Embedding" licenses.
   └─ Verify domain restrictions, monthly pageview limits, and seat counts.
   └─ Desktop-only licenses ❌ cannot be deployed in web applications.

2. Font Compression (WOFF2 Optimization)
   └─ Convert raw OTF/TTF masters to compressed WOFF2 formats (using python tools).
   └─ Apply subsetting: extract only standard Korean syllables (2,350 characters), basic ASCII, and punctuation.
   └─ Target: reduces file sizes to ~50-100 KB per weight (a 70-80% file size reduction).

3. Upload Assets
   └─ Admin Dashboard ➔ Fonts ➔ Upload Font asset files.
   └─ Define the family name, UI labels, weight levels, and license terms.
   └─ Document acquisition invoices, seat volumes, and renewal dates in metadata fields.

4. Playout Deployment
   └─ Uploaded fonts automatically display in graphic editor selectors.
   └─ Playout renderers generate dynamic @font-face rules at runtime.
```

---

## 9. Offline Font Optimization (Subsetting)

Because air-gapped workspaces lack access to online font converters, use a Python script to optimize fonts offline:

```bash
# Install fonttools and brotli (required once)
pip install fonttools brotli

# Extract Korean syllables, basic ASCII, and CJK punctuation to output WOFF2 subsets
pyftsubset NotoSansKR-Regular.otf \
    --unicodes="U+0020-007E,U+AC00-D7A3,U+3130-318F,U+2000-206F,U+3000-303F" \
    --flavor=woff2 \
    --output-file=NotoSansKR-Regular.subset.woff2

# Optimize multiple weights using a loop
for weight in Regular Medium Bold; do
    pyftsubset "NotoSansKR-${weight}.otf" \
        --unicodes="U+0020-007E,U+AC00-D7A3,U+3130-318F,U+2000-206F,U+3000-303F" \
        --flavor=woff2 \
        --output-file="NotoSansKR-${weight}.subset.woff2"
done
```

#### Unicode Ranges Explained

| Range | Characters Included |
|------|------|
| `U+0020-007E` | Basic Latin ASCII (English characters, numbers, and basic symbols) |
| `U+AC00-D7A3` | Korean syllables (11,172 characters) |
| `U+3130-318F` | Korean Jamo (consonants and vowels) |
| `U+2000-206F` | Common punctuation marks (e.g. em-dashes, ellipses) |
| `U+3000-303F` | CJK punctuation and symbols |

---

## 10. Major Font Foundries & Registries

| Foundry | Webfont License Model | Web Portal |
|---|---|---|
| **Sandoll Cloud** | Monthly/annual subscription including webfont endpoints. | [sandoll.co.kr](https://www.sandoll.co.kr/) |
| **Yoon Design** | Dedicated Webfont licensing options. | [yoondesign.com](https://yoondesign.com/) |
| **Morisawa (FontPlus)** | Webfont hosting services. | [fontplus.jp](https://fontplus.jp/) |
| **Adobe Fonts** | Included in Creative Cloud subscriptions (⚠️ hosting files locally is prohibited). | [fonts.adobe.com](https://fonts.adobe.com/) |
| **Gilmhang (Pretendard)** | Free under SIL Open Font License. | [cactus.tistory.com](https://cactus.tistory.com/) |
| **Noonnu** | Registry portal for free Korean commercial fonts. | [noonnu.cc](https://noonnu.cc/) |
| **Naver Hangeul** | Free Nanum font family directory. | [hangeul.naver.com](https://hangeul.naver.com/) |

> [!WARNING]
> **Adobe Fonts (Typekit) only allows loading fonts through their own CDN endpoints.**
> Downloading and hosting Adobe Font files on your own server **violates their license agreement**. 
> As a result, Adobe Fonts cannot be used in air-gapped environments.

---

## Playout Font Compliance Checklist

```
□ Verify the license permits hosting web fonts before deploying them in the workspace.
□ Save all license metadata (LICENSE.txt, invoices, receipts) in public directories.
□ Configure the correct license type when uploading fonts through the admin panel.
□ Document renewal dates and terms for commercial paid fonts.
□ Run final license audits before deploying code updates to production environments.
□ Confirm usage terms for fonts with unknown licenses before distributing them commercially.
```
