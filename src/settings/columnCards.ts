import powerbi from "powerbi-visuals-api";
import DataViewMetadataColumn = powerbi.DataViewMetadataColumn;
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import {
    AggregationKind,
    Alignment,
    ColumnFormatting,
    ColumnKind,
    ColumnModel,
    ConditionalFormatting,
    ConditionalMode,
    ConditionalTarget,
    RuleOperator
} from "../data/types";
import {
    readBool,
    readEnum,
    readNumber,
    readOptionalFill,
    readOptionalNumber,
    readText
} from "./objectReader";

export const COLUMN_OBJECT = "columnFormatting";
export const CONDITIONAL_OBJECT = "conditionalFormatting";
export const TOTALS_OBJECT = "totals";

const ALIGNMENTS: readonly Alignment[] = ["auto", "left", "center", "right"];
const MODES: readonly ConditionalMode[] = ["none", "colorScale", "dataBar", "rules"];
const TARGETS: readonly ConditionalTarget[] = ["background", "font"];
const OPERATORS: readonly RuleOperator[] = [
    "none", "eq", "ne", "gt", "gte", "lt", "lte", "contains", "startsWith", "isBlank"
];
const AGGREGATIONS: readonly AggregationKind[] = [
    "none", "sum", "avg", "min", "max", "count", "countDistinct"
];

export const DEFAULT_SCALE_MIN = "#DEEBF7";
export const DEFAULT_SCALE_MID = "#FFFFFF";
export const DEFAULT_SCALE_MAX = "#2E75B6";
export const DEFAULT_BAR_POSITIVE = "#4A90D9";
export const DEFAULT_BAR_NEGATIVE = "#D9534F";
export const DEFAULT_RULE_COLOR = "#FFC000";

export function readColumnFormatting(column: DataViewMetadataColumn): ColumnFormatting {
    const objects = column.objects;
    return {
        hide: readBool(objects, COLUMN_OBJECT, "hide", false),
        userSelectable: readBool(objects, COLUMN_OBJECT, "userSelectable", false),
        width: readOptionalNumber(objects, COLUMN_OBJECT, "width"),
        alignment: readEnum(objects, COLUMN_OBJECT, "alignment", ALIGNMENTS, "auto"),
        displayUnits: readNumber(objects, COLUMN_OBJECT, "displayUnits", 0),
        decimalPlaces: readOptionalNumber(objects, COLUMN_OBJECT, "decimalPlaces"),
        wrapText: readBool(objects, COLUMN_OBJECT, "wrapText", false),
        fontColor: readOptionalFill(objects, COLUMN_OBJECT, "fontColor"),
        backColor: readOptionalFill(objects, COLUMN_OBJECT, "backColor")
    };
}

export function readConditionalFormatting(column: DataViewMetadataColumn): ConditionalFormatting {
    const objects = column.objects;
    const rules = [1, 2, 3].map((slot) => ({
        op: readEnum(objects, CONDITIONAL_OBJECT, `rule${slot}Op`, OPERATORS, "none"),
        value: readText(objects, CONDITIONAL_OBJECT, `rule${slot}Value`, ""),
        color:
            readOptionalFill(objects, CONDITIONAL_OBJECT, `rule${slot}Color`) ??
            DEFAULT_RULE_COLOR
    }));
    return {
        mode: readEnum(objects, CONDITIONAL_OBJECT, "mode", MODES, "none"),
        target: readEnum(objects, CONDITIONAL_OBJECT, "target", TARGETS, "background"),
        minColor: readOptionalFill(objects, CONDITIONAL_OBJECT, "minColor") ?? DEFAULT_SCALE_MIN,
        midColor: readOptionalFill(objects, CONDITIONAL_OBJECT, "midColor") ?? DEFAULT_SCALE_MID,
        maxColor: readOptionalFill(objects, CONDITIONAL_OBJECT, "maxColor") ?? DEFAULT_SCALE_MAX,
        useMid: readBool(objects, CONDITIONAL_OBJECT, "useMid", false),
        dataBarColor:
            readOptionalFill(objects, CONDITIONAL_OBJECT, "dataBarColor") ?? DEFAULT_BAR_POSITIVE,
        dataBarNegativeColor:
            readOptionalFill(objects, CONDITIONAL_OBJECT, "dataBarNegativeColor") ??
            DEFAULT_BAR_NEGATIVE,
        dataBarShowValue: readBool(objects, CONDITIONAL_OBJECT, "dataBarShowValue", true),
        rules
    };
}

export function readTotalsAggregation(
    column: DataViewMetadataColumn,
    kind: ColumnKind
): AggregationKind {
    const fallback: AggregationKind = kind === "number" ? "sum" : "none";
    return readEnum(column.objects, TOTALS_OBJECT, "aggregation", AGGREGATIONS, fallback);
}

/** Per-column slices address a single column via a metadata selector. */
function selectorFor(column: ColumnModel): powerbi.data.Selector {
    return { metadata: column.queryName } as powerbi.data.Selector;
}

function colorSlice(
    name: string,
    displayName: string,
    column: ColumnModel,
    value: string
): formattingSettings.ColorPicker {
    return new formattingSettings.ColorPicker({
        name,
        displayName,
        selector: selectorFor(column),
        value: { value }
    });
}

/**
 * One expandable group per column, so column settings live under a single
 * "Specific column" card the way the native table's per-column options do.
 */
