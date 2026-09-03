import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

function numberRange(min: number, max: number): powerbi.visuals.NumUpDownFormat {
    return {
        minValue: { type: powerbi.visuals.ValidatorType.Min, value: min },
        maxValue: { type: powerbi.visuals.ValidatorType.Max, value: max }
    };
}

class TableStyleCard extends formattingSettings.SimpleCard {
    name = "tableStyle";
    displayName = "Style preset";

    preset = new formattingSettings.AutoDropdown({
        name: "preset",
        displayName: "Style",
        value: "default"
    });

    slices = [this.preset];
}

class HeaderCard extends formattingSettings.SimpleCard {
    name = "header";
    displayName = "Column headers";

    font = new formattingSettings.FontControl({
        name: "headerFont",
        displayName: "Font",
        fontFamily: new formattingSettings.FontPicker({
            name: "fontFamily",
            value: "Segoe UI, wf_segoe-ui_normal, helvetica, arial, sans-serif"
        }),
        fontSize: new formattingSettings.NumUpDown({
            name: "fontSize",
            displayName: "Text size",
            value: 10,
            options: numberRange(6, 40)
        }),
        bold: new formattingSettings.ToggleSwitch({ name: "bold", value: true }),
        italic: new formattingSettings.ToggleSwitch({ name: "italic", value: false }),
        underline: new formattingSettings.ToggleSwitch({ name: "underline", value: false })
    });

    fontColor = new formattingSettings.ColorPicker({
        name: "fontColor",
        displayName: "Text color",
        value: { value: "#252423" }
    });

    backColor = new formattingSettings.ColorPicker({
        name: "backColor",
        displayName: "Background color",
        value: { value: "#FFFFFF" }
    });

    alignment = new formattingSettings.AutoDropdown({
        name: "alignment",
        displayName: "Alignment",
        value: "auto"
    });

    wrapText = new formattingSettings.ToggleSwitch({
        name: "wrapText",
        displayName: "Wrap text",
        value: true
    });

    sticky = new formattingSettings.ToggleSwitch({
        name: "sticky",
        displayName: "Freeze header row",
        value: true
    });

    showBorder = new formattingSettings.ToggleSwitch({
        name: "showBorder",
        displayName: "Bottom border",
        value: true
    });

    borderColor = new formattingSettings.ColorPicker({
        name: "borderColor",
        displayName: "Border color",
        value: { value: "#C8C6C4" }
    });

    borderWidth = new formattingSettings.NumUpDown({
        name: "borderWidth",
        displayName: "Border width",
        value: 1,
        options: numberRange(0, 10)
    });

    slices = [
        this.font,
        this.fontColor,
        this.backColor,
        this.alignment,
        this.wrapText,
        this.sticky,
        this.showBorder,
        this.borderColor,
        this.borderWidth
    ];
}

class ValuesCard extends formattingSettings.SimpleCard {
    name = "values";
    displayName = "Values";

    font = new formattingSettings.FontControl({
        name: "valuesFont",
        displayName: "Font",
        fontFamily: new formattingSettings.FontPicker({
            name: "fontFamily",
            value: "Segoe UI, wf_segoe-ui_normal, helvetica, arial, sans-serif"
        }),
        fontSize: new formattingSettings.NumUpDown({
            name: "fontSize",
            displayName: "Text size",
            value: 10,
            options: numberRange(6, 40)
        }),
        bold: new formattingSettings.ToggleSwitch({ name: "bold", value: false }),
        italic: new formattingSettings.ToggleSwitch({ name: "italic", value: false })
    });

    fontColor = new formattingSettings.ColorPicker({
        name: "fontColor",
        displayName: "Text color",
        value: { value: "#252423" }
    });

    backColor = new formattingSettings.ColorPicker({
        name: "backColor",
        displayName: "Background color",
        value: { value: "#FFFFFF" }
    });

    banded = new formattingSettings.ToggleSwitch({
        name: "banded",
        displayName: "Alternate row colors",
        value: false
    });

    bandedBackColor = new formattingSettings.ColorPicker({
        name: "bandedBackColor",
        displayName: "Alternate background",
        value: { value: "#FAF9F8" }
    });

    bandedFontColor = new formattingSettings.ColorPicker({
        name: "bandedFontColor",
        displayName: "Alternate text color",
        value: { value: "#252423" }
    });

    density = new formattingSettings.AutoDropdown({
        name: "density",
        displayName: "Row density",
        value: "normal"
    });

    rowHeight = new formattingSettings.NumUpDown({
        name: "rowHeight",
        displayName: "Row height (px)",
        value: 0,
        options: numberRange(0, 200)
    });

    wrapText = new formattingSettings.ToggleSwitch({
        name: "wrapText",
        displayName: "Wrap text",
        value: false
    });

