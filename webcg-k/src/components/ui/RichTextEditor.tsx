/**
 * RichTextEditor — TipTap 기반 인라인 리치 텍스트 에디터
 *
 * 큐시트 속성 패널에서 방송 그래픽 텍스트의 특정 단어/문장에
 * 색상·폰트 크기를 개별 지정할 수 있는 WYSIWYG 에디터.
 *
 * Why TipTap?: ProseMirror의 Mark 시스템이 방송 그래픽의
 * "인라인 스타일 오버라이드"와 개념적으로 정확히 대응됨.
 * 커스텀 Mark를 정의하면 color, fontSize 등
 * 방송에 필요한 모든 속성을 확장 가능.
 */

import type { ChainedCommands } from "@tiptap/core";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Palette, Redo, Type, Undo } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { FontSize } from "@/lib/fontSizeExtension";
import { wrapPlainText } from "@/lib/richTextUtils";
import "./rich-text-editor.css";

// ─── 프로퍼티 정의 ────────────────────────────────────────────

interface RichTextEditorProps {
	/** 초기 콘텐츠 (HTML 또는 plain text) */
	content: string;
	/** 콘텐츠 변경 콜백 (HTML 출력) */
	onChange: (html: string) => void;
	/** 플레이스홀더 텍스트 */
	placeholder?: string;
	/** 라벨 (좌상단 표시) */
	label?: string;
	/** 비활성화 */
	disabled?: boolean;
}

// 방송 그래픽 폰트 크기 — 브랜드 가이드라인 보호
// ■ Why 3단계 제한?
//   디자이너가 그래픽 편집기에서 세팅한 폰트 크기만 허용.
//   오퍼레이터가 임의로 크기를 바꾸면 디자인 일관성이 무너짐.
const FONT_SIZES = ["16px", "24px", "36px"];

// 방송 그래픽에서 자주 쓰는 색상 팔레트
const COLOR_PRESETS = [
	"#FFFFFF", // 흰색
	"#FFD700", // 골드
	"#FF4444", // 빨강
	"#44AAFF", // 파랑
	"#44FF88", // 초록
	"#FF88FF", // 분홍
	"#FFAA44", // 주황
	"#AAAAAA", // 회색
	"#000000", // 검정
];

type FontSizeChainedCommands = ChainedCommands & {
	setFontSize: (size: string) => ChainedCommands;
};

// ─── 메인 컴포넌트 ────────────────────────────────────────────

