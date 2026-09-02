import { CellValue, ColumnKind, ColumnModel, RowModel } from "../data/types";
import {
    BLANK_KEY,
    ColumnFilter,
    FilterMap,
    FilterOp,
    valueKey
} from "./filterState";

export type SortDirection = "asc" | "desc";

export interface SortEntry {
    key: string;
    dir: SortDirection;
}

export interface DistinctValue {
    key: string;
    display: string;
    raw: CellValue;
    count: number;
}

/**
 * Natural-order collator so "Item 2" sorts before "Item 10", matching Excel.
 * Built once per locale because construction is expensive.
 */
const collatorCache = new Map<string, Intl.Collator>();

function getCollator(locale: string): Intl.Collator {
    let collator = collatorCache.get(locale);
    if (!collator) {
        try {
            collator = new Intl.Collator(locale, { numeric: true, sensitivity: "variant" });
        } catch {
            collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "variant" });
        }
        collatorCache.set(locale, collator);
    }
    return collator;
}

function timeOf(value: CellValue): number {
    return value instanceof Date ? value.getTime() : Number(value);
}

/**
 * Orders two cell values of a known kind. Blanks always sort last regardless of
 * direction, which is how Excel and the native Power BI table both behave.
 */
export function compareValues(
    a: CellValue,
    b: CellValue,
    kind: ColumnKind,
    locale: string
): number {
    const aBlank = a === null || a === undefined || a === "";
    const bBlank = b === null || b === undefined || b === "";
    if (aBlank || bBlank) {
        if (aBlank && bBlank) {
            return 0;
        }
        // Signal "always last" to the caller, which un-inverts it for descending.
        return aBlank ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    }
    switch (kind) {
        case "number":
            return (a as number) - (b as number);
        case "date":
            return timeOf(a) - timeOf(b);
        case "boolean":
            return (a === b ? 0 : a ? 1 : -1);
        default:
            return getCollator(locale).compare(String(a), String(b));
    }
}

/**
 * Applies a multi-column sort. Sort entries are applied in priority order, so
 * shift-clicking additional headers refines the previous ordering.
 */
export function sortRows(
    rows: RowModel[],
    columns: ColumnModel[],
    sort: SortEntry[],
    locale: string
): RowModel[] {
    if (sort.length === 0) {
        return rows;
    }
    const byKey = new Map(columns.map((column) => [column.key, column]));
    const active = sort
        .map((entry) => ({ entry, column: byKey.get(entry.key) }))
        .filter((pair): pair is { entry: SortEntry; column: ColumnModel } => !!pair.column);

    if (active.length === 0) {
        return rows;
    }

    const sorted = rows.slice();
    sorted.sort((rowA, rowB) => {
        for (const { entry, column } of active) {
            const raw = compareValues(
                rowA.values[column.index],
                rowB.values[column.index],
                column.kind,
                locale
            );
            if (raw === 0) {
                continue;
            }
            // Blank sentinels keep blanks last in both directions.
            if (raw === Number.POSITIVE_INFINITY) {
                return 1;
            }
            if (raw === Number.NEGATIVE_INFINITY) {
                return -1;
            }
            return entry.dir === "asc" ? raw : -raw;
        }
        // Stable tie-break on the original row order.
        return rowA.id - rowB.id;
    });
    return sorted;
}