export function buildColumnFormattingGroups(columns: ColumnModel[]): formattingSettings.Group[] {
    return columns.map((column) => {
        const slices: formattingSettings.Slice[] = [
            new formattingSettings.ToggleSwitch({
                name: "hide",
                displayName: "Hide column",
                selector: selectorFor(column),
                value: column.fmt.hide
            }),
            new formattingSettings.ToggleSwitch({
                name: "userSelectable",
                displayName: "Reader can choose this column",
                selector: selectorFor(column),
                value: column.fmt.userSelectable
            }),
            new formattingSettings.NumUpDown({
                name: "width",
                displayName: "Width (px)",
                selector: selectorFor(column),
                value: column.fmt.width ?? 0,
                options: {
                    minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 },
                    maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 2000 }
                }
            }),
            new formattingSettings.AutoDropdown({
                name: "alignment",
                displayName: "Alignment",
                selector: selectorFor(column),
                value: column.fmt.alignment
            }),
            new formattingSettings.ToggleSwitch({
                name: "wrapText",
                displayName: "Wrap text",
                selector: selectorFor(column),
                value: column.fmt.wrapText
            }),
            colorSlice("fontColor", "Text color", column, column.fmt.fontColor ?? "#000000"),
            colorSlice("backColor", "Background color", column, column.fmt.backColor ?? "#FFFFFF")
        ];

        // Display units and precision are meaningless outside numeric columns.
        if (column.kind === "number") {
            slices.splice(
                3,
                0,
                new formattingSettings.AutoDropdown({
                    name: "displayUnits",
                    displayName: "Display units",
                    selector: selectorFor(column),
                    value: column.fmt.displayUnits
                }),
                new formattingSettings.NumUpDown({
                    name: "decimalPlaces",
                    displayName: "Decimal places",
                    selector: selectorFor(column),
                    value: column.fmt.decimalPlaces ?? 0,
                    options: {
                        minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 },
                        maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 15 }
                    }
                })
            );
        }

        return new formattingSettings.Group({
            name: `${COLUMN_OBJECT}_${column.key}`,
            displayName: column.displayName,
            collapsible: true,
            slices
        });
    });
}

/** One group per column holding that column's conditional formatting rules. */
export function buildConditionalFormattingGroups(columns: ColumnModel[]): formattingSettings.Group[] {
    return columns.map((column) => {
        const cf = column.cf;
        const slices: formattingSettings.Slice[] = [
            new formattingSettings.AutoDropdown({
                name: "mode",
                displayName: "Format by",
                selector: selectorFor(column),
                value: cf.mode
            })
        ];

        if (cf.mode === "colorScale") {
            slices.push(
                new formattingSettings.AutoDropdown({
                    name: "target",
                    displayName: "Apply to",
                    selector: selectorFor(column),
                    value: cf.target
                }),
                colorSlice("minColor", "Minimum color", column, cf.minColor),
                new formattingSettings.ToggleSwitch({
                    name: "useMid",
                    displayName: "Add middle color",
                    selector: selectorFor(column),
                    value: cf.useMid
                })
            );
            if (cf.useMid) {
                slices.push(colorSlice("midColor", "Center color", column, cf.midColor));
            }
            slices.push(colorSlice("maxColor", "Maximum color", column, cf.maxColor));
        } else if (cf.mode === "dataBar") {
            slices.push(
                colorSlice("dataBarColor", "Positive bar color", column, cf.dataBarColor),
                colorSlice(
                    "dataBarNegativeColor",
                    "Negative bar color",
                    column,
                    cf.dataBarNegativeColor
                ),
                new formattingSettings.ToggleSwitch({
                    name: "dataBarShowValue",
                    displayName: "Show value with bar",
                    selector: selectorFor(column),
                    value: cf.dataBarShowValue
                })
            );
        } else if (cf.mode === "rules") {
            slices.push(
                new formattingSettings.AutoDropdown({
                    name: "target",
                    displayName: "Apply to",
                    selector: selectorFor(column),
                    value: cf.target
                })
            );
            cf.rules.forEach((rule, i) => {
                const slot = i + 1;
                slices.push(
                    new formattingSettings.AutoDropdown({
                        name: `rule${slot}Op`,
                        displayName: `Rule ${slot} condition`,
                        selector: selectorFor(column),
                        value: rule.op
                    })
                );
                // Only ask for a comparison value once a real operator is chosen.
                if (rule.op !== "none") {
                    if (rule.op !== "isBlank") {
                        slices.push(
                            new formattingSettings.TextInput({
                                name: `rule${slot}Value`,
                                displayName: `Rule ${slot} value`,
                                placeholder: column.kind === "number" ? "0" : "value",
                                selector: selectorFor(column),
                                value: rule.value
                            })
                        );
                    }
                    slices.push(
                        colorSlice(`rule${slot}Color`, `Rule ${slot} color`, column, rule.color)
                    );
                }
            });
        }

        return new formattingSettings.Group({
            name: `${CONDITIONAL_OBJECT}_${column.key}`,
            displayName: column.displayName,
            collapsible: true,
            slices
        });
    });
}

/** Per-column aggregation pickers shown inside the totals card. */
export function buildTotalsGroups(columns: ColumnModel[]): formattingSettings.Group[] {
    return columns.map(
        (column) =>
            new formattingSettings.Group({
                name: `${TOTALS_OBJECT}_${column.key}`,
                displayName: column.displayName,
                collapsible: true,
                slices: [
                    new formattingSettings.AutoDropdown({
                        name: "aggregation",
                        displayName: "Aggregation",
                        selector: selectorFor(column),
                        value: column.totalsAgg
                    })
                ]
            })
    );
}