    showRowNumbers = new formattingSettings.ToggleSwitch({
        name: "showRowNumbers",
        displayName: "Show row numbers",
        value: false
    });

    selectionColor = new formattingSettings.ColorPicker({
        name: "selectionColor",
        displayName: "Selected row color",
        value: { value: "#CCE4F7" }
    });

    slices = [
        this.font,
        this.fontColor,
        this.backColor,
        this.banded,
        this.bandedBackColor,
        this.bandedFontColor,
        this.density,
        this.rowHeight,
        this.wrapText,
        this.showRowNumbers,
        this.selectionColor
    ];
}

class GridCard extends formattingSettings.SimpleCard {
    name = "grid";
    displayName = "Gridlines";

    showHorizontal = new formattingSettings.ToggleSwitch({
        name: "showHorizontal",
        displayName: "Horizontal gridlines",
        value: true
    });

    showVertical = new formattingSettings.ToggleSwitch({
        name: "showVertical",
        displayName: "Vertical gridlines",
        value: false
    });

    gridColor = new formattingSettings.ColorPicker({
        name: "gridColor",
        displayName: "Gridline color",
        value: { value: "#E1DFDD" }
    });

    gridWidth = new formattingSettings.NumUpDown({
        name: "gridWidth",
        displayName: "Gridline width",
        value: 1,
        options: numberRange(0, 5)
    });

    outline = new formattingSettings.ToggleSwitch({
        name: "outline",
        displayName: "Outline",
        value: false
    });

    outlineColor = new formattingSettings.ColorPicker({
        name: "outlineColor",
        displayName: "Outline color",
        value: { value: "#C8C6C4" }
    });

    paddingX = new formattingSettings.NumUpDown({
        name: "paddingX",
        displayName: "Horizontal cell padding",
        value: 8,
        options: numberRange(0, 40)
    });

    slices = [
        this.showHorizontal,
        this.showVertical,
        this.gridColor,
        this.gridWidth,
        this.outline,
        this.outlineColor,
        this.paddingX
    ];
}

class FilteringCard extends formattingSettings.SimpleCard {
    name = "filtering";
    displayName = "Column filters";

    enabled = new formattingSettings.ToggleSwitch({
        name: "enabled",
        displayName: "Enable filter buttons",
        value: true
    });

    topLevelSlice = this.enabled;

    scope = new formattingSettings.AutoDropdown({
        name: "scope",
        displayName: "Filter scope",
        value: "local"
    });

    showSearch = new formattingSettings.ToggleSwitch({
        name: "showSearch",
        displayName: "Search box in filter menu",
        value: true
    });

    showConditions = new formattingSettings.ToggleSwitch({
        name: "showConditions",
        displayName: "Condition filters",
        value: true
    });

    indicatorColor = new formattingSettings.ColorPicker({
        name: "indicatorColor",
        displayName: "Active filter color",
        value: { value: "#0078D4" }
    });

    enableSorting = new formattingSettings.ToggleSwitch({
        name: "enableSorting",
        displayName: "Enable column sorting",
        value: true
    });

    slices = [
        this.scope,
        this.showSearch,
        this.showConditions,
        this.indicatorColor,
        this.enableSorting
    ];
}

class ViewsCard extends formattingSettings.SimpleCard {
    name = "views";
    displayName = "Views (worksheets)";

    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Enable views",
        value: false
    });

    topLevelSlice = this.show;

    maxViews = new formattingSettings.NumUpDown({
        name: "maxViews",
        displayName: "Maximum views",
        value: 5,
        options: numberRange(1, 20)
    });

    maxColumns = new formattingSettings.NumUpDown({
        name: "maxColumns",
        displayName: "Maximum columns per view",
        value: 0,
        options: numberRange(0, 60)
    });

    lockViews = new formattingSettings.ToggleSwitch({
        name: "lockViews",
        displayName: "Lock views",
        value: false
    });

    showColumnChooser = new formattingSettings.ToggleSwitch({
        name: "showColumnChooser",
        displayName: "Show column chooser",
        value: true
    });

    slices = [this.maxViews, this.maxColumns, this.lockViews, this.showColumnChooser];
}

class TotalsCard extends formattingSettings.CompositeCard {
    name = "totals";
    displayName = "Totals row";

    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show totals",
        value: false
    });

    topLevelSlice = this.show;

    label = new formattingSettings.TextInput({
        name: "label",
        displayName: "Label",
        placeholder: "Total",
        value: "Total"
    });

    fontColor = new formattingSettings.ColorPicker({
        name: "fontColor",
        displayName: "Text color",
        value: { value: "#252423" }
    });

    backColor = new formattingSettings.ColorPicker({
        name: "backColor",
        displayName: "Background color",
        value: { value: "#F3F2F1" }
    });

    bold = new formattingSettings.ToggleSwitch({
        name: "bold",
        displayName: "Bold",
        value: true
    });

    appearance = new formattingSettings.Group({
        name: "totalsAppearance",
        displayName: "Appearance",
        slices: [this.label, this.fontColor, this.backColor, this.bold]
    });

    /** Per-column aggregation groups are appended at getFormattingModel time. */
    groups: formattingSettings.Group[] = [this.appearance];
}

