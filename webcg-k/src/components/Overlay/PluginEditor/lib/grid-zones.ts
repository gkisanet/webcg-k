export function getZonesFromTemplate(template: any): any[] {
  const td = template.template_data;
  if (!td) return [];

  if (td.zones && td.zones.length > 0) {
    const canvasW = td.canvas?.width || 1920;
    const canvasH = td.canvas?.height || 1080;
    const validZones = td.zones
      .map((z: any, idx: number) => {
        if (z.bounds && typeof z.bounds.x === "number") {
          return {
            id: z.id,
            name: z.name || `영역 ${idx + 1}`,
            type: z.type || "unknown",
            bounds: z.bounds,
          };
        }
        if (typeof z.x === "number" && typeof z.width === "number") {
          return {
            id: z.id,
            name: z.name || `영역 ${idx + 1}`,
            type: z.type || "unknown",
            bounds: {
              x: Math.round((z.x / 100) * canvasW),
              y: Math.round((z.y / 100) * canvasH),
              width: Math.round((z.width / 100) * canvasW),
              height: Math.round((z.height / 100) * canvasH),
            },
          };
        }
        return null;
      })
      .filter(Boolean);
    if (validZones.length > 0) return validZones;
  }

  if (td.splits && td.splits.length > 0) {
    const simpleZones = calculateSimpleZones(td.splits);
    const canvasW = td.canvas?.width || 1920;
    const canvasH = td.canvas?.height || 1080;
    return simpleZones.map((z) => ({
      id: z.id,
      name: `영역 ${z.id.replace("zone-", "")}`,
      type: "split",
      bounds: {
        x: Math.round((z.x / 100) * canvasW),
        y: Math.round((z.y / 100) * canvasH),
        width: Math.round((z.width / 100) * canvasW),
        height: Math.round((z.height / 100) * canvasH),
      },
    }));
  }

  return [];
}

export function calculateSimpleZones(
  splits: Array<{
    id: string;
    orientation: string;
    position: number;
  }>,
): Array<{ id: string; x: number; y: number; width: number; height: number }> {
  type BspZone = { x: number; y: number; w: number; h: number };
  let zones: BspZone[] = [{ x: 0, y: 0, w: 100, h: 100 }];

  for (const split of splits) {
    const newZones: BspZone[] = [];
    for (const zone of zones) {
      if (split.orientation === "vertical") {
        if (split.position > zone.x && split.position < zone.x + zone.w) {
          const leftW = split.position - zone.x;
          const rightW = zone.w - leftW;
          newZones.push({ x: zone.x, y: zone.y, w: leftW, h: zone.h });
          newZones.push({ x: split.position, y: zone.y, w: rightW, h: zone.h });
        } else {
          newZones.push(zone);
        }
      } else {
        if (split.position > zone.y && split.position < zone.y + zone.h) {
          const topH = split.position - zone.y;
          const bottomH = zone.h - topH;
          newZones.push({ x: zone.x, y: zone.y, w: zone.w, h: topH });
          newZones.push({ x: zone.x, y: split.position, w: zone.w, h: bottomH });
        } else {
          newZones.push(zone);
        }
      }
    }
    zones = newZones;
  }

  return zones.map((z, i) => ({
    id: `zone-${i + 1}`,
    x: z.x,
    y: z.y,
    width: z.w,
    height: z.h,
  }));
}
