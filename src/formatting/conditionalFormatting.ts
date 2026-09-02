import { CellValue, ColumnModel, ConditionalRule, RowModel } from "../data/types";

export interface DataBar {
    /** Left edge of the bar, as a percentage of the cell width. */
    left: number;
    /** Bar width, as a percentage of the cell width. */
    width: number;
    color: string;
    showValue: boolean;
}

export interface CellFormat {
    background?: string;
    color?: string;
    dataBar?: DataBar;
}

export interface ColumnStats {
    min: number;
    max: number;
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

function parseColor(color: string): [number, number, number] {
    const match = HEX.exec(color.trim());
    if (!match) {
        return [0, 0, 0];
    }
    let hex = match[1];
    if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16)
    ];
}

function toHex(rgb: [number, number, number]): string {
    return (
        "#" +
        rgb
            .map((channel) => Math.max(0, Math.min(255, Math.round(channel)))
                .toString(16)
                .padStart(2, "0"))
            .join("")
    );
}

/** Linear interpolation in sRGB, matching how Power BI blends scale stops. */
export function mixColors(from: string, to: string, ratio: number): string {
    const a = parseColor(from);
    const b = parseColor(to);
    const t = Math.max(0, Math.min(1, ratio));
    return toHex([
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t
    ]);
}

/**
 * Min/max over the rows currently on screen. Recomputing against the filtered
 * set is deliberate: like Excel, bars and colour scales rescale to what the
 * user can actually see.
 */
export function computeStats(rows: RowModel[], column: ColumnModel): ColumnStats | null {
    if (column.kind !== "number") {
        return null;
    }
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let found = false;
    for (const row of rows) {
        const value = row.values[column.index];
        if (typeof value === "number" && isFinite(value)) {
            found = true;
            if (value < min) {
                min = value;
            }
            if (value > max) {
                max = value;
            }
        }
    }
    return found ? { min, max } : null;
}

function ruleMatches(rule: ConditionalRule, raw: CellValue, display: string): boolean {
    const blank = raw === null || raw === undefined || raw === "";
    if (rule.op === "isBlank") {
        return blank;
    }
    if (blank) {
        return false;
    }
    const numeric = typeof raw === "number" ? raw : Number(rule.value);
    const target = Number(rule.value);
    const isNumericComparison = typeof raw === "number" && !isNaN(target);

    switch (rule.op) {
        case "eq":
            return isNumericComparison
                ? numeric === target
                : display.toLowerCase() === rule.value.toLowerCase();
        case "ne":
            return isNumericComparison
                ? numeric !== target
                : display.toLowerCase() !== rule.value.toLowerCase();
        case "gt":
            return isNumericComparison ? numeric > target : display > rule.value;
        case "gte":
            return isNumericComparison ? numeric >= target : display >= rule.value;
        case "lt":
            return isNumericComparison ? numeric < target : display < rule.value;
        case "lte":
            return isNumericComparison ? numeric <= target : display <= rule.value;
        case "contains":
            return display.toLowerCase().indexOf(rule.value.toLowerCase()) >= 0;
        case "startsWith":
            return display.toLowerCase().startsWith(rule.value.toLowerCase());
        default:
            return false;
    }
}

/**
 * Positions a data bar within its cell. With only positive values the bar grows
 * from the left edge; once negatives are present a shared zero axis is placed
 * proportionally and bars grow outwards from it, as Excel does.
 */
function buildDataBar(
    value: number,
    stats: ColumnStats,
    positiveColor: string,
    negativeColor: string,
    showValue: boolean
): DataBar | undefined {
    const min = Math.min(stats.min, 0);
    const max = Math.max(stats.max, 0);
    const span = max - min;
    if (span <= 0) {
        return undefined;
    }
    const axis = (-min / span) * 100;
    if (value >= 0) {
        return {
            left: axis,
            width: (value / span) * 100,
            color: positiveColor,
            showValue
        };
    }
    const width = (-value / span) * 100;
    return {
        left: axis - width,
        width,
        color: negativeColor,
        showValue
    };
}

/**
 * Resolves the conditional formatting for one cell. Returns undefined when the
 * column has no conditional formatting or the value does not qualify, letting
 * callers fall back to the column's plain styling.
 */
export function evaluateCell(
    raw: CellValue,
    display: string,
    column: ColumnModel,
    stats: ColumnStats | null
): CellFormat | undefined {
    const cf = column.cf;
    if (cf.mode === "none") {
        return undefined;
    }

    if (cf.mode === "rules") {
        for (const rule of cf.rules) {
            if (rule.op !== "none" && ruleMatches(rule, raw, display)) {
                return cf.target === "font" ? { color: rule.color } : { background: rule.color };
            }
        }
        return undefined;
    }

    if (typeof raw !== "number" || !isFinite(raw) || !stats) {
        return undefined;
    }

    if (cf.mode === "dataBar") {
        const bar = buildDataBar(
            raw,
            stats,
            cf.dataBarColor,
            cf.dataBarNegativeColor,
            cf.dataBarShowValue
        );
        return bar ? { dataBar: bar } : undefined;
    }

    // Colour scale.
    const span = stats.max - stats.min;
    const ratio = span === 0 ? 0.5 : (raw - stats.min) / span;
    let color: string;
    if (cf.useMid) {
        color =
            ratio <= 0.5
                ? mixColors(cf.minColor, cf.midColor, ratio * 2)
                : mixColors(cf.midColor, cf.maxColor, (ratio - 0.5) * 2);
    } else {
        color = mixColors(cf.minColor, cf.maxColor, ratio);
    }
    return cf.target === "font" ? { color } : { background: color };
}

/**
 * Picks black or white text for a generated background so that colour-scale
 * cells stay readable at both ends of the scale.
 */
export function contrastingText(background: string): string {
    const [r, g, b] = parseColor(background);
    // Rec. 601 luma, the standard cheap approximation of perceived brightness.
    const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luma > 0.6 ? "#000000" : "#FFFFFF";
}
