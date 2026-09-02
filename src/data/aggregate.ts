import { AggregationKind, CellValue, ColumnModel, RowModel } from "./types";
import { valueKey } from "../filtering/filterState";

export interface TotalResult {
    /** The aggregate value, or null when the aggregation does not apply. */
    value: CellValue;
    /** True when the result is a plain count rather than a value in the column's own units. */
    isCount: boolean;
}

/**
 * Computes one column's totals-row value over the rows currently displayed.
 * Counts work for every column kind; the arithmetic aggregations are limited to
 * numeric columns, and min/max additionally support dates.
 */
export function aggregate(
    rows: RowModel[],
    column: ColumnModel,
    kind: AggregationKind
): TotalResult | null {
    if (kind === "none") {
        return null;
    }

    if (kind === "count") {
        let count = 0;
        for (const row of rows) {
            const value = row.values[column.index];
            if (value !== null && value !== undefined && value !== "") {
                count++;
            }
        }
        return { value: count, isCount: true };
    }

    if (kind === "countDistinct") {
        const seen = new Set<string>();
        for (const row of rows) {
            const value = row.values[column.index];
            if (value !== null && value !== undefined && value !== "") {
                seen.add(valueKey(value));
            }
        }
        return { value: seen.size, isCount: true };
    }

    if (column.kind === "date" && (kind === "min" || kind === "max")) {
        let best: Date | null = null;
        for (const row of rows) {
            const value = row.values[column.index];
            if (value instanceof Date) {
                if (!best || (kind === "min" ? value < best : value > best)) {
                    best = value;
                }
            }
        }
        return best ? { value: best, isCount: false } : null;
    }

    if (column.kind !== "number") {
        return null;
    }

    let sum = 0;
    let count = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const row of rows) {
        const value = row.values[column.index];
        if (typeof value === "number" && isFinite(value)) {
            sum += value;
            count++;
            if (value < min) {
                min = value;
            }
            if (value > max) {
                max = value;
            }
        }
    }
    if (count === 0) {
        return null;
    }

    switch (kind) {
        case "sum":
            return { value: sum, isCount: false };
        case "avg":
            return { value: sum / count, isCount: false };
        case "min":
            return { value: min, isCount: false };
        case "max":
            return { value: max, isCount: false };
        default:
            return null;
    }
}

/** Short label shown alongside a total so the aggregation used is obvious. */
export function aggregationLabel(kind: AggregationKind): string {
    switch (kind) {
        case "sum":
            return "Sum";
        case "avg":
            return "Average";
        case "min":
            return "Min";
        case "max":
            return "Max";
        case "count":
            return "Count";
        case "countDistinct":
            return "Distinct";
        default:
            return "";
    }
}
