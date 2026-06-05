/**
 * Layers Panel - 레이어 목록 패널 (트리 구조 + 라인 연결)
 */

import {
	ChevronDown,
	ChevronRight,
	Circle,
	Clock,
	Combine,
	Eye,
	EyeOff,
	Image,
	Layers,
	Lock,
	Minus,
	Play,
	Square,
	Trash2,
	Type,
	Unlock,
} from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import type { GraphicElement } from "@/routes/dashboard/studio/graphics/$graphicId";

interface LayersPanelProps {
	elements: GraphicElement[];
	selectedIds: string[];
	onSelect: (ids: string[]) => void;
	onUpdate: (id: string, updates: Partial<GraphicElement>) => void;
	onReorder: (fromIndex: number, toIndex: number) => void;
	panelMode: PanelMode;
	onPanelModeChange: (mode: PanelMode) => void;
	onMotionReorder: (
		phase: MotionPhase,
		orderedIds: string[],
		stepMs: number,
	) => void;
	onApplyStaggeredMotion: (
		phase: MotionPhase,
		orderedIds: string[],
		selectedIds: string[],
		stepMs: number,
	) => void;
	onApplySimultaneousMotion: (
		phase: MotionPhase,
		orderedIds: string[],
		selectedIds: string[],
	) => void;
	onApplySequenceMotion: (
		phase: MotionPhase,
		orderedIds: string[],
		selectedIds: string[],
	) => void;
	onRemoveMotion: (ids: string[], phase?: MotionPhase) => void;
	onDelete: (ids: string[]) => void;
}

type PanelMode = "layers" | "motion";
type MotionPhase = "enter" | "exit";

type MotionListItem = {
	key: string;
	phase: MotionPhase;
	element: GraphicElement;
	type: string;
	delay: number;
	duration: number;
};

// 타입별 아이콘
const typeIcons: Record<GraphicElement["type"], typeof Square> = {
	rect: Square,
	ellipse: Circle,
	text: Type,
	image: Image,
	group: Layers,
	boolean_group: Combine,
	html_plugin: Layers, // 또는 AppWindow 아이콘 사용 가능
};

// 인덴트 라인 색상
const lineColors = [
	"rgba(255, 215, 0, 0.6)", // 노란색
	"rgba(139, 92, 246, 0.6)", // 보라색
	"rgba(34, 211, 238, 0.6)", // 시안
	"rgba(249, 115, 22, 0.6)", // 주황
	"rgba(236, 72, 153, 0.6)", // 핑크
];

const DEFAULT_MOTION_STAGGER_MS = 120;

const enterAnimationLabels: Record<string, string> = {
	fadeIn: "Fade",
	slideLeft: "Left",
	slideRight: "Right",
	slideUp: "Up",
	slideDown: "Down",
	zoomIn: "Zoom",
	bounce: "Bounce",
	expand: "Expand",
	reveal: "Reveal",
	maskIn: "Mask",
	maskInLeft: "Mask L",
	maskInRight: "Mask R",
	typewriter: "Type",
};

const exitAnimationLabels: Record<string, string> = {
	fadeOut: "Fade",
	slideLeft: "Left",
	slideRight: "Right",
	slideUp: "Up",
	slideDown: "Down",
	zoomOut: "Zoom",
	shrink: "Shrink",
	collapse: "Collapse",
	maskOut: "Mask",
	maskOutLeft: "Mask L",
	maskOutRight: "Mask R",
};

function getElementLabel(element: GraphicElement): string {
	const label =
		element.type === "text" && element.content ? element.content : element.name;
	return label.length > 15 ? `${label.slice(0, 15)}...` : label;
}

function hasMotion(element: GraphicElement): boolean {
	return Boolean(element.animation?.enter || element.animation?.exit);
}

