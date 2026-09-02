import { RowModel, TableModel } from "../data/types";
import { ViewCommand, ViewLimits, Workspace } from "../views/viewTypes";
import { ResolvedStyle } from "../formatting/theme";
import { ExportKind } from "../export/download";
import { TableXLSettings } from "../settings/settingsModel";
import { ExportView } from "../export/viewSnapshot";

export interface ExportAvailability {
    ok: boolean;
    message?: string;
}

/**
 * Callbacks back into the visual host. The React tree never touches the host
 * API directly, which keeps the lifecycle concerns in visual.ts.
 */
export interface HostActions {
    /** The single channel for changing a view: columns, filters, sort, tabs. */
    onViewCommand(command: ViewCommand): void;
    onSelectRow(row: RowModel | null, multiSelect: boolean): void;
    onContextMenu(row: RowModel | null, x: number, y: number): void;
    onColumnResize(columnKey: string, width: number): void;
    /** Report-canvas tooltip for the hovered row. */
    onCellHover(row: RowModel, columnKey: string | null, x: number, y: number): void;
    onCellMove(row: RowModel, x: number, y: number): void;
    onHoverEnd(): void;
    /** Signals that the React commit for a given update has painted. */
    onRendered(snapshotId: number): void;
    onRenderFailed(error: unknown): void;
    exportFile(kind: ExportKind, view: ExportView): Promise<ExportAvailability>;
}

export interface AppProps {
    /** Increments on every update so effects can key off a specific commit. */
    snapshotId: number;
    model: TableModel | null;
    settings: TableXLSettings;
    style: ResolvedStyle;
    locale: string;
    viewport: { width: number; height: number };
    /** Views, and which one is active. Always holds at least one view. */
    workspace: Workspace;
    /** The author's limits on what readers may do with views. */
    viewLimits: ViewLimits;
    /** True while the report is open for editing, so changes save to the report. */
    isAuthor: boolean;
    selectedRowIds: number[];
    /** False when the report author has switched interactions off. */
    allowInteractions: boolean;
    exportAvailability: ExportAvailability;
    actions: HostActions;
}
