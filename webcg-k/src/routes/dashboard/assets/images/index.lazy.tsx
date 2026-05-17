/**
 * Images Management Page
 * 이미지 관리 페이지 - 2K/4K 다중 해상도 지원
 * [Lazy 로드 — 코드 스플리팅 적용]
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { FolderOpen, Image, Trash2, Upload, Loader2, X, Edit2, Clock, Sparkles, Code, Grid3x3 } from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "../../../../lib/supabase";
import { useAuth } from "../../../../lib/auth";
import { fetchImages } from "../../../../services/imageService";
import { generateSvg, uploadSvgToStorage, SVG_STYLE_PRESETS, type SvgStylePreset } from "../../../../services/aiSvgService";
import { GridSelector } from "../../../../components/Overlay/GridSelector";
import { ZoneSelector, calculateCombinedBounds } from "../../../../components/Overlay/ZoneSelector";
import type { GridTemplateRow } from "../../../../lib/gridTypes";
import type { ZoneBounds } from "../../../../lib/overlayTypes";

import "../../dashboard-common.css";
import "../../../../components/Overlay/OverlayCreationWizard.css";

export const Route = createLazyFileRoute("/dashboard/assets/images/")({
	component: ImagesPage,
});

// 이미지 타입 (다중 해상도 지원 + 소유자 정보)
interface ImageItem {
	id: string;
	owner_id: string;
	name: string;
	description: string | null;
	category: string | null;
	is_public: boolean;
	storage_path: string;
	storage_path_2k: string | null;
	storage_path_4k: string | null;
	file_size: number | null;
	mime_type: string | null;
	created_at: string;
	url_2k: string | null;
	url_4k: string | null;
}

// 업로드 모달 상태
interface UploadModalState {
	isOpen: boolean;
	name: string;
	description: string;
	category: string;
	file2k: File | null;
	file4k: File | null;
}

function ImagesPage() {
	const { user } = useAuth();
	const queryClient = useQueryClient();

	// 이미지 목록 조회
	const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
	const { data: images = [], isLoading: loading } = useQuery({
		queryKey: ["images", selectedCategory],
		queryFn: () => fetchImages(selectedCategory),
		enabled: !!user,
	})

	const [uploading, setUploading] = useState(false);
	const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

	// 업로드 모달 상태
	const [uploadModal, setUploadModal] = useState<UploadModalState>({
		isOpen: false,
		name: "",
		description: "",
		category: "기타",
		file2k: null,
		file4k: null,
	})

	// 편집 모달 상태
	const [editingImage, setEditingImage] = useState<ImageItem | null>(null);
	const [editForm, setEditForm] = useState({
		name: "",
		description: "",
		category: "",
		is_public: true,
	})

	const file2kInputRef = useRef<HTMLInputElement>(null);
	const file4kInputRef = useRef<HTMLInputElement>(null);

	// ── AI SVG 생성 모달 상태 ──
	const [svgModal, setSvgModal] = useState({
		isOpen: false,
		prompt: "",
		width: 1920,
		height: 1080,
		style: "" as SvgStylePreset | "",
		svgCode: "",
		previewUrl: "",
		name: "",
		category: "기타",
		generating: false,
		saving: false,
		error: "",
		// ── 크기 결정 모드: 그리드 기반 vs 수동 입력 ──
		sizeMode: "manual" as "grid" | "manual",
	})

	// ── 그리드 기반 크기 결정 상태 (모달과 독립 관리하여 복잡도 분리) ──
	const [svgGrid, setSvgGrid] = useState<GridTemplateRow | null>(null);
	const [svgZoneIds, setSvgZoneIds] = useState<Set<string>>(new Set());
	const [svgCombinedBounds, setSvgCombinedBounds] = useState<ZoneBounds | null>(null);

	// 그리드 선택 핸들러
	const handleSvgGridSelect = useCallback((template: GridTemplateRow) => {
		setSvgGrid(template);
		setSvgZoneIds(new Set());
		setSvgCombinedBounds(null);
	}, []);

	// Zone 토글 핸들러
	const handleSvgZoneToggle = useCallback((zoneId: string) => {
		setSvgZoneIds((prev) => {
			const next = new Set(prev);
			if (next.has(zoneId)) {
				next.delete(zoneId);
			} else {
				next.add(zoneId);
			}
			// 결합 Bounds 재계산
			if (svgGrid) {
				setSvgCombinedBounds(calculateCombinedBounds(svgGrid, next));
			}
			return next;
		})
	}, [svgGrid]);

	// AI SVG 생성 핸들러
	// ■ Why sizeMode 분기?
	//   그리드 모드: Zone 결합 크기(combinedBounds)를 AI에게 전달 → 영역에 딱 맞는 SVG 생성
	//   수동 모드: 사용자가 직접 입력한 width/height 사용 (기존 방식과 동일)
	const handleSvgGenerate = async () => {
		// 1. 크기 결정: 모드에 따라 width/height 산출
		let finalWidth = svgModal.width;
		let finalHeight = svgModal.height;

		if (svgModal.sizeMode === "grid") {
			if (!svgCombinedBounds) {
				setSvgModal((prev) => ({ ...prev, error: "그리드에서 영역을 선택해주세요." }));
				return
			}
			finalWidth = svgCombinedBounds.width;
			finalHeight = svgCombinedBounds.height;
		}

		setSvgModal((prev) => ({ ...prev, generating: true, error: "" }));
		try {
			const result = await generateSvg(
				svgModal.prompt,
				finalWidth,
				finalHeight,
				(svgModal.style || undefined) as SvgStylePreset | undefined,
			)
			setSvgModal((prev) => ({
				...prev,
				svgCode: result.svgCode,
				previewUrl: result.previewUrl,
				generating: false,
				name: prev.name || svgModal.prompt.slice(0, 20),
			}))
		} catch (err: any) {
			setSvgModal((prev) => ({
				...prev,
				generating: false,
				error: err.message || "SVG 생성 실패",
			}))
		}
	}

	// AI SVG 저장 핸들러
	const handleSvgSave = async () => {
		if (!svgModal.svgCode || !svgModal.name.trim()) return;
		setSvgModal((prev) => ({ ...prev, saving: true, error: "" }));
		try {
			await uploadSvgToStorage(
				svgModal.svgCode,
				svgModal.name,
				svgModal.prompt,
				svgModal.category,
				svgModal.sizeMode === "grid" ? svgCombinedBounds : null
			)
			setSvgModal({
				isOpen: false, prompt: "", width: 1920, height: 1080,
				style: "", svgCode: "", previewUrl: "", name: "", category: "기타",
				generating: false, saving: false, error: "",
				sizeMode: "manual",
			})
			// 그리드 상태도 초기화
			setSvgGrid(null);
			setSvgZoneIds(new Set());
			setSvgCombinedBounds(null);
			queryClient.invalidateQueries({ queryKey: ["images"] });
		} catch (err: any) {
			setSvgModal((prev) => ({
				...prev,
				saving: false,
				error: err.message || "SVG 저장 실패",
			}))
		}
	}

	// 카테고리 목록
	const categories = ["로고", "배경", "아이콘", "기타"];

	// 업로드 모달 열기
	const openUploadModal = () => {
		setUploadModal({
			isOpen: true,
			name: "",
			description: "",
			category: selectedCategory || "기타",
			file2k: null,
			file4k: null,
		})
	}

	// 업로드 모달 닫기
	const closeUploadModal = () => {
		setUploadModal({
			isOpen: false,
			name: "",
			description: "",
			category: "기타",
			file2k: null,
			file4k: null,
		})
	}

	// 이미지 업로드 (모달에서)
	const handleModalUpload = async () => {
		if (!user) {
			alert("로그인이 필요합니다.");
			return
		}

		if (!uploadModal.name.trim()) {
			alert("이미지 이름을 입력해주세요.");
			return
		}

		if (!uploadModal.file2k) {
			alert("2K 이미지는 필수입니다.");
			return
		}

		setUploading(true);

		try {
			const timestamp = Date.now();
			let storagePath2k: string | null = null;
			let storagePath4k: string | null = null;

			// 2K 이미지 업로드
			const safeName2k = uploadModal.file2k.name.replace(/[^a-zA-Z0-9.-]/g, "_");
			storagePath2k = `${user.id}/2k/${timestamp}_${safeName2k}`;

			const { error: upload2kError } = await supabase.storage
				.from("images")
				.upload(storagePath2k, uploadModal.file2k, {
					cacheControl: "3600",
					upsert: false,
				})

			if (upload2kError) {
				alert(`2K 이미지 업로드 실패: ${upload2kError.message}`);
				setUploading(false);
				return
			}

			// 4K 이미지 업로드 (선택 사항)
			if (uploadModal.file4k) {
				const safeName4k = uploadModal.file4k.name.replace(/[^a-zA-Z0-9.-]/g, "_");
				storagePath4k = `${user.id}/4k/${timestamp}_${safeName4k}`;

				const { error: upload4kError } = await supabase.storage
					.from("images")
					.upload(storagePath4k, uploadModal.file4k, {
						cacheControl: "3600",
						upsert: false,
					})

				if (upload4kError) {
					console.warn("4K 이미지 업로드 실패:", upload4kError);
					// 4K 실패 시에도 계속 진행 (선택 사항이므로)
					storagePath4k = null;
				}
			}

			// DB에 메타데이터 저장
			const { error: dbError } = await supabase.from("images").insert({
				owner_id: user.id,
				name: uploadModal.name.trim(),
				description: uploadModal.description.trim() || null,
				category: uploadModal.category,
				storage_path: storagePath2k, // 하위 호환성
				storage_path_2k: storagePath2k,
				storage_path_4k: storagePath4k,
				file_size: uploadModal.file2k.size,
				mime_type: uploadModal.file2k.type,
			})

			if (dbError) {
				alert(`DB 저장 실패: ${dbError.message}`);
				// Storage 정리
				await supabase.storage.from("images").remove([storagePath2k]);
				if (storagePath4k) {
					await supabase.storage.from("images").remove([storagePath4k]);
				}
				setUploading(false);
				return
			}

			// 성공
			closeUploadModal();
			queryClient.invalidateQueries({ queryKey: ["images"] });
		} catch (err) {
			console.error("Upload error:", err);
			alert("업로드 중 오류가 발생했습니다.");
		} finally {
			setUploading(false);
		}
	}

	// 이미지 삭제
	const handleDelete = async (image: ImageItem) => {
		if (!user) return;

		try {
			// Storage에서 삭제
			const pathsToDelete: string[] = [];
			if (image.storage_path_2k) pathsToDelete.push(image.storage_path_2k);
			if (image.storage_path_4k) pathsToDelete.push(image.storage_path_4k);
			if (image.storage_path && !pathsToDelete.includes(image.storage_path)) {
				pathsToDelete.push(image.storage_path);
			}

			if (pathsToDelete.length > 0) {
				await supabase.storage.from("images").remove(pathsToDelete);
			}

			// DB에서 삭제
			await supabase.from("images").delete().eq("id", image.id);

			setDeleteConfirm(null);
			queryClient.invalidateQueries({ queryKey: ["images"] });
		} catch (err) {
			console.error("Delete error:", err);
			alert("삭제 중 오류가 발생했습니다.");
		}
	}

	// 파일 크기 포맷
	const formatFileSize = (bytes: number | null) => {
		if (!bytes) return "-";
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	// 해상도 상태 계산
	const getResolutionStatus = (image: ImageItem) => {
		const has2k = !!image.storage_path_2k || !!image.storage_path;
		const has4k = !!image.storage_path_4k;
		return { has2k, has4k, isComplete: has2k && has4k };
	}

	// 소유자 확인
	const isOwner = (image: ImageItem) => user?.id === image.owner_id;

	// 편집 모달 열기
	const openEditModal = (image: ImageItem) => {
		setEditingImage(image);
		setEditForm({
			name: image.name,
			description: image.description || "",
			category: image.category || "기타",
			is_public: image.is_public ?? true,
		})
	}

	// 편집 모달 닫기
	const closeEditModal = () => {
		setEditingImage(null);
	}

	// 이미지 정보 수정
	const handleEditSave = async () => {
		if (!editingImage || !user) return;

		try {
			setUploading(true);

			const { error } = await supabase
				.from("images")
				.update({
					name: editForm.name.trim(),
					description: editForm.description.trim() || null,
					category: editForm.category,
					is_public: editForm.is_public,
					updated_at: new Date().toISOString(),
				})
				.eq("id", editingImage.id);

			if (error) {
				alert(`수정 실패: ${error.message}`);
				return
			}

			closeEditModal();
			queryClient.invalidateQueries({ queryKey: ["images"] });
		} catch (err) {
			console.error("Edit error:", err);
			alert("수정 중 오류가 발생했습니다.");
		} finally {
			setUploading(false);
		}
	}

	return (
        <>
            {/* 페이지 헤더 */}
            <div className="dash-page-header">
				<div>
					<div className="dash-page-title">
						<div className="dash-page-title-icon">
							<Image size={18} />
						</div>
						이미지
					</div>
					<div className="dash-page-subtitle">
						2K/4K 다중 해상도 이미지를 관리합니다
					</div>
				</div>
				<div className="dash-page-actions" style={{ display: "flex", gap: 8 }}>
					<button className="dash-btn accent" onClick={() => setSvgModal({ ...svgModal, isOpen: true })}>
						<Sparkles size={16} /> AI SVG 생성
					</button>
					<button className="dash-btn primary" onClick={openUploadModal} disabled={uploading}>
						<Upload size={16} /> 이미지 업로드
					</button>
				</div>
			</div>
            {/* 카테고리 필터 */}
            <div className="dash-filter-group">
				<button
					className={`dash-filter-btn ${selectedCategory === null ? "active" : ""}`}
					onClick={() => setSelectedCategory(null)}
				>
					전체
				</button>
				{categories.map((cat) => (
					<button
						key={cat}
						className={`dash-filter-btn ${selectedCategory === cat ? "active" : ""}`}
						onClick={() => setSelectedCategory(cat)}
					>
						{cat}
					</button>
				))}
			</div>
            {/* 로딩/빈 상태 */}
            {loading ? (
				<div className="dash-loading">
					<Loader2 size={24} className="animate-spin" />
				</div>
			) : images.length === 0 ? (
				<div className="dash-empty-state">
					<div className="dash-empty-icon">
						<FolderOpen size={48} />
					</div>
					<div className="dash-empty-title">이미지가 없습니다</div>
					<div className="dash-empty-desc">
						첫 번째 이미지를 업로드하여 방송 그래픽에 활용해보세요
					</div>
					<button className="dash-btn primary" onClick={openUploadModal}>
						<Upload size={16} /> 처음 이미지 업로드
					</button>
				</div>
			) : (
				<div className="dash-cards-grid compact">
					{images.map((image) => {
						const resStatus = getResolutionStatus(image);
						return (
							<div
								key={image.id}
								className="dash-card"
							>
								{/* 썸네일 + 해상도 배지 */}
								<div className="dash-card-thumb">
									<img
										src={image.url_2k || ""}
										alt={image.name}
										style={{ objectFit: "contain" }}
										loading="lazy"
									/>
									{/* 해상도 배지 그룹 */}
									<div style={{ position: "absolute", top: 8, left: 8, display: "flex", gap: 4, zIndex: 2 }}>
										<span className={`dash-card-badge left ${resStatus.has2k ? "success" : ""}`}
											style={{ opacity: resStatus.has2k ? 1 : 0.4 }}
											title={resStatus.has2k ? "2K 있음" : "2K 없음"}
										>2K</span>
										<span className={`dash-card-badge left ${resStatus.has4k ? "info" : ""}`}
											style={{ opacity: resStatus.has4k ? 1 : 0.4 }}
											title={resStatus.has4k ? "4K 있음" : "4K 없음"}
										>4K</span>
									</div>
								</div>

								{/* 카드 바디 */}
								<div className="dash-card-body">
									<div className="dash-card-name" title={image.name}>
										{image.name}
									</div>
									{image.description && (
										<div className="dash-card-desc">{image.description}</div>
									)}
									<div className="dash-card-tags">
										<span className="dash-card-tag neutral">
											{image.category || "기타"}
										</span>
										<span className="dash-card-tag" style={{ background: "var(--accent-primary)", color: "white" }}>
											{image.mime_type?.split("/")[1]?.toUpperCase() || "IMG"}
										</span>
										<span className="dash-card-tag blue">
											{formatFileSize(image.file_size)}
										</span>
									</div>
								</div>

								{/* 카드 하단 */}
								<div className="dash-card-footer">
									<div className="dash-card-date">
										<Clock size={10} />
										{new Date(image.created_at).toLocaleDateString()}
									</div>
									<div className="dash-card-actions">
										{isOwner(image) && (
											<button
												className="dash-card-action-btn"
												onClick={() => openEditModal(image)}
												title="편집"
											>
												<Edit2 size={12} />
											</button>
										)}
										<button
											className="dash-card-action-btn delete"
											onClick={() => setDeleteConfirm(image.id)}
											title="삭제"
										>
											<Trash2 size={12} />
										</button>
									</div>
								</div>

								{/* 삭제 확인 오버레이 */}
								{deleteConfirm === image.id && (
									<div className="dash-card-delete-confirm">
										<p>"{image.name}" 삭제?</p>
										<div className="confirm-btns">
											<button
												className="dash-delete-cancel"
												onClick={() => setDeleteConfirm(null)}
											>
												취소
											</button>
											<button
												className="dash-delete-confirm"
												onClick={() => handleDelete(image)}
											>
												삭제
											</button>
										</div>
									</div>
								)}
							</div>
						)
					})}
				</div>
			)}
            {/* 업로드 모달 */}
            {uploadModal.isOpen && (
				<div
					style={{
						position: "fixed",
						inset: 0,
						backgroundColor: "rgba(0,0,0,0.6)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						zIndex: 1000,
					}}
					onClick={closeUploadModal}
				>
					<div
						className="card"
						style={{
							width: "480px",
							maxWidth: "90vw",
							maxHeight: "90vh",
							overflow: "auto",
						}}
						onClick={(e) => e.stopPropagation()}
					>
						{/* 모달 헤더 */}
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								padding: "1rem",
								borderBottom: "1px solid var(--border-primary)",
							}}
						>
							<h2 style={{ margin: 0, fontSize: "1.125rem" }}>이미지 업로드</h2>
							<button
								type="button"
								onClick={closeUploadModal}
								style={{
									background: "none",
									border: "none",
									cursor: "pointer",
									color: "var(--text-tertiary)",
									padding: "4px",
								}}
							>
								<X size={20} />
							</button>
						</div>

						{/* 모달 본문 */}
						<div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
							{/* 이름 */}
							<div>
								<label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", fontWeight: 500 }}>
									이름 <span style={{ color: "#ef4444" }}>*</span>
								</label>
								<input
									type="text"
									className="form-input"
									placeholder="이미지 이름"
									value={uploadModal.name}
									onChange={(e) => setUploadModal({ ...uploadModal, name: e.target.value })}
									style={{ width: "100%" }}
								/>
							</div>

							{/* 설명 */}
							<div>
								<label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", fontWeight: 500 }}>
									설명
								</label>
								<input
									type="text"
									className="form-input"
									placeholder="이미지 설명 (선택)"
									value={uploadModal.description}
									onChange={(e) => setUploadModal({ ...uploadModal, description: e.target.value })}
									style={{ width: "100%" }}
								/>
							</div>

							{/* 카테고리 */}
							<div>
								<label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", fontWeight: 500 }}>
									카테고리
								</label>
								<select
									className="form-input"
									value={uploadModal.category}
									onChange={(e) => setUploadModal({ ...uploadModal, category: e.target.value })}
									style={{ width: "100%" }}
								>
									{categories.map((cat) => (
										<option key={cat} value={cat}>{cat}</option>
									))}
								</select>
							</div>

							{/* 2K/4K 파일 선택 */}
							<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
								{/* 2K 이미지 */}
								<div
									style={{
										padding: "1rem",
										border: "2px dashed var(--border-primary)",
										borderRadius: "8px",
										textAlign: "center",
										cursor: "pointer",
										backgroundColor: uploadModal.file2k ? "var(--app-bg-alt)" : undefined,
									}}
									onClick={() => file2kInputRef.current?.click()}
								>
									<input
										ref={file2kInputRef}
										type="file"
										accept="image/*"
										style={{ display: "none" }}
										onChange={(e) => {
											const file = e.target.files?.[0] || null;
											setUploadModal({ ...uploadModal, file2k: file });
										}}
									/>
									<div style={{ marginBottom: "0.5rem" }}>
										<span
											style={{
												padding: "2px 8px",
												borderRadius: "4px",
												fontSize: "12px",
												fontWeight: "bold",
												backgroundColor: "#22c55e",
												color: "white",
											}}
										>
											2K (필수)
										</span>
									</div>
									<div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
										{uploadModal.file2k ? (
											<>
												<Image size={24} style={{ color: "#22c55e", marginBottom: "4px" }} />
												<div style={{ wordBreak: "break-all" }}>{uploadModal.file2k.name}</div>
											</>
										) : (
											<>
												<Upload size={24} style={{ marginBottom: "4px", color: "var(--text-tertiary)" }} />
												<div>클릭하여 선택</div>
											</>
										)}
									</div>
								</div>

								{/* 4K 이미지 */}
								<div
									style={{
										padding: "1rem",
										border: "2px dashed var(--border-primary)",
										borderRadius: "8px",
										textAlign: "center",
										cursor: "pointer",
										backgroundColor: uploadModal.file4k ? "var(--app-bg-alt)" : undefined,
									}}
									onClick={() => file4kInputRef.current?.click()}
								>
									<input
										ref={file4kInputRef}
										type="file"
										accept="image/*"
										style={{ display: "none" }}
										onChange={(e) => {
											const file = e.target.files?.[0] || null;
											setUploadModal({ ...uploadModal, file4k: file });
										}}
									/>
									<div style={{ marginBottom: "0.5rem" }}>
										<span
											style={{
												padding: "2px 8px",
												borderRadius: "4px",
												fontSize: "12px",
												fontWeight: "bold",
												backgroundColor: "#3b82f6",
												color: "white",
											}}
										>
											4K (선택)
										</span>
									</div>
									<div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
										{uploadModal.file4k ? (
											<>
												<Image size={24} style={{ color: "#3b82f6", marginBottom: "4px" }} />
												<div style={{ wordBreak: "break-all" }}>{uploadModal.file4k.name}</div>
											</>
										) : (
											<>
												<Upload size={24} style={{ marginBottom: "4px", color: "var(--text-tertiary)" }} />
												<div>클릭하여 선택</div>
											</>
										)}
									</div>
								</div>
							</div>

							{/* 경고 메시지 */}
							{uploadModal.file2k && !uploadModal.file4k && (
								<div
									style={{
										padding: "0.75rem",
										backgroundColor: "rgba(234, 179, 8, 0.1)",
										border: "1px solid #eab308",
										borderRadius: "8px",
										fontSize: "0.8125rem",
										color: "#eab308",
									}}
								>
									⚠️ 4K 이미지가 없으면 4K 렌더러에서 이미지 열화가 발생할 수 있습니다.
								</div>
							)}
						</div>

						{/* 모달 푸터 */}
						<div
							style={{
								display: "flex",
								justifyContent: "flex-end",
								gap: "0.5rem",
								padding: "1rem",
								borderTop: "1px solid var(--border-primary)",
							}}
						>
							<Button
								variant="secondary"
								onClick={closeUploadModal}
								disabled={uploading}
							>
								취소
							</Button>
							<Button
								onClick={handleModalUpload}
								disabled={uploading || !uploadModal.file2k || !uploadModal.name.trim()}
							>
								{uploading ? (
									<>
										<Loader2 size={16} className="animate-spin" />
										업로드 중...
									</>
								) : (
									<>
										<Upload size={16} />
										업로드
									</>
								)}
							</Button>
						</div>
					</div>
				</div>
			)}
            {editingImage && (
				/* ...existing edit modal... */
				(<EditImageModal
					editingImage={editingImage}
					editForm={editForm}
					setEditForm={setEditForm}
					closeEditModal={closeEditModal}
					handleEditSave={handleEditSave}
					uploading={uploading}
					categories={categories}
				/>)
			)}
            {/* AI SVG 생성 모달 */}
            {svgModal.isOpen && (
				<div
					style={{
						position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.7)",
						display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
					}}
					onClick={() => setSvgModal({ ...svgModal, isOpen: false })}
				>
					<div
						className="card"
						style={{ width: 720, maxWidth: "90vw", maxHeight: "85vh", overflow: "auto" }}
						onClick={(e) => e.stopPropagation()}
					>
						{/* 모달 헤더 */}
						<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem", borderBottom: "1px solid var(--border-primary)" }}>
							<h2 style={{ margin: 0, fontSize: "1.125rem", display: "flex", alignItems: "center", gap: 8 }}>
								<Sparkles size={20} style={{ color: "var(--accent-primary)" }} />
								AI SVG 생성
							</h2>
							<button type="button" onClick={() => setSvgModal({ ...svgModal, isOpen: false })} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: 4 }}>
								<X size={20} />
							</button>
						</div>

						{/* 모달 본문 */}
						<div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
							{/* 프롬프트 및 카테고리 */}
							<div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: "1rem" }}>
								<div>
									<label style={{ display: "block", marginBottom: 4, fontSize: "0.875rem", fontWeight: 500 }}>
										프롬프트 <span style={{ color: "#ef4444" }}>*</span>
									</label>
									<textarea
										className="form-input"
										rows={3}
										placeholder="예: 뉴스 속보 하단자막 배경을 만들어줘. 블루/골드 컬러로."
										value={svgModal.prompt}
										onChange={(e) => setSvgModal({ ...svgModal, prompt: e.target.value })}
										style={{ width: "100%", resize: "vertical", backgroundColor: "rgba(255, 255, 255, 0.05)", border: "1px solid var(--border-primary)" }}
									/>
								</div>
								<div>
									<label style={{ display: "block", marginBottom: 4, fontSize: "0.875rem", fontWeight: 500 }}>
										저장 카테고리
									</label>
									<select
										className="form-input"
										value={svgModal.category}
										onChange={(e) => setSvgModal({ ...svgModal, category: e.target.value })}
										style={{ width: "100%", backgroundColor: "rgba(255, 255, 255, 0.05)", border: "1px solid var(--border-primary)" }}
									>
										{categories.map((cat) => (
											<option key={cat} value={cat}>{cat}</option>
										))}
									</select>
								</div>
							</div>

						{/* ── 💡 프롬프트 작성 가이드 (접이식) ── */}
						{/* ■ Why details/summary?
						     JS 상태 없이 브라우저 네이티브로 접었다 펼 수 있어 복잡도 0.
						     사용자가 프롬프트 입력 중 바로 옆에서 참고 가능. */}
						<details style={{
							border: "1px solid rgba(139, 92, 246, 0.2)",
							borderRadius: 8,
							background: "rgba(139, 92, 246, 0.04)",
							overflow: "hidden",
						}}>
							<summary style={{
								padding: "0.5rem 0.75rem",
								cursor: "pointer",
								fontSize: "0.8125rem",
								fontWeight: 600,
								color: "#a78bfa",
								display: "flex",
								alignItems: "center",
								gap: 6,
								userSelect: "none",
							}}>
								💡 프롬프트 작성 가이드 — AI가 잘 그리게 만드는 5가지 규칙
							</summary>
							<div style={{
								padding: "0.625rem 0.75rem",
								fontSize: "0.75rem",
								lineHeight: 1.6,
								color: "var(--text-secondary)",
								borderTop: "1px solid rgba(139, 92, 246, 0.15)",
								display: "flex",
								flexDirection: "column",
								gap: 8,
							}}>
								{/* 가이드 1 */}
								<div>
									<strong style={{ color: "#22c55e" }}>✅ 기본 도형으로 조립</strong>
									<div style={{ marginTop: 2, paddingLeft: 12 }}>
										"<code>&lt;path&gt;</code> 사용 금지, <code>&lt;rect&gt;</code>, <code>&lt;circle&gt;</code>, <code>&lt;ellipse&gt;</code> 등
										기본 도형만 조합해서 형태를 조립해" 같은 제약을 추가하세요.
									</div>
								</div>
								{/* 가이드 2 */}
								<div>
									<strong style={{ color: "#3b82f6" }}>📐 대칭 및 좌표 지정</strong>
									<div style={{ marginTop: 2, paddingLeft: 12 }}>
										"정중앙(cx=960, cy=540) 기준으로 대칭 배치" 처럼 수학적 좌표를 명시하면 형태 왜곡이 줄어듭니다.
									</div>
								</div>
								{/* 가이드 3 */}
								<div>
									<strong style={{ color: "#f59e0b" }}>🏷️ 부위별 그룹화</strong>
									<div style={{ marginTop: 2, paddingLeft: 12 }}>
										"배경, 프레임, 아이콘 등 각 구성 요소를 <code>&lt;g&gt;</code> 태그로 묶고 한글 주석을 달아줘"
									</div>
								</div>
								{/* 가이드 4 */}
								<div>
									<strong style={{ color: "#ec4899" }}>🎨 색상 제한</strong>
									<div style={{ marginTop: 2, paddingLeft: 12 }}>
										"메인(#003366), 강조(#FFD700), 배경(#0A0E1A) 등 3~4가지 솔리드 컬러만 사용" 으로 팔레트를 직접 지정하세요.
									</div>
								</div>
								{/* 좋은 예 vs 나쁜 예 */}
								<div style={{
									display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
									padding: "6px 0", borderTop: "1px solid rgba(139, 92, 246, 0.1)",
								}}>
									<div>
										<div style={{ color: "#ef4444", fontWeight: 600, marginBottom: 2 }}>❌ 나쁜 예</div>
										<div style={{ fontStyle: "italic", opacity: 0.7 }}>"예쁜 뉴스 배경 그려줘"</div>
									</div>
									<div>
										<div style={{ color: "#22c55e", fontWeight: 600, marginBottom: 2 }}>✅ 좋은 예</div>
										<div style={{ fontStyle: "italic", opacity: 0.7 }}>"하단자막용 직사각형 바. 좌측 블루→골드 그라데이션. rect+circle 도형만 사용. 4색 이하."</div>
									</div>
								</div>
							</div>
						</details>

							{/* ── 크기 결정 모드 탭 ── */}
							<div>
								<div style={{
									display: "flex", gap: 0, borderBottom: "2px solid var(--border-primary)",
									marginBottom: "0.75rem",
								}}>
									<button
										type="button"
										style={{
											padding: "0.5rem 1rem", border: "none", background: "none",
											cursor: "pointer", fontSize: "0.8125rem", fontWeight: 600,
											color: svgModal.sizeMode === "grid" ? "var(--accent-primary)" : "var(--text-secondary)",
											borderBottom: svgModal.sizeMode === "grid" ? "2px solid var(--accent-primary)" : "2px solid transparent",
											marginBottom: "-2px",
											display: "flex", alignItems: "center", gap: 6,
										}}
										onClick={() => setSvgModal({ ...svgModal, sizeMode: "grid" })}
									>
										<Grid3x3 size={14} /> 그리드 가이드
									</button>
									<button
										type="button"
										style={{
											padding: "0.5rem 1rem", border: "none", background: "none",
											cursor: "pointer", fontSize: "0.8125rem", fontWeight: 600,
											color: svgModal.sizeMode === "manual" ? "var(--accent-primary)" : "var(--text-secondary)",
											borderBottom: svgModal.sizeMode === "manual" ? "2px solid var(--accent-primary)" : "2px solid transparent",
											marginBottom: "-2px",
											display: "flex", alignItems: "center", gap: 6,
										}}
										onClick={() => setSvgModal({ ...svgModal, sizeMode: "manual" })}
									>
										✏️ 수동 입력
									</button>
								</div>

								{/* ── 그리드 가이드 모드 ── */}
								{svgModal.sizeMode === "grid" && (
									<div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
										{/* Step 1: 그리드 선택 */}
										<div>
											<div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
												<span style={{ background: "var(--accent-primary)", color: "#fff", borderRadius: "50%", width: 20, height: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700 }}>1</span>
												그리드 템플릿 선택
											</div>
											<div style={{ maxHeight: 180, overflowY: "auto", borderRadius: 8, border: "1px solid var(--border-primary)", padding: 8 }}>
												<GridSelector
													selectedGridId={svgGrid?.id ?? null}
													onSelect={handleSvgGridSelect}
												/>
											</div>
										</div>

										{/* Step 2: 영역 선택 (그리드 선택 후 표시) */}
										{svgGrid && (
											<div>
												<div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
													<span style={{ background: "var(--accent-primary)", color: "#fff", borderRadius: "50%", width: 20, height: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700 }}>2</span>
													SVG를 배치할 영역 선택
												</div>
												<div style={{ borderRadius: 8, border: "1px solid var(--border-primary)", padding: 8 }}>
													<ZoneSelector
														template={svgGrid}
														selectedZoneIds={svgZoneIds}
														onToggleZone={handleSvgZoneToggle}
													/>
												</div>
											</div>
										)}

										{/* 결합 크기 표시 */}
										{svgCombinedBounds && (
											<div style={{
												padding: "0.625rem 1rem",
												background: "rgba(59,130,246,0.08)",
												border: "1px solid rgba(59,130,246,0.3)",
												borderRadius: 8,
												fontSize: "0.8125rem",
												color: "var(--text-primary)",
												display: "flex", alignItems: "center", gap: 8,
											}}>
												✅ 생성 크기: <strong>{svgCombinedBounds.width} × {svgCombinedBounds.height}px</strong>
												<span style={{ color: "var(--text-tertiary)", fontSize: "0.75rem" }}>
													(비율 {(svgCombinedBounds.width / svgCombinedBounds.height).toFixed(2)}:1)
												</span>
											</div>
										)}
									</div>
								)}

								{/* ── 수동 입력 모드 ── */}
								{svgModal.sizeMode === "manual" && (
									<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
										<div>
											<label style={{ display: "block", marginBottom: 4, fontSize: "0.8125rem" }}>너비 (px)</label>
											<input type="number" className="form-input" value={svgModal.width}
												onChange={(e) => setSvgModal({ ...svgModal, width: Number(e.target.value) })}
												style={{ width: "100%" }} />
										</div>
										<div>
											<label style={{ display: "block", marginBottom: 4, fontSize: "0.8125rem" }}>높이 (px)</label>
											<input type="number" className="form-input" value={svgModal.height}
												onChange={(e) => setSvgModal({ ...svgModal, height: Number(e.target.value) })}
												style={{ width: "100%" }} />
										</div>
									</div>
								)}
							</div>

							{/* 스타일 프리셋 (공통) */}
							<div>
								<label style={{ display: "block", marginBottom: 4, fontSize: "0.8125rem" }}>스타일</label>
								<select className="form-input" value={svgModal.style}
									onChange={(e) => setSvgModal({ ...svgModal, style: e.target.value as SvgStylePreset })}
									style={{ width: "100%" }}>
									<option value="">자유 스타일</option>
									{SVG_STYLE_PRESETS.map((p) => (
										<option key={p.id} value={p.id}>{p.label}</option>
									))}
								</select>
							</div>

							{/* 프리뷰 */}
							{svgModal.previewUrl && (
								<div style={{ border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 12, background: "var(--app-bg-muted)" }}>
									<div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
										<Code size={12} /> SVG 프리뷰
									</div>
									<div style={{ display: "flex", justifyContent: "center", background: "#1a1a2e", borderRadius: 6, padding: 16 }}>
										<img src={svgModal.previewUrl} alt="SVG Preview"
											style={{ maxWidth: "100%", maxHeight: 240, objectFit: "contain" }} />
									</div>
								</div>
							)}

							{/* SVG 코드 편집 */}
							{svgModal.svgCode && (
								<details>
									<summary style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", cursor: "pointer" }}>
										SVG 코드 보기/편집
									</summary>
									<textarea
										className="form-input"
										rows={6}
										value={svgModal.svgCode}
										onChange={(e) => {
											const code = e.target.value
											const blob = new Blob([code], { type: "image/svg+xml" });
											const url = URL.createObjectURL(blob);
											setSvgModal({ ...svgModal, svgCode: code, previewUrl: url });
										}}
										style={{ width: "100%", fontFamily: "monospace", fontSize: "0.75rem" }}
									/>
								</details>
							)}

							{/* 이름 (저장 시) */}
							{svgModal.svgCode && (
								<div>
									<label style={{ display: "block", marginBottom: 4, fontSize: "0.8125rem", fontWeight: 500 }}>저장 이름</label>
									<input type="text" className="form-input" placeholder="예: 뉴스9 하단바"
										value={svgModal.name}
										onChange={(e) => setSvgModal({ ...svgModal, name: e.target.value })}
										style={{ width: "100%" }} />
								</div>
							)}

							{/* 에러 표시 */}
							{svgModal.error && (
								<div style={{ padding: 10, background: "rgba(239,68,68,0.1)", border: "1px solid #ef4444", borderRadius: 6, fontSize: "0.8125rem", color: "#ef4444" }}>
									❌ {svgModal.error}
								</div>
							)}
						</div>

						{/* 모달 푸터 */}
						<div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "1rem", borderTop: "1px solid var(--border-primary)" }}>
							<Button variant="secondary" onClick={() => setSvgModal({ ...svgModal, isOpen: false })}>취소</Button>

							{/* 생성 / 재생성 */}
							<Button
								onClick={handleSvgGenerate}
								disabled={
									svgModal.generating ||
									!svgModal.prompt.trim() ||
									(svgModal.sizeMode === "grid" && !svgCombinedBounds)
								}
								variant="secondary"
							>
								{svgModal.generating ? (
									<><Loader2 size={16} className="animate-spin" /> 생성 중...</>
								) : svgModal.svgCode ? (
									<><Sparkles size={16} /> 재생성</>
								) : (
									<><Sparkles size={16} /> 생성</>
								)}
							</Button>

							{/* 저장 (프리뷰 있을 때만) */}
							{svgModal.svgCode && (
								<Button
									onClick={handleSvgSave}
									disabled={svgModal.saving || !svgModal.name.trim()}
								>
									{svgModal.saving ? (
										<><Loader2 size={16} className="animate-spin" /> 저장 중...</>
									) : (
										<><Upload size={16} /> 갤러리에 저장</>
									)}
								</Button>
							)}
						</div>
					</div>
				</div>
			)}
        </>
    )
}