class ExportCard extends formattingSettings.CompositeCard {
    name = "exportSettings";
    displayName = "Export & print";

    showToolbar = new formattingSettings.ToggleSwitch({
        name: "showToolbar",
        displayName: "Show toolbar",
        value: true
    });

    topLevelSlice = this.showToolbar;

    enableCsv = new formattingSettings.ToggleSwitch({
        name: "enableCsv",
        displayName: "CSV",
        value: true
    });

    enableXlsx = new formattingSettings.ToggleSwitch({
        name: "enableXlsx",
        displayName: "Excel (.xlsx)",
        value: true
    });

    enablePdf = new formattingSettings.ToggleSwitch({
        name: "enablePdf",
        displayName: "PDF / print",
        value: true
    });

    fileName = new formattingSettings.TextInput({
        name: "fileName",
        displayName: "File name",
        placeholder: "table-export",
        value: "table-export"
    });

    rawValues = new formattingSettings.ToggleSwitch({
        name: "rawValues",
        displayName: "Export raw values",
        value: false
    });

    buttons = new formattingSettings.Group({
        name: "exportButtons",
        displayName: "Buttons",
        slices: [this.enableCsv, this.enableXlsx, this.enablePdf, this.fileName, this.rawValues]
    });

    pdfTitle = new formattingSettings.TextInput({
        name: "pdfTitle",
        displayName: "PDF title",
        placeholder: "(none)",
        value: ""
    });

    pdfOrientation = new formattingSettings.AutoDropdown({
        name: "pdfOrientation",
        displayName: "Orientation",
        value: "auto"
    });

    pdfPageSize = new formattingSettings.AutoDropdown({
        name: "pdfPageSize",
        displayName: "Page size",
        value: "a4"
    });

    pdfFitToWidth = new formattingSettings.ToggleSwitch({
        name: "pdfFitToWidth",
        displayName: "Fit table to page width",
        value: true
    });

    pdfRepeatHeader = new formattingSettings.ToggleSwitch({
        name: "pdfRepeatHeader",
        displayName: "Repeat header on every page",
        value: true
    });

    pdfPageNumbers = new formattingSettings.ToggleSwitch({
        name: "pdfPageNumbers",
        displayName: "Page numbers",
        value: true
    });

    pdfGroup = new formattingSettings.Group({
        name: "pdfGroup",
        displayName: "PDF layout",
        collapsible: true,
        slices: [
            this.pdfTitle,
            this.pdfOrientation,
            this.pdfPageSize,
            this.pdfFitToWidth,
            this.pdfRepeatHeader,
            this.pdfPageNumbers
        ]
    });

    xlsxAutoFilter = new formattingSettings.ToggleSwitch({
        name: "xlsxAutoFilter",
        displayName: "Excel AutoFilter",
        value: true
    });

    xlsxFreezeHeader = new formattingSettings.ToggleSwitch({
        name: "xlsxFreezeHeader",
        displayName: "Freeze header in Excel",
        value: true
    });

    xlsxGroup = new formattingSettings.Group({
        name: "xlsxGroup",
        displayName: "Excel layout",
        collapsible: true,
        slices: [this.xlsxAutoFilter, this.xlsxFreezeHeader]
    });

    groups: formattingSettings.Group[] = [this.buttons, this.pdfGroup, this.xlsxGroup];
}

/**
 * Visual-level formatting settings. Per-column cards are appended in
 * getFormattingModel because the formatting service only hydrates
 * visual-level objects, never per-column metadata objects.
 */
export class TableXLSettings extends formattingSettings.Model {
    tableStyle = new TableStyleCard();
    header = new HeaderCard();
    values = new ValuesCard();
    grid = new GridCard();
    filtering = new FilteringCard();
    views = new ViewsCard();
    totals = new TotalsCard();
    exportSettings = new ExportCard();

    cards: formattingSettings.Cards[] = [
        this.tableStyle,
        this.header,
        this.values,
        this.grid,
        this.filtering,
        this.views,
        this.totals,
        this.exportSettings
    ];

    /** The static card list, used to rebuild `cards` on each format-pane build. */
    baseCards(): formattingSettings.Cards[] {
        return [
            this.tableStyle,
            this.header,
            this.values,
            this.grid,
            this.filtering,
            this.views,
            this.totals,
            this.exportSettings
        ];
    }
}

export type { TableStyleCard, HeaderCard, ValuesCard, GridCard, FilteringCard, ViewsCard, TotalsCard, ExportCard };
