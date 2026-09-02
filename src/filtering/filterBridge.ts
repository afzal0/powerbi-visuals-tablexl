import powerbi from "powerbi-visuals-api";
import IVisualHost = powerbi.extensibility.visual.IVisualHost;

import {
    AdvancedFilter,
    AdvancedFilterConditionOperators,
    BasicFilter,
    FilterType,
    IAdvancedFilter,
    IAdvancedFilterCondition,
    IBasicFilter,
    IFilter,
    IFilterColumnTarget
} from "powerbi-models";

import { CellValue, ColumnModel } from "../data/types";
import { parseDateInput } from "./filterEngine";
import {
    BLANK_KEY,
    ColumnFilter,
    FilterMap,
    FilterOp,
    parseValueKey,
    valueKey
} from "./filterState";

export const FILTER_OBJECT = "general";
export const FILTER_PROPERTY = "filter";

/** Primitive types a report-level basic filter is allowed to carry. */
type FilterPrimitive = string | number | boolean;

function toPrimitive(value: CellValue): FilterPrimitive | null {
    if (value === null || value === undefined) {
        return null;
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    return value as FilterPrimitive;
}

function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, -1);
}

/** Maps our condition operators onto the report filter API's vocabulary. */
function advancedOperator(op: FilterOp, isText: boolean): AdvancedFilterConditionOperators | null {
    switch (op) {
        case "eq":
            return "Is";
        case "ne":
            return "IsNot";
        case "gt":
            return "GreaterThan";
        case "gte":
            return "GreaterThanOrEqual";
        case "lt":
            return "LessThan";
        case "lte":
            return "LessThanOrEqual";
        case "contains":
            return "Contains";
        case "notContains":
            return "DoesNotContain";
        case "startsWith":
            return "StartsWith";
        case "endsWith":
            // The report filter API has no "ends with"; keep it local-only.
            return null;
        case "isEmpty":
            return isText ? "IsEmptyString" : "IsBlank";
        case "isNotEmpty":
            return isText ? "IsNotEmptyString" : "IsNotBlank";
        default:
            return null;
    }
}

function conditionValue(column: ColumnModel, text: string): FilterPrimitive | null {
    if (column.kind === "number") {
        const num = Number(text);
        return isNaN(num) ? null : num;
    }
    if (column.kind === "date") {
        const date = parseDateInput(text);
        return date ? date.toISOString() : null;
    }
    if (column.kind === "boolean") {
        return text.toLowerCase() === "true";
    }
    return text;
}

/**
 * Reports why a column's filter cannot be pushed to the report page, so the UI
 * can say so instead of silently diverging from what the table shows.
 */
export function crossFilterLimitation(
    column: ColumnModel,
    filter: ColumnFilter | undefined
): string | null {
    if (!column.crossFilterable) {
        return column.isMeasure
            ? "Measures can only be filtered inside this visual."
            : "This field can only be filtered inside this visual.";
    }
    if (!filter) {
        return null;
    }
    if (filter.kind === "values") {
        if (column.kind === "date") {
            return "Dates are sent to the page as a date range.";
        }
        if (filter.included.indexOf(BLANK_KEY) >= 0) {
            return "Blank values are not included in the page filter.";
        }
        return null;
    }
    if (
        filter.op !== "between" &&
        advancedOperator(filter.op, column.kind === "text") === null
    ) {
        return "This condition only applies inside this visual.";
    }
    return null;
}

/**
 * Translates one column filter into a report-level JSON filter. Returns null
 * when the filter has no faithful representation, in which case it stays local.
 */
function buildFilter(column: ColumnModel, filter: ColumnFilter): IFilter | null {
    const target = column.filterTarget;
    if (!target) {
        return null;
    }
    const filterTarget: IFilterColumnTarget = {
        table: target.table,
        column: target.column
    };

    if (filter.kind === "values") {
        const raws = filter.included.map(parseValueKey);
        const nonBlank = raws.filter((value) => value !== null);
        if (nonBlank.length === 0) {
            // Only blanks selected — express that directly.
            if (filter.included.indexOf(BLANK_KEY) >= 0) {
                return new AdvancedFilter(filterTarget, "And", {
                    operator: "IsBlank"
                } as IAdvancedFilterCondition).toJSON();
            }
            return null;
        }

        // Basic filters cannot carry Date values, so date selections become a
        // covering range; the exact selection still applies inside the visual.
        if (column.kind === "date") {
            const times = nonBlank
                .map((value) => (value instanceof Date ? value : new Date(String(value))))
                .filter((date) => !isNaN(date.getTime()));
            if (times.length === 0) {
                return null;
            }
            let min = times[0];
            let max = times[0];
            for (const date of times) {
                if (date.getTime() < min.getTime()) {
                    min = date;
                }
                if (date.getTime() > max.getTime()) {
                    max = date;
                }
            }
            return new AdvancedFilter(
                filterTarget,
                "And",
                {
                    operator: "GreaterThanOrEqual",
                    value: startOfDay(min).toISOString()
                } as IAdvancedFilterCondition,
                {
                    operator: "LessThanOrEqual",
                    value: endOfDay(max).toISOString()
                } as IAdvancedFilterCondition
            ).toJSON();
        }

        const values = nonBlank
            .map(toPrimitive)
            .filter((value): value is FilterPrimitive => value !== null);
        if (values.length === 0) {
            return null;
        }
        return new BasicFilter(filterTarget, "In", values).toJSON();
    }

    // "between" has no single API operator; it becomes a pair of conditions.
    if (filter.op === "between") {
        const from = conditionValue(column, filter.v1);
        const to = conditionValue(column, filter.v2);
        if (from === null || to === null) {
            return null;
        }
        return new AdvancedFilter(
            filterTarget,
            "And",
            { operator: "GreaterThanOrEqual", value: from } as IAdvancedFilterCondition,
            { operator: "LessThanOrEqual", value: to } as IAdvancedFilterCondition
        ).toJSON();
    }

    const isText = column.kind === "text";
    const operator = advancedOperator(filter.op, isText);
    if (!operator) {
        return null;
    }

    if (operator === "IsBlank" || operator === "IsNotBlank" ||
        operator === "IsEmptyString" || operator === "IsNotEmptyString") {
        return new AdvancedFilter(filterTarget, "And", {
            operator
        } as IAdvancedFilterCondition).toJSON();
    }

    const value = conditionValue(column, filter.v1);
    if (value === null) {
        return null;
    }
    return new AdvancedFilter(filterTarget, "And", {
        operator,
        value
    } as IAdvancedFilterCondition).toJSON();
}

