import powerbi from "powerbi-visuals-api";
import ISandboxExtendedColorPalette = powerbi.extensibility.ISandboxExtendedColorPalette;

import { Alignment, ColumnModel } from "../data/types";
import { readOptionalBool, readOptionalFill } from "../settings/objectReader";
import { TableXLSettings } from "../settings/settingsModel";
import { mixColors } from "./conditionalFormatting";
import { presetSpec } from "./themePresets";

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
 * Folds the report theme, the chosen style preset and the format-pane settings
 * into the concrete style model used by both the grid and the exporters, so a
 * PDF or workbook always matches what is on screen.
 *
 * Colours follow the report theme unless the author set one explicitly. That is
 * what makes the visual sit on a themed page without looking foreign: Power BI
 * gives every visual the same foreground/background pair, and the neutrals are
 * derived from those two rather than hard-coded, so a dark or branded theme
 * comes out right instead of staying stubbornly light grey.
 *
 * In high-contrast mode every colour is replaced by a palette colour, as
 * required for accessibility certification.
 */
export function resolveStyle(
    settings: TableXLSettings,
    palette: ISandboxExtendedColorPalette,
    objects?: powerbi.DataViewObjects
): ResolvedStyle {
    const highContrast = !!palette.isHighContrast;
    const foreground = palette.foreground?.value ?? "#252423";
    const background = palette.background?.value ?? "#FFFFFF";
    const selected = palette.foregroundSelected?.value ?? foreground;
    const themeAccent = palette.hyperlink?.value ?? "#0078D4";

    const preset = presetSpec(settings.tableStyle.preset.value as string);

    /** A neutral derived from the theme's own two anchor colours. */
    const neutral = (amount: number): string => mixColors(background, foreground, amount);

    /**
     * An explicit choice in the format pane wins; otherwise the theme decides.
     * The settings model cannot express "unset", so the persisted objects are
     * consulted directly.
     */
    const chosen = (objectName: string, property: string): string | null =>
        readOptionalFill(objects, objectName, property);

    const pick = (objectName: string, property: string, themed: string): string =>
        chosen(objectName, property) ?? themed;

    const pickBool = (objectName: string, property: string, fromPreset: boolean): boolean =>
        readOptionalBool(objects, objectName, property) ?? fromPreset;

    const headerCard = settings.header;
    const valuesCard = settings.values;
    const gridCard = settings.grid;
    const totalsCard = settings.totals;

    const headerFontSize = headerCard.font.fontSize.value;
    const bodyFontSize = valuesCard.font.fontSize.value;

    const header: HeaderStyle = {
        fontFamily: headerCard.font.fontFamily.value,
        fontSize: headerFontSize,
        bold: readOptionalBool(objects, "header", "bold") ?? preset.headerBold,
        italic: !!headerCard.font.italic?.value,
        underline: !!headerCard.font.underline?.value,
        color: highContrast ? background : pick("header", "fontColor", foreground),
        background: highContrast
            ? foreground
            : pick(
                  "header",
                  "backColor",
                  preset.headerFillMix > 0 ? neutral(preset.headerFillMix) : background
              ),
        alignment: headerCard.alignment.value as Alignment,
        wrapText: headerCard.wrapText.value,
        sticky: headerCard.sticky.value,
        showBorder: pickBool("header", "showBorder", preset.headerBorder),
        borderColor: highContrast
            ? foreground
            : pick("header", "borderColor", neutral(preset.headerBorderMix)),
        borderWidth: headerCard.borderWidth.value
    };

    const body: BodyStyle = {
        fontFamily: valuesCard.font.fontFamily.value,
        fontSize: bodyFontSize,
        bold: !!valuesCard.font.bold?.value,
        italic: !!valuesCard.font.italic?.value,
        underline: false,
        color: highContrast ? foreground : pick("values", "fontColor", foreground),
        background: highContrast ? background : pick("values", "backColor", background),
        // Banding relies on subtle fills that high contrast cannot express.
        banded: highContrast ? false : pickBool("values", "banded", preset.banded),
        bandedBackground: pick("values", "bandedBackColor", neutral(preset.bandedMix || 0.04)),
        bandedColor: pick("values", "bandedFontColor", foreground),
        rowHeight: resolveRowHeight(
            valuesCard.density.value as string,
            valuesCard.rowHeight.value,
            bodyFontSize
        ),
        wrapText: valuesCard.wrapText.value,
        showRowNumbers: valuesCard.showRowNumbers.value,
        selectionColor: highContrast
            ? selected
            : pick("values", "selectionColor", mixColors(background, themeAccent, 0.22))
    };

    const grid: GridStyle = {
        showHorizontal: highContrast ? true : pickBool("grid", "showHorizontal", preset.showHorizontal),
        showVertical: highContrast ? true : pickBool("grid", "showVertical", preset.showVertical),
        color: highContrast ? foreground : pick("grid", "gridColor", neutral(preset.gridMix)),
        width: highContrast ? Math.max(1, gridCard.gridWidth.value) : gridCard.gridWidth.value,
        outline: pickBool("grid", "outline", preset.outline),
        outlineColor: highContrast
            ? foreground
            : pick("grid", "outlineColor", neutral(preset.headerBorderMix)),
        paddingX: gridCard.paddingX.value
    };

    const totals: TotalsStyle = {
        show: totalsCard.show.value,
        label: totalsCard.label.value || "Total",
        color: highContrast ? background : pick("totals", "fontColor", foreground),
        background: highContrast
            ? foreground
            : pick(
                  "totals",
                  "backColor",
                  preset.totalsFillMix > 0 ? neutral(preset.totalsFillMix) : background
              ),
        bold: totalsCard.bold.value
    };

    return {
        header,
        body,
        grid,
        totals,
        highContrast,
        accent: highContrast
            ? foreground
            : pick("filtering", "indicatorColor", themeAccent)
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