// ─── EditImageModal (기존 편집 모달 분리) ──────────────────────────

function EditImageModal({ editingImage: _editingImage, editForm, setEditForm, closeEditModal, handleEditSave, uploading, categories }: {
	editingImage: ImageItem;
	editForm: { name: string; description: string; category: string; is_public: boolean };
	setEditForm: React.Dispatch<React.SetStateAction<{ name: string; description: string; category: string; is_public: boolean }>>;
	closeEditModal: () => void;
	handleEditSave: () => void;
	uploading: boolean;
	categories: string[];
}) {
	return (
		<div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
			onClick={closeEditModal}>
			<div className="card" style={{ width: 400, maxWidth: "90vw", maxHeight: "80vh", display: "flex", flexDirection: "column" }}
				onClick={(e) => e.stopPropagation()}>
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem", borderBottom: "1px solid var(--border-primary)" }}>
					<h3 style={{ margin: 0, fontSize: "1rem" }}>
						<Edit2 size={18} style={{ marginRight: 8, verticalAlign: "middle" }} />
						이미지 편집
					</h3>
					<button type="button" onClick={closeEditModal} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)" }}>
						<X size={20} />
					</button>
				</div>
				<div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
					<div>
						<label style={{ display: "block", marginBottom: 4, fontSize: "0.8125rem", color: "var(--text-secondary)" }}>이름 *</label>
						<input type="text" className="form-input" value={editForm.name}
							onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="이미지 이름" />
					</div>
					<div>
						<label style={{ display: "block", marginBottom: 4, fontSize: "0.8125rem", color: "var(--text-secondary)" }}>설명</label>
						<textarea className="form-input" value={editForm.description}
							onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="이미지 설명" rows={2} />
					</div>
					<div>
						<label style={{ display: "block", marginBottom: 4, fontSize: "0.8125rem", color: "var(--text-secondary)" }}>카테고리</label>
						<select className="form-input" value={editForm.category}
							onChange={(e) => setEditForm((prev) => ({ ...prev, category: e.target.value }))}>
							{categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
						</select>
					</div>
					<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<input type="checkbox" id="is_public" checked={editForm.is_public}
							onChange={(e) => setEditForm((prev) => ({ ...prev, is_public: e.target.checked }))} />
						<label htmlFor="is_public" style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>다른 사용자에게 공개</label>
					</div>
				</div>
				<div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "1rem", borderTop: "1px solid var(--border-primary)" }}>
					<Button variant="secondary" onClick={closeEditModal} disabled={uploading}>취소</Button>
					<Button onClick={handleEditSave} disabled={uploading || !editForm.name.trim()}>
						{uploading ? (<><Loader2 size={16} className="animate-spin" /> 저장 중...</>) : "저장"}
					</Button>
				</div>
			</div>
		</div>
	)
}
