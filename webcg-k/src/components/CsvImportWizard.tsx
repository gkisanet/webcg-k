/**
 * CSV Import Wizard — 3단계 큐시트 임포트 마법사
 *
 * Step 1: CSV 파일 업로드 + 미리보기 테이블
 * Step 2: CSV 컬럼 → WebCG-K 필드 매핑
 * Step 3: 번들 선택 + 변환 미리보기 + 큐시트 생성
 *
 * ■ 비유: 택배 분류 시스템.
 *   Step 1 = "물건(CSV)을 받는다"
 *   Step 2 = "각 상자에 라벨(필드)을 붙인다"
 *   Step 3 = "목적지(큐시트)로 발송한다"
 */

import { useState, useMemo } from "react";
import {
	Upload,
	ArrowRight,
	ArrowLeft,
	Check,
	FileText,
	Loader2,
	X,
	HelpCircle,
	ChevronDown,
	ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseCsvFile } from "@/lib/csvParser";
import type { CsvParseResult } from "@/lib/csvParser";
import { createCuesheet, type NrcsCuesheet } from "@/services/cuesheetService";
import { supabase } from "@/lib/supabase";
import { CG_TYPE_LABELS } from "@/lib/nrcsTypes";
import type { CgTextType } from "@/lib/nrcsTypes";
import type { TemplateBundle } from "@/services/bundleService";

// ─── 타입 ────────────────────────────────────────────────────────

/** WebCG-K 큐시트 아이템의 필드 목록 */
const CUESHEET_FIELDS = [
	{ key: "slug", label: "슬러그 (기사 구분)", required: true },
	{ key: "title", label: "제목", required: true },
	{ key: "reporter", label: "기자", required: false },
	{ key: "article_type", label: "기사 유형", required: false },
	{ key: "cg_type", label: "CG 타입 (super, band...)", required: false },
] as const;

/** CG 텍스트 필드 후보 (cg_type 지정 시 자동 매핑) */
const CG_TEXT_FIELDS = ["name", "title", "text", "subtitle", "source", "location", "role", "body"];

/** 컬럼 매핑 */
interface ColumnMapping {
	[csvColumn: string]: string; // CSV 컬럼 → WebCG-K 필드 key 또는 "cg.name" 형식
}

// ─── 컴포넌트 ────────────────────────────────────────────────────

