export function GridZoneOverlay({
  zones,
  selectedZoneIds,
  onSelectZone,
}: {
  zones: any[];
  selectedZoneIds: string[];
  onSelectZone: (ids: string[]) => void;
}) {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "auto", zIndex: 3 }}>
      {zones.filter((z: any) => z.bounds).map((zone: any) => {
        const isSelected = selectedZoneIds.includes(zone.id);
        const b = zone.bounds;
        const left = (b.x / 1920) * 100;
        const top = (b.y / 1080) * 100;
        const width = (b.width / 1920) * 100;
        const height = (b.height / 1080) * 100;

        return (
          <div
            key={zone.id}
            onClick={() => onSelectZone(
              isSelected
                ? selectedZoneIds.filter(id => id !== zone.id)
                : [...selectedZoneIds, zone.id],
            )}
            style={{
              position: "absolute",
              left: `${left}%`, top: `${top}%`,
              width: `${width}%`, height: `${height}%`,
              border: isSelected ? "2px solid #00d4ff" : "1px dashed rgba(0, 212, 255, 0.4)",
              backgroundColor: isSelected ? "rgba(0, 212, 255, 0.15)" : "rgba(0, 212, 255, 0.05)",
              cursor: "pointer", transition: "all 0.15s",
              display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: "2px", boxSizing: "border-box",
            }}
          >
            <span style={{
              fontSize: "9px", fontWeight: 600,
              color: isSelected ? "#fff" : "rgba(0, 212, 255, 0.8)",
              textShadow: "0 1px 2px rgba(0,0,0,0.8)",
              pointerEvents: "none", whiteSpace: "nowrap",
              overflow: "hidden", textOverflow: "ellipsis", padding: "0 4px",
            }}>
              {zone.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