export function RichTextEditor({
	content,
	onChange,
	placeholder = "텍스트를 입력하세요...",
	label,
	disabled = false,
}: RichTextEditorProps) {
	const [showColorPicker, setShowColorPicker] = useState(false);
	const [showSizePicker, setShowSizePicker] = useState(false);
	const colorPickerRef = useRef<HTMLDivElement>(null);
	const sizePickerRef = useRef<HTMLDivElement>(null);

	const syncedHtmlRef = useRef(wrapPlainText(content));

	// TipTap 에디터 인스턴스 생성
	const editor = useEditor({
		immediatelyRender: false,
		extensions: [
			StarterKit.configure({
				// 방송 그래픽 텍스트 편집에 불필요한 블록 기능 비활성화
				heading: false,
				blockquote: false,
				bulletList: false,
				orderedList: false,
				codeBlock: false,
				code: false,
				horizontalRule: false,
			}),
			TextStyle,
			Color,
			FontSize,
		],
		// plain text를 HTML로 변환 후 초기화
		content: syncedHtmlRef.current,
		editable: !disabled,
		onUpdate: ({ editor: e }) => {
			const html = e.getHTML();
			syncedHtmlRef.current = html;
			onChange(html);
		},
	});

	// 외부에서 content가 변경되면 에디터 내용도 갱신
	// (다른 아이템 선택 시 에디터 내용 교체용)
	useEffect(() => {
		if (!editor) return;

		const nextHtml = wrapPlainText(content);
		if (nextHtml === syncedHtmlRef.current) return;

		// 외부 선택 변경은 에디터 본문만 교체하고, 부모 onChange는 다시 호출하지 않는다.
		if (editor.getHTML() !== nextHtml) {
			editor.commands.setContent(nextHtml, { emitUpdate: false });
		}
		syncedHtmlRef.current = nextHtml;
	}, [content, editor]);

	useEffect(() => {
		if (!editor) return;
		editor.setEditable(!disabled);
	}, [disabled, editor]);

	// 색상 적용
	const handleColorSelect = useCallback(
		(color: string) => {
			if (!editor) return;
			editor.chain().focus().setColor(color).run();
			setShowColorPicker(false);
		},
		[editor],
	);

	// 폰트 크기 적용
	const handleSizeSelect = useCallback(
		(size: string) => {
			if (!editor) return;
			(editor.chain().focus() as FontSizeChainedCommands)
				.setFontSize(size)
				.run();
			setShowSizePicker(false);
		},
		[editor],
	);

	// 바깥 클릭 시 드롭다운 닫기
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (
				colorPickerRef.current &&
				!colorPickerRef.current.contains(e.target as Node)
			) {
				setShowColorPicker(false);
			}
			if (
				sizePickerRef.current &&
				!sizePickerRef.current.contains(e.target as Node)
			) {
				setShowSizePicker(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	if (!editor) return null;

	return (
		<div className={`rte-root ${disabled ? "disabled" : ""}`}>
			{/* 라벨 */}
			{label && <span className="rte-label">{label}</span>}

			{/* ─── 미니 툴바 ─── */}
			<div className="rte-toolbar">
				{/* Bold */}
				<button
					type="button"
					className={`rte-btn ${editor.isActive("bold") ? "active" : ""}`}
					onClick={() => editor.chain().focus().toggleBold().run()}
					title="굵게 (Ctrl+B)"
				>
					<Bold size={13} />
				</button>

				{/* Italic */}
				<button
					type="button"
					className={`rte-btn ${editor.isActive("italic") ? "active" : ""}`}
					onClick={() => editor.chain().focus().toggleItalic().run()}
					title="기울임 (Ctrl+I)"
				>
					<Italic size={13} />
				</button>

				<span className="rte-separator" />

				{/* 색상 선택 */}
				<div className="rte-dropdown-wrap" ref={colorPickerRef}>
					<button
						type="button"
						className="rte-btn"
						onClick={() => {
							setShowColorPicker(!showColorPicker);
							setShowSizePicker(false);
						}}
						title="텍스트 색상"
					>
						<Palette size={13} />
					</button>
					{showColorPicker && (
						<div className="rte-dropdown rte-color-grid">
							{COLOR_PRESETS.map((c) => (
								<button
									key={c}
									type="button"
									className="rte-color-swatch"
									style={{ background: c }}
									onClick={() => handleColorSelect(c)}
									title={c}
								/>
							))}
							{/* 커스텀 색상 입력 — 제거됨
							 * ■ Why 제거?
							 *   방송 브랜드 가이드라인 보호.
							 *   디자이너가 지정한 9색 프리셋만 사용하여
							 *   방송국 톤앤매너 일관성을 유지.
							 */}
						</div>
					)}
				</div>

				{/* 폰트 크기 */}
				<div className="rte-dropdown-wrap" ref={sizePickerRef}>
					<button
						type="button"
						className="rte-btn"
						onClick={() => {
							setShowSizePicker(!showSizePicker);
							setShowColorPicker(false);
						}}
						title="폰트 크기"
					>
						<Type size={13} />
					</button>
					{showSizePicker && (
						<div className="rte-dropdown rte-size-list">
							{FONT_SIZES.map((s) => (
								<button
									key={s}
									type="button"
									className="rte-size-option"
									onClick={() => handleSizeSelect(s)}
								>
									{s}
								</button>
							))}
						</div>
					)}
				</div>

				<span className="rte-separator" />

				{/* Undo / Redo */}
				<button
					type="button"
					className="rte-btn"
					onClick={() => editor.chain().focus().undo().run()}
					disabled={!editor.can().undo()}
					title="실행 취소 (Ctrl+Z)"
				>
					<Undo size={13} />
				</button>
				<button
					type="button"
					className="rte-btn"
					onClick={() => editor.chain().focus().redo().run()}
					disabled={!editor.can().redo()}
					title="다시 실행 (Ctrl+Y)"
				>
					<Redo size={13} />
				</button>
			</div>

			{/* ─── 에디터 영역 ─── */}
			<EditorContent
				editor={editor}
				className="rte-content"
				data-placeholder={placeholder}
			/>
		</div>
	);
}
