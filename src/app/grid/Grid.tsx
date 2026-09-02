import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { ColumnModel, RowModel } from "../../data/types";
import { SortEntry } from "../../filtering/filterEngine";
import { FilterMap } from "../../filtering/filterState";
import {
    ColumnStats,
    contrastingText,
    evaluateCell
} from "../../formatting/conditionalFormatting";
import { ResolvedStyle, effectiveAlignment } from "../../formatting/theme";
import { ExportCell } from "../../export/viewSnapshot";
import { AnchorRect } from "../filters/FilterPopover";
import { HeaderCell } from "./HeaderCell";

interface Props {
    columns: ColumnModel[];
    rows: RowModel[];
    widths: { [columnKey: string]: number };
    style: ResolvedStyle;
    sort: SortEntry[];
    filters: FilterMap;
    filtersEnabled: boolean;
    sortingEnabled: boolean;
    openFilterColumn: string | null;
    selectedRowIds: Set<number>;
    allowInteractions: boolean;
    stats: (ColumnStats | null)[];
    totals: ExportCell[] | null;
    onSort(columnKey: string, additive: boolean): void;
    onOpenFilter(columnKey: string, anchor: AnchorRect): void;
    onResizeStart(columnKey: string, startX: number, startWidth: number): void;
    onRowClick(row: RowModel, multiSelect: boolean): void;
    onBackgroundClick(): void;
    onContextMenu(row: RowModel | null, x: number, y: number): void;
    onHover(row: RowModel, columnKey: string | null, x: number, y: number): void;
    onHoverMove(row: RowModel, x: number, y: number): void;
    onHoverEnd(): void;
}

const ROW_NUMBER_WIDTH = 52;

/**
 * The scrolling data grid.
 *
 * Rows are virtualised so the full 30,000-row data window stays responsive, and
 * the header and totals rows are sticky inside the same scroller so they stay
 * aligned during horizontal scrolling.
 */