export function LayersPanel({
	elements,
	selectedIds,
	onSelect,
	onUpdate,
	onReorder,
	panelMode,
	onPanelModeChange,
	onMotionReorder,
	onApplyStaggeredMotion,
	onApplySimultaneousMotion,
	onApplySequenceMotion,
	onRemoveMotion,
	onDelete,
}: LayersPanelProps) {
	const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
	const [draggedId, setDraggedId] = useState<string | null>(null);
	const [dragOverId, setDragOverId] = useState<string | null>(null);
	const [motionStepMs, setMotionStepMs] = useState(DEFAULT_MOTION_STAGGER_MS);
	// 🆕 단축키 접기/펼침 상태 (레이어 UI 공간 극대화)
	const [isShortcutsExpanded, setIsShortcutsExpanded] = useState(false);

	// 그룹 펼침/접힘 토글
	const toggleGroup = (groupId: string, e: React.MouseEvent) => {
		e.stopPropagation();
		const newExpanded = new Set(expandedGroups);
		if (newExpanded.has(groupId)) {
			newExpanded.delete(groupId);
		} else {
			newExpanded.add(groupId);
		}
		setExpandedGroups(newExpanded);
	};

	// 드래그 시작
	const handleDragStart = (e: React.DragEvent, id: string) => {
		setDraggedId(id);
		e.dataTransfer.effectAllowed = "move";
	};

	// 드래그 오버
	const handleDragOver = (e: React.DragEvent, id: string) => {
		e.preventDefault();
		if (draggedId && draggedId !== id) {
			setDragOverId(id);
		}
	};

	// 드래그 종료
	const handleDragEnd = () => {
		setDraggedId(null);
		setDragOverId(null);
	};

	// 드롭 - z-index 순서 변경
	const handleDrop = (e: React.DragEvent, targetId: string) => {
		e.preventDefault();
		if (!draggedId || draggedId === targetId) return;

		if (panelMode === "motion") {
			const sortedItems = [...motionItems];
			const fromIndex = sortedItems.findIndex((item) => item.key === draggedId);
			const toIndex = sortedItems.findIndex((item) => item.key === targetId);

			if (fromIndex !== -1 && toIndex !== -1) {
				const draggedItem = sortedItems[fromIndex];
				const targetItem = sortedItems[toIndex];

				if (draggedItem.phase === targetItem.phase) {
					const samePhaseItems = sortedItems.filter(
						(item) => item.phase === draggedItem.phase,
					);
					const samePhaseFromIndex = samePhaseItems.findIndex(
						(item) => item.key === draggedId,
					);
					const samePhaseToIndex = samePhaseItems.findIndex(
						(item) => item.key === targetId,
					);

					const [movedItem] = samePhaseItems.splice(samePhaseFromIndex, 1);
					samePhaseItems.splice(samePhaseToIndex, 0, movedItem);
					onMotionReorder(
						draggedItem.phase,
						samePhaseItems.map((item) => item.element.id),
						motionStepMs,
					);
				}
			}

			handleDragEnd();
			return;
		}

		// 현재 요소들의 인덱스 찾기 (zIndex 기준 정렬된 배열에서)
		const sortedElements = [...elements].sort((a, b) => b.zIndex - a.zIndex);
		const fromIndex = sortedElements.findIndex((el) => el.id === draggedId);
		const toIndex = sortedElements.findIndex((el) => el.id === targetId);

		if (fromIndex !== -1 && toIndex !== -1) {
			onReorder(fromIndex, toIndex);
		}

		handleDragEnd();
	};

	const handleClick = (id: string, e: React.MouseEvent) => {
		if (e.ctrlKey || e.metaKey) {
			if (selectedIds.includes(id)) {
				onSelect(selectedIds.filter((sid) => sid !== id));
			} else {
				onSelect([...selectedIds, id]);
			}
		} else {
			onSelect([id]);
		}
	};

	const handleKeyboardSelect = (id: string, e: React.KeyboardEvent) => {
		if (e.key !== "Enter" && e.key !== " ") return;
		e.preventDefault();
		onSelect([id]);
	};

	// 트리 구조: 최상위 요소만 (parentId가 null)
	const rootElements = elements
		.filter((el) => !el.parentId)
		.sort((a, b) => b.zIndex - a.zIndex);

	const motionItems = useMemo<MotionListItem[]>(() => {
		const items = elements.flatMap((element) => {
			if (element.visible === false) return [];

			const result: MotionListItem[] = [];
			if (element.animation?.enter) {
				result.push({
					key: `enter:${element.id}`,
					phase: "enter",
					element,
					type: element.animation.enter.type,
					delay: element.animation.enter.delay ?? 0,
					duration: element.animation.enter.duration ?? 500,
				});
			}
			if (element.animation?.exit) {
				result.push({
					key: `exit:${element.id}`,
					phase: "exit",
					element,
					type: element.animation.exit.type,
					delay: element.animation.exit.delay ?? 0,
					duration: element.animation.exit.duration ?? 400,
				});
			}

			return result;
		});

		return items.sort((a, b) => {
			if (a.phase !== b.phase) return a.phase === "enter" ? -1 : 1;
			return (
				a.delay - b.delay || (a.element.zIndex ?? 0) - (b.element.zIndex ?? 0)
			);
		});
	}, [elements]);

	const staticElementCount = elements.filter(
		(el) => el.visible !== false && !hasMotion(el),
	).length;

	const enterMotionOrderIds = useMemo(
		() =>
			motionItems
				.filter((item) => item.phase === "enter")
				.map((item) => item.element.id),
		[motionItems],
	);

	const selectedEnterMotionIds = useMemo(() => {
		const selectedIdSet = new Set(selectedIds);
		return motionItems
			.filter(
				(item) => item.phase === "enter" && selectedIdSet.has(item.element.id),
			)
			.map((item) => item.element.id);
	}, [motionItems, selectedIds]);

	// 자식 요소 찾기
	const getChildren = (parentId: string) => {
		return elements
			.filter((el) => el.parentId === parentId)
			.sort((a, b) => b.zIndex - a.zIndex);
	};

	const getParent = (parentId: string | null) => {
		if (!parentId) return null;
		return elements.find((element) => element.id === parentId) ?? null;
	};

	// 레이어 아이템 렌더링
	const renderLayerItem = (
		el: GraphicElement,
		depth: number = 0,
		isLast: boolean = false,
	) => {
		let Icon = typeIcons[el.type] || Square;
		if (el.type === "boolean_group") {
			if (el.booleanOperation === "subtract") {
				Icon = Minus;
			} else {
				Icon = Combine;
			}
		}
		const isSelected = selectedIds.includes(el.id);
		const isGroup = el.type === "group" || el.type === "boolean_group";
		const isExpanded = expandedGroups.has(el.id);
		const children = isGroup ? getChildren(el.id) : [];
		const parent = getParent(el.parentId);
		const isMaskSource = parent?.maskSourceId === el.id;
		const isBooleanOperand = parent?.type === "boolean_group";
		const compositionBadges = [
			el.clipContent
				? {
						key: "clip",
						label: <Square size={10} />,
						title: "Clip Content 프레임",
					}
				: null,
			el.maskSourceId
				? { key: "mask", label: <EyeOff size={10} />, title: "마스킹 그룹" }
				: null,
			isMaskSource
				? {
						key: "mask-source",
						label: <Circle size={10} />,
						title: "마스크 소스 레이어",
					}
				: null,
			isBooleanOperand
				? {
						key: "operand",
						label: <Combine size={10} style={{ opacity: 0.7 }} />,
						title: "Boolean 피연산자 레이어",
					}
				: null,
		].filter(
			(
				badge,
			): badge is { key: string; label: React.ReactElement; title: string } =>
				badge !== null,
		);

		return (
			<div key={el.id} style={{ position: "relative" }}>
				{/* 수직 연결 라인 */}
				{depth > 0 && (
					<div
						style={{
							position: "absolute",
							left: `${(depth - 1) * 12 + 10}px`,
							top: 0,
							bottom: isLast ? "50%" : 0,
							width: "1px",
							background: lineColors[(depth - 1) % lineColors.length],
						}}
					/>
				)}

				{/* 수평 연결 라인 */}
				{depth > 0 && (
					<div
						style={{
							position: "absolute",
							left: `${(depth - 1) * 12 + 10}px`,
							top: "50%",
							width: "8px",
							height: "1px",
							background: lineColors[(depth - 1) % lineColors.length],
						}}
					/>
				)}

				<div
					role="treeitem"
					tabIndex={0}
					aria-selected={isSelected}
					className={`layer-item ${isSelected ? "selected" : ""} ${draggedId === el.id ? "dragging" : ""} ${dragOverId === el.id ? "drag-over" : ""}`}
					onClick={(e) => handleClick(el.id, e)}
					onKeyDown={(e) => handleKeyboardSelect(el.id, e)}
					draggable={!el.parentId} // 최상위 요소만 드래그 가능
					onDragStart={(e) => handleDragStart(e, el.id)}
					onDragOver={(e) => handleDragOver(e, el.id)}
					onDragEnd={handleDragEnd}
					onDrop={(e) => handleDrop(e, el.id)}
					style={{
						paddingLeft: `${4 + depth * 12}px`,
					}}
				>
					{/* 그룹 펼침/접힘 아이콘 */}
					{isGroup ? (
						<button
							type="button"
							onClick={(e) => toggleGroup(el.id, e)}
							style={{
								background: "transparent",
								border: "none",
								padding: 0,
								cursor: "pointer",
								display: "flex",
								alignItems: "center",
								color: "inherit",
								marginRight: "2px",
							}}
						>
							{isExpanded ? (
								<ChevronDown size={12} />
							) : (
								<ChevronRight size={12} />
							)}
						</button>
					) : (
						<span style={{ width: 14, marginRight: "2px" }} />
					)}

					<Icon size={14} className="layer-icon" />
					<div className="layer-content">
						<div className="layer-title-row">
							<span
								className="layer-name"
								title={el.type === "text" && el.content ? el.content : el.name}
							>
								{getElementLabel(el)}
							</span>

							{isGroup && children.length > 0 && (
								<span className="layer-count">({children.length})</span>
							)}
						</div>

						{compositionBadges.length > 0 && (
							<div className="layer-badges">
								{compositionBadges.map((badge) => (
									<span
										key={badge.key}
										className="layer-badge"
										title={badge.title}
									>
										{badge.label}
									</span>
								))}
							</div>
						)}
					</div>

					<div className="layer-actions">
						<button
							type="button"
							className="layer-action-btn"
							onClick={(e) => {
								e.stopPropagation();
								onUpdate(el.id, { visible: !el.visible });
							}}
							title={el.visible ? "숨기기" : "보이기"}
						>
							{el.visible ? <Eye size={14} /> : <EyeOff size={14} />}
						</button>
						<button
							type="button"
							className="layer-action-btn"
							onClick={(e) => {
								e.stopPropagation();
								onUpdate(el.id, { locked: !el.locked });
							}}
							title={el.locked ? "잠금 해제" : "잠금"}
						>
							{el.locked ? <Lock size={14} /> : <Unlock size={14} />}
						</button>
						<button
							type="button"
							className="layer-action-btn"
							onClick={(e) => {
								e.stopPropagation();
								onDelete([el.id]);
							}}
							title="삭제"
						>
							<Trash2 size={14} />
						</button>
					</div>
				</div>

				{/* 자식 요소들 */}
				{isGroup && isExpanded && (
					<div style={{ position: "relative" }}>
						{children.map((child, idx) =>
							renderLayerItem(child, depth + 1, idx === children.length - 1),
						)}
					</div>
				)}
			</div>
		);
	};

	const renderMotionItem = (item: MotionListItem, index: number) => {
		const { element: el, phase } = item;
		const Icon = typeIcons[el.type] || Square;
		const isSelected = selectedIds.includes(el.id);
		const labels =
			phase === "enter" ? enterAnimationLabels : exitAnimationLabels;

		return (
			<div key={item.key} style={{ position: "relative" }}>
				<div
					role="treeitem"
					tabIndex={0}
					aria-selected={isSelected}
					className={`layer-item motion-item ${phase} ${isSelected ? "selected" : ""} ${draggedId === item.key ? "dragging" : ""} ${dragOverId === item.key ? "drag-over" : ""}`}
					onClick={(e) => handleClick(el.id, e)}
					onKeyDown={(e) => handleKeyboardSelect(el.id, e)}
					draggable
					onDragStart={(e) => handleDragStart(e, item.key)}
					onDragOver={(e) => handleDragOver(e, item.key)}
					onDragEnd={handleDragEnd}
					onDrop={(e) => handleDrop(e, item.key)}
				>
					<span className="motion-order-index">{index + 1}</span>
					<div className="motion-row-body">
						<div className="motion-row-main">
							<span className={`motion-phase-badge ${phase}`}>
								{phase === "enter" ? "IN" : "OUT"}
							</span>
							<Icon size={14} className="layer-icon" />
							<span
								className="layer-name"
								title={el.type === "text" && el.content ? el.content : el.name}
							>
								{getElementLabel(el)}
							</span>
						</div>
						<div className="motion-meta">
							<span className={`motion-chip motion-name ${phase}`}>
								{labels[item.type] ?? item.type}
							</span>
							<span className="motion-chip muted">
								<Clock size={10} />
								{item.delay}ms
							</span>
							<span className="motion-chip muted">{item.duration}ms</span>
						</div>
					</div>
					<div className="layer-actions">
						<button
							type="button"
							className="layer-action-btn"
							onClick={(e) => {
								e.stopPropagation();
								onRemoveMotion([el.id], phase);
							}}
							title={`${phase === "enter" ? "In" : "Out"} 모션만 삭제`}
						>
							<Trash2 size={14} />
						</button>
					</div>
				</div>
			</div>
		);
	};

	return (
		<div className="layers-panel">
			<div className="layers-panel-header">
				<div className="layers-panel-title-group">
					<button
						type="button"
						className={`layers-panel-title-btn ${panelMode === "layers" ? "active" : ""}`}
						onClick={() => onPanelModeChange("layers")}
						aria-pressed={panelMode === "layers"}
					>
						<Layers size={12} />
						레이어
					</button>
					<button
						type="button"
						className={`layers-panel-title-btn ${panelMode === "motion" ? "active" : ""}`}
						onClick={() => onPanelModeChange("motion")}
						aria-pressed={panelMode === "motion"}
					>
						<Play size={12} />
						모션 순서
					</button>
				</div>
				<span className="layers-panel-count">
					{panelMode === "layers"
						? `${elements.length}개`
						: `${motionItems.length}개`}
				</span>
			</div>

			{panelMode === "motion" && (
				<div className="layers-motion-toolbar">
					<button
						type="button"
						className="motion-stagger-btn"
						onClick={() =>
							onApplyStaggeredMotion(
								"enter",
								enterMotionOrderIds,
								selectedEnterMotionIds,
								motionStepMs,
							)
						}
						disabled={selectedEnterMotionIds.length === 0}
						title="선택한 In 모션을 현재 리스트 순서대로 간격 배치합니다"
					>
						선택 간격 적용
					</button>
					<button
						type="button"
						className="motion-stagger-btn secondary"
						onClick={() =>
							onApplySimultaneousMotion(
								"enter",
								enterMotionOrderIds,
								selectedEnterMotionIds,
							)
						}
						disabled={selectedEnterMotionIds.length === 0}
						title="선택한 In 모션을 바로 앞 모션과 같은 시각에 시작합니다"
					>
						이전과 동시
					</button>
					<button
						type="button"
						className="motion-stagger-btn secondary"
						onClick={() =>
							onApplySequenceMotion(
								"enter",
								enterMotionOrderIds,
								selectedEnterMotionIds,
							)
						}
						disabled={selectedEnterMotionIds.length === 0}
						title="선택한 In 모션을 이전 모션이 완료된 직후 이어서 시작하도록 배치합니다"
					>
						이어서 시작
					</button>
					<label className="motion-step-control">
						<Clock size={11} />
						<input
							type="number"
							min={0}
							max={5000}
							step={50}
							value={motionStepMs}
							onChange={(event) =>
								setMotionStepMs(Math.max(0, Number(event.target.value) || 0))
							}
							aria-label="순차 시작 간격"
						/>
						<span>ms</span>
					</label>
				</div>
			)}

			<div className="layers-list">
				{panelMode === "motion" ? (
					motionItems.length === 0 ? (
						<div className="motion-empty">
							<Play size={20} />
							<strong>모션이 있는 요소가 없습니다</strong>
							<span>
								요소를 선택한 뒤 순차 적용하거나 Animate 탭에서 In 효과를
								추가하세요.
							</span>
						</div>
					) : (
						<>
							{motionItems.map((item, idx) => renderMotionItem(item, idx))}
							{staticElementCount > 0 && (
								<div className="motion-static-note">
									정적 요소 {staticElementCount}개는 처음부터 표시됩니다.
								</div>
							)}
						</>
					)
				) : rootElements.length === 0 ? (
					<div
						style={{
							padding: "1rem",
							textAlign: "center",
							color: "var(--text-secondary)",
							fontSize: "0.875rem",
						}}
					>
						요소가 없습니다
					</div>
				) : (
					rootElements.map((el, idx) =>
						renderLayerItem(el, 0, idx === rootElements.length - 1),
					)
				)}
			</div>

			{/* 단축키 가이드 (Fold/Unfold accordion 도입으로 레이어 리스트 공간 최적화) */}
			<div
				className={`shortcuts-guide ${isShortcutsExpanded ? "expanded" : "collapsed"}`}
			>
				<button
					type="button"
					className="shortcuts-guide-title"
					onClick={() => setIsShortcutsExpanded(!isShortcutsExpanded)}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							setIsShortcutsExpanded(!isShortcutsExpanded);
						}
					}}
				>
					<span>⌨️ 단축키 안내</span>
					{isShortcutsExpanded ? (
						<ChevronDown size={12} className="toggle-icon" />
					) : (
						<ChevronRight size={12} className="toggle-icon" />
					)}
				</button>
				{isShortcutsExpanded && (
					<div className="shortcuts-guide-list">
						<div className="shortcut-item">
							<kbd>Ctrl</kbd>+<kbd>D</kbd>
							<span>도형 복제</span>
						</div>
						<div className="shortcut-item">
							<kbd>Ctrl</kbd>+<kbd>G</kbd>
							<span>그룹화</span>
						</div>
						<div className="shortcut-item">
							<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd>
							<span>그룹 해제</span>
						</div>
						<div className="shortcut-item">
							<kbd>Ctrl</kbd>+<kbd>Z</kbd>
							<span>실행 취소</span>
						</div>
						<div className="shortcut-item">
							<kbd>Ctrl</kbd>+<kbd>Y</kbd>
							<span>다시 실행</span>
						</div>
						<div className="shortcut-item">
							<kbd>Delete</kbd>
							<span>선택 삭제</span>
						</div>
						<div className="shortcut-item">
							<kbd>Ctrl</kbd>+클릭
							<span>다중 선택</span>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
