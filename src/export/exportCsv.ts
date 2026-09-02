import { ExportView } from "./viewSnapshot";

/**
 * RFC 4180 quoting: wrap in quotes when the field contains a delimiter, quote
 * or newline, and double any embedded quotes.
 */
function quote(value: string): string {
    if (value === "") {
        return "";
    }
    if (/[",\r\n]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

/**
 * Serialises the current view as CSV.
 *
 * A UTF-8 byte order mark is prepended because Excel otherwise interprets a
 * CSV as the system code page and mangles any non-ASCII text.
 */
export function buildCsv(view: ExportView): string {
    const lines: string[] = [];
    lines.push(view.columns.map((column) => quote(column.header)).join(","));

    for (const row of view.rows) {
        lines.push(row.map((cell) => quote(cell.text)).join(","));
    }

    if (view.totals) {
        lines.push(view.totals.map((cell) => quote(cell.text)).join(","));
    }

    return "﻿" + lines.join("\r\n");
}
