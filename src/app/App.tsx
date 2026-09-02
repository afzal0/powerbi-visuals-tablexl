import * as React from "react";

import { ColumnModel, RowModel } from "../data/types";
import { ExportKind } from "../export/download";
import { buildExportView, buildTotalsRow, columnWidth } from "../export/viewSnapshot";
import {
    applyFilters,
    distinctValues,
    SortDirection,
    SortEntry,
    sortRows
} from "../filtering/filterEngine";
import { crossFilterLimitation } from "../filtering/filterBridge";
import { ColumnFilter, FilterMap, hasActiveFilters } from "../filtering/filterState";
import { computeStats } from "../formatting/conditionalFormatting";
import {
    applyViewFormatting,
    pinnedColumns,
    poolColumns,
    resolveVisibleColumns
} from "../views/viewState";
import { activeView } from "../views/viewTypes";
import { AppProps } from "./appTypes";
import { AnchorRect, FilterPopover } from "./filters/FilterPopover";
import { Grid } from "./grid/Grid";
import { MIN_COLUMN_WIDTH } from "./grid/HeaderCell";
import { LandingPage } from "./LandingPage";
import { Toolbar } from "./Toolbar";
import { ColumnChooser } from "./views/ColumnChooser";
import { ViewTabs } from "./views/ViewTabs";

interface ResizeState {
    columnKey: string;
    startX: number;
    startWidth: number;
}

interface OpenFilter {
    columnKey: string;
    anchor: AnchorRect;
}

/**
 * Root of the visual's UI.
 *
 * The active view is the single source of truth for which columns are shown and
 * how they are filtered and sorted; every change is dispatched as a command and
 * returns as new props. Column widths and the open menus are the only local
 * state, because they are transient and never belong to a saved view.
 */
