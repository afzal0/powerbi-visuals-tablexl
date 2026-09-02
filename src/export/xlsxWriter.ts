import { strToU8, zipSync } from "fflate";
import { ExportCell, ExportColumn, ExportView } from "./viewSnapshot";

/**
 * A minimal SpreadsheetML (.xlsx) writer.
 *
 * Writing the OOXML parts directly rather than pulling in a full workbook
 * library keeps the bundle small enough for a certified visual and avoids any
 * dependency on Node built-ins, which the visual build no longer polyfills.
 * Only the parts Excel requires for a single styled sheet are emitted.
 */

export interface XlsxOptions {
    sheetName: string;
    autoFilter: boolean;
    freezeHeader: boolean;
}

/*
 * OOXML namespace identifiers. These are opaque names fixed by the ECMA-376
 * specification, not addresses the visual ever requests; Excel rejects the
 * workbook if they differ by even one character, so the http form is required.
 */
/* eslint-disable powerbi-visuals/no-http-string */
const SHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types";
/* eslint-enable powerbi-visuals/no-http-string */

/** Excel's 1900 date system counts days from 1899-12-30. */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

function escapeXml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

/**
 * Strips characters that are illegal in XML 1.0. Power BI text can contain
 * control characters that would otherwise make the workbook unopenable.
 */
