export const OGRAF_LOWER_THIRD_ENTRYPOINT = "webcgk:ograf/lower-third";

const lowerThirdManifest = {
	id: "webcgk.samples.lower-third",
	name: "OGraf Lower Third",
	description: "Built-in OGraf Web Component lower-third sample.",
	main: "lower-third.mjs",
	schema: {
		type: "object",
		required: ["name", "title"],
		properties: {
			name: {
				type: "string",
				title: "Name",
				default: "Kim Minji",
			},
			title: {
				type: "string",
				title: "Title",
				default: "Reporter",
			},
		},
	},
	customActions: [
		{ id: "show", label: "Show" },
		{ id: "hide", label: "Hide" },
	],
	renderRequirements: [
		{
			resolution: { min: { width: 1920, height: 1080 } },
			frameRate: { ideal: 59.94 },
			engine: [{ name: "chromium", minVersion: "120" }],
			accessToPublicInternet: { exact: false },
		},
	],
	thumbnails: [],
	v_webcgk_motion: {
		schemaVersion: "webcgk.motion.v2",
		timeline: [
			{
				target: ".wrap",
				in: "slide-left",
				out: "slide-left",
				at: 0,
				duration: 420,
			},
		],
	},
};

export function createOgrafLowerThirdSourceData() {
	return {
		manifest: lowerThirdManifest,
		entrypoint: OGRAF_LOWER_THIRD_ENTRYPOINT,
		data: {
			name: "Kim Minji",
			title: "Reporter",
		},
	};
}

export function createOgrafLowerThirdLibraryItem() {
	return {
		id: "webcgk-sample-ograf-lower-third",
		name: "OGraf Lower Third",
		source_type: "ograf" as const,
		thumbnail: null,
		data: createOgrafLowerThirdSourceData(),
	};
}
