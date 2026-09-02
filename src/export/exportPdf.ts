import { jsPDF } from "jspdf";
import { autoTable, CellHookData, HookData, UserOptions } from "jspdf-autotable";

import { ExportView } from "./viewSnapshot";

export interface PdfOptions {
    title: string;
    orientation: "portrait" | "landscape" | "auto";
    pageSize: string;
    fitToWidth: boolean;
    repeatHeader: boolean;
    pageNumbers: boolean;
}

/** CSS pixels to PostScript points, the unit jsPDF measures in. */
const PX_TO_PT = 0.75;

function toRgb(color: string | undefined, fallback: [number, number, number]): [number, number, number] {
    if (!color) {
        return fallback;
    }
    let hex = color.replace("#", "").trim();
    if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    if (hex.length !== 6) {
        return fallback;
    }
    return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16)
    ];
}

/**
 * Wide tables are unreadable on portrait pages, so "auto" switches to landscape
 * once the columns need more width than a portrait page can give them.
 */
function resolveOrientation(view: ExportView, options: PdfOptions): "portrait" | "landscape" {
    if (options.orientation !== "auto") {
        return options.orientation;
    }
    const totalWidth = view.columns.reduce((sum, column) => sum + column.width, 0);
    return totalWidth > 700 ? "landscape" : "portrait";
}

/**
 * Renders the current view as a paginated PDF. This doubles as the print path:
 * the visual runs in a sandboxed iframe where window.print() cannot be relied
 * on, so producing a properly paginated document is the dependable route to
 * a well-formatted printout.
 */
export function buildPdf(view: ExportView, options: PdfOptions): ArrayBuffer {
    const orientation = resolveOrientation(view, options);
    const doc = new jsPDF({
        orientation,
        unit: "pt",
        format: options.pageSize,
        compress: true
    });

    const style = view.style;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 28;
    const hasTitle = options.title.trim().length > 0;

    const head = [view.columns.map((column) => column.header)];
    const body = view.rows.map((row) => row.map((cell) => cell.text));
    const foot = view.totals ? [view.totals.map((cell) => cell.text)] : undefined;

    // Proportion the on-screen widths to the printable area when fitting.
    const available = pageWidth - margin * 2;
    const totalPx = view.columns.reduce((sum, column) => sum + column.width, 0) || 1;
    const columnStyles: UserOptions["columnStyles"] = {};
    view.columns.forEach((column, index) => {
        const width = options.fitToWidth
            ? (column.width / totalPx) * available
            : column.width * PX_TO_PT;
        columnStyles[index] = {
            cellWidth: width,
            halign: column.alignment === "auto" ? "left" : column.alignment
        };
    });

    autoTable(doc, {
        head,
        body,
        foot,
        startY: hasTitle ? margin + 22 : margin,
        margin: { top: hasTitle ? margin + 22 : margin, right: margin, bottom: margin + 16, left: margin },
        theme: "grid",
        tableWidth: options.fitToWidth ? available : "wrap",
        showHead: options.repeatHeader ? "everyPage" : "firstPage",
        showFoot: foot ? "lastPage" : "never",
        columnStyles,
        styles: {
            font: "helvetica",
            fontSize: Math.max(6, Math.min(12, style.body.fontSize * 0.8)),
            cellPadding: 3,
            overflow: "linebreak",
            lineColor: toRgb(style.grid.color, [225, 223, 221]),
            lineWidth: style.grid.showHorizontal || style.grid.showVertical ? 0.5 : 0,
            textColor: toRgb(style.body.color, [37, 36, 35]),
            fillColor: toRgb(style.body.background, [255, 255, 255])
        },
        headStyles: {
            fillColor: toRgb(style.header.background, [243, 242, 241]),
            textColor: toRgb(style.header.color, [37, 36, 35]),
            fontStyle: style.header.bold ? "bold" : "normal",
            fontSize: Math.max(6, Math.min(12, style.header.fontSize * 0.8))
        },
        footStyles: {
            fillColor: toRgb(style.totals.background, [243, 242, 241]),
            textColor: toRgb(style.totals.color, [37, 36, 35]),
            fontStyle: style.totals.bold ? "bold" : "normal"
        },
        alternateRowStyles: style.body.banded
            ? { fillColor: toRgb(style.body.bandedBackground, [250, 249, 248]) }
            : undefined,

        // Carry per-cell conditional formatting through to the printed page.
        didParseCell: (data: CellHookData) => {
            if (data.section !== "body") {
                return;
            }
            const cell = view.rows[data.row.index]?.[data.column.index];
            if (!cell) {
                return;
            }
            if (cell.background) {
                data.cell.styles.fillColor = toRgb(cell.background, [255, 255, 255]);
            }
            if (cell.color) {
                data.cell.styles.textColor = toRgb(cell.color, [37, 36, 35]);
            }
        },

        didDrawPage: (data: HookData) => {
            if (hasTitle) {
                doc.setFontSize(13);
                doc.setTextColor(37, 36, 35);
                doc.text(options.title, margin, margin + 6);
            }
            if (options.pageNumbers) {
                doc.setFontSize(8);
                doc.setTextColor(120, 120, 120);
                doc.text(
                    `Page ${data.pageNumber}`,
                    pageWidth - margin,
                    pageHeight - margin + 8,
                    { align: "right" }
                );
            }
        }
    });

    return doc.output("arraybuffer");
}
