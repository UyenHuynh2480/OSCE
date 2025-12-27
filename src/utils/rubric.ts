
import { FixedRubricItem } from "@/types/osce";

export function getMaxScoreOfItem(item: FixedRubricItem): number {
  const scores = Object.values(item.levels).map((l) => Number(l.score) || 0);
  return Math.max(...scores);
}

export function getMaxTotalScore(items: FixedRubricItem[]): number {
  return items.reduce((sum, it) => sum + getMaxScoreOfItem(it), 0);
}

export function downloadJSON(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${filename}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function buildRubricFilename(opts: {
  levelName?: string;
  cohortYear?: number;
  roundNo?: number;
  stationName?: string;
  taskName?: string;
}): string {
  const { levelName, cohortYear, roundNo, stationName, taskName } = opts;
  const parts = [
    levelName ?? "Level",
    cohortYear ?? "Year",
    typeof roundNo === "number" ? `Round${roundNo}` : "Round",
    stationName ? `Station-${stationName}` : "Station",
    taskName ?? "Task",
  ];
  return parts.join("_").replace(/[\\/:*?"<>|]/g, "-");
}
