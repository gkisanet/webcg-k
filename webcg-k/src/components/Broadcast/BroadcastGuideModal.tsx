import React, { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { HelpCircle, Keyboard, CheckSquare, Users } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
	DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface BroadcastGuideModalProps {
	isOpen: boolean;
	onClose: () => void;
}

// ── KBD 스타일 토큰 ───────────────────────────
const kbdBase: React.CSSProperties = {
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace',
	whiteSpace: "nowrap",
	textShadow: "0 1px 1px rgba(0, 0, 0, 0.3)",
	boxShadow: "0 1px 2px rgba(0, 0, 0, 0.2)",
};

const kbdStyle: React.CSSProperties = {
	...kbdBase,
	minWidth: "28px",
	height: "24px",
	padding: "0 6px",
	background: "linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.04) 100%)",
	border: "1px solid rgba(255, 255, 255, 0.12)",
	borderBottomWidth: "2px",
	borderRadius: "6px",
	fontSize: "0.7rem",
	fontWeight: 600,
	color: "#cbd5e1",
};

const kbdAccentStyle: React.CSSProperties = {
	...kbdStyle,
	border: "1px solid rgba(16, 185, 129, 0.4)",
	borderBottomWidth: "2px",
	color: "#a7f3d0",
	boxShadow: "0 1px 2px rgba(16, 185, 129, 0.2)",
};

const kbdMiniStyle: React.CSSProperties = {
	...kbdBase,
	minWidth: "18px",
	height: "18px",
	padding: "0 3px",
	background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
	border: "1px solid rgba(255, 255, 255, 0.08)",
	borderBottomWidth: "2px",
	borderRadius: "4px",
	fontSize: "0.6rem",
	fontWeight: 600,
	color: "#e2e8f0",
	margin: "0 1px",
	verticalAlign: "middle",
};

export function BroadcastGuideModal({ isOpen, onClose }: BroadcastGuideModalProps) {
	const { t } = useTranslation(["broadcast"]);

	return (
		<Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent
				className="border-0 shadow-2xl p-6 overflow-hidden max-h-[90vh] flex flex-col text-slate-100"
				style={{
					width: "94vw",
					maxWidth: "1400px",
					background: "linear-gradient(165deg, #1e1e2e 0%, #16161e 100%)",
					border: "1px solid rgba(255, 255, 255, 0.08)",
					borderRadius: "16px",
					boxShadow: `
						0 24px 48px rgba(0, 0, 0, 0.4),
						0 0 0 1px rgba(255, 255, 255, 0.05),
						inset 0 1px 0 rgba(255, 255, 255, 0.05)
					`,
				}}
			>
				<DialogHeader className="border-b border-white/5 pb-4 mb-2 flex-shrink-0">
					<div className="flex items-center gap-3 text-left">
						<div className="p-2.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-[#a78bfa]">
							<HelpCircle size={20} />
						</div>
						<div>
							<DialogTitle className="text-lg font-semibold tracking-tight text-slate-100">
								{t("broadcast:guide.title")}
							</DialogTitle>
							<DialogDescription className="text-xs text-slate-400 mt-0.5">
								{t("broadcast:guide.intro")}
							</DialogDescription>
						</div>
					</div>
				</DialogHeader>

				{/* ── 본문 ── */}
				<div className="flex-1 overflow-y-auto pr-1 py-2">
					<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">

						{/* 1열: 운영 순서 01~03 */}
						<div className="space-y-0 min-w-0">
							<SectionHeader icon={CheckSquare} label="운영 순서별 체크리스트 (01 ~ 03)" />
							<div className="relative">
								{/* 세로 연결선 */}
								<div
									className="absolute left-[15px] top-8 bottom-8 w-px"
									style={{
										background: "linear-gradient(to bottom, rgba(167,139,250,0.25) 0%, rgba(167,139,250,0.08) 60%, transparent 100%)",
									}}
								/>
								<GuideScenario
									index={1}
									title={t("broadcast:guide.prepTitle")}
									summary={t("broadcast:guide.prepSummary")}
									items={[0, 1, 2].map((i) => t(`broadcast:guide.prepItems.${i}`))}
								/>
								<GuideScenario
									index={2}
									title={t("broadcast:guide.liveTitle")}
									summary={t("broadcast:guide.liveSummary")}
									items={[0, 1, 2].map((i) => t(`broadcast:guide.liveItems.${i}`))}
								/>
								<GuideScenario
									index={3}
									title={t("broadcast:guide.scrubTitle")}
									summary={t("broadcast:guide.scrubSummary")}
									items={[0, 1, 2].map((i) => t(`broadcast:guide.scrubItems.${i}`))}
								/>
							</div>
						</div>

						{/* 2열: 멀티 유저 04 */}
						<div className="space-y-0 min-w-0">
							<SectionHeader icon={Users} label="멀티 유저 작업 (04)" />
							<GuideScenario
								index={4}
								title={t("broadcast:guide.multiTitle")}
								summary={t("broadcast:guide.multiSummary")}
								items={[0, 1, 2].map((i) => t(`broadcast:guide.multiItems.${i}`))}
							/>
						</div>

						{/* 3열: 비상 복구 05 */}
						<div className="space-y-0 min-w-0">
							<SectionHeader icon={HelpCircle} label="비상 복구 가이드 (05)" accentColor="text-red-400" />
							<GuideScenario
								index={5}
								title={t("broadcast:guide.recoverTitle")}
								summary={t("broadcast:guide.recoverSummary")}
								items={[0, 1, 2].map((i) => t(`broadcast:guide.recoverItems.${i}`))}
								highlight
							/>
						</div>

						{/* 단축키: 3열 전체 */}
						<div className="lg:col-span-3 bg-white/[0.01] border border-white/[0.05] rounded-lg p-4">
							<SectionHeader icon={Keyboard} label={t("broadcast:guide.quickTitle")} />
							<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-3">
								<KeyRow label={t("broadcast:guide.keyArrows")} keys={["←", "→"]} />
								<KeyRow label={t("broadcast:guide.keyScrub")} keys={["S"]} />
								<KeyRow label={t("broadcast:guide.keySpace")} keys={["Space"]} accent />
								<KeyRow label={t("broadcast:guide.keyUp")} keys={["↑"]} />
								<KeyRow label={t("broadcast:guide.keyUndo")} keys={["Ctrl+Z/Y"]} />
							</div>
						</div>
					</div>
				</div>

				<DialogFooter className="border-t border-white/5 pt-4 mt-2 flex-shrink-0">
					<DialogClose asChild>
						<Button
							variant="outline"
							size="sm"
							className="bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-slate-300 hover:text-slate-200 transition-all rounded-lg"
						>
							닫기
						</Button>
					</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ═══════════════════════════════════════════════════════
//  내부 헬퍼 컴포넌트
// ═══════════════════════════════════════════════════════

function SectionHeader({
	icon: Icon,
	label,
	accentColor = "text-[#a78bfa]",
}: {
	icon: React.ElementType;
	label: string;
	accentColor?: string;
}) {
	return (
		<div className={`flex items-center gap-2 text-xs font-semibold ${accentColor} border-b border-white/5 pb-2 mb-3`}>
			<Icon size={14} />
			{label}
		</div>
	);
}

function GuideScenario({
	index,
	title,
	summary,
	items,
	highlight = false,
}: {
	index: number;
	title: string;
	summary: string;
	items: string[];
	highlight?: boolean;
}) {
	return (
		<div
			className={`p-3 rounded-r-lg transition-all duration-200 border border-transparent ${
				highlight
					? "border-l-2 border-l-red-500 bg-red-500/5 hover:bg-red-500/10 border-white/[0.03]"
					: "border-l-2 border-l-violet-500/40 hover:border-l-[#a78bfa] bg-white/[0.01] hover:bg-white/[0.03] border-white/[0.03]"
			}`}
		>
			<div className="flex items-start gap-2.5 mb-2">
				<span
					className="inline-flex items-center justify-center w-6 h-6 rounded-md text-xs font-bold font-tabular flex-shrink-0 text-center leading-6"
					style={{
						background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
						border: "1px solid rgba(255, 255, 255, 0.08)",
						color: highlight ? "#ef4444" : "#a78bfa",
					}}
				>
					{String(index).padStart(2, "0")}
				</span>
				<div className="min-w-0">
					<div className="text-slate-200 font-bold text-xs">{title}</div>
					<div className="text-slate-400 text-[10px] leading-snug mt-0.5">{summary}</div>
				</div>
			</div>

			<ol className="list-decimal pl-4 text-slate-300 text-xs space-y-0.5 leading-snug">
				{items.map((item, i) => (
					<li key={`${item}-${i}`} className="pl-0.5">
						<GuideStepText text={item} />
					</li>
				))}
			</ol>
		</div>
	);
}

function GuideStepText({ text }: { text: string }) {
	const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
	return (
		<>
			{parts.map((part, index) => {
				if (part.startsWith("**") && part.endsWith("**")) {
					return (
						<strong key={`${part}-${index}`} className="text-slate-100 font-semibold">
							{part.slice(2, -2)}
						</strong>
					);
				}
				if (part.startsWith("`") && part.endsWith("`")) {
					return (
						<kbd key={`${part}-${index}`} style={kbdMiniStyle}>
							{part.slice(1, -1)}
						</kbd>
					);
				}
				return <Fragment key={`${part}-${index}`}>{part}</Fragment>;
			})}
		</>
	);
}

function KeyRow({
	label,
	keys,
	accent = false,
}: {
	label: string;
	keys: string[];
	accent?: boolean;
}) {
	return (
		<div className="flex items-center justify-between gap-3 border-b border-white/[0.03] pb-2">
			<span className={`text-xs truncate ${accent ? "text-emerald-400 font-semibold" : "text-slate-300 font-medium"}`}>
				{label}
			</span>
			<div className="flex gap-1.5 shrink-0">
				{keys.map((k) => (
					<kbd key={k} style={accent ? kbdAccentStyle : kbdStyle}>
						{k}
					</kbd>
				))}
			</div>
		</div>
	);
}
