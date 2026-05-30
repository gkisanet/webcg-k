import { memo } from "react";
import { Palette, Layers, Loader2, Search, Plus } from "lucide-react";
import { useRundownState, useRundownActions } from "./RundownEditorContext";
import { GraphicPreviewRenderer, type GraphicElement } from "../GraphicPreviewRenderer";

/**
 * ⚡ 왼쪽 사이드바: 그래픽 라이브러리 및 타 런다운 섹션 임포트 패널
 * React.memo로 밀봉되어, 중앙 목록 편집이나 우측 속성 변경에 따른 리렌더 전파를 완벽히 가드합니다.
 */
export const LibraryPanel = memo(function LibraryPanel() {
	const {
		activeTab,
		libraryLoading,
		libraryItems,
		sectionImportSearch,
		sectionImportScope,
		sectionImportCandidates,
		importingSectionKey,
	} = useRundownState();

	const {
		setActiveTab,
		setSectionImportSearch,
		setSectionImportScope,
		handleAddToRundown,
		handleImportSection,
	} = useRundownActions();

	const SECTION_COLORS = [
		"rgba(59, 130, 246, 0.12)",
		"rgba(16, 185, 129, 0.12)",
		"rgba(139, 92, 246, 0.12)",
		"rgba(236, 72, 153, 0.12)",
		"rgba(245, 158, 11, 0.12)",
	];

	return (
		<aside className="library-panel">
			<div className="library-tabs">
				<button
					type="button"
					className={`library-tab ${activeTab === "graphics" ? "active" : ""}`}
					onClick={() => setActiveTab("graphics")}
				>
					<Palette size={16} />
					그래픽
				</button>
				<button
					type="button"
					className={`library-tab ${activeTab === "sections" ? "active" : ""}`}
					onClick={() => setActiveTab("sections")}
				>
					<Layers size={16} />
					섹션 가져오기
				</button>
			</div>
			<div className="library-content">
				{activeTab === "graphics" ? (
					libraryLoading ? (
						<div className="library-loading">
							<Loader2 className="animate-spin" size={24} />
						</div>
					) : libraryItems.length === 0 ? (
						<div className="library-empty">항목이 없습니다</div>
					) : (
						<div className="library-grid">
							{libraryItems.map((item) => (
								<div
									key={item.id}
									className="library-item"
									onClick={() => handleAddToRundown(item)}
									title={item.name}
								>
									{item.thumbnail ? (
										<img
											src={item.thumbnail}
											alt={item.name}
											className="library-item-thumb"
										/>
									) : item.data?.elements && item.data.elements.length > 0 ? (
										/* ⚡ 방송 그래픽(Broadcast Graphics) SVG 실시간 미니 프리뷰 */
										<div className="library-item-preview">
											<GraphicPreviewRenderer
												elements={item.data.elements as GraphicElement[]}
											/>
										</div>
									) : (
										<div className="library-item-placeholder">
											<Palette size={24} />
										</div>
									)}
									<span className="library-item-name">{item.name}</span>
									<Plus size={16} className="library-item-add" />
								</div>
							))}
						</div>
					)
				) : (
					<div className="section-import-panel">
						<div className="section-import-toolbar">
							<div className="section-import-search">
								<Search size={14} />
								<input
									type="search"
									value={sectionImportSearch}
									onChange={(event) => setSectionImportSearch(event.target.value)}
									placeholder="런다운 또는 섹션 검색"
								/>
							</div>
							<select
								className="section-import-scope"
								value={sectionImportScope}
								onChange={(event) =>
									setSectionImportScope(event.target.value as any)
								}
							>
								<option value="all">내 워크스페이스 + 공개</option>
								<option value="workspace">내 워크스페이스</option>
								<option value="public">공개 런다운</option>
							</select>
						</div>
						{libraryLoading ? (
							<div className="library-loading">
								<Loader2 className="animate-spin" size={24} />
							</div>
						) : sectionImportCandidates.length === 0 ? (
							<div className="library-empty">가져올 섹션이 없습니다</div>
						) : (
							<div className="section-import-list">
								{sectionImportCandidates.map((candidate) => {
									const importKey = `${candidate.source_rundown_id}:${candidate.section.id}`;
									const isImporting = importingSectionKey === importKey;
									const sectionColor =
										candidate.section.color || SECTION_COLORS[0];
									return (
										<div key={importKey} className="section-import-card">
											<div className="section-import-card-header">
												<span
													className="section-import-color"
													style={{
														background: sectionColor.replace("0.12", "0.7"),
													}}
												/>
												<div className="section-import-title-group">
													<strong>{candidate.section.label}</strong>
													<span>{candidate.source_rundown_title}</span>
												</div>
											</div>
											<div className="section-import-meta">
												<span>{candidate.item_count}개 아이템</span>
												<span>
													{candidate.source_is_public ? "공개" : "워크스페이스"}
												</span>
											</div>
											<button
												type="button"
												className="section-import-button"
												disabled={isImporting || candidate.item_count === 0}
												onClick={() => handleImportSection(candidate)}
											>
												{isImporting ? (
													<>
														<Loader2 className="animate-spin" size={14} />
														가져오는 중
													</>
												) : (
													<>
														<Plus size={14} />
														현재 런다운에 가져오기
													</>
												)}
											</button>
										</div>
									);
								})}
							</div>
						)}
					</div>
				)}
			</div>
		</aside>
	);
});
