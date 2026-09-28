import { GRAHA_SHORT, RASHIS } from "@/lib/astro-engine";
import type { KundliHouse, KundliHouseOccupant } from "@/lib/kundli-engine";

type Point = [number, number];
const pt = (x: number, y: number): Point => [x, y];

const SIZE = 400;
const TL = pt(0, 0), TR = pt(SIZE, 0), BR = pt(SIZE, SIZE), BL = pt(0, SIZE);
const MT = pt(SIZE / 2, 0), MR = pt(SIZE, SIZE / 2), MB = pt(SIZE / 2, SIZE), ML = pt(0, SIZE / 2);
const C = pt(SIZE / 2, SIZE / 2);
const Q_TR = pt(SIZE * 0.75, SIZE * 0.25), Q_BR = pt(SIZE * 0.75, SIZE * 0.75), Q_BL = pt(SIZE * 0.25, SIZE * 0.75), Q_TL = pt(SIZE * 0.25, SIZE * 0.25);

/** Vertices of each of the 12 house cells in a North Indian diamond chart (house 1 = top-center). */
const HOUSE_POLYGONS: Point[][] = [
  [MT, Q_TR, C, Q_TL], // 1 — Lagna
  [MT, TR, Q_TR], // 2
  [TR, MR, Q_TR], // 3
  [MR, Q_BR, C, Q_TR], // 4
  [MR, BR, Q_BR], // 5
  [BR, MB, Q_BR], // 6
  [MB, Q_BL, C, Q_BR], // 7
  [MB, BL, Q_BL], // 8
  [BL, ML, Q_BL], // 9
  [ML, Q_TL, C, Q_BL], // 10
  [ML, TL, Q_TL], // 11
  [TL, MT, Q_TL], // 12
];

function centroid(points: Point[]) {
  const x = points.reduce((sum, [px]) => sum + px, 0) / points.length;
  const y = points.reduce((sum, [, py]) => sum + py, 0) / points.length;
  return [x, y] as const;
}

/**
 * Planet labels in rows. On one line, three or more planets in a house ran past the edges of the
 * narrow triangle cells on a phone ("Ma Ke", "Ju℞ Ra℞" overlapping the lines), so the corner
 * triangles take two per row and the four larger diamond houses take three.
 */
function occupantRows(occupants: KundliHouseOccupant[], perRow: number) {
  const labels = occupants.map((occupant) => `${GRAHA_SHORT[occupant.graha]}${occupant.isRetrograde ? "℞" : ""}`);
  const rows: string[] = [];
  for (let index = 0; index < labels.length; index += perRow) rows.push(labels.slice(index, index + perRow).join(" "));
  return rows;
}

/** Houses 1, 4, 7 and 10 are the large central diamonds; the rest are corner triangles. */
const DIAMOND_HOUSES = new Set([0, 3, 6, 9]);
const ROW_HEIGHT = 15;

export function KundliChartDiagram({ houses }: { houses: KundliHouse[] }) {
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Your Vedic birth chart, houses and planetary placements" className="kundli-chart-svg">
      {HOUSE_POLYGONS.map((polygon, index) => {
        const house = houses[index];
        const points = polygon.map(([x, y]) => `${x},${y}`).join(" ");
        const [cx, cy] = centroid(polygon);
        const rows = occupantRows(house.occupants, DIAMOND_HOUSES.has(index) ? 3 : 2);
        // The rashi number sits above the planet rows; the whole block stays centred on the cell.
        const blockTop = cy - ((rows.length - 1) * ROW_HEIGHT) / 2;
        const lastRowY = blockTop + 10 + (rows.length - 1) * ROW_HEIGHT;
        return (
          <g key={house.house}>
            <polygon points={points} className={house.house === 1 ? "kundli-chart-house kundli-chart-house--lagna" : "kundli-chart-house"} />
            <text x={cx} y={blockTop - 12} textAnchor="middle" className="kundli-chart-rashi">{house.rashiIndex + 1}</text>
            {rows.length > 0 && (
              <text textAnchor="middle" className="kundli-chart-planets">
                {rows.map((row, rowIndex) => <tspan key={rowIndex} x={cx} y={blockTop + 10 + rowIndex * ROW_HEIGHT}>{row}</tspan>)}
              </text>
            )}
            {house.house === 1 && <text x={cx} y={(rows.length ? lastRowY : cy) + 16} textAnchor="middle" className="kundli-chart-lagna-tag">Lagna</text>}
          </g>
        );
      })}
    </svg>
  );
}

export function rashiName(rashiIndex: number) {
  return RASHIS[rashiIndex].name;
}
