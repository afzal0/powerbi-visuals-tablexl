import { SortEntry } from "../filtering/filterEngine";
import { FilterMap } from "../filtering/filterState";
import {
    AggregationKind,
    Alignment,
    ConditionalFormatting
} from "../data/types";

/** Payload version stored in general.savedState. v1 was a bare FilterMap. */
export const WORKSPACE_VERSION = 2;

export const DEFAULT_VIEW_NAME = "Sheet 1";
export const MAX_VIEW_NAME_LENGTH = 32;

/**
 * Per-column formatting captured into a view. Every field is optional: an
 * absent field means "inherit whatever the format pane says for this column".
 *
 * Only per-column formatting is captured. Visual-level settings such as row
 * density are deliberately excluded — they are report-author decisions, and
 * letting a view silently override the format pane makes the pane impossible
 * to reason about while editing.
 */
export interface ViewColumnFormat {
    width?: number;
    alignment?: Alignment;
    wrapText?: boolean;
    fontColor?: string | null;
    backColor?: string | null;
    cf?: ConditionalFormatting;
    totalsAgg?: AggregationKind;
}

export interface ViewDef {
    id: string;
    name: string;
    /** Pool columns switched on in this view, by ColumnModel.key (queryName). */
    columns: string[];
    sort: SortEntry[];
    filters: FilterMap;
    /** Present only once the user has pinned formatting to this view. */
    fmt?: { [columnKey: string]: ViewColumnFormat };
}

export interface Workspace {
    v: typeof WORKSPACE_VERSION;
    /** ViewDef.id of the active view; falls back to views[0] when unknown. */
    active: string;
    /** Always at least one view. */
    views: ViewDef[];
}

export type ViewCommand =
    | { type: "activate"; id: string }
    | { type: "create"; copyActive: boolean }
    | { type: "rename"; id: string; name: string }
    | { type: "delete"; id: string }
    | { type: "setColumns"; columns: string[] }
    | { type: "setSort"; sort: SortEntry[] }
    | { type: "setFilters"; filters: FilterMap }
    | { type: "setWidth"; columnKey: string; width: number }
    | { type: "pinFormatting"; on: boolean };

/** Author-controlled limits, read from the `views` format-pane card. */
export interface ViewLimits {
    enabled: boolean;
    maxViews: number;
    /** 0 means no cap on how many pool columns a view may show. */
    maxColumns: number;
    /** Viewers may switch views but not create, rename or delete them. */
    locked: boolean;
    showColumnChooser: boolean;
}

/**
 * Ids are minted from a counter rather than a clock so that the same sequence
 * of user actions always produces the same payload, which keeps the "is this
 * our own state echoing back?" comparison in visual.ts meaningful.
 */
let idCounter = 0;

export function mintViewId(existing: ViewDef[]): string {
    const taken = new Set(existing.map((view) => view.id));
    let candidate: string;
    do {
        idCounter++;
        candidate = `v${idCounter}`;
    } while (taken.has(candidate));
    return candidate;
}

export function emptyView(id: string, name: string, columns: string[]): ViewDef {
    return { id, name, columns: columns.slice().sort(), sort: [], filters: {} };
}

export function emptyWorkspace(columns: string[] = []): Workspace {
    const view = emptyView("v1", DEFAULT_VIEW_NAME, columns);
    idCounter = Math.max(idCounter, 1);
    return { v: WORKSPACE_VERSION, active: view.id, views: [view] };
}

export function activeView(workspace: Workspace): ViewDef {
    return (
        workspace.views.find((view) => view.id === workspace.active) ?? workspace.views[0]
    );
}

/** A name that does not collide with an existing view. */
export function uniqueViewName(views: ViewDef[], desired: string, skipId?: string): string {
    const base = desired.trim().slice(0, MAX_VIEW_NAME_LENGTH) || DEFAULT_VIEW_NAME;
    const taken = new Set(
        views.filter((view) => view.id !== skipId).map((view) => view.name.toLowerCase())
    );
    if (!taken.has(base.toLowerCase())) {
        return base;
    }
    for (let suffix = 2; suffix < 200; suffix++) {
        const candidate = `${base} (${suffix})`;
        if (!taken.has(candidate.toLowerCase())) {
            return candidate;
        }
    }
    return base;
}
