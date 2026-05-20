import React from "react";
import { Lock, Users, Globe, LucideIcon } from "lucide-react";

export type VisibilityState = "private" | "workspace" | "public";

export interface VisibilityToggleProps {
	visibility: string | null;
	onToggle: (nextVisibility: VisibilityState) => void;
	size?: number;
	className?: string;
}

export function VisibilityToggle({ visibility, onToggle, size = 14, className = "" }: VisibilityToggleProps) {
	const currentVis = (visibility as VisibilityState) || "workspace";

	const getProps = (vis: VisibilityState): { icon: LucideIcon; tooltip: string; color: string } => {
		switch (vis) {
			case "private":
				return { icon: Lock, tooltip: "비공개 (나만 편집 가능)", color: "var(--text-muted)" };
			case "public":
				return { icon: Globe, tooltip: "전체 공개 (다른 워크스페이스에서 복제 가능)", color: "#10b981" };
			case "workspace":
			default:
				return { icon: Users, tooltip: "팀 공유 (현재 워크스페이스 멤버와 공유)", color: "var(--text-primary)" };
		}
	};

	const handleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		const nextMap: Record<VisibilityState, VisibilityState> = {
			private: "workspace",
			workspace: "public",
			public: "private",
		};
		onToggle(nextMap[currentVis] || "workspace");
	};

	const props = getProps(currentVis);
	const Icon = props.icon;

	return (
		<button
			type="button"
			onClick={handleClick}
			className={`visibility-toggle ${className}`}
			style={{
				background: "none",
				border: "none",
				cursor: "pointer",
				padding: "4px",
				color: props.color,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
			}}
			title={props.tooltip}
		>
			<Icon size={size} />
		</button>
	);
}
