import { ColumnModel } from "../data/types";
import { SortEntry } from "../filtering/filterEngine";
import { deserializeFilters, FilterMap } from "../filtering/filterState";
import {
    activeView,
    emptyView,
    emptyWorkspace,
    mintViewId,
    uniqueViewName,
    ViewColumnFormat,
    ViewCommand,
    ViewDef,
    ViewLimits,
    Workspace,
    WORKSPACE_VERSION
} from "./viewTypes";

/* ------------------------------------------------------------------ *
 * Column pool
 * ------------------------------------------------------------------ */

/**
 * The author expresses four states with two per-column booleans:
 *
 * | hide  | userSelectable | behaviour                                    |
 * |-------|----------------|----------------------------------------------|
 * | false | false          | always shown; the user cannot remove it       |
 * | true  | false          | never shown                                   |
 * | false | true           | in the pool, on by default in a new view      |
 * | true  | true           | in the pool, off by default in a new view     |
 */
export function isPinned(column: ColumnModel): boolean {
    return !column.fmt.userSelectable && !column.fmt.hide;
}

export function isInPool(column: ColumnModel): boolean {
    return column.fmt.userSelectable;
}

/** Columns the user may switch on and off, in field-well order. */
export function poolColumns(columns: ColumnModel[]): ColumnModel[] {
    return columns.filter(isInPool);
}

/** Columns shown in every view regardless of the user's choices. */
export function pinnedColumns(columns: ColumnModel[]): ColumnModel[] {
    return columns.filter(isPinned);
}

/** The pool columns a brand-new view starts with. */
export function defaultColumnsFor(columns: ColumnModel[]): string[] {
    return columns
        .filter((column) => isInPool(column) && !column.fmt.hide)
        .map((column) => column.key);
}

/**
 * Resolves which columns the grid renders. With views switched off this is
 * exactly the pre-existing behaviour, so an upgraded report renders
 * identically until the author turns the feature on.
 *
 * Column order always follows the field well; a view records membership only.
 */
export function resolveVisibleColumns(
    columns: ColumnModel[],
    selected: string[],
    viewsEnabled: boolean
): ColumnModel[] {
    if (!viewsEnabled) {
        return columns.filter((column) => !column.fmt.hide);
    }
    const on = new Set(selected);
    return columns.filter((column) =>
        isInPool(column) ? on.has(column.key) : !column.fmt.hide
    );
}

/* ------------------------------------------------------------------ *
 * Formatting overlay
 * ------------------------------------------------------------------ */

/**
 * Layers a view's pinned formatting over the columns' own settings, returning
 * new ColumnModel objects. Columns with no overlay entry are returned
 * unchanged, so the common case allocates nothing.
 */
export function applyViewFormatting(
    columns: ColumnModel[],
    overlay: { [columnKey: string]: ViewColumnFormat } | undefined
): ColumnModel[] {
    if (!overlay) {
        return columns;
    }
    return columns.map((column) => {
        const patch = overlay[column.key];
        if (!patch) {
            return column;
        }
        return {
            ...column,
            fmt: {
                ...column.fmt,
                width: patch.width ?? column.fmt.width,
                alignment: patch.alignment ?? column.fmt.alignment,
                wrapText: patch.wrapText ?? column.fmt.wrapText,
                fontColor: patch.fontColor !== undefined ? patch.fontColor : column.fmt.fontColor,
                backColor: patch.backColor !== undefined ? patch.backColor : column.fmt.backColor
            },
            cf: patch.cf ?? column.cf,
            totalsAgg: patch.totalsAgg ?? column.totalsAgg
        };
    });
}

/** Snapshots the current per-column formatting into a view overlay. */
export function captureFormatting(
    columns: ColumnModel[],
    widths: { [columnKey: string]: number }
): { [columnKey: string]: ViewColumnFormat } {
    const overlay: { [columnKey: string]: ViewColumnFormat } = {};
    for (const column of columns) {
        overlay[column.key] = {
            width: widths[column.key] ?? column.fmt.width ?? undefined,
            alignment: column.fmt.alignment,
            wrapText: column.fmt.wrapText,
            fontColor: column.fmt.fontColor,
            backColor: column.fmt.backColor,
            cf: column.cf,
            totalsAgg: column.totalsAgg
        };
    }
    return overlay;
}

