export interface CornerRadiusInput {
	borderRadius?: number;
	borderRadiusUnit?: "px" | "%";
	borderRadiusTL?: number;
	borderRadiusTR?: number;
	borderRadiusBR?: number;
	borderRadiusBL?: number;
	borderRadiusLinked?: boolean;
}

export interface ResolvedCornerRadius {
	tl: number;
	tr: number;
	br: number;
	bl: number;
	unit: "px" | "%";
	hasAny: boolean;
	allSame: boolean;
}

export function resolveCornerRadius(
	el: CornerRadiusInput,
	size?: { width: number; height: number },
): ResolvedCornerRadius {
	const unit: "px" | "%" = el.borderRadiusUnit === "%" ? "%" : "px";
	const linked = el.borderRadiusLinked !== false;
	const base = el.borderRadius ?? 0;
	let tl = linked ? base : (el.borderRadiusTL ?? base);
	let tr = linked ? base : (el.borderRadiusTR ?? base);
	let br = linked ? base : (el.borderRadiusBR ?? base);
	let bl = linked ? base : (el.borderRadiusBL ?? base);

	let outUnit: "px" | "%" = unit;
	if (size) {
		const halfMin = Math.min(size.width, size.height) / 2;
		const toPx = (v: number) =>
			unit === "%"
				? Math.min(((v / 100) * Math.min(size.width, size.height)) / 2, halfMin)
				: Math.min(v, size.width / 2, size.height / 2);
		tl = Math.max(0, toPx(tl));
		tr = Math.max(0, toPx(tr));
		br = Math.max(0, toPx(br));
		bl = Math.max(0, toPx(bl));
		outUnit = "px";
	}

	const hasAny = tl > 0 || tr > 0 || br > 0 || bl > 0;
	const allSame = tl === tr && tr === br && br === bl;
	return { tl, tr, br, bl, unit: outUnit, hasAny, allSame };
}

export function toCssBorderRadius(r: ResolvedCornerRadius): string | undefined {
	if (!r.hasAny) return undefined;
	const u = r.unit;
	if (r.allSame) return `${r.tl}${u}`;
	return `${r.tl}${u} ${r.tr}${u} ${r.br}${u} ${r.bl}${u}`;
}

export function toRoundedRectPath(
	x: number,
	y: number,
	width: number,
	height: number,
	r: ResolvedCornerRadius,
): string {
	const { tl, tr, br, bl } = r;
	return [
		`M ${x + tl} ${y}`,
		`L ${x + width - tr} ${y}`,
		`Q ${x + width} ${y} ${x + width} ${y + tr}`,
		`L ${x + width} ${y + height - br}`,
		`Q ${x + width} ${y + height} ${x + width - br} ${y + height}`,
		`L ${x + bl} ${y + height}`,
		`Q ${x} ${y + height} ${x} ${y + height - bl}`,
		`L ${x} ${y + tl}`,
		`Q ${x} ${y} ${x + tl} ${y}`,
		"Z",
	].join(" ");
}