function sanitizeText(value: string): string {
    return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

/** Converts a zero-based column index to a spreadsheet column reference. */
export function columnLetter(index: number): string {
    let result = "";
    let current = index;
    while (current >= 0) {
        result = String.fromCharCode((current % 26) + 65) + result;
        current = Math.floor(current / 26) - 1;
    }
    return result;
}

/**
 * Excel stores dates as a day count. Using the UTC epoch against the date's
 * local wall-clock parts keeps the exported value equal to what was displayed,
 * regardless of the viewer's time zone.
 */
function toExcelSerial(date: Date): number {
    const localAsUtc = Date.UTC(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        date.getHours(),
        date.getMinutes(),
        date.getSeconds(),
        date.getMilliseconds()
    );
    return (localAsUtc - EXCEL_EPOCH_UTC) / 86400000;
}

/** ARGB is what OOXML expects; the palette stores plain #RRGGBB. */
function toArgb(color: string | undefined, fallback: string): string {
    const source = (color ?? fallback).replace("#", "").trim();
    if (source.length === 3) {
        return (
            "FF" +
            source[0] + source[0] +
            source[1] + source[1] +
            source[2] + source[2]
        ).toUpperCase();
    }
    if (source.length === 8) {
        return source.toUpperCase();
    }
    if (source.length !== 6) {
        return "FF" + fallback.replace("#", "").toUpperCase();
    }
    return ("FF" + source).toUpperCase();
}

interface FontSpec {
    size: number;
    name: string;
    bold: boolean;
    italic: boolean;
    color: string;
}

interface XfSpec {
    fontId: number;
    fillId: number;
    borderId: number;
    numFmtId: number;
    alignment: string;
    wrap: boolean;
}

/**
 * Interns fonts, fills, borders and number formats so the styles part stays
 * small even when thousands of cells share a handful of appearances.
 */
class StyleRegistry {
    private readonly fontKeys: string[] = [];
    private readonly fonts: FontSpec[] = [];
    private readonly fillKeys: string[] = [];
    private readonly fills: string[] = [];
    private readonly borderKeys: string[] = [];
    private readonly borders: string[] = [];
    private readonly numFmtKeys: string[] = [];
    private readonly numFmts: string[] = [];
    private readonly xfKeys: string[] = [];
    private readonly xfs: XfSpec[] = [];

    constructor() {
        // Excel requires fill 0 to be "none" and fill 1 to be "gray125".
        this.fillKeys.push("none", "gray125");
        this.fills.push(
            '<fill><patternFill patternType="none"/></fill>',
            '<fill><patternFill patternType="gray125"/></fill>'
        );
        this.borderKeys.push("none");
        this.borders.push("<border><left/><right/><top/><bottom/><diagonal/></border>");
    }

    font(spec: FontSpec): number {
        const key = `${spec.size}|${spec.name}|${spec.bold}|${spec.italic}|${spec.color}`;
        const existing = this.fontKeys.indexOf(key);
        if (existing >= 0) {
            return existing;
        }
        this.fontKeys.push(key);
        this.fonts.push(spec);
        return this.fonts.length - 1;
    }

    fill(color: string | undefined): number {
        if (!color) {
            return 0;
        }
        const argb = toArgb(color, "FFFFFF");
        const key = `solid:${argb}`;
        const existing = this.fillKeys.indexOf(key);
        if (existing >= 0) {
            return existing;
        }
        this.fillKeys.push(key);
        this.fills.push(
            `<fill><patternFill patternType="solid"><fgColor rgb="${argb}"/>` +
                `<bgColor indexed="64"/></patternFill></fill>`
        );
        return this.fills.length - 1;
    }

    border(color: string | undefined): number {
        if (!color) {
            return 0;
        }
        const argb = toArgb(color, "D0D0D0");
        const key = `thin:${argb}`;
        const existing = this.borderKeys.indexOf(key);
        if (existing >= 0) {
            return existing;
        }
        const side = `<color rgb="${argb}"/>`;
        this.borderKeys.push(key);
        this.borders.push(
            `<border><left style="thin">${side}</left><right style="thin">${side}</right>` +
                `<top style="thin">${side}</top><bottom style="thin">${side}</bottom><diagonal/></border>`
        );
        return this.borders.length - 1;
    }

    numFmt(code: string | undefined): number {
        if (!code || code === "General") {
            return 0;
        }
        const existing = this.numFmtKeys.indexOf(code);
        if (existing >= 0) {
            // Custom formats are numbered from 164 upwards by convention.
            return 164 + existing;
        }
        this.numFmtKeys.push(code);
        this.numFmts.push(code);
        return 164 + this.numFmts.length - 1;
    }

    xf(spec: XfSpec): number {
        const key = `${spec.fontId}|${spec.fillId}|${spec.borderId}|${spec.numFmtId}|${spec.alignment}|${spec.wrap}`;
        const existing = this.xfKeys.indexOf(key);
        if (existing >= 0) {
            return existing;
        }
        this.xfKeys.push(key);
        this.xfs.push(spec);
        return this.xfs.length - 1;
    }

    toXml(): string {
        const numFmts = this.numFmts.length
            ? `<numFmts count="${this.numFmts.length}">` +
              this.numFmts
                  .map(
                      (code, index) =>
                          `<numFmt numFmtId="${164 + index}" formatCode="${escapeXml(code)}"/>`
                  )
                  .join("") +
              "</numFmts>"
            : "";

        const fonts =
            `<fonts count="${this.fonts.length}">` +
            this.fonts
                .map(
                    (font) =>
                        `<font><sz val="${font.size}"/><color rgb="${toArgb(font.color, "000000")}"/>` +
                        `<name val="${escapeXml(font.name)}"/>` +
                        (font.bold ? "<b/>" : "") +
                        (font.italic ? "<i/>" : "") +
                        "</font>"
                )
                .join("") +
            "</fonts>";

        const fills = `<fills count="${this.fills.length}">${this.fills.join("")}</fills>`;
        const borders = `<borders count="${this.borders.length}">${this.borders.join("")}</borders>`;

        const cellXfs =
            `<cellXfs count="${this.xfs.length}">` +
            this.xfs
                .map((xf) => {
                    const attributes =
                        `numFmtId="${xf.numFmtId}" fontId="${xf.fontId}" fillId="${xf.fillId}" ` +
                        `borderId="${xf.borderId}" xfId="0" applyFont="1" applyFill="1" ` +
                        `applyBorder="1" applyNumberFormat="1" applyAlignment="1"`;
                    const alignment =
                        `<alignment horizontal="${xf.alignment}" vertical="center"` +
                        (xf.wrap ? ' wrapText="1"' : "") +
                        "/>";
                    return `<xf ${attributes}>${alignment}</xf>`;
                })
                .join("") +
            "</cellXfs>";

        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            `<styleSheet xmlns="${SHEET_NS}">` +
            numFmts +
            fonts +
            fills +
            borders +
            '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
            cellXfs +
            '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
            "</styleSheet>"
        );
    }
}

/** Power BI and Excel share a format-code dialect, so codes pass through. */
function numberFormatFor(column: ExportColumn): string | undefined {
    if (column.formatString && column.formatString !== "General") {
        return column.formatString;
    }
    return column.kind === "date" ? "yyyy\\-mm\\-dd" : undefined;
}

function alignmentFor(column: ExportColumn): string {
    return column.alignment === "auto" ? "general" : column.alignment;
}