export function Grid(props: Props): JSX.Element {
    const {
        columns,
        rows,
        widths,
        style,
        sort,
        filters,
        filtersEnabled,
        sortingEnabled,
        openFilterColumn,
        selectedRowIds,
        allowInteractions,
        stats,
        totals,
        onSort,
        onOpenFilter,
        onResizeStart,
        onRowClick,
        onBackgroundClick,
        onContextMenu,
        onHover,
        onHoverMove,
        onHoverEnd
    } = props;

    const scrollRef = React.useRef<HTMLDivElement>(null);
    const [focusedIndex, setFocusedIndex] = React.useState(0);

    const rowHeight = style.body.rowHeight;
    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => rowHeight,
        overscan: 10
    });

    const sortLookup = React.useMemo(() => {
        const map = new Map<string, { dir: SortEntry["dir"]; index: number }>();
        sort.forEach((entry, index) => map.set(entry.key, { dir: entry.dir, index: index + 1 }));
        return map;
    }, [sort]);

    const showRowNumbers = style.body.showRowNumbers;
    const totalWidth =
        columns.reduce((sum, column) => sum + (widths[column.key] ?? 140), 0) +
        (showRowNumbers ? ROW_NUMBER_WIDTH : 0);

    const cellBorder = style.grid.showVertical
        ? `${style.grid.width}px solid ${style.grid.color}`
        : "none";
    const rowBorder = style.grid.showHorizontal
        ? `${style.grid.width}px solid ${style.grid.color}`
        : "none";

    /** Arrow-key navigation over rows, with Enter/Space selecting. */
    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
        if (rows.length === 0) {
            return;
        }
        let next = focusedIndex;
        switch (event.key) {
            case "ArrowDown":
                next = Math.min(rows.length - 1, focusedIndex + 1);
                break;
            case "ArrowUp":
                next = Math.max(0, focusedIndex - 1);
                break;
            case "PageDown":
                next = Math.min(rows.length - 1, focusedIndex + 10);
                break;
            case "PageUp":
                next = Math.max(0, focusedIndex - 10);
                break;
            case "Home":
                next = 0;
                break;
            case "End":
                next = rows.length - 1;
                break;
            case "Enter":
            case " ":
                event.preventDefault();
                if (allowInteractions) {
                    onRowClick(rows[focusedIndex], event.ctrlKey || event.metaKey);
                }
                return;
            default:
                return;
        }
        event.preventDefault();
        setFocusedIndex(next);
        virtualizer.scrollToIndex(next, { align: "auto" });
    };

    return (
        <div
            className="txl-scroll"
            ref={scrollRef}
            role="grid"
            aria-rowcount={rows.length + 1}
            aria-colcount={columns.length}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onClick={onBackgroundClick}
            onContextMenu={(event) => {
                event.preventDefault();
                onContextMenu(null, event.clientX, event.clientY);
            }}
            style={{
                border: style.grid.outline ? `1px solid ${style.grid.outlineColor}` : "none",
                background: style.body.background
            }}
        >
            <div className="txl-table" style={{ width: totalWidth }}>
                <div
                    className={`txl-head${style.header.sticky ? " is-sticky" : ""}`}
                    role="row"
                    style={{ background: style.header.background }}
                >
                    {showRowNumbers && (
                        <div
                            className="txl-th txl-rownum-head"
                            style={{
                                width: ROW_NUMBER_WIDTH,
                                minWidth: ROW_NUMBER_WIDTH,
                                background: style.header.background,
                                borderRight: cellBorder,
                                borderBottom: style.header.showBorder
                                    ? `${style.header.borderWidth}px solid ${style.header.borderColor}`
                                    : "none"
                            }}
                        />
                    )}
                    {columns.map((column) => {
                        const entry = sortLookup.get(column.key);
                        return (
                            <HeaderCell
                                key={column.key}
                                column={column}
                                width={widths[column.key] ?? 140}
                                style={style}
                                sortDirection={entry ? entry.dir : null}
                                sortPriority={sort.length > 1 && entry ? entry.index : null}
                                isFiltered={!!filters[column.key]}
                                filtersEnabled={filtersEnabled}
                                sortingEnabled={sortingEnabled}
                                isFilterOpen={openFilterColumn === column.key}
                                onSort={onSort}
                                onOpenFilter={onOpenFilter}
                                onResizeStart={onResizeStart}
                            />
                        );
                    })}
                </div>

                <div
                    className="txl-body"
                    style={{ height: virtualizer.getTotalSize(), position: "relative" }}
                >
                    {virtualizer.getVirtualItems().map((virtualRow) => {
                        const row = rows[virtualRow.index];
                        const isSelected = selectedRowIds.has(row.id);
                        const isBanded = style.body.banded && virtualRow.index % 2 === 1;
                        const rowBackground = isSelected
                            ? style.body.selectionColor
                            : isBanded
                              ? style.body.bandedBackground
                              : style.body.background;
                        const rowColor = isBanded ? style.body.bandedColor : style.body.color;

                        return (
                            <div
                                key={row.id}
                                className={`txl-tr${isSelected ? " is-selected" : ""}${
                                    virtualRow.index === focusedIndex ? " is-focused" : ""
                                }`}
                                role="row"
                                aria-rowindex={virtualRow.index + 2}
                                aria-selected={isSelected}
                                style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    width: "100%",
                                    height: rowHeight,
                                    transform: `translateY(${virtualRow.start}px)`,
                                    background: rowBackground,
                                    borderBottom: rowBorder
                                }}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setFocusedIndex(virtualRow.index);
                                    if (allowInteractions) {
                                        onRowClick(row, event.ctrlKey || event.metaKey);
                                    }
                                }}
                                onContextMenu={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setFocusedIndex(virtualRow.index);
                                    onContextMenu(row, event.clientX, event.clientY);
                                }}
                                onMouseEnter={(event) => {
                                    const cell = (event.target as HTMLElement).closest?.(
                                        "[data-col]"
                                    );
                                    onHover(
                                        row,
                                        cell ? cell.getAttribute("data-col") : null,
                                        event.clientX,
                                        event.clientY
                                    );
                                }}
                                onMouseMove={(event) => onHoverMove(row, event.clientX, event.clientY)}
                                onMouseLeave={onHoverEnd}
                            >
                                {showRowNumbers && (
                                    <div
                                        className="txl-td txl-rownum"
                                        style={{
                                            width: ROW_NUMBER_WIDTH,
                                            minWidth: ROW_NUMBER_WIDTH,
                                            borderRight: cellBorder,
                                            color: style.body.color,
                                            padding: `0 ${style.grid.paddingX}px`
                                        }}
                                    >
                                        {virtualRow.index + 1}
                                    </div>
                                )}
                                {columns.map((column, columnIndex) => {
                                    const raw = row.values[column.index];
                                    const text = row.display[column.index];
                                    const format = evaluateCell(
                                        raw,
                                        text,
                                        column,
                                        stats[columnIndex]
                                    );
                                    const alignment = effectiveAlignment(
                                        column,
                                        style.header.alignment
                                    );

                                    let background = column.fmt.backColor ?? undefined;
                                    let color =
                                        column.fmt.fontColor ?? (isBanded ? rowColor : style.body.color);
                                    if (format?.background) {
                                        background = format.background;
                                        color = contrastingText(format.background);
                                    } else if (format?.color) {
                                        color = format.color;
                                    }
                                    // The selection highlight always wins.
                                    if (isSelected) {
                                        background = undefined;
                                    }

                                    const wrap = column.fmt.wrapText || style.body.wrapText;

                                    return (
                                        <div
                                            key={column.key}
                                            className={`txl-td${wrap ? " is-wrapped" : ""}`}
                                            role="gridcell"
                                            data-col={column.key}
                                            title={wrap ? undefined : text}
                                            style={{
                                                width: widths[column.key] ?? 140,
                                                minWidth: widths[column.key] ?? 140,
                                                maxWidth: widths[column.key] ?? 140,
                                                background,
                                                color,
                                                borderRight: cellBorder,
                                                padding: `0 ${style.grid.paddingX}px`,
                                                fontFamily: style.body.fontFamily,
                                                fontSize: style.body.fontSize,
                                                fontWeight: style.body.bold ? 700 : 400,
                                                fontStyle: style.body.italic ? "italic" : "normal",
                                                justifyContent:
                                                    alignment === "right"
                                                        ? "flex-end"
                                                        : alignment === "center"
                                                          ? "center"
                                                          : "flex-start"
                                            }}
                                        >
                                            {format?.dataBar && (
                                                <span
                                                    className="txl-databar"
                                                    aria-hidden="true"
                                                    style={{
                                                        left: `${format.dataBar.left}%`,
                                                        width: `${format.dataBar.width}%`,
                                                        background: format.dataBar.color
                                                    }}
                                                />
                                            )}
                                            {(!format?.dataBar || format.dataBar.showValue) && (
                                                <span className="txl-cell-text">{text}</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>

                {totals && (
                    <div
                        className="txl-totals"
                        role="row"
                        style={{
                            background: style.totals.background,
                            color: style.totals.color,
                            fontWeight: style.totals.bold ? 700 : 400,
                            height: rowHeight,
                            borderTop: `1px solid ${style.grid.color}`
                        }}
                    >
                        {showRowNumbers && (
                            <div
                                className="txl-td"
                                style={{
                                    width: ROW_NUMBER_WIDTH,
                                    minWidth: ROW_NUMBER_WIDTH,
                                    borderRight: cellBorder
                                }}
                            />
                        )}
                        {columns.map((column, columnIndex) => {
                            const alignment = effectiveAlignment(column, style.header.alignment);
                            return (
                                <div
                                    key={column.key}
                                    className="txl-td"
                                    role="gridcell"
                                    style={{
                                        width: widths[column.key] ?? 140,
                                        minWidth: widths[column.key] ?? 140,
                                        maxWidth: widths[column.key] ?? 140,
                                        borderRight: cellBorder,
                                        padding: `0 ${style.grid.paddingX}px`,
                                        fontFamily: style.body.fontFamily,
                                        fontSize: style.body.fontSize,
                                        justifyContent:
                                            alignment === "right"
                                                ? "flex-end"
                                                : alignment === "center"
                                                  ? "center"
                                                  : "flex-start"
                                    }}
                                >
                                    {totals[columnIndex]?.text ?? ""}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