/* ------------------------------------------------------------------ *
 * Commands
 * ------------------------------------------------------------------ */

export interface CommandContext {
    limits: ViewLimits;
    columns: ColumnModel[];
    /** Current column widths, used when pinning formatting into a view. */
    widths: { [columnKey: string]: number };
}

function replaceActive(workspace: Workspace, patch: Partial<ViewDef>): Workspace {
    const current = activeView(workspace);
    return {
        ...workspace,
        views: workspace.views.map((view) =>
            view.id === current.id ? { ...view, ...patch } : view
        )
    };
}

/**
 * Applies one user action to the workspace. Pure, and returns the *same*
 * reference when a command is a no-op or is not permitted, so callers can skip
 * persisting and re-rendering by identity.
 */
export function applyCommand(
    workspace: Workspace,
    command: ViewCommand,
    context: CommandContext
): Workspace {
    const { limits, columns, widths } = context;

    switch (command.type) {
        case "activate": {
            if (command.id === workspace.active ||
                !workspace.views.some((view) => view.id === command.id)) {
                return workspace;
            }
            return { ...workspace, active: command.id };
        }

        case "create": {
            if (limits.locked || workspace.views.length >= Math.max(1, limits.maxViews)) {
                return workspace;
            }
            const source = activeView(workspace);
            const id = mintViewId(workspace.views);
            const name = uniqueViewName(
                workspace.views,
                command.copyActive ? `${source.name} copy` : `Sheet ${workspace.views.length + 1}`
            );
            const view: ViewDef = command.copyActive
                ? { ...source, id, name, filters: { ...source.filters }, sort: source.sort.slice() }
                : emptyView(id, name, defaultColumnsFor(columns));
            return { ...workspace, active: id, views: [...workspace.views, view] };
        }

        case "rename": {
            if (limits.locked) {
                return workspace;
            }
            const name = uniqueViewName(workspace.views, command.name, command.id);
            return {
                ...workspace,
                views: workspace.views.map((view) =>
                    view.id === command.id ? { ...view, name } : view
                )
            };
        }

        case "delete": {
            // The last sheet is never removable; there must always be a view.
            if (limits.locked || workspace.views.length <= 1) {
                return workspace;
            }
            const index = workspace.views.findIndex((view) => view.id === command.id);
            if (index < 0) {
                return workspace;
            }
            const views = workspace.views.filter((view) => view.id !== command.id);
            const active =
                workspace.active === command.id
                    ? views[Math.min(index, views.length - 1)].id
                    : workspace.active;
            return { ...workspace, active, views };
        }

        case "setColumns": {
            const allowed = new Set(poolColumns(columns).map((column) => column.key));
            let next = command.columns.filter((key) => allowed.has(key));
            if (limits.maxColumns > 0 && next.length > limits.maxColumns) {
                next = next.slice(0, limits.maxColumns);
            }
            next = next.sort();
            const current = activeView(workspace);
            if (current.columns.join(" ") === next.join(" ")) {
                return workspace;
            }
            return replaceActive(workspace, { columns: next });
        }

        case "setSort":
            return replaceActive(workspace, { sort: command.sort });

        case "setFilters":
            return replaceActive(workspace, { filters: command.filters });

        case "setWidth": {
            const current = activeView(workspace);
            // Widths only stick to a view once its formatting is pinned;
            // otherwise they belong to the column, as they always have.
            if (!current.fmt) {
                return workspace;
            }
            return replaceActive(workspace, {
                fmt: {
                    ...current.fmt,
                    [command.columnKey]: {
                        ...current.fmt[command.columnKey],
                        width: command.width
                    }
                }
            });
        }

        case "pinFormatting": {
            if (!command.on) {
                const current = activeView(workspace);
                if (!current.fmt) {
                    return workspace;
                }
                const { fmt, ...rest } = current;
                void fmt;
                return {
                    ...workspace,
                    views: workspace.views.map((view) =>
                        view.id === current.id ? (rest as ViewDef) : view
                    )
                };
            }
            return replaceActive(workspace, { fmt: captureFormatting(columns, widths) });
        }

        default:
            return workspace;
    }
}

/* ------------------------------------------------------------------ *
 * Serialisation
 * ------------------------------------------------------------------ */