export function App(props: AppProps): JSX.Element {
    const {
        snapshotId,
        model,
        settings,
        style,
        locale,
        viewport,
        workspace,
        viewLimits,
        isAuthor,
        selectedRowIds,
        allowInteractions,
        exportAvailability,
        actions
    } = props;

    const [widthOverrides, setWidthOverrides] = React.useState<{ [key: string]: number }>({});
    const [openFilter, setOpenFilter] = React.useState<OpenFilter | null>(null);
    const [chooserOpen, setChooserOpen] = React.useState(false);
    const [resize, setResize] = React.useState<ResizeState | null>(null);
    const [busyKind, setBusyKind] = React.useState<ExportKind | null>(null);
    const [status, setStatus] = React.useState<string | null>(null);

    const view = activeView(workspace);
    const filters = view.filters;
    const sort = view.sort;

    /** Every column the field well provides, with the view's formatting layered on. */
    const allColumns: ColumnModel[] = React.useMemo(
        () => (model ? applyViewFormatting(model.columns, view.fmt) : []),
        [model, view.fmt]
    );

    const columns: ColumnModel[] = React.useMemo(
        () => resolveVisibleColumns(allColumns, view.columns, viewLimits.enabled),
        [allColumns, view.columns, viewLimits.enabled]
    );

    const pool = React.useMemo(() => poolColumns(allColumns), [allColumns]);
    const pinned = React.useMemo(() => pinnedColumns(allColumns), [allColumns]);

    // Widths come from the format pane, overridden by any in-session drag.
    const widths = React.useMemo(() => {
        const result: { [key: string]: number } = {};
        for (const column of columns) {
            result[column.key] = widthOverrides[column.key] ?? columnWidth(column);
        }
        return result;
    }, [columns, widthOverrides]);

    /*
     * Filtering runs over EVERY column, not just the visible ones. Removing a
     * column from a view must not silently stop its filter applying — Excel
     * keeps the filter, and in cross-filter scope the report page is filtered
     * by it regardless, so dropping it here made the table disagree.
     */
    const filteredRows: RowModel[] = React.useMemo(
        () => (model ? applyFilters(model.rows, allColumns, filters) : []),
        [model, allColumns, filters]
    );

    const sortedRows = React.useMemo(
        () => sortRows(filteredRows, allColumns, sort, locale),
        [filteredRows, allColumns, sort, locale]
    );

    const stats = React.useMemo(
        () => columns.map((column) => computeStats(sortedRows, column)),
        [columns, sortedRows]
    );

    const totals = React.useMemo(
        () => (style.totals.show ? buildTotalsRow(columns, sortedRows, style, locale) : null),
        [style, columns, sortedRows, locale]
    );

    // The value list for an open menu reflects every other column's filter,
    // exactly as Excel's AutoFilter dropdown does.
    const popoverValues = React.useMemo(() => {
        if (!openFilter || !model) {
            return [];
        }
        const column = allColumns.find((candidate) => candidate.key === openFilter.columnKey);
        if (!column) {
            return [];
        }
        return distinctValues(
            applyFilters(model.rows, allColumns, filters, column.key),
            column,
            locale
        );
    }, [openFilter, model, allColumns, filters, locale]);

    const commitFilters = React.useCallback(
        (next: FilterMap) => actions.onViewCommand({ type: "setFilters", filters: next }),
        [actions]
    );

    const handleSort = React.useCallback(
        (columnKey: string, additive: boolean) => {
            const existing = sort.find((entry) => entry.key === columnKey);
            const nextDirection: SortDirection | null =
                !existing ? "asc" : existing.dir === "asc" ? "desc" : null;
            const others = sort.filter((entry) => entry.key !== columnKey);
            const next: SortEntry[] = !additive
                ? nextDirection
                    ? [{ key: columnKey, dir: nextDirection }]
                    : []
                : nextDirection
                  ? [...others, { key: columnKey, dir: nextDirection }]
                  : others;
            actions.onViewCommand({ type: "setSort", sort: next });
        },
        [sort, actions]
    );

    const handleSortFromMenu = React.useCallback(
        (columnKey: string, direction: SortDirection | null) => {
            const others = sort.filter((entry) => entry.key !== columnKey);
            actions.onViewCommand({
                type: "setSort",
                sort: direction ? [...others, { key: columnKey, dir: direction }] : others
            });
        },
        [sort, actions]
    );

    // Column resizing: track the pointer globally so the drag survives the
    // cursor leaving the narrow handle.
    React.useEffect(() => {
        if (!resize) {
            return undefined;
        }
        const onMove = (event: MouseEvent): void => {
            const delta = event.clientX - resize.startX;
            setWidthOverrides((previous) => ({
                ...previous,
                [resize.columnKey]: Math.max(MIN_COLUMN_WIDTH, resize.startWidth + delta)
            }));
        };
        const onUp = (event: MouseEvent): void => {
            const delta = event.clientX - resize.startX;
            const width = Math.round(Math.max(MIN_COLUMN_WIDTH, resize.startWidth + delta));
            setResize(null);
            actions.onColumnResize(resize.columnKey, width);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, [resize, actions]);

    // Report that this update has painted, keyed on the snapshot so each
    // update signals completion exactly once, after its own commit.
    React.useEffect(() => {
        actions.onRendered(snapshotId);
    }, [snapshotId, actions]);

    const runExport = React.useCallback(
        async (kind: ExportKind) => {
            if (!model) {
                return;
            }
            setBusyKind(kind);
            setStatus(null);
            try {
                // Yield a frame so the button's busy state paints before the
                // main thread is occupied building the file.
                await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
                const snapshot = buildExportView({
                    // Export exactly the columns the active view shows.
                    columns,
                    rows: sortedRows,
                    style,
                    locale,
                    title: settings.exportSettings.pdfTitle.value,
                    truncated: model.truncated,
                    useRawValues: settings.exportSettings.rawValues.value,
                    widths
                });
                const outcome = await actions.exportFile(kind, snapshot);
                setStatus(outcome.ok ? null : (outcome.message ?? "Export failed."));
            } catch {
                setStatus("The export could not be created.");
            } finally {
                setBusyKind(null);
            }
        },
        [model, columns, sortedRows, style, locale, settings, widths, actions]
    );

    if (!model || allColumns.length === 0) {
        return <LandingPage style={style} />;
    }

    const activeColumn = openFilter
        ? allColumns.find((column) => column.key === openFilter.columnKey)
        : undefined;
    const crossScope = settings.filtering.scope.value === "cross";
    const sortEntry = activeColumn
        ? sort.find((entry) => entry.key === activeColumn.key)
        : undefined;

    const showChooserButton =
        viewLimits.enabled && viewLimits.showColumnChooser && pool.length > 0;

    return (
        <div
            className="txl-root"
            style={{ width: viewport.width, height: viewport.height }}
            onClick={() => {
                setOpenFilter(null);
                setChooserOpen(false);
            }}
        >
            {settings.exportSettings.showToolbar.value && (
                <Toolbar
                    style={style}
                    enableCsv={settings.exportSettings.enableCsv.value}
                    enableXlsx={settings.exportSettings.enableXlsx.value}
                    enablePdf={settings.exportSettings.enablePdf.value}
                    exportAvailable={exportAvailability.ok}
                    exportMessage={exportAvailability.message}
                    busyKind={busyKind}
                    filteredCount={sortedRows.length}
                    totalCount={model.rowCount}
                    hasFilters={hasActiveFilters(filters)}
                    truncated={model.truncated}
                    status={status}
                    showColumnChooser={showChooserButton}
                    columnChooserOpen={chooserOpen}
                    onToggleColumnChooser={() => {
                        setOpenFilter(null);
                        setChooserOpen((open) => !open);
                    }}
                    onExport={runExport}
                    onClearFilters={() => commitFilters({})}
                />
            )}

            <Grid
                columns={columns}
                rows={sortedRows}
                widths={widths}
                style={style}
                sort={sort}
                filters={filters}
                filtersEnabled={settings.filtering.enabled.value}
                sortingEnabled={settings.filtering.enableSorting.value}
                openFilterColumn={openFilter ? openFilter.columnKey : null}
                selectedRowIds={new Set(selectedRowIds)}
                allowInteractions={allowInteractions}
                stats={stats}
                totals={totals}
                onSort={handleSort}
                onOpenFilter={(columnKey, anchor) => {
                    setChooserOpen(false);
                    setOpenFilter((previous) =>
                        previous && previous.columnKey === columnKey ? null : { columnKey, anchor }
                    );
                }}
                onResizeStart={(columnKey, startX, startWidth) =>
                    setResize({ columnKey, startX, startWidth })
                }
                onRowClick={(row, multiSelect) => actions.onSelectRow(row, multiSelect)}
                onBackgroundClick={() => actions.onSelectRow(null, false)}
                onContextMenu={(row, x, y) => actions.onContextMenu(row, x, y)}
                onHover={(row, columnKey, x, y) => actions.onCellHover(row, columnKey, x, y)}
                onHoverMove={(row, x, y) => actions.onCellMove(row, x, y)}
                onHoverEnd={() => actions.onHoverEnd()}
            />

            {viewLimits.enabled && (
                <ViewTabs
                    views={workspace.views}
                    activeId={view.id}
                    locked={viewLimits.locked}
                    canAdd={workspace.views.length < Math.max(1, viewLimits.maxViews)}
                    style={style}
                    persistenceHint={
                        isAuthor
                            ? null
                            : "Views you add last for this session. Save a personal bookmark to keep them."
                    }
                    onActivate={(id) => actions.onViewCommand({ type: "activate", id })}
                    onCreate={() => actions.onViewCommand({ type: "create", copyActive: false })}
                    onRename={(id, name) => actions.onViewCommand({ type: "rename", id, name })}
                    onDelete={(id) => actions.onViewCommand({ type: "delete", id })}
                />
            )}

            {chooserOpen && (
                <ColumnChooser
                    pool={pool}
                    pinned={pinned}
                    selected={view.columns}
                    maxColumns={viewLimits.maxColumns}
                    container={viewport}
                    onApply={(next) => {
                        actions.onViewCommand({ type: "setColumns", columns: next });
                        setChooserOpen(false);
                    }}
                    onClose={() => setChooserOpen(false)}
                />
            )}

            {openFilter && activeColumn && (
                <FilterPopover
                    column={activeColumn}
                    anchor={openFilter.anchor}
                    container={viewport}
                    values={popoverValues}
                    current={filters[activeColumn.key]}
                    showSearch={settings.filtering.showSearch.value}
                    showConditions={settings.filtering.showConditions.value}
                    sortDirection={sortEntry ? sortEntry.dir : null}
                    scopeNote={
                        crossScope
                            ? crossFilterLimitation(activeColumn, filters[activeColumn.key])
                            : null
                    }
                    onApply={(filter: ColumnFilter | null) => {
                        const next = { ...filters };
                        if (filter) {
                            next[activeColumn.key] = filter;
                        } else {
                            delete next[activeColumn.key];
                        }
                        commitFilters(next);
                        setOpenFilter(null);
                    }}
                    onSort={(direction) => handleSortFromMenu(activeColumn.key, direction)}
                    onClose={() => setOpenFilter(null)}
                />
            )}
        </div>
    );
}