function startOfDay(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function endOfDay(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime() - 1;
}

/**
 * Parses a date typed into the condition editor. `<input type="date">` yields
 * "YYYY-MM-DD", which Date() would read as UTC midnight and shift across time
 * zones, so the parts are applied to a local-time constructor instead.
 */
export function parseDateInput(text: string): Date | null {
    if (!text) {
        return null;
    }
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
    if (parts) {
        return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
    }
    const parsed = new Date(text);
    return isNaN(parsed.getTime()) ? null : parsed;
}

function compareNumeric(value: number, op: FilterOp, a: number, b: number): boolean {
    switch (op) {
        case "eq":
            return value === a;
        case "ne":
            return value !== a;
        case "gt":
            return value > a;
        case "gte":
            return value >= a;
        case "lt":
            return value < a;
        case "lte":
            return value <= a;
        case "between":
            return value >= Math.min(a, b) && value <= Math.max(a, b);
        default:
            return true;
    }
}

/**
 * Date comparisons operate on whole days, so "is 5 March" matches every row
 * recorded that day rather than only those at exactly midnight.
 */
function compareDate(value: Date, op: FilterOp, a: Date | null, b: Date | null): boolean {
    if (!a && op !== "isEmpty" && op !== "isNotEmpty") {
        return true;
    }
    const time = value.getTime();
    const from = a ? startOfDay(a) : 0;
    const to = a ? endOfDay(a) : 0;
    switch (op) {
        case "eq":
            return time >= from && time <= to;
        case "ne":
            return time < from || time > to;
        case "gt":
            return time > to;
        case "gte":
            return time >= from;
        case "lt":
            return time < from;
        case "lte":
            return time <= to;
        case "between": {
            if (!b) {
                return time >= from;
            }
            const lower = Math.min(from, startOfDay(b));
            const upper = Math.max(to, endOfDay(b));
            return time >= lower && time <= upper;
        }
        default:
            return true;
    }
}

function compareText(text: string, op: FilterOp, needle: string): boolean {
    const haystack = text.toLowerCase();
    const target = needle.toLowerCase();
    switch (op) {
        case "eq":
            return haystack === target;
        case "ne":
            return haystack !== target;
        case "contains":
            return haystack.indexOf(target) >= 0;
        case "notContains":
            return haystack.indexOf(target) < 0;
        case "startsWith":
            return haystack.startsWith(target);
        case "endsWith":
            return haystack.endsWith(target);
        case "gt":
            return haystack > target;
        case "gte":
            return haystack >= target;
        case "lt":
            return haystack < target;
        case "lte":
            return haystack <= target;
        default:
            return true;
    }
}

/** Evaluates one column filter against one row's value for that column. */
export function matchesFilter(
    raw: CellValue,
    display: string,
    filter: ColumnFilter,
    kind: ColumnKind
): boolean {
    if (filter.kind === "values") {
        // An empty inclusion list means "nothing selected", which hides all rows.
        return filter.included.indexOf(valueKey(raw)) >= 0;
    }

    const blank = raw === null || raw === undefined || raw === "";
    if (filter.op === "isEmpty") {
        return blank;
    }
    if (filter.op === "isNotEmpty") {
        return !blank;
    }
    if (blank) {
        // Blanks never satisfy a value comparison.
        return false;
    }

    if (kind === "number") {
        const a = Number(filter.v1);
        const b = Number(filter.v2);
        if (isNaN(a)) {
            return true;
        }
        return compareNumeric(raw as number, filter.op, a, isNaN(b) ? a : b);
    }
    if (kind === "date" && raw instanceof Date) {
        return compareDate(raw, filter.op, parseDateInput(filter.v1), parseDateInput(filter.v2));
    }
    if (kind === "boolean") {
        const target = filter.v1.toLowerCase() === "true";
        return filter.op === "ne" ? raw !== target : raw === target;
    }
    if (!filter.v1) {
        return true;
    }
    // Text conditions run against the rendered string, which is what the user sees.
    return compareText(display || String(raw), filter.op, filter.v1);
}

/**
 * Applies every active filter. `skipColumnKey` omits one column's own filter,
 * which is how Excel builds a filter dropdown: the list of values reflects the
 * other columns' filters but not the column being edited.
 */
export function applyFilters(
    rows: RowModel[],
    columns: ColumnModel[],
    filters: FilterMap,
    skipColumnKey?: string
): RowModel[] {
    const active = columns
        .map((column) => ({ column, filter: filters[column.key] }))
        .filter((pair) => !!pair.filter && pair.column.key !== skipColumnKey);

    if (active.length === 0) {
        return rows;
    }

    return rows.filter((row) => {
        for (const { column, filter } of active) {
            if (
                !matchesFilter(
                    row.values[column.index],
                    row.display[column.index],
                    filter,
                    column.kind
                )
            ) {
                return false;
            }
        }
        return true;
    });
}

/**
 * Distinct values for a column's checkbox list, ordered the way the column
 * sorts ascending with blanks last, and counted so the UI can show frequencies.
 */
export function distinctValues(
    rows: RowModel[],
    column: ColumnModel,
    locale: string
): DistinctValue[] {
    const seen = new Map<string, DistinctValue>();
    for (const row of rows) {
        const raw = row.values[column.index];
        const key = valueKey(raw);
        const existing = seen.get(key);
        if (existing) {
            existing.count++;
        } else {
            seen.set(key, {
                key,
                raw,
                display: row.display[column.index],
                count: 1
            });
        }
    }

    const values = Array.from(seen.values());
    values.sort((a, b) => {
        if (a.key === BLANK_KEY) {
            return 1;
        }
        if (b.key === BLANK_KEY) {
            return -1;
        }
        const result = compareValues(a.raw, b.raw, column.kind, locale);
        if (result === Number.POSITIVE_INFINITY) {
            return 1;
        }
        if (result === Number.NEGATIVE_INFINITY) {
            return -1;
        }
        return result;
    });
    return values;
}