/** Every column filter that can be expressed as a report-level filter. */
export function buildJsonFilters(columns: ColumnModel[], filters: FilterMap): IFilter[] {
    const result: IFilter[] = [];
    for (const column of columns) {
        const filter = filters[column.key];
        if (!filter) {
            continue;
        }
        const jsonFilter = buildFilter(column, filter);
        if (jsonFilter) {
            result.push(jsonFilter);
        }
    }
    return result;
}

/**
 * Pushes the current selection to the report page. Passing an empty list clears
 * the visual's contribution rather than leaving a stale filter behind.
 */
export function applyToHost(host: IVisualHost, jsonFilters: IFilter[]): void {
    host.applyJsonFilter(
        jsonFilters.length > 0 ? jsonFilters : null,
        FILTER_OBJECT,
        FILTER_PROPERTY,
        jsonFilters.length > 0 ? powerbi.FilterAction.merge : powerbi.FilterAction.remove
    );
}

function targetOf(filter: IFilter): IFilterColumnTarget | null {
    const target = (filter as { target?: unknown }).target;
    if (!target || Array.isArray(target)) {
        return null;
    }
    const candidate = target as IFilterColumnTarget;
    return typeof candidate.table === "string" && typeof candidate.column === "string"
        ? candidate
        : null;
}

function reverseOperator(operator: AdvancedFilterConditionOperators): FilterOp | null {
    switch (operator) {
        case "Is":
            return "eq";
        case "IsNot":
            return "ne";
        case "GreaterThan":
            return "gt";
        case "GreaterThanOrEqual":
            return "gte";
        case "LessThan":
            return "lt";
        case "LessThanOrEqual":
            return "lte";
        case "Contains":
            return "contains";
        case "DoesNotContain":
            return "notContains";
        case "StartsWith":
            return "startsWith";
        case "IsBlank":
        case "IsEmptyString":
            return "isEmpty";
        case "IsNotBlank":
        case "IsNotEmptyString":
            return "isNotEmpty";
        default:
            return null;
    }
}

function conditionText(column: ColumnModel, value: unknown): string {
    if (value === null || value === undefined) {
        return "";
    }
    if (column.kind === "date") {
        const date = new Date(String(value));
        if (!isNaN(date.getTime())) {
            // The condition editor works in local YYYY-MM-DD form.
            const month = `${date.getMonth() + 1}`.padStart(2, "0");
            const day = `${date.getDate()}`.padStart(2, "0");
            return `${date.getFullYear()}-${month}-${day}`;
        }
    }
    return String(value);
}

/**
 * Rebuilds filter state from the filters Power BI hands back in
 * VisualUpdateOptions, so that a reloaded report or a restored bookmark shows
 * the same active funnels the user left behind.
 */
export function restoreFromJsonFilters(
    jsonFilters: IFilter[] | undefined,
    columns: ColumnModel[]
): FilterMap {
    const result: FilterMap = {};
    if (!jsonFilters || jsonFilters.length === 0) {
        return result;
    }

    const byTarget = new Map<string, ColumnModel>();
    for (const column of columns) {
        if (column.filterTarget) {
            byTarget.set(`${column.filterTarget.table}|${column.filterTarget.column}`, column);
        }
    }

    for (const filter of jsonFilters) {
        const target = targetOf(filter);
        if (!target) {
            continue;
        }
        const column = byTarget.get(`${target.table}|${target.column}`);
        if (!column) {
            continue;
        }

        const filterType = (filter as { filterType?: FilterType }).filterType;
        if (filterType === FilterType.Basic) {
            const basic = filter as IBasicFilter;
            if (basic.operator !== "In" || !Array.isArray(basic.values)) {
                continue;
            }
            result[column.key] = {
                kind: "values",
                included: basic.values.map((value) => {
                    if (column.kind === "date") {
                        const date = new Date(String(value));
                        return isNaN(date.getTime()) ? valueKey(String(value)) : valueKey(date);
                    }
                    return valueKey(value as CellValue);
                })
            };
        } else if (filterType === FilterType.Advanced) {
            const advanced = filter as IAdvancedFilter;
            const conditions = advanced.conditions ?? [];
            if (conditions.length === 0) {
                continue;
            }
            if (conditions.length >= 2) {
                const lower = conditions.find(
                    (condition) => condition.operator === "GreaterThanOrEqual"
                );
                const upper = conditions.find(
                    (condition) => condition.operator === "LessThanOrEqual"
                );
                if (lower && upper) {
                    result[column.key] = {
                        kind: "condition",
                        op: "between",
                        v1: conditionText(column, lower.value),
                        v2: conditionText(column, upper.value)
                    };
                    continue;
                }
            }
            const op = reverseOperator(conditions[0].operator);
            if (!op) {
                continue;
            }
            result[column.key] = {
                kind: "condition",
                op,
                v1: conditionText(column, conditions[0].value),
                v2: ""
            };
        }
    }

    return result;
}
