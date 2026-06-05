export function rgbaToHex(colorStr: string): string {
    if (!colorStr) return "#000000";
    if (colorStr.startsWith("#") && colorStr.length === 7) return colorStr;
    if (colorStr.startsWith("rgba") || colorStr.startsWith("rgb(")) {
        const parts = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (parts && parts.length >= 4) {
            return "#" + 
                parseInt(parts[1]).toString(16).padStart(2, "0") +
                parseInt(parts[2]).toString(16).padStart(2, "0") +
                parseInt(parts[3]).toString(16).padStart(2, "0");
        }
    }
    if (colorStr.startsWith("#")) return colorStr.substring(0, 7);
    return "#000000";
}