function cellXml(
    reference: string,
    styleId: number,
    cell: ExportCell,
    column: ExportColumn
): string {
    const raw = cell.raw;

    if (raw === null || raw === undefined || cell.text === "") {
        // Keep the styled but empty cell so banding and borders stay continuous.
        return `<c r="${reference}" s="${styleId}"/>`;
    }
    if (column.kind === "number" && typeof raw === "number" && isFinite(raw)) {
        return `<c r="${reference}" s="${styleId}"><v>${raw}</v></c>`;
    }
    if (column.kind === "date" && raw instanceof Date && !isNaN(raw.getTime())) {
        return `<c r="${reference}" s="${styleId}"><v>${toExcelSerial(raw)}</v></c>`;
    }
    if (column.kind === "boolean" && typeof raw === "boolean") {
        return `<c r="${reference}" s="${styleId}" t="b"><v>${raw ? 1 : 0}</v></c>`;
    }
    const text = escapeXml(sanitizeText(cell.text));
    return (
        `<c r="${reference}" s="${styleId}" t="inlineStr">` +
        `<is><t xml:space="preserve">${text}</t></is></c>`
    );
}

/** Excel column widths are measured in characters, not pixels. */
function pixelsToChars(pixels: number): number {
    return Math.max(5, Math.round(((pixels - 5) / 7) * 100) / 100);
}

/**
 * Produces a complete .xlsx package for the current view, carrying over header
 * and value fonts, fills, conditional-formatting colours, alignment, number
 * formats, column widths, a frozen header row and Excel's own AutoFilter.
 */
