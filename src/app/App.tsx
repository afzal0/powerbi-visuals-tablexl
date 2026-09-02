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
import { AppProps } from "./appTypes";
import { AnchorRect, FilterPopover } from "./filters/FilterPopover";
import { Grid } from "./grid/Grid";
import { MIN_COLUMN_WIDTH } from "./grid/HeaderCell";
import { LandingPage } from "./LandingPage";
import { Toolbar } from "./Toolbar";

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
 * View state — sort order, filters, column widths, scroll position — lives here
 * rather than in the host, so that a formatting change or an unrelated data
 * refresh never resets what the user has set up.
 */
export function App(props: AppProps): JSX.Element {
    const {
        snapshotId,
        model,
        settings,
        style,
        locale,
        viewport,
        hostFilters,
        filtersRevision,
        selectedRowIds,
        allowInteractions,
        exportAvailability,
        actions
    } = props;

    const [filters, setFilters] = React.useState<FilterMap>(hostFilters);
    const [sort, setSort] = React.useState<SortEntry[]>([]);
    const [widthOverrides, setWidthOverrides] = React.useState<{ [key: string]: number }>({});
    const [openFilter, setOpenFilter] = React.useState<OpenFilter | null>(null);
    const [resize, setResize] = React.useState<ResizeState | null>(null);
    const [busyKind, setBusyKind] = React.useState<ExportKind | null>(null);
    const [status, setStatus] = React.useState<string | null>(null);

    // Adopt filters supplied by the host: restored report filters, a bookmark,
    // or the state persisted alongside the visual.
    const lastRevision = React.useRef(-1);
    React.useEffect(() => {
        if (filtersRevision !== lastRevision.current) {
            lastRevision.current = filtersRevision;
            setFilters(hostFilters);
        }
    }, [filtersRevision, hostFilters]);

    const columns: ColumnModel[] = React.useMemo(
        () => (model ? model.columns.filter((column) => !column.fmt.hide) : []),
        [model]
    );

    // Widths come from the format pane, overridden by any in-session drag.
    const widths = React.useMemo(() => {
        const result: { [key: string]: number } = {};
        for (const column of columns) {
            result[column.key] = widthOverrides[column.key] ?? columnWidth(column);
        }
        return result;
    }, [columns, widthOverrides]);

    const filteredRows: RowModel[] = React.useMemo(
        () => (model ? applyFilters(model.rows, columns, filters) : []),
        [model, columns, filters]
    );

    const sortedRows = React.useMemo(
        () => sortRows(filteredRows, columns, sort, locale),
        [filteredRows, columns, sort, locale]
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
        const column = columns.find((candidate) => candidate.key === openFilter.columnKey);
        if (!column) {
            return [];
        }
        const scoped = applyFilters(model.rows, columns, filters, column.key);
        return distinctValues(scoped, column, locale);
    }, [openFilter, model, columns, filters, locale]);

    const commitFilters = React.useCallback(
        (next: FilterMap) => {
            setFilters(next);
            actions.onFiltersChanged(next);
        },
        [actions]
    );

    const handleSort = React.useCallback((columnKey: string, additive: boolean) => {
        setSort((previous) => {
            const existing = previous.find((entry) => entry.key === columnKey);
            const nextDirection: SortDirection | null =
                !existing ? "asc" : existing.dir === "asc" ? "desc" : null;

            if (!additive) {
                return nextDirection ? [{ key: columnKey, dir: nextDirection }] : [];
            }
            const others = previous.filter((entry) => entry.key !== columnKey);
            return nextDirection ? [...others, { key: columnKey, dir: nextDirection }] : others;
        });
    }, []);

    const handleSortFromMenu = React.useCallback(
        (columnKey: string, direction: SortDirection | null) => {
            setSort((previous) => {
                const others = previous.filter((entry) => entry.key !== columnKey);
                return direction ? [...others, { key: columnKey, dir: direction }] : others;
            });
        },
        []
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
            const width = Math.max(MIN_COLUMN_WIDTH, resize.startWidth + delta);
            setResize(null);
            actions.onColumnResize(resize.columnKey, Math.round(width));
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, [resize, actions]);

    // Report that this update has painted. Keyed on the snapshot so each
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
                const view = buildExportView({
                    columns: model.columns,
                    rows: sortedRows,
                    style,
                    locale,
                    title: settings.exportSettings.pdfTitle.value,
                    truncated: model.truncated,
                    useRawValues: settings.exportSettings.rawValues.value,
                    widths
                });
                const outcome = await actions.exportFile(kind, view);
                setStatus(outcome.ok ? null : (outcome.message ?? "Export failed."));
            } catch {
                setStatus("The export could not be created.");
            } finally {
                setBusyKind(null);
            }
        },
        [model, sortedRows, style, locale, settings, widths, actions]
    );

    if (!model || columns.length === 0) {
        return <LandingPage style={style} />;
    }

    const activeColumn = openFilter
        ? columns.find((column) => column.key === openFilter.columnKey)
        : undefined;
    const crossScope = settings.filtering.scope.value === "cross";
    const sortEntry = activeColumn
        ? sort.find((entry) => entry.key === activeColumn.key)
        : undefined;

    return (
        <div
            className="txl-root"
            style={{ width: viewport.width, height: viewport.height }}
            onClick={() => setOpenFilter(null)}
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
                onOpenFilter={(columnKey, anchor) =>
                    setOpenFilter((previous) =>
                        previous && previous.columnKey === columnKey ? null : { columnKey, anchor }
                    )
                }
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
