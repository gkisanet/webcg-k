/**
 * TipTap Custom Extension — fontSize
 *
 * Why 커스텀?: @tiptap/extension-font-size는 공식 패키지가 아니며 유지보수되지 않음.
 * @tiptap/extension-text-style의 TextStyle Mark를 확장하여,
 * <span style="font-size: 24px"> 형태로 인라인 폰트 크기를 적용한다.
 *
 * 원리: TipTap의 Mark 시스템은 ProseMirror의 Mark 개념을 래핑한다.
 * Mark는 인라인 텍스트에 메타데이터(속성)를 부여하는 방식으로,
 * 방송 CG의 "특정 단어만 크기 변경"과 정확히 대응된다.
 */

import { Extension } from "@tiptap/react";

/**
 * fontSize Extension
 * - addGlobalAttributes()로 textStyle Mark에 fontSize 속성을 추가
 * - setFontSize 커맨드: 선택 영역에 fontSize 적용
 * - unsetFontSize 커맨드: 선택 영역에서 fontSize 제거
 */
export const FontSize = Extension.create({
	name: "fontSize",

	addGlobalAttributes() {
		return [
			{
				types: ["textStyle"],
				attributes: {
					fontSize: {
						default: null,
						// 1. DOM → ProseMirror: HTML을 파싱할 때 style에서 fontSize 추출
						parseHTML: (element) =>
							element.style.fontSize?.replace(/['"]+/g, ""),
						// 2. ProseMirror → DOM: 렌더링할 때 style에 fontSize 삽입
						renderHTML: (attributes) => {
							if (!attributes.fontSize) return {};
							return {
								style: `font-size: ${attributes.fontSize}`,
							};
						},
					},
				},
			},
		];
	},

	addCommands() {
		return {
			setFontSize:
				(fontSize: string) =>
				({ chain }: any) => {
					return chain().setMark("textStyle", { fontSize }).run();
				},
			unsetFontSize:
				() =>
				({ chain }: any) => {
					return chain()
						.setMark("textStyle", { fontSize: null })
						.removeEmptyTextStyle()
						.run();
				},
		};
	},
});