export function buildWorkbook(view: ExportView, options: XlsxOptions): Uint8Array {
    const styles = new StyleRegistry();
    const { style } = view;
    const columnCount = view.columns.length;

    // Font 0 must exist and is used as the workbook default.
    styles.font({
        size: style.body.fontSize,
        name: style.body.fontFamily.split(",")[0].trim(),
        bold: false,
        italic: false,
        color: style.body.color
    });

    const bodyFontName = style.body.fontFamily.split(",")[0].trim();
    const headerFontName = style.header.fontFamily.split(",")[0].trim();
    const gridColor = style.grid.showHorizontal || style.grid.showVertical
        ? style.grid.color
        : undefined;

    const headerFontId = styles.font({
        size: style.header.fontSize,
        name: headerFontName,
        bold: style.header.bold,
        italic: style.header.italic,
        color: style.header.color
    });
    const headerFillId = styles.fill(style.header.background);
    const borderId = styles.border(gridColor);

    const headerStyleIds = view.columns.map((column) =>
        styles.xf({
            fontId: headerFontId,
            fillId: headerFillId,
            borderId,
            numFmtId: 0,
            alignment: alignmentFor(column),
            wrap: style.header.wrapText
        })
    );

    const rowsXml: string[] = [];
    const headerCells = view.columns
        .map((column, index) => {
            const reference = `${columnLetter(index)}1`;
            return (
                `<c r="${reference}" s="${headerStyleIds[index]}" t="inlineStr">` +
                `<is><t xml:space="preserve">${escapeXml(sanitizeText(column.header))}</t></is></c>`
            );
        })
        .join("");
    rowsXml.push(
        `<row r="1" customHeight="1" ht="${Math.max(18, style.header.fontSize * 1.8)}">` +
            headerCells +
            "</row>"
    );

    // Per-cell appearance is interned, so repeated styles cost one lookup each.
    const numFmtIds = view.columns.map((column) => styles.numFmt(numberFormatFor(column)));
    const alignments = view.columns.map(alignmentFor);

    view.rows.forEach((row, rowIndex) => {
        const excelRow = rowIndex + 2;
        const cells = row
            .map((cell, columnIndex) => {
                const column = view.columns[columnIndex];
                const fontId = styles.font({
                    size: style.body.fontSize,
                    name: bodyFontName,
                    bold: style.body.bold,
                    italic: style.body.italic,
                    color: cell.color ?? style.body.color
                });
                const styleId = styles.xf({
                    fontId,
                    fillId: styles.fill(cell.background),
                    borderId,
                    numFmtId: numFmtIds[columnIndex],
                    alignment: alignments[columnIndex],
                    wrap: style.body.wrapText
                });
                return cellXml(
                    `${columnLetter(columnIndex)}${excelRow}`,
                    styleId,
                    cell,
                    column
                );
            })
            .join("");
        rowsXml.push(`<row r="${excelRow}">${cells}</row>`);
    });

    if (view.totals) {
        const totalsRow = view.rows.length + 2;
        const totalsFontId = styles.font({
            size: style.body.fontSize,
            name: bodyFontName,
            bold: style.totals.bold,
            italic: false,
            color: style.totals.color
        });
        const totalsFillId = styles.fill(style.totals.background);
        const cells = view.totals
            .map((cell, columnIndex) => {
                const column = view.columns[columnIndex];
                const styleId = styles.xf({
                    fontId: totalsFontId,
                    fillId: totalsFillId,
                    borderId,
                    numFmtId:
                        typeof cell.raw === "number" && column.kind === "number"
                            ? numFmtIds[columnIndex]
                            : 0,
                    alignment: alignments[columnIndex],
                    wrap: false
                });
                // Count aggregates carry their label, so write them as text.
                const isNumeric =
                    typeof cell.raw === "number" &&
                    column.kind === "number" &&
                    cell.text.indexOf(" ") < 0;
                if (isNumeric) {
                    return `<c r="${columnLetter(columnIndex)}${totalsRow}" s="${styleId}"><v>${cell.raw}</v></c>`;
                }
                if (!cell.text) {
                    return `<c r="${columnLetter(columnIndex)}${totalsRow}" s="${styleId}"/>`;
                }
                return (
                    `<c r="${columnLetter(columnIndex)}${totalsRow}" s="${styleId}" t="inlineStr">` +
                    `<is><t xml:space="preserve">${escapeXml(sanitizeText(cell.text))}</t></is></c>`
                );
            })
            .join("");
        rowsXml.push(`<row r="${totalsRow}">${cells}</row>`);
    }

    const lastRow = view.rows.length + 1 + (view.totals ? 1 : 0);
    const lastColumn = columnLetter(Math.max(0, columnCount - 1));
    const dimension = `A1:${lastColumn}${Math.max(1, lastRow)}`;

    const cols =
        `<cols>` +
        view.columns
            .map(
                (column, index) =>
                    `<col min="${index + 1}" max="${index + 1}" width="${pixelsToChars(column.width)}" customWidth="1"/>`
            )
            .join("") +
        "</cols>";

    const pane = options.freezeHeader
        ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
          '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>'
        : "";

    // The autofilter must exclude the totals row so Excel does not filter it.
    const autoFilterRange = `A1:${lastColumn}${view.rows.length + 1}`;
    const autoFilter =
        options.autoFilter && columnCount > 0
            ? `<autoFilter ref="${autoFilterRange}"/>`
            : "";

    // Element order in a worksheet part is fixed by the OOXML schema.
    const sheetXml =
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        `<worksheet xmlns="${SHEET_NS}" xmlns:r="${REL_NS}">` +
        `<dimension ref="${dimension}"/>` +
        `<sheetViews><sheetView tabSelected="1" workbookViewId="0">${pane}</sheetView></sheetViews>` +
        `<sheetFormatPr defaultRowHeight="15"/>` +
        (columnCount > 0 ? cols : "") +
        `<sheetData>${rowsXml.join("")}</sheetData>` +
        autoFilter +
        "</worksheet>";

    const sheetName = sanitizeText(options.sheetName).replace(/[\\/*?:[\]]/g, "").slice(0, 31) || "Data";

    const workbookXml =
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        `<workbook xmlns="${SHEET_NS}" xmlns:r="${REL_NS}">` +
        `<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
        "</workbook>";

    const workbookRels =
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        `<Relationships xmlns="${PKG_REL_NS}">` +
        `<Relationship Id="rId1" Type="${REL_NS}/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="${REL_NS}/styles" Target="styles.xml"/>` +
        "</Relationships>";

    const rootRels =
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        `<Relationships xmlns="${PKG_REL_NS}">` +
        `<Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/>` +
        "</Relationships>";

    const contentTypes =
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        `<Types xmlns="${CONTENT_TYPES_NS}">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        "</Types>";

    return zipSync(
        {
            "[Content_Types].xml": strToU8(contentTypes),
            "_rels/.rels": strToU8(rootRels),
            "xl/workbook.xml": strToU8(workbookXml),
            "xl/_rels/workbook.xml.rels": strToU8(workbookRels),
            "xl/styles.xml": strToU8(styles.toXml()),
            "xl/worksheets/sheet1.xml": strToU8(sheetXml)
        },
        { level: 6 }
    );
}
