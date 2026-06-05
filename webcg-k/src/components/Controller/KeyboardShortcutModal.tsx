/**
 * KeyboardShortcutModal — 타임라인 키보드 단축키 안내 모달
 *
 * ■ Why 별도 컴포넌트?
 *   기존 alert()는 브라우저 네이티브 UI를 사용하여
 *   방송 시스템의 프로페셔널한 톤앤매너와 불일치.
 *   전용 모달로 교체하여 카테고리별 시각적 구분과
 *   키 바인딩 하이라이트를 제공한다.
 */

import { useEffect, useRef } from "react";
import { X, Keyboard } from "lucide-react";

interface ShortcutItem {
	keys: string[];
	description: string;
}

interface ShortcutCategory {
	title: string;
	icon: string;
	items: ShortcutItem[];
}

const SHORTCUT_DATA: ShortcutCategory[] = [
	{
		title: "탐색",
		icon: "🧭",
		items: [
			{ keys: ["←", "→"], description: "블록 경계 단위로 플레이헤드 이동" },
			{ keys: ["↑"], description: "마지막 송출 위치로 복귀" },
			{ keys: ["Ctrl", "←"], description: "타임라인 맨 처음" },
			{ keys: ["Ctrl", "→"], description: "타임라인 맨 끝" },
			{ keys: ["Alt", "←", "→"], description: "세그먼트 탭 이동" },
		],
	},
	{
		title: "송출",
		icon: "📡",
		items: [
			{ keys: ["Space"], description: "현재 위치의 방송 그래픽을 PGM 송출" },
			{ keys: ["S"], description: "스크러빙 모드 전환: 확인 중에는 Space 송출 차단" },
		],
	},
	{
		title: "복구",
		icon: "↩",
		items: [
			{ keys: ["Ctrl", "Z"], description: "실행 취소. 방송 중 PGM 복원은 재송출 확인 필요" },
			{ keys: ["Ctrl", "Y"], description: "다시 실행. 방송 중 PGM 복원은 재송출 확인 필요" },
			{ keys: ["Esc"], description: "선택 해제 및 스크러빙 해제" },
		],
	},
	{
		title: "편집",
		icon: "✏️",
		items: [
			{ keys: ["Delete"], description: "블록 또는 선택된 갭 삭제" },
			{ keys: ["Ctrl", "C"], description: "블록 복사" },
			{ keys: ["Ctrl", "V"], description: "블록 붙여넣기" },
			{ keys: ["Ctrl", "↑", "↓"], description: "트랙 간 블록 이동" },
			{ keys: ["Ctrl", "Shift", "L"], description: "로고 블록 세그먼트 확장" },
		],
	},
	{
		title: "줌",
		icon: "🔍",
		items: [
			{ keys: ["Ctrl", "Wheel ↑"], description: "줌인: 세밀한 위치 확인" },
			{ keys: ["Ctrl", "Wheel ↓"], description: "줌아웃: 전체 런다운 확인" },
		],
	},
];

/** 개별 키 뱃지 */
function KeyBadge({ label }: { label: string }) {
	return (
		<span className="shortcut-key-badge">
			{label}
		</span>
	);
}

