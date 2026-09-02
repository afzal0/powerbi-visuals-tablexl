import powerbi from "powerbi-visuals-api";
import ISelectionId = powerbi.visuals.ISelectionId;

/** A raw cell value as it arrives from the Power BI data view. */
export type CellValue = string | number | boolean | Date | null;

/** Coarse value class used to pick comparators, filter UI and alignment. */
export type ColumnKind = "text" | "number" | "date" | "boolean";

export type Alignment = "auto" | "left" | "center" | "right";

export type AggregationKind =
    | "none"
    | "sum"
    | "avg"
    | "min"
    | "max"
    | "count"
    | "countDistinct";

export type ConditionalMode = "none" | "colorScale" | "dataBar" | "rules";
export type ConditionalTarget = "background" | "font";

export type RuleOperator =
    | "none"
    | "eq"
    | "ne"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "contains"
    | "startsWith"
    | "isBlank";

export interface ConditionalRule {
    op: RuleOperator;
    value: string;
    color: string;
}

/** Per-column conditional formatting, resolved from the column's own objects. */
export interface ConditionalFormatting {
    mode: ConditionalMode;
    target: ConditionalTarget;
    minColor: string;
    midColor: string;
    maxColor: string;
    useMid: boolean;
    dataBarColor: string;
    dataBarNegativeColor: string;
    dataBarShowValue: boolean;
    rules: ConditionalRule[];
}

/** Per-column display settings, resolved from the column's own objects. */
export interface ColumnFormatting {
    hide: boolean;
    width: number | null;
    alignment: Alignment;
    displayUnits: number;
    decimalPlaces: number | null;
    wrapText: boolean;
    fontColor: string | null;
    backColor: string | null;
}

/** Target of a Power BI JSON filter — only resolvable for real table columns. */
export interface FilterTarget {
    table: string;
    column: string;
}

export interface ColumnModel {
    /** Stable identity across column reorder and display-name changes. */
    key: string;
    /** Position within dataView.table.columns / row value arrays. */
    index: number;
    displayName: string;
    queryName: string;
    kind: ColumnKind;
    isMeasure: boolean;
    formatString: string | undefined;
    /** Undefined when the field cannot be targeted by a report-level filter. */
    filterTarget: FilterTarget | undefined;
    crossFilterable: boolean;
    fmt: ColumnFormatting;
    cf: ConditionalFormatting;
    totalsAgg: AggregationKind;
}

export interface RowModel {
    /** Index of the row in the unsorted, unfiltered data view. */
    id: number;
    values: CellValue[];
    display: string[];
    selectionId: ISelectionId;
}

export interface TableModel {
    columns: ColumnModel[];
    rows: RowModel[];
    /** True when the data view was truncated by the 30k row window. */
    truncated: boolean;
    rowCount: number;
}
