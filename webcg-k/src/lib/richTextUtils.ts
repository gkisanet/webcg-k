/**
 * Rich Text 유틸리티 — TipTap 리치 텍스트 ↔ plain text 변환
 *
 * Why?: CgTextItem.fields의 value가 plain text 또는 HTML 문자열일 수 있으므로,
 * 두 포맷 간 호환성을 보장하는 유틸리티가 필요하다.
 * SVG 렌더러는 plain text만 사용하고, DOM/CSS 렌더러는 HTML을 사용한다.
 */

/**
 * 값이 HTML(리치 텍스트)인지 판별
 * 단순한 정규식으로 HTML 태그 존재 여부를 확인
 *
 * @example
 * isRichText("홍길동")         → false  (plain text)
 * isRichText("<p>홍길동</p>")  → true   (HTML)
 * isRichText('<p><span style="color: red">서울</span> 날씨</p>') → true
 */
export function isRichText(value: string): boolean {
	return /<[a-z][\s\S]*>/i.test(value);
}

/**
 * HTML → plain text 추출 (SVG 렌더링용 fallback)
 *
 * Why 이 방식?: DOMParser 대신 임시 div를 사용하는 이유는
 * DOMParser는 <p> 태그 간 줄바꿈을 보존하지 않지만,
 * textContent는 태그를 제거하면서 텍스트만 깔끔하게 추출한다.
 *
 * @example
 * stripHtml('<p><span style="color:red">서울</span> 날씨</p>') → "서울 날씨"
 */
export function stripHtml(html: string): string {
	// 1. HTML이 아니면 그대로 반환 (불필요한 DOM 조작 방지)
	if (!isRichText(html)) return html;

	// 2. 임시 div에 innerHTML 주입 후 textContent 추출
	const div = document.createElement("div");
	div.innerHTML = html;
	return div.textContent || "";
}

/**
 * plain text → TipTap 호환 HTML 래핑
 * TipTap은 <p> 태그를 기본 블록 단위로 사용
 *
 * @example
 * wrapPlainText("홍길동 / 서울시장")  → "<p>홍길동 / 서울시장</p>"
 */
export function wrapPlainText(text: string): string {
	// 이미 HTML이면 그대로 반환
	if (isRichText(text)) return text;
	return `<p>${text}</p>`;
}

/**
 * 리치 텍스트 HTML에서 인라인 스타일 정보만 추출 (디버깅/검사용)
 * 어떤 스타일이 적용되었는지 요약 정보를 반환
 *
 * @returns 적용된 스타일 요약 (예: ["color: red", "font-size: 24px"])
 */
export function extractAppliedStyles(html: string): string[] {
	if (!isRichText(html)) return [];
	const styles: string[] = [];
	const regex = /style="([^"]*)"/g;
	let match: RegExpExecArray | null;
	match = regex.exec(html);
	while (match !== null) {
		styles.push(match[1]);
		match = regex.exec(html);
	}
	return styles;
}