export function KeyboardShortcutModal({ onClose }: { onClose: () => void }) {
	const overlayRef = useRef<HTMLDivElement>(null);

	// ESC 키로 닫기
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				onClose();
			}
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [onClose]);

	// 오버레이 클릭 시 닫기
	const handleOverlayClick = (e: React.MouseEvent) => {
		if (e.target === overlayRef.current) onClose();
	};

	return (
		<div
			ref={overlayRef}
			className="shortcut-modal-overlay"
			onClick={handleOverlayClick}
		>
			<div className="shortcut-modal">
				{/* 헤더 */}
				<div className="shortcut-modal-header">
					<div className="shortcut-modal-title">
						<Keyboard size={18} />
						<span>키보드 단축키</span>
					</div>
					<button
						type="button"
						className="shortcut-modal-close"
						onClick={onClose}
						title="닫기 (Esc)"
					>
						<X size={16} />
					</button>
				</div>

				{/* 본문: 카테고리별 단축키 */}
				<div className="shortcut-modal-body">
					{SHORTCUT_DATA.map((category) => (
						<div key={category.title} className="shortcut-category">
							<div className="shortcut-category-title">
								<span>{category.icon}</span>
								<span>{category.title}</span>
							</div>
							<div className="shortcut-items">
								{category.items.map((item) => (
									<div key={item.description} className="shortcut-item">
										<div className="shortcut-keys">
											{item.keys.map((key, idx) => (
												<span key={key + idx}>
													{idx > 0 && <span className="shortcut-key-separator">+</span>}
													<KeyBadge label={key} />
												</span>
											))}
										</div>
										<span className="shortcut-desc">{item.description}</span>
									</div>
								))}
							</div>
						</div>
					))}
				</div>

				{/* 푸터 */}
				<div className="shortcut-modal-footer">
					<span>Esc 또는 바깥 클릭으로 닫기</span>
				</div>
			</div>

			<style>{`
				.shortcut-modal-overlay {
					position: fixed;
					inset: 0;
					z-index: 9999;
					background: rgba(0, 0, 0, 0.6);
					backdrop-filter: blur(4px);
					display: flex;
					align-items: center;
					justify-content: center;
					animation: shortcutOverlayIn 0.2s ease-out;
				}

				@keyframes shortcutOverlayIn {
					from { opacity: 0; }
					to { opacity: 1; }
				}

				.shortcut-modal {
					background: linear-gradient(165deg, #1e1e2e 0%, #16161e 100%);
					border: 1px solid rgba(255, 255, 255, 0.08);
					border-radius: 16px;
					width: 520px;
					max-width: 90vw;
					max-height: 80vh;
					display: flex;
					flex-direction: column;
					box-shadow:
						0 24px 48px rgba(0, 0, 0, 0.4),
						0 0 0 1px rgba(255, 255, 255, 0.05),
						inset 0 1px 0 rgba(255, 255, 255, 0.05);
					animation: shortcutModalIn 0.25s ease-out;
				}

				@keyframes shortcutModalIn {
					from { opacity: 0; transform: scale(0.95) translateY(10px); }
					to { opacity: 1; transform: scale(1) translateY(0); }
				}

				.shortcut-modal-header {
					display: flex;
					align-items: center;
					justify-content: space-between;
					padding: 16px 20px 12px;
					border-bottom: 1px solid rgba(255, 255, 255, 0.06);
				}

				.shortcut-modal-title {
					display: flex;
					align-items: center;
					gap: 10px;
					font-size: 1rem;
					font-weight: 600;
					color: #e2e8f0;
					letter-spacing: -0.01em;
				}

				.shortcut-modal-title svg {
					color: #a78bfa;
				}

				.shortcut-modal-close {
					background: rgba(255, 255, 255, 0.06);
					border: 1px solid rgba(255, 255, 255, 0.08);
					border-radius: 8px;
					color: #94a3b8;
					padding: 6px;
					cursor: pointer;
					display: flex;
					align-items: center;
					justify-content: center;
					transition: all 0.15s;
				}

				.shortcut-modal-close:hover {
					background: rgba(255, 255, 255, 0.1);
					color: #e2e8f0;
				}

				.shortcut-modal-body {
					padding: 16px 20px;
					overflow-y: auto;
					display: flex;
					flex-direction: column;
					gap: 20px;
				}

				.shortcut-category {
					display: flex;
					flex-direction: column;
					gap: 8px;
				}

				.shortcut-category-title {
					display: flex;
					align-items: center;
					gap: 8px;
					font-size: 0.75rem;
					font-weight: 600;
					color: #a78bfa;
					text-transform: uppercase;
					letter-spacing: 0.05em;
				}

				.shortcut-items {
					display: flex;
					flex-direction: column;
					gap: 2px;
				}

				.shortcut-item {
					display: flex;
					align-items: center;
					justify-content: space-between;
					padding: 7px 12px;
					border-radius: 8px;
					transition: background 0.12s;
				}

				.shortcut-item:hover {
					background: rgba(255, 255, 255, 0.04);
				}

				.shortcut-keys {
					display: flex;
					align-items: center;
					gap: 3px;
					flex-shrink: 0;
				}

				.shortcut-key-badge {
					display: inline-flex;
					align-items: center;
					justify-content: center;
					min-width: 28px;
					height: 26px;
					padding: 0 7px;
					background: linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.04) 100%);
					border: 1px solid rgba(255, 255, 255, 0.12);
					border-bottom-width: 2px;
					border-radius: 6px;
					font-size: 0.7rem;
					font-weight: 600;
					font-family: "SF Mono", "Fira Code", "Cascadia Code", monospace;
					color: #cbd5e1;
					white-space: nowrap;
					text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3);
					box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
				}

				.shortcut-key-separator {
					color: #475569;
					font-size: 0.65rem;
					margin: 0 1px;
				}

				.shortcut-desc {
					font-size: 0.8rem;
					color: #94a3b8;
				}

				.shortcut-modal-footer {
					padding: 10px 20px;
					border-top: 1px solid rgba(255, 255, 255, 0.06);
					text-align: center;
					font-size: 0.68rem;
					color: #475569;
				}
			`}</style>
		</div>
	);
}
