import type {
	GraphicMotionDriver,
	GraphicMotionManifest,
} from "./graphicMotionManifest";

export type GraphicMotionDriverAvailability = Partial<
	Record<GraphicMotionDriver, boolean>
>;

export interface GraphicMotionRuntimeCapability {
	motionDrivers?: GraphicMotionDriverAvailability;
}

export interface GraphicMotionCapabilityIssue {
	driver: GraphicMotionDriver;
	severity: "warning";
	message: string;
}

const DEFAULT_DRIVER_AVAILABILITY: Required<GraphicMotionDriverAvailability> = {
	waapi: true,
	gsap: false,
};

function getDriverAvailability(
	capability: GraphicMotionRuntimeCapability,
): Required<GraphicMotionDriverAvailability> {
	return {
		...DEFAULT_DRIVER_AVAILABILITY,
		...(capability.motionDrivers ?? {}),
	};
}

function getRequestedDrivers(
	motion: GraphicMotionManifest | null | undefined,
): Set<GraphicMotionDriver> {
	const drivers = new Set<GraphicMotionDriver>();
	for (const item of motion?.timeline ?? []) {
		if (item.driver) drivers.add(item.driver);
	}
	return drivers;
}

export function getGraphicMotionCapabilityIssues(
	motion: GraphicMotionManifest | null | undefined,
	capability: GraphicMotionRuntimeCapability = {},
): GraphicMotionCapabilityIssue[] {
	const requestedDrivers = getRequestedDrivers(motion);
	if (requestedDrivers.size === 0) return [];

	const availability = getDriverAvailability(capability);
	const issues: GraphicMotionCapabilityIssue[] = [];

	if (requestedDrivers.has("gsap") && !availability.gsap) {
		issues.push({
			driver: "gsap",
			severity: "warning",
			message:
				"GSAP motion driver가 선택됐지만 현재 renderer capability에 GSAP이 없습니다. 런타임은 WAAPI로 fallback합니다.",
		});
	}

	return issues;
}

export function getGraphicMotionCapabilityWarning(
	motion: GraphicMotionManifest | null | undefined,
	capability: GraphicMotionRuntimeCapability = {},
): string | null {
	const issues = getGraphicMotionCapabilityIssues(motion, capability);
	return issues.length > 0
		? issues.map((issue) => issue.message).join(" · ")
		: null;
}
