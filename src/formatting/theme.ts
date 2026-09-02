import powerbi from "powerbi-visuals-api";
import ISandboxExtendedColorPalette = powerbi.extensibility.ISandboxExtendedColorPalette;

import { Alignment, ColumnModel } from "../data/types";
import { TableXLSettings } from "../settings/settingsModel";

export interface TextStyle {
    fontFamily: string;
    fontSize: number;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    color: string;
    background: string;
}

export interface HeaderStyle extends TextStyle {
    alignment: Alignment;
    wrapText: boolean;
    sticky: boolean;
    showBorder: boolean;
    borderColor: string;
    borderWidth: number;
}

export interface BodyStyle extends TextStyle {
    banded: boolean;
    bandedBackground: string;
    bandedColor: string;
    rowHeight: number;
    wrapText: boolean;
    showRowNumbers: boolean;
    selectionColor: string;
}

export interface GridStyle {
    showHorizontal: boolean;
    showVertical: boolean;
    color: string;
    width: number;
    outline: boolean;
    outlineColor: string;
    paddingX: number;
}

export interface TotalsStyle {
    show: boolean;
    label: string;
    color: string;
    background: string;
    bold: boolean;
}

export interface ResolvedStyle {
    header: HeaderStyle;
    body: BodyStyle;
    grid: GridStyle;
    totals: TotalsStyle;
    highContrast: boolean;
    /** Colour used for filter/sort affordances and focus rings. */
    accent: string;
}

const DENSITY_HEIGHT: { [key: string]: number } = {
    compact: 22,
    normal: 30,
    comfortable: 40
};

/**
 * Row height follows the density preset unless an explicit height is set, and
 * never drops below what the chosen font can legibly occupy.
 */
function resolveRowHeight(density: string, explicit: number, fontSize: number): number {
    const base = DENSITY_HEIGHT[density] ?? DENSITY_HEIGHT.normal;
    const height = explicit > 0 ? explicit : base;
    return Math.max(height, Math.ceil(fontSize * 1.6) + 4);
}

/**
 * Folds the format-pane settings and the host palette into the concrete style
 * model used by both the grid and the exporters, so a PDF or workbook always
 * matches what is on screen.
 *
 * In high-contrast mode every user-chosen colour is replaced by a palette
 * colour, as required for accessibility certification.
 */
export function resolveStyle(
    settings: TableXLSettings,
    palette: ISandboxExtendedColorPalette
): ResolvedStyle {
    const highContrast = !!palette.isHighContrast;
    const foreground = palette.foreground?.value ?? "#000000";
    const background = palette.background?.value ?? "#FFFFFF";
    const selected = palette.foregroundSelected?.value ?? foreground;

    const headerCard = settings.header;
    const valuesCard = settings.values;
    const gridCard = settings.grid;
    const totalsCard = settings.totals;

    const headerFontSize = headerCard.font.fontSize.value;
    const bodyFontSize = valuesCard.font.fontSize.value;

    const header: HeaderStyle = {
        fontFamily: headerCard.font.fontFamily.value,
        fontSize: headerFontSize,
        bold: !!headerCard.font.bold?.value,
        italic: !!headerCard.font.italic?.value,
        underline: !!headerCard.font.underline?.value,
        color: highContrast ? background : headerCard.fontColor.value.value,
        background: highContrast ? foreground : headerCard.backColor.value.value,
        alignment: headerCard.alignment.value as Alignment,
        wrapText: headerCard.wrapText.value,
        sticky: headerCard.sticky.value,
        showBorder: headerCard.showBorder.value,
        borderColor: highContrast ? foreground : headerCard.borderColor.value.value,
        borderWidth: headerCard.borderWidth.value
    };

    const body: BodyStyle = {
        fontFamily: valuesCard.font.fontFamily.value,
        fontSize: bodyFontSize,
        bold: !!valuesCard.font.bold?.value,
        italic: !!valuesCard.font.italic?.value,
        underline: false,
        color: highContrast ? foreground : valuesCard.fontColor.value.value,
        background: highContrast ? background : valuesCard.backColor.value.value,
        // Banding relies on subtle fills that high contrast cannot express.
        banded: highContrast ? false : valuesCard.banded.value,
        bandedBackground: valuesCard.bandedBackColor.value.value,
        bandedColor: valuesCard.bandedFontColor.value.value,
        rowHeight: resolveRowHeight(
            valuesCard.density.value as string,
            valuesCard.rowHeight.value,
            bodyFontSize
        ),
        wrapText: valuesCard.wrapText.value,
        showRowNumbers: valuesCard.showRowNumbers.value,
        selectionColor: highContrast ? selected : valuesCard.selectionColor.value.value
    };

    const grid: GridStyle = {
        showHorizontal: highContrast ? true : gridCard.showHorizontal.value,
        showVertical: highContrast ? true : gridCard.showVertical.value,
        color: highContrast ? foreground : gridCard.gridColor.value.value,
        width: highContrast ? Math.max(1, gridCard.gridWidth.value) : gridCard.gridWidth.value,
        outline: gridCard.outline.value,
        outlineColor: highContrast ? foreground : gridCard.outlineColor.value.value,
        paddingX: gridCard.paddingX.value
    };

    const totals: TotalsStyle = {
        show: totalsCard.show.value,
        label: totalsCard.label.value || "Total",
        color: highContrast ? background : totalsCard.fontColor.value.value,
        background: highContrast ? foreground : totalsCard.backColor.value.value,
        bold: totalsCard.bold.value
    };

    return {
        header,
        body,
        grid,
        totals,
        highContrast,
        accent: highContrast ? foreground : settings.filtering.indicatorColor.value.value
    };
}

/** Numeric columns right-align by default, as in Excel. */
export function effectiveAlignment(column: ColumnModel, headerAlignment?: Alignment): Alignment {
    const explicit = column.fmt.alignment;
    if (explicit && explicit !== "auto") {
        return explicit;
    }
    if (headerAlignment && headerAlignment !== "auto") {
        return headerAlignment;
    }
    return column.kind === "number" ? "right" : "left";
}
