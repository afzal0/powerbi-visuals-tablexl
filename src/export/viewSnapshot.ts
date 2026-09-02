import { aggregate, aggregationLabel } from "../data/aggregate";
import { createColumnFormatter, formatCell } from "../data/formatValue";
import { Alignment, CellValue, ColumnKind, ColumnModel, RowModel } from "../data/types";
import {
    CellFormat,
    computeStats,
    contrastingText,
    evaluateCell
} from "../formatting/conditionalFormatting";
import { effectiveAlignment, ResolvedStyle } from "../formatting/theme";

export interface ExportColumn {
    header: string;
    kind: ColumnKind;
    alignment: Alignment;
    /** On-screen width in pixels, used to proportion Excel and PDF columns. */
    width: number;
    formatString: string | undefined;
}

export interface ExportCell {
    text: string;
    raw: CellValue;
    background?: string;
    color?: string;
}

export interface ExportView {
    title: string;
    columns: ExportColumn[];
    rows: ExportCell[][];
    /** Present only when the totals row is switched on. */
    totals: ExportCell[] | null;
    style: ResolvedStyle;
    /** True when the source data view hit the 30,000 row window. */
    truncated: boolean;
    totalRowCount: number;
}

export const DEFAULT_COLUMN_WIDTH = 140;

export function columnWidth(column: ColumnModel): number {
    return column.fmt.width && column.fmt.width > 0 ? column.fmt.width : DEFAULT_COLUMN_WIDTH;
}

function cellColors(
    format: CellFormat | undefined,
    column: ColumnModel,
    style: ResolvedStyle,
    rowIndex: number
): { background?: string; color?: string } {
    // Data bars are a rendering concern; exports keep the plain value.
    if (format?.background) {
        return { background: format.background, color: contrastingText(format.background) };
    }

    const background =
        column.fmt.backColor ??
        (style.body.banded && rowIndex % 2 === 1 ? style.body.bandedBackground : undefined);
    const color =
        format?.color ??
        column.fmt.fontColor ??
        (style.body.banded && rowIndex % 2 === 1 ? style.body.bandedColor : undefined);

    return { background, color };
}

/**
 * Builds the totals row for a set of columns. Shared by the grid and the
 * exporters so an exported total can never disagree with the displayed one.
 */
export function buildTotalsRow(
    columns: ColumnModel[],
    rows: RowModel[],
    style: ResolvedStyle,
    locale: string
): ExportCell[] {
    const formatters = columns.map((column) => createColumnFormatter(column, locale));
    return columns.map((column, index) => {
        const result = aggregate(rows, column, column.totalsAgg);
        if (!result) {
            // The first column carries the totals label when it has no aggregate.
            return { text: index === 0 ? style.totals.label : "", raw: null };
        }
        const text = result.isCount
            ? `${aggregationLabel(column.totalsAgg)} ${result.value}`
            : formatCell(formatters[index], result.value);
        return { text, raw: result.value };
    });
}

/**
 * Builds the snapshot every exporter consumes. It is derived from the rows that
 * are actually on screen — already filtered, sorted and formatted — so a CSV,
 * workbook or PDF can never disagree with the table the user is looking at.
 */
export interface BuildViewOptions {
    columns: ColumnModel[];
    /** Rows already filtered and sorted, in display order. */
    rows: RowModel[];
    style: ResolvedStyle;
    locale: string;
    title: string;
    truncated: boolean;
    useRawValues: boolean;
    /** Live column widths, including any the user has dragged. */
    widths?: { [columnKey: string]: number };
}

export function buildExportView(options: BuildViewOptions): ExportView {
    const { columns, rows, style, locale, title, truncated, useRawValues, widths } = options;
    const visible = columns.filter((column) => !column.fmt.hide);

    const exportColumns: ExportColumn[] = visible.map((column) => ({
        header: column.displayName,
        kind: column.kind,
        alignment: effectiveAlignment(column, style.header.alignment),
        width: widths?.[column.key] ?? columnWidth(column),
        formatString: column.formatString
    }));

    const stats = visible.map((column) => computeStats(rows, column));

    const exportRows: ExportCell[][] = rows.map((row, rowIndex) =>
        visible.map((column, columnIndex) => {
            const raw = row.values[column.index];
            const text = row.display[column.index];
            const format = evaluateCell(raw, text, column, stats[columnIndex]);
            const { background, color } = cellColors(format, column, style, rowIndex);
            return {
                text: useRawValues && raw !== null ? String(raw) : text,
                raw,
                background,
                color
            };
        })
    );

    const totals = style.totals.show
        ? buildTotalsRow(visible, rows, style, locale)
        : null;

    return {
        title,
        columns: exportColumns,
        rows: exportRows,
        totals,
        style,
        truncated,
        totalRowCount: rows.length
    };
}
