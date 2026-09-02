import { valueFormatter } from "powerbi-visuals-utils-formattingutils";
import { CellValue, ColumnModel } from "./types";

type Formatter = { format(value: unknown): string };

/**
 * Builds a display formatter for a column, honouring the model's own format
 * string plus any per-column display-unit / precision override, in the host
 * locale. Formatters are relatively costly to build, so callers should create
 * one per column per update rather than one per cell.
 */
export function createColumnFormatter(column: ColumnModel, locale: string): Formatter {
    const { displayUnits, decimalPlaces } = column.fmt;
    const options: {
        format?: string;
        value?: number;
        precision?: number;
        cultureSelector?: string;
    } = {
        format: column.formatString,
        cultureSelector: locale
    };

    // Display units and precision only make sense for numeric columns.
    if (column.kind === "number") {
        if (displayUnits > 0) {
            options.value = displayUnits;
        }
        if (decimalPlaces !== null && decimalPlaces >= 0) {
            options.precision = decimalPlaces;
        }
    }

    return valueFormatter.create(options);
}

/** Formats one raw value, mapping blanks to an empty cell rather than "null". */
export function formatCell(formatter: Formatter, value: CellValue): string {
    if (value === null || value === undefined) {
        return "";
    }
    return formatter.format(value);
}

/**
 * Stable, locale-aware text used for searching and text comparisons. Falls back
 * to the raw value so that numbers remain searchable by their digits even when
 * the display string is abbreviated (e.g. "1.2M").
 */
export function searchText(display: string, raw: CellValue): string {
    const rawText = raw === null || raw === undefined ? "" : String(raw);
    return (display + " " + rawText).toLowerCase();
}
