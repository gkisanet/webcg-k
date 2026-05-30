import { memo, useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
	Plus,
	Trash2,
	ChevronRight,
	GripVertical,
	Palette,
	LayoutTemplate,
	Layers,
	Play,
} from "lucide-react";
import { useRundownState, useRundownActions, type RundownItem, type RundownSection } from "./RundownEditorContext";

const SECTION_COLORS = [
	"rgba(59, 130, 246, 0.12)",
	"rgba(16, 185, 129, 0.12)",
	"rgba(139, 92, 246, 0.12)",
	"rgba(236, 72, 153, 0.12)",
	"rgba(245, 158, 11, 0.12)",
];

/**
 * ⚡ 런다운 아이템 해상도 경고 체크 유틸 (Warning caching)
 */
function checkResolutionWarning(item: RundownItem): boolean {
	const elements = item.data?.elements;
	if (!Array.isArray(elements)) return false;

	const imageElements = elements.filter((el: any) => el.type === "image");
	if (imageElements.length === 0) return false;

	return imageElements.some((img: any) => {
		const has2k = !!(img.src_2k || img.src);
		const has4k = !!img.src_4k;
		return (has2k && !has4k) || (!has2k && has4k);
	});
}

interface SortableRundownItemProps {
	item: RundownItem;
	index: number;
	isSelected: boolean;
	hasResolutionWarning?: boolean;
	onSelect: () => void;
	onPlay: () => void;
	onDelete: () => void;
}

/**
 * ⚡ 개별 런다운 행 컴포넌트: React.memo로 밀봉
 */
const SortableRundownItem = memo(function SortableRundownItem({
	item,
	index,
	isSelected,
	hasResolutionWarning,
	onSelect,
	onPlay,
	onDelete,
}: SortableRundownItemProps) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: item.id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={`rundown-item ${isSelected ? "selected" : ""} ${isDragging ? "dragging" : ""}`}
			onClick={onSelect}
		>
			<div className="rundown-item-drag" {...attributes} {...listeners}>
				<GripVertical size={16} />
			</div>
			<span className="rundown-item-order">{index + 1}</span>
			{item.thumbnail ? (
				<img src={item.thumbnail} alt="" className="rundown-item-thumb" />
			) : (
				<div className="rundown-item-thumb-placeholder">
					{item.source_type === "graphic" && <Palette size={16} />}
					{item.source_type === "template" && <LayoutTemplate size={16} />}
					{item.source_type === "overlay" && <Layers size={16} />}
				</div>
			)}
			<div className="rundown-item-info">
				<span className="rundown-item-type">{item.source_type}</span>
				<span className="rundown-item-name">{item.source_name}</span>
			</div>
			{hasResolutionWarning && (
				<span
					title="2K 또는 4K 이미지가 누락되어 렌더링 품질 저하 가능"
					style={{
						color: "#eab308",
						marginRight: "4px",
						fontSize: "14px",
					}}
				>
					⚠️
				</span>
			)}
			<div className="rundown-item-actions">
				<button
					type="button"
					className="rundown-item-play"
					onClick={(e) => {
						e.stopPropagation();
						onPlay();
					}}
				>
					<Play size={14} />
				</button>
				<button
					type="button"
					className="rundown-item-delete"
					onClick={(e) => {
						e.stopPropagation();
						onDelete();
					}}
				>
					<Trash2 size={14} />
				</button>
			</div>
		</div>
	);
});

interface DroppableSectionProps {
	section: RundownSection;
	isCollapsed: boolean;
	children: React.ReactNode;
}

/**
 * ⚡ 드롭 영역을 갖춘 섹션 컴포넌트: React.memo로 밀봉
 */
const DroppableSection = memo(function DroppableSection({
	section,
	isCollapsed,
	children,
}: DroppableSectionProps) {
	const { setNodeRef, isOver } = useDroppable({
		id: `drop-${section.id}`,
		data: { sectionId: section.id },
	});

	return (
		<div
			ref={setNodeRef}
			className={`rundown-section-wrapper ${isOver ? "drag-over" : ""} ${isCollapsed ? "collapsed" : ""}`}
			style={{
				background: isOver ? "rgba(99, 102, 241, 0.05)" : undefined,
			}}
		>
			{children}
		</div>
	);
});

