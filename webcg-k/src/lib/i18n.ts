/**
 * i18n 설정 (react-i18next)
 *
 * Why react-i18next?
 * - React 생태계 1위 i18n 라이브러리 (가장 큰 커뮤니티, 가장 많은 레퍼런스)
 * - Namespace 지원으로 번역 파일을 컴포넌트/페이지별로 분리 가능
 * - TypeScript와 궁합이 좋고, 번역 키 자동완성 지원
 *
 * 구조:
 *   src/locales/
 *     ko/  ← 한국어 (기본 언어)
 *       common.json     ← 공통 UI (버튼, 상태, 네비게이션)
 *       dashboard.json  ← 대시보드 홈
 *       broadcast.json  ← 프로젝트 송출
 *     en/  ← 영어
 *       common.json
 *       dashboard.json
 *       broadcast.json
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// ─── 한국어 번역 (기본) ──────────────────────────────────
import koCommon from "../locales/ko/common.json";
import koDashboard from "../locales/ko/dashboard.json";
import koBroadcast from "../locales/ko/broadcast.json";
import koAdmin from "../locales/ko/admin.json";
import koDatasources from "../locales/ko/datasources.json";
import koGraphics from "../locales/ko/graphics.json";
import koTemplates from "../locales/ko/templates.json";
import koFonts from "../locales/ko/fonts.json";
import koImages from "../locales/ko/images.json";
import koRundowns from "../locales/ko/rundowns.json";

// ─── 영어 번역 ──────────────────────────────────────────
import enCommon from "../locales/en/common.json";
import enDashboard from "../locales/en/dashboard.json";
import enBroadcast from "../locales/en/broadcast.json";
import enAdmin from "../locales/en/admin.json";
import enDatasources from "../locales/en/datasources.json";
import enGraphics from "../locales/en/graphics.json";
import enTemplates from "../locales/en/templates.json";
import enFonts from "../locales/en/fonts.json";
import enImages from "../locales/en/images.json";
import enRundowns from "../locales/en/rundowns.json";

i18n
	.use(initReactI18next)
	.init({
		// 1. 리소스 번들 — 빌드 타임에 포함 (별도 HTTP 요청 없음)
		resources: {
			ko: {
				common: koCommon,
				dashboard: koDashboard,
				broadcast: koBroadcast,
				admin: koAdmin,
				datasources: koDatasources,
				graphics: koGraphics,
				templates: koTemplates,
				fonts: koFonts,
				images: koImages,
				rundowns: koRundowns,
			},
			en: {
				common: enCommon,
				dashboard: enDashboard,
				broadcast: enBroadcast,
				admin: enAdmin,
				datasources: enDatasources,
				graphics: enGraphics,
				templates: enTemplates,
				fonts: enFonts,
				images: enImages,
				rundowns: enRundowns,
			},
		},

		// 2. 기본 언어 설정
		// SSR 환경(서버)에서는 localStorage가 없으므로 안전하게 체크
		lng: (typeof window !== "undefined" && window.localStorage?.getItem("webcgk-lang")) || "ko",
		fallbackLng: "ko",

		// 3. Namespace 설정
		defaultNS: "common",
		ns: ["common", "dashboard", "broadcast", "admin", "datasources", "graphics", "templates", "fonts", "images", "rundowns"],

		// 4. 보간(Interpolation) — React가 XSS 방어를 하므로 이중 이스케이프 불필요
		interpolation: {
			escapeValue: false,
		},

		// 5. 개발 모드에서 번역 키 누락 시 콘솔 경고
		saveMissing: false,
		missingKeyHandler: (lngs, ns, key) => {
			if (typeof window !== "undefined" && import.meta.env.DEV) {
				console.warn(`[i18n] Missing key: ${ns}:${key} for [${lngs}]`);
			}
		},
	});

// 언어 변경 시 localStorage에 저장 (클라이언트에서만)
i18n.on("languageChanged", (lng) => {
	if (typeof window !== "undefined") {
		window.localStorage?.setItem("webcgk-lang", lng);
	}
});

export default i18n;