export function CsvImportWizard({
	bundles,
	onComplete,
	onCancel,
}: {
	bundles: TemplateBundle[];
	onComplete: (cuesheet: NrcsCuesheet) => void;
	onCancel: () => void;
}) {
	const [step, setStep] = useState<1 | 2 | 3>(1);
	const [csvResult, setCsvResult] = useState<CsvParseResult | null>(null);
	const [fileName, setFileName] = useState("");
	const [mapping, setMapping] = useState<ColumnMapping>({});
	const [selectedBundleId, setSelectedBundleId] = useState("");
	const [programName, setProgramName] = useState("");
	const [programDate, setProgramDate] = useState(new Date().toISOString().split("T")[0]);
	const [creating, setCreating] = useState(false);
	const [error, setError] = useState("");
	const [showHelp, setShowHelp] = useState(false);

	// ─── Step 1: 파일 업로드 ──────────────────────────────────────

	const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		setError("");
		try {
			const result = await parseCsvFile(file, { maxRows: 200 });
			if (result.headers.length === 0 || result.rows.length === 0) {
				setError("CSV 파일이 비어있거나 형식이 올바르지 않습니다.");
				return;
			}
			setCsvResult(result);
			setFileName(file.name);
			// 자동 매핑 추측
			const autoMapping: ColumnMapping = {};
			for (const header of result.headers) {
				const lower = header.toLowerCase().trim();
				if (lower.includes("slug") || lower === "구분" || lower === "기사") autoMapping[header] = "slug";
				else if (lower.includes("title") || lower === "제목") autoMapping[header] = "title";
				else if (lower.includes("reporter") || lower === "기자") autoMapping[header] = "reporter";
				else if (lower.includes("type") || lower === "유형" || lower === "cg") autoMapping[header] = "cg_type";
				// CG 텍스트 필드 자동 매핑
				else if (lower === "name" || lower === "이름") autoMapping[header] = "cg.name";
				else if (lower === "text" || lower === "텍스트" || lower === "내용") autoMapping[header] = "cg.text";
				else if (lower === "subtitle" || lower === "부제") autoMapping[header] = "cg.subtitle";
				else if (lower === "source" || lower === "출처") autoMapping[header] = "cg.source";
			}
			setMapping(autoMapping);
		} catch (err) {
			setError(`CSV 파싱 실패: ${(err as Error).message}`);
		}
	};

	// ─── Step 3: 변환 미리보기 ────────────────────────────────────

	const previewItems = useMemo(() => {
		if (!csvResult) return [];
		return csvResult.rows.map((row, i) => {
			const obj: Record<string, string> = {};
			csvResult.headers.forEach((h, idx) => {
				obj[h] = row[idx]?.trim() ?? "";
			});

			// 매핑 적용
			const slug = findMappedValue(obj, mapping, "slug") || `item-${i + 1}`;
			const title = findMappedValue(obj, mapping, "title") || slug;
			const reporter = findMappedValue(obj, mapping, "reporter") || "";
			const cgType = findMappedValue(obj, mapping, "cg_type") || "super";
			const articleType = findMappedValue(obj, mapping, "article_type") || "";

			// CG 텍스트 필드 수집
			const cgFields: Record<string, string> = {};
			for (const [csvCol, targetField] of Object.entries(mapping)) {
				if (targetField.startsWith("cg.")) {
					const fieldKey = targetField.slice(3);
					const value = obj[csvCol];
					if (value) cgFields[fieldKey] = value;
				}
			}

			return {
				slug,
				title,
				reporter,
				article_type: articleType,
				cg_type: cgType as CgTextType,
				cg_fields: cgFields,
			};
		});
	}, [csvResult, mapping]);

	// ─── Step 3: 큐시트 생성 ──────────────────────────────────────

	const handleCreate = async () => {
		if (!programName.trim()) {
			setError("프로그램명을 입력하세요.");
			return;
		}
		setCreating(true);
		setError("");
		try {
			// 1. 큐시트 생성
			const cuesheet = await createCuesheet({
				program_name: programName.trim(),
				program_date: programDate,
				bundle_id: selectedBundleId || undefined,
			});

			// 2. 아이템 일괄 삽입
			const itemInserts = previewItems.map((item, index) => ({
				cuesheet_id: cuesheet.id,
				nrcs_item_id: `csv-${index}`,
				slug: item.slug,
				title: item.title,
				reporter: item.reporter || null,
				article_type: item.article_type || null,
				item_order: index,
				cg_data: Object.keys(item.cg_fields).length > 0
					? [{ id: `cg-${index}`, type: item.cg_type, order: 0, fields: item.cg_fields }]
					: [],
				mapping_result: {},
				status: "pending",
			}));

			if (itemInserts.length > 0) {
				const { error: insertErr } = await supabase
					.from("nrcs_cuesheet_items")
					.insert(itemInserts as any);
				if (insertErr) throw insertErr;

				// total_items 업데이트
				await supabase
					.from("nrcs_cuesheets")
					.update({ total_items: itemInserts.length, updated_at: new Date().toISOString() } as any)
					.eq("id", cuesheet.id);
			}

			onComplete({ ...cuesheet, total_items: itemInserts.length });
		} catch (err) {
			setError(`생성 실패: ${(err as Error).message}`);
			setCreating(false);
		}
	};

	// ─── 렌더링 ───────────────────────────────────────────────────

	return (
		<div
			style={{
				position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
				display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
			}}
			onClick={onCancel}
		>
			<div
				style={{
					background: "var(--app-bg-alt)", borderRadius: 14, padding: 0,
					width: 720, maxHeight: "85vh", overflow: "hidden",
					border: "1px solid rgba(255,255,255,0.1)",
					boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
					display: "flex", flexDirection: "column",
				}}
				onClick={(e) => e.stopPropagation()}
			>
				{/* 헤더 */}
				<div style={{
					padding: "14px 20px", borderBottom: "1px solid var(--border-primary)",
					display: "flex", justifyContent: "space-between", alignItems: "center",
				}}>
					<div>
						<h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
							📄 CSV 임포트 위자드
						</h3>
						<div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
							Step {step}/3 — {step === 1 ? "파일 업로드" : step === 2 ? "컬럼 매핑" : "생성 확인"}
						</div>
					</div>
					<button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)" }}>
						<X size={18} />
					</button>
				</div>

				{/* 스텝 인디케이터 */}
				<div style={{ display: "flex", padding: "10px 20px", gap: 4, borderBottom: "1px solid var(--border-primary)" }}>
					{[1, 2, 3].map((s) => (
						<div key={s} style={{
							flex: 1, height: 3, borderRadius: 2,
							background: s <= step ? "var(--accent-primary)" : "var(--border-primary)",
							transition: "background 0.2s",
						}} />
					))}
				</div>

				{/* 본문 */}
				<div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
					{/* ─── Step 1: 파일 업로드 ─── */}
					{step === 1 && (
						<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
							{!csvResult ? (
								<label style={{
									display: "flex", flexDirection: "column", alignItems: "center",
									gap: 12, padding: 40, border: "2px dashed var(--border-primary)",
									borderRadius: 10, cursor: "pointer", transition: "border-color 0.2s",
								}}>
									<Upload size={32} style={{ color: "var(--text-tertiary)" }} />
									<span style={{ fontSize: 13, color: "var(--text-secondary)" }}>클릭하여 CSV 파일 선택</span>
									<span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>UTF-8 인코딩 권장 · 콤마/세미콜론/탭 자동 탐지</span>
									<input type="file" accept=".csv,.tsv,.txt" onChange={handleFileUpload} style={{ display: "none" }} />
								</label>
							) : (
								<div>
									<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
										<FileText size={14} style={{ color: "#60a5fa" }} />
										<span style={{ fontWeight: 600, fontSize: 13 }}>{fileName}</span>
										<span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
											{csvResult.totalRows}행 · {csvResult.headers.length}열 · 구분자: {csvResult.delimiter === "," ? "콤마" : csvResult.delimiter === "\t" ? "탭" : "세미콜론"}
										</span>
										<button
											onClick={() => { setCsvResult(null); setFileName(""); setMapping({}); }}
											style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", fontSize: 11 }}
										>다시 선택</button>
									</div>
									{/* 미리보기 테이블 (최대 5행) */}
									<div style={{ overflowX: "auto", border: "1px solid var(--border-primary)", borderRadius: 8 }}>
										<table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
											<thead>
												<tr>
													{csvResult.headers.map((h, i) => (
														<th key={i} style={{ padding: "6px 8px", textAlign: "left", background: "var(--app-bg-muted)", borderBottom: "1px solid var(--border-primary)", fontWeight: 600, whiteSpace: "nowrap" }}>
															{h}
														</th>
													))}
												</tr>
											</thead>
											<tbody>
												{csvResult.rows.slice(0, 5).map((row, ri) => (
													<tr key={ri}>
														{row.map((cell, ci) => (
															<td key={ci} style={{ padding: "4px 8px", borderBottom: "1px solid var(--border-primary)", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
																{cell}
															</td>
														))}
													</tr>
												))}
											</tbody>
										</table>
									</div>
									{csvResult.totalRows > 5 && (
										<div style={{ fontSize: 10, color: "var(--text-tertiary)", textAlign: "center", marginTop: 4 }}>
											... 외 {csvResult.totalRows - 5}행
										</div>
									)}
								</div>
							)}

							{/* 🆕 도움말 토글 */}
							<button
								onClick={() => setShowHelp(!showHelp)}
								style={{
									display: "flex", alignItems: "center", gap: 6,
									background: "none", border: "1px solid var(--border-primary)",
									borderRadius: 6, padding: "6px 12px", cursor: "pointer",
									color: "var(--text-secondary)", fontSize: 12,
									width: "100%", justifyContent: "center",
								}}
							>
								<HelpCircle size={14} />
								CSV 파일 작성 가이드
								{showHelp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
							</button>

							{showHelp && (
								<div style={{
									background: "var(--app-bg-muted)", border: "1px solid var(--border-primary)",
									borderRadius: 8, padding: 16, fontSize: 12, lineHeight: 1.7,
									color: "var(--text-secondary)",
								}}>
									<h4 style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)", margin: "0 0 10px" }}>
										📖 CSV 파일 구조 가이드
									</h4>

									<p style={{ fontWeight: 600, marginBottom: 4 }}>1. 기본 구조</p>
									<ul style={{ margin: "0 0 10px", paddingLeft: 18 }}>
										<li><strong>첫 번째 행</strong>: 헤더 (컨럼 이름)</li>
										<li><strong>2번째 행부터</strong>: 데이터 (각 행 = 큐시트 아이템 1건)</li>
										<li><strong>인코딩</strong>: UTF-8 권장 (엑셀에서 내보낼 때 “CSV UTF-8” 선택)</li>
										<li><strong>구분자</strong>: 콤마(,) / 세미콜론(;) / 탭(\t) 자동 탐지</li>
									</ul>

									<p style={{ fontWeight: 600, marginBottom: 4 }}>2. 권장 컨럼 이름</p>
									<div style={{ overflowX: "auto", marginBottom: 10 }}>
										<table style={{ fontSize: 11, borderCollapse: "collapse", width: "100%" }}>
											<thead>
												<tr style={{ background: "var(--app-bg-secondary)" }}>
													<th style={{ padding: "4px 8px", textAlign: "left", borderBottom: "1px solid var(--border-primary)" }}>컨럼 이름</th>
													<th style={{ padding: "4px 8px", textAlign: "left", borderBottom: "1px solid var(--border-primary)" }}>자동 매핑 대상</th>
													<th style={{ padding: "4px 8px", textAlign: "left", borderBottom: "1px solid var(--border-primary)" }}>설명</th>
												</tr>
											</thead>
											<tbody>
												{[
													['"제목" 또는 "title"', '제목 *', '아이템 제목 (필수)'],
													['"구분" / "기사" / "slug"', '슬러그 *', '기사 구분자 (필수)'],
													['"기자" 또는 "reporter"', '기자', '취재 기자명'],
													['"유형" / "type" / "cg"', 'CG 타입', 'super, band, lowthird 등'],
													['"이름" 또는 "name"', 'CG: name', 'CG 텍스트 — 인물명'],
													['"텍스트" / "내용" / "text"', 'CG: text', 'CG 텍스트 — 본문'],
													['"부제" / "subtitle"', 'CG: subtitle', 'CG 텍스트 — 부제목'],
													['"출처" / "source"', 'CG: source', 'CG 텍스트 — 출처 표시'],
												].map(([col, target, desc], i) => (
													<tr key={i}>
														<td style={{ padding: "3px 8px", borderBottom: "1px solid var(--border-primary)", fontFamily: "monospace" }}>{col}</td>
														<td style={{ padding: "3px 8px", borderBottom: "1px solid var(--border-primary)", color: "#60a5fa" }}>{target}</td>
														<td style={{ padding: "3px 8px", borderBottom: "1px solid var(--border-primary)" }}>{desc}</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>

									<p style={{ fontWeight: 600, marginBottom: 4 }}>3. 예시 CSV</p>
									<pre style={{
										background: "var(--app-bg-secondary)", padding: 10, borderRadius: 6,
										fontSize: 10, fontFamily: "monospace", overflow: "auto",
										border: "1px solid var(--border-primary)", margin: "0 0 10px",
										whiteSpace: "pre", lineHeight: 1.5,
									}}>{`제목,구분,기자,유형,이름,텍스트
속보: 폭설 주의보,속보-001,김철수,super,김철수,기상캠스터
날씨 안내,날씨-001,박영희,band,,서울 전역 대설특보
국회 본회의,국회-001,이지은,lowthird,이지은,국회 기자`}</pre>

									<p style={{ fontWeight: 600, marginBottom: 4 }}>4. CG 타입 코드</p>
									<div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
										{["super", "band", "lowthird", "headline", "subheadline", "source", "crawl", "locator", "fullcg", "credit", "soundbite", "reporter", "flash"].map((t) => (
											<span key={t} style={{
												padding: "2px 6px", borderRadius: 3, fontSize: 10,
												background: "var(--app-bg-secondary)", border: "1px solid var(--border-primary)",
												fontFamily: "monospace",
											}}>{t}</span>
										))}
									</div>

									<p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: 0 }}>
										💡 팀: 컨럼 이름이 위 표와 다르더라도 Step 2에서 수동 매핑할 수 있습니다.
									</p>
								</div>
							)}
						</div>
					)}

					{/* ─── Step 2: 컬럼 매핑 ─── */}
					{step === 2 && csvResult && (
						<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
							<p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
								CSV의 각 컬럼을 WebCG-K 필드에 매핑하세요. 자동 추측된 매핑을 확인하고 수정할 수 있습니다.
							</p>
							{csvResult.headers.map((header) => (
								<div key={header} style={{ display: "flex", alignItems: "center", gap: 10 }}>
									<span style={{
										flex: "0 0 140px", fontSize: 12, fontWeight: 600,
										padding: "4px 8px", background: "var(--app-bg-muted)",
										borderRadius: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
									}}>
										{header}
									</span>
									<span style={{ color: "var(--text-tertiary)" }}>→</span>
									<select
										value={mapping[header] || ""}
										onChange={(e) => setMapping({ ...mapping, [header]: e.target.value })}
										style={{
											flex: 1, background: "var(--app-bg-muted)", border: "1px solid var(--border-primary)",
											borderRadius: 6, padding: "5px 8px", fontSize: 12,
										}}
									>
										<option value="">무시</option>
										<optgroup label="큐시트 필드">
											{CUESHEET_FIELDS.map((f) => (
												<option key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}</option>
											))}
										</optgroup>
										<optgroup label="CG 텍스트 필드">
											{CG_TEXT_FIELDS.map((f) => (
												<option key={f} value={`cg.${f}`}>CG: {f}</option>
											))}
										</optgroup>
									</select>
								</div>
							))}
						</div>
					)}

					{/* ─── Step 3: 생성 확인 ─── */}
					{step === 3 && (
						<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
							{/* 메타 입력 */}
							<div style={{ display: "flex", gap: 10 }}>
								<div style={{ flex: 1 }}>
									<label style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>프로그램명 *</label>
									<input
										value={programName}
										onChange={(e) => setProgramName(e.target.value)}
										placeholder="예: KBS 뉴스 9"
										style={{ width: "100%", background: "var(--app-bg-muted)", border: "1px solid var(--border-primary)", borderRadius: 6, padding: "6px 8px", fontSize: 12 }}
									/>
								</div>
								<div style={{ flex: "0 0 130px" }}>
									<label style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>방송일</label>
									<input
										type="date"
										value={programDate}
										onChange={(e) => setProgramDate(e.target.value)}
										style={{ width: "100%", background: "var(--app-bg-muted)", border: "1px solid var(--border-primary)", borderRadius: 6, padding: "6px 8px", fontSize: 12 }}
									/>
								</div>
							</div>

							{/* 번들 선택 */}
							<div>
								<label style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>매핑 번들 (선택)</label>
								<select
									value={selectedBundleId}
									onChange={(e) => setSelectedBundleId(e.target.value)}
									style={{ width: "100%", background: "var(--app-bg-muted)", border: "1px solid var(--border-primary)", borderRadius: 6, padding: "6px 8px", fontSize: 12 }}
								>
									<option value="">번들 없이 생성</option>
									{bundles.map((b) => (
										<option key={b.id} value={b.id}>
											{b.name}{b.program_name ? ` (${b.program_name})` : ""}
										</option>
									))}
								</select>
							</div>

							{/* 변환 미리보기 */}
							<div style={{ border: "1px solid var(--border-primary)", borderRadius: 8, overflow: "hidden" }}>
								<div style={{ padding: "6px 10px", background: "var(--app-bg-muted)", fontSize: 11, fontWeight: 600, borderBottom: "1px solid var(--border-primary)" }}>
									변환 미리보기 ({previewItems.length}건)
								</div>
								<div style={{ maxHeight: 200, overflowY: "auto" }}>
									{previewItems.slice(0, 10).map((item, i) => (
										<div key={i} style={{
											padding: "6px 10px", borderBottom: "1px solid var(--border-primary)",
											display: "flex", alignItems: "center", gap: 6, fontSize: 11,
										}}>
											<span style={{ fontWeight: 600, color: "var(--text-primary)" }}>#{i + 1}</span>
											<span style={{
												padding: "0 5px", borderRadius: 3, fontSize: 9, fontWeight: 600,
												background: "rgba(59, 130, 246, 0.1)", color: "#3b82f6",
											}}>
												{CG_TYPE_LABELS[item.cg_type as keyof typeof CG_TYPE_LABELS] || item.cg_type}
											</span>
											<span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
												{item.title}
											</span>
											{item.reporter && (
												<span style={{ color: "var(--text-tertiary)", fontSize: 10 }}>{item.reporter}</span>
											)}
											{Object.keys(item.cg_fields).length > 0 && (
												<span style={{ color: "#10b981", fontSize: 10 }}>
													{Object.keys(item.cg_fields).length}필드
												</span>
											)}
										</div>
									))}
								</div>
							</div>
						</div>
					)}
				</div>

				{/* 에러 */}
				{error && (
					<div style={{ padding: "8px 20px", background: "rgba(239,68,68,0.08)", color: "#ef4444", fontSize: 12 }}>
						⚠️ {error}
					</div>
				)}

				{/* 하단 버튼 */}
				<div style={{
					padding: "12px 20px", borderTop: "1px solid var(--border-primary)",
					display: "flex", justifyContent: "space-between",
				}}>
					<Button variant="ghost" onClick={step === 1 ? onCancel : () => setStep((step - 1) as 1 | 2)}>
						{step === 1 ? "취소" : <><ArrowLeft size={14} /> 이전</>}
					</Button>

					{step < 3 ? (
						<Button
							onClick={() => setStep((step + 1) as 2 | 3)}
							disabled={step === 1 && !csvResult}
						>
							다음 <ArrowRight size={14} />
						</Button>
					) : (
						<Button onClick={handleCreate} disabled={creating || !programName.trim()}>
							{creating ? <><Loader2 size={14} className="animate-spin" /> 생성 중...</> : <><Check size={14} /> 큐시트 생성</>}
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}

// ─── 유틸리티 ────────────────────────────────────────────────────

/** 매핑에서 특정 필드에 해당하는 CSV 값을 찾는다 */
function findMappedValue(
	obj: Record<string, string>,
	mapping: ColumnMapping,
	targetField: string,
): string {
	for (const [csvCol, mappedField] of Object.entries(mapping)) {
		if (mappedField === targetField && obj[csvCol]) {
			return obj[csvCol];
		}
	}
	return "";
}
