/**
 * Table style presets, mirroring the Style presets on Power BI's own table.
 *
 * A preset supplies *defaults* only. Anything the report author sets explicitly
 * in the format pane still wins, so choosing a preset never destroys a
 * deliberate choice.
 */
export type StylePreset =
    | "none"
    | "default"
    | "minimal"
    | "boldHeader"
    | "alternating"
    | "contrast";

export interface PresetSpec {
    /** 0 = no fill (use the table background). Otherwise a mix toward foreground. */
    headerFillMix: number;
    headerBold: boolean;
    headerBorder: boolean;
    headerBorderMix: number;
    banded: boolean;
    bandedMix: number;
    showHorizontal: boolean;
    showVertical: boolean;
    gridMix: number;
    outline: boolean;
    totalsFillMix: number;
}

/*
 * The native table draws almost nothing: a rule under the header, faint row
 * separators, no vertical lines and no outline. Matching that is what makes a
 * custom visual sit on a report page without looking foreign.
 */
const PRESETS: { [K in StylePreset]: PresetSpec } = {
    none: {
        headerFillMix: 0,
        headerBold: true,
        headerBorder: false,
        headerBorderMix: 0.2,
        banded: false,
        bandedMix: 0,
        showHorizontal: false,
        showVertical: false,
        gridMix: 0.12,
        outline: false,
        totalsFillMix: 0
    },
    default: {
        headerFillMix: 0,
        headerBold: true,
        headerBorder: true,
        headerBorderMix: 0.28,
        banded: false,
        bandedMix: 0.04,
        showHorizontal: true,
        showVertical: false,
        gridMix: 0.12,
        outline: false,
        totalsFillMix: 0
    },
    minimal: {
        headerFillMix: 0,
        headerBold: true,
        headerBorder: true,
        headerBorderMix: 0.2,
        banded: false,
        bandedMix: 0,
        showHorizontal: false,
        showVertical: false,
        gridMix: 0.1,
        outline: false,
        totalsFillMix: 0
    },
    boldHeader: {
        headerFillMix: 0.08,
        headerBold: true,
        headerBorder: true,
        headerBorderMix: 0.32,
        banded: false,
        bandedMix: 0.04,
        showHorizontal: true,
        showVertical: false,
        gridMix: 0.12,
        outline: false,
        totalsFillMix: 0.06
    },
    alternating: {
        headerFillMix: 0.06,
        headerBold: true,
        headerBorder: true,
        headerBorderMix: 0.28,
        banded: true,
        bandedMix: 0.045,
        showHorizontal: false,
        showVertical: false,
        gridMix: 0.12,
        outline: false,
        totalsFillMix: 0.06
    },
    contrast: {
        headerFillMix: 0.16,
        headerBold: true,
        headerBorder: true,
        headerBorderMix: 0.4,
        banded: true,
        bandedMix: 0.08,
        showHorizontal: true,
        showVertical: true,
        gridMix: 0.2,
        outline: true,
        totalsFillMix: 0.16
    }
};

export function presetSpec(preset: string): PresetSpec {
    return PRESETS[(preset as StylePreset) in PRESETS ? (preset as StylePreset) : "default"];
}