/**
 * Canonical JSON for a workspace: keys emitted in a fixed order and every
 * collection sorted, so that two workspaces that mean the same thing always
 * produce byte-identical text.
 *
 * This is what makes the adoption test in visual.ts sound — it can decide
 * "is this incoming payload just my own state coming back?" by string
 * comparison, with no pending-write flags to wedge or race.
 */
export function serializeWorkspace(workspace: Workspace): string {
    return JSON.stringify({
        v: WORKSPACE_VERSION,
        active: workspace.active,
        views: workspace.views.map((view) => ({
            id: view.id,
            name: view.name,
            columns: view.columns.slice().sort(),
            sort: view.sort.map((entry) => ({ key: entry.key, dir: entry.dir })),
            filters: canonicalFilters(view.filters),
            ...(view.fmt ? { fmt: canonicalFormat(view.fmt) } : {})
        }))
    });
}

function canonicalFilters(filters: FilterMap): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(filters).sort()) {
        const filter = filters[key];
        out[key] =
            filter.kind === "values"
                ? { kind: "values", included: filter.included.slice().sort() }
                : { kind: "condition", op: filter.op, v1: filter.v1, v2: filter.v2 };
    }
    return out;
}

function canonicalFormat(fmt: {
    [columnKey: string]: ViewColumnFormat;
}): Record<string, ViewColumnFormat> {
    const out: Record<string, ViewColumnFormat> = {};
    for (const key of Object.keys(fmt).sort()) {
        out[key] = fmt[key];
    }
    return out;
}

function readSort(raw: unknown): SortEntry[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    return raw
        .filter(
            (entry): entry is SortEntry =>
                !!entry &&
                typeof (entry as SortEntry).key === "string" &&
                ((entry as SortEntry).dir === "asc" || (entry as SortEntry).dir === "desc")
        )
        .map((entry) => ({ key: entry.key, dir: entry.dir }));
}

function readView(raw: unknown, index: number): ViewDef | null {
    if (!raw || typeof raw !== "object") {
        return null;
    }
    const source = raw as Record<string, unknown>;
    const id = typeof source.id === "string" && source.id ? source.id : `v${index + 1}`;
    return {
        id,
        name: typeof source.name === "string" && source.name ? source.name : `Sheet ${index + 1}`,
        columns: Array.isArray(source.columns) ? source.columns.map(String) : [],
        sort: readSort(source.sort),
        filters: deserializeFilters(JSON.stringify(source.filters ?? {})),
        ...(source.fmt && typeof source.fmt === "object"
            ? { fmt: source.fmt as { [key: string]: ViewColumnFormat } }
            : {})
    };
}

/**
 * Reads a stored payload. Understands both the current workspace format and
 * the v1 payload — a bare FilterMap — written by earlier releases, so an
 * existing report keeps its filters when it is opened by this version.
 */
export function deserializeWorkspace(
    payload: string | undefined | null,
    defaultColumns: string[]
): Workspace {
    if (!payload) {
        return emptyWorkspace(defaultColumns);
    }
    try {
        const parsed = JSON.parse(payload) as Record<string, unknown>;
        if (!parsed || typeof parsed !== "object") {
            return emptyWorkspace(defaultColumns);
        }

        if (parsed.v === WORKSPACE_VERSION && Array.isArray(parsed.views)) {
            const views = parsed.views
                .map(readView)
                .filter((view): view is ViewDef => view !== null);
            if (views.length === 0) {
                return emptyWorkspace(defaultColumns);
            }
            const active =
                typeof parsed.active === "string" &&
                views.some((view) => view.id === parsed.active)
                    ? parsed.active
                    : views[0].id;
            // Keep the id counter ahead of anything already stored.
            for (const view of views) {
                const n = Number(/^v(\d+)$/.exec(view.id)?.[1]);
                if (!isNaN(n)) {
                    mintViewId(views.filter((v) => v.id !== view.id));
                }
            }
            return { v: WORKSPACE_VERSION, active, views };
        }

        // v1: the payload was a bare FilterMap. Carry those filters into the
        // first view so nothing is lost when a report is upgraded.
        const workspace = emptyWorkspace(defaultColumns);
        workspace.views[0].filters = deserializeFilters(payload);
        return workspace;
    } catch {
        return emptyWorkspace(defaultColumns);
    }
}