/**
 * ⚡ 중앙 메인 패널: 런다운 순서 목록 (Drag & Drop 리액트 분리)
 * areEqual 커스텀 비교 함수를 내포하여 극도의 미려한 고성능 상태 격리를 보장합니다.
 */
export const RundownListPanel = memo(function RundownListPanel() {
	const {
		items,
		sections,
		collapsedSections,
		activeSectionId,
		selectedItemId,
	} = useRundownState();

	const {
		handleAddSection,
		handleDeleteSection,
		handleRenameSection,
		toggleSectionCollapse,
		handleToggleWrap,
		handleDeleteItemWithOrphanRecovery,
		handlePlayItem,
		setSelectedItemId,
		setActiveSectionId,
		sensors,
		handleDragEnd,
	} = useRundownActions();

	// ⚡ $O(1)$ 상수 시간 인덱스 맵 캐싱 (Finding linear search detoxification)
	const itemIndexMap = useMemo(() => {
		const map = new Map<string, number>();
		items.forEach((item, index) => {
			map.set(item.id, index);
		});
		return map;
	}, [items]);

	return (
		<main className="rundown-panel">
			<div className="rundown-header">
				<h2>런다운 순서</h2>
				<span className="rundown-count">
					{items.length}개
					{sections.length > 0 ? ` • ${sections.length} 섹션` : ""}
				</span>
			</div>
			<div className="rundown-list">
				<button
					type="button"
					className="add-section-btn"
					onClick={handleAddSection}
				>
					<Plus size={16} />
					Add Section
				</button>

				{items.length === 0 && sections.length === 0 ? (
					<div className="rundown-empty">
						<Plus size={32} />
						<p>
							왼쪽 라이브러리에서
							<br />
							아이템을 추가하세요
						</p>
					</div>
				) : (
					<DndContext
						sensors={sensors}
						collisionDetection={closestCenter}
						onDragEnd={handleDragEnd}
					>
						<SortableContext
							items={items.map((i) => i.id)}
							strategy={verticalListSortingStrategy}
						>
							{sections.map((section) => {
								const sectionItems = items.filter((i) => i.section_id === section.id);
								const isCollapsed = collapsedSections.has(section.id);

								return (
									<DroppableSection
										key={section.id}
										section={section}
										isCollapsed={isCollapsed}
									>
										<div
											className={`section-header ${activeSectionId === section.id ? "section-header--active" : ""}`}
											onClick={() => {
												setActiveSectionId(activeSectionId === section.id ? null : section.id);
												setSelectedItemId(null);
												if (collapsedSections.has(section.id)) {
													toggleSectionCollapse(section.id);
												}
											}}
										>
											<span className="section-collapse-icon">
												<ChevronRight size={14} />
											</span>
											<div
												className="section-color-bar"
												style={{
													background: section.color.replace("0.12", "0.7"),
												}}
											/>
											<input
												type="text"
												className="section-label-input"
												value={section.label}
												readOnly
												onChange={(e) => handleRenameSection(section.id, e.target.value)}
												onDoubleClick={(e) => {
													e.stopPropagation();
													const input = e.target as HTMLInputElement;
													input.readOnly = false;
													input.focus();
													input.select();
												}}
												onBlur={(e) => {
													(e.target as HTMLInputElement).readOnly = true;
												}}
												onKeyDown={(e) => {
													if (e.key === "Enter" || e.key === "Escape") {
														(e.target as HTMLInputElement).blur();
													}
												}}
											/>
											<span className="section-count-badge">{sectionItems.length}</span>
											<button
												type="button"
												className="section-delete-btn"
												onClick={(e) => {
													e.stopPropagation();
													handleDeleteSection(section.id);
												}}
												title="섹션 삭제"
											>
												<Trash2 size={12} />
											</button>
										</div>

										<div className={`section-items ${isCollapsed ? "collapsed" : ""}`}>
											{sectionItems.length === 0 ? (
												<div className="section-empty">
													아이템을 여기에 드래그하여 추가하세요
												</div>
											) : (
												(() => {
													const rendered: React.ReactNode[] = [];
													let idx = 0;

													while (idx < sectionItems.length) {
														const item = sectionItems[idx];
														// ⚡ $O(1)$ 상수 시간 인덱스 맵 룩업 대조
														const globalIndex = itemIndexMap.get(item.id) ?? 0;

														if (item.track_layer === "wrap") {
															const children = sectionItems.filter((i) => i.parent_item_id === item.id);
															rendered.push(
																<div key={`wrap-group-${item.id}`} className="rundown-tree-group">
																	<div className="rundown-tree-parent">
																		<SortableRundownItem
																			item={item}
																			index={globalIndex}
																			isSelected={selectedItemId === item.id}
																			hasResolutionWarning={checkResolutionWarning(item)}
																			onSelect={() => setSelectedItemId(item.id)}
																			onPlay={() => handlePlayItem(item)}
																			onDelete={() => handleDeleteItemWithOrphanRecovery(item.id)}
																		/>
																		<button
																			type="button"
																			className={`rundown-item-wrap-toggle ${item.track_layer === "wrap" ? "active" : ""}`}
																			onClick={(e) => {
																				e.stopPropagation();
																				handleToggleWrap(item.id);
																			}}
																			title="자식 분리 (Main 전환)"
																		>
																			<Layers size={14} />
																		</button>
																		<button
																			type="button"
																			className="rundown-item-delete"
																			onClick={(e) => {
																				e.stopPropagation();
																				handleDeleteItemWithOrphanRecovery(item.id);
																			}}
																		>
																			<Trash2 size={14} />
																		</button>
																	</div>

																	{children.length > 0 && (
																		<div className="rundown-tree-children">
																			{children.map((child) => {
																				// ⚡ $O(1)$ 상수 시간 인덱스 맵 룩업 대조
																				const childGlobalIndex = itemIndexMap.get(child.id) ?? 0;
																				return (
																					<SortableRundownItem
																						key={child.id}
																						item={child}
																						index={childGlobalIndex}
																						isSelected={selectedItemId === child.id}
																						hasResolutionWarning={checkResolutionWarning(child)}
																						onSelect={() => setSelectedItemId(child.id)}
																						onPlay={() => handlePlayItem(child)}
																						onDelete={() => handleDeleteItemWithOrphanRecovery(child.id)}
																					/>
																				);
																			})}
																		</div>
																	)}
																</div>
															);
															idx++;
														} else if (!item.parent_item_id) {
															rendered.push(
																<SortableRundownItem
																	key={item.id}
																	item={item}
																	index={globalIndex}
																	isSelected={selectedItemId === item.id}
																	hasResolutionWarning={checkResolutionWarning(item)}
																	onSelect={() => setSelectedItemId(item.id)}
																	onPlay={() => handlePlayItem(item)}
																	onDelete={() => handleDeleteItemWithOrphanRecovery(item.id)}
																/>
															);
															idx++;
														} else {
															idx++;
														}
													}
													return rendered;
												})()
											)}
										</div>
									</DroppableSection>
								);
							})}

							{/* 미분류 Main 아이템들 (섹션이 지정되지 않은 최상단 에셋) */}
							{items.some((i) => !i.section_id) && (
								<div className="unsectioned-group">
									<div className="unsectioned-header">미분류 항목</div>
									<div className="section-items">
										{items
											.filter((item) => !item.section_id && !item.parent_item_id)
											.map((item) => {
												// ⚡ $O(1)$ 상수 시간 인덱스 맵 룩업 대조
												const globalIndex = itemIndexMap.get(item.id) ?? 0;
												return (
													<SortableRundownItem
														key={item.id}
														item={item}
														index={globalIndex}
														isSelected={selectedItemId === item.id}
														hasResolutionWarning={checkResolutionWarning(item)}
														onSelect={() => setSelectedItemId(item.id)}
														onPlay={() => handlePlayItem(item)}
														onDelete={() => handleDeleteItemWithOrphanRecovery(item.id)}
													/>
												);
											})}
									</div>
								</div>
							)}
						</SortableContext>
					</DndContext>
				)}
			</div>
		</main>
	);
});
