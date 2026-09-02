import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import DataViewMetadataColumn = powerbi.DataViewMetadataColumn;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;

import { createColumnFormatter, formatCell } from "./formatValue";
import {
    CellValue,
    ColumnKind,
    ColumnModel,
    FilterTarget,
    RowModel,
    TableModel
} from "./types";
import { readColumnFormatting, readConditionalFormatting, readTotalsAggregation } from "../settings/columnCards";

/** Matches "Table.Column" only — not "Sum(Table.Column)" or hierarchy paths. */
const SIMPLE_QUERY_NAME = /^([^.()[\]]+)\.([^.()[\]]+)$/;

/**
 * Report-level JSON filters can only target real table columns. Implicit
 * measures ("Sum(Sales.Amount)"), explicit measures and hierarchy levels have
 * no addressable {table, column} pair, so those columns filter locally only.
 */
export function resolveFilterTarget(
    column: DataViewMetadataColumn
): FilterTarget | undefined {
    if (column.isMeasure) {
        return undefined;
    }
    const queryName = column.queryName;
    if (!queryName) {
        return undefined;
    }
    const match = SIMPLE_QUERY_NAME.exec(queryName);
    if (!match) {
        return undefined;
    }
    return { table: match[1], column: match[2] };
}

function classify(column: DataViewMetadataColumn): ColumnKind {
    const type = column.type;
    if (!type) {
        return "text";
    }
    if (type.dateTime) {
        return "date";
    }
    if (type.numeric || type.integer) {
        return "number";
    }
    if (type.bool) {
        return "boolean";
    }
    return "text";
}

/**
 * Power BI hands date values back as Date objects, but bookmark/filter
 * round-trips can produce ISO strings. Normalise so comparators and the
 * conditional formatting engine only ever see one shape per column kind.
 */
function normalize(value: powerbi.PrimitiveValue, kind: ColumnKind): CellValue {
    if (value === null || value === undefined) {
        return null;
    }
    if (kind === "date") {
        if (value instanceof Date) {
            return isNaN(value.getTime()) ? null : value;
        }
        const parsed = new Date(value as string);
        return isNaN(parsed.getTime()) ? null : parsed;
    }
    if (kind === "number") {
        const num = typeof value === "number" ? value : Number(value);
        return isNaN(num) ? null : num;
    }
    if (kind === "boolean") {
        return typeof value === "boolean" ? value : String(value) === "true";
    }
    return value instanceof Date ? value.toISOString() : String(value);
}

/** The row cap declared by the table data reduction algorithm in capabilities. */
export const ROW_WINDOW = 30000;

/**
 * Projects the table data view into the flat column/row model the grid,
 * filters and exporters all share. Columns are keyed by queryName so that
 * per-column settings survive reordering and renaming in the field well.
 */
export function transform(dataView: DataView | undefined, host: IVisualHost): TableModel | null {
    const table = dataView?.table;
    if (!table || !table.columns || table.columns.length === 0) {
        return null;
    }

    const columns: ColumnModel[] = table.columns.map((metadataColumn, index) => {
        const kind = classify(metadataColumn);
        const filterTarget = resolveFilterTarget(metadataColumn);
        // queryName is the only identifier that is stable across reorder and
        // rename; fall back to the display name for the rare column without one.
        const key = metadataColumn.queryName ?? `col:${metadataColumn.displayName}:${index}`;
        return {
            key,
            index,
            displayName: metadataColumn.displayName ?? "",
            queryName: metadataColumn.queryName ?? key,
            kind,
            isMeasure: !!metadataColumn.isMeasure,
            formatString: metadataColumn.format,
            filterTarget,
            crossFilterable: filterTarget !== undefined,
            fmt: readColumnFormatting(metadataColumn),
            cf: readConditionalFormatting(metadataColumn),
            totalsAgg: readTotalsAggregation(metadataColumn, kind)
        };
    });

    const formatters = columns.map((column) => createColumnFormatter(column, host.locale));
    const sourceRows = table.rows ?? [];

    const rows: RowModel[] = sourceRows.map((sourceRow, rowIndex) => {
        const values: CellValue[] = new Array(columns.length);
        const display: string[] = new Array(columns.length);
        for (let i = 0; i < columns.length; i++) {
            const value = normalize(sourceRow[i], columns[i].kind);
            values[i] = value;
            display[i] = formatCell(formatters[i], value);
        }
        return {
            id: rowIndex,
            values,
            display,
            selectionId: host
                .createSelectionIdBuilder()
                .withTable(table, rowIndex)
                .createSelectionId()
        };
    });

    return {
        columns,
        rows,
        rowCount: rows.length,
        truncated: !!dataView.metadata?.segment || rows.length >= ROW_WINDOW
    };
}
