import * as React from "react";

import { ColumnModel } from "../../data/types";
import { SortDirection } from "../../filtering/filterEngine";
import { ResolvedStyle, effectiveAlignment } from "../../formatting/theme";
import { AnchorRect } from "../filters/FilterPopover";

interface Props {
    column: ColumnModel;
    width: number;
    style: ResolvedStyle;
    sortDirection: SortDirection | null;
    /** 1-based priority shown when more than one column is sorted. */
    sortPriority: number | null;
    isFiltered: boolean;
    filtersEnabled: boolean;
    sortingEnabled: boolean;
    isFilterOpen: boolean;
    onSort(columnKey: string, additive: boolean): void;
    onOpenFilter(columnKey: string, anchor: AnchorRect): void;
    onResizeStart(columnKey: string, startX: number, startWidth: number): void;
}

const MIN_COLUMN_WIDTH = 48;

export { MIN_COLUMN_WIDTH };

function ariaSort(direction: SortDirection | null): "ascending" | "descending" | "none" {
    if (direction === "asc") {
        return "ascending";
    }
    if (direction === "desc") {
        return "descending";
    }
    return "none";
}

/**
 * A column header carrying the sort affordance and the filter button. Sorting
 * is driven from the header itself because capabilities declare custom sorting,
 * which suppresses Power BI's own header menu.
 */
export function HeaderCell(props: Props): JSX.Element {
    const {
        column,
        width,
        style,
        sortDirection,
        sortPriority,
        isFiltered,
        filtersEnabled,
        sortingEnabled,
        isFilterOpen,
        onSort,
        onOpenFilter,
        onResizeStart
    } = props;

    const buttonRef = React.useRef<HTMLButtonElement>(null);
    const alignment = effectiveAlignment(column, style.header.alignment);

    const openFilter = (): void => {
        const node = buttonRef.current;
        if (!node) {
            return;
        }
        const rect = node.getBoundingClientRect();
        const host = node.closest(".txl-root");
        const hostRect = host ? host.getBoundingClientRect() : { left: 0, top: 0 };
        onOpenFilter(column.key, {
            left: rect.left - hostRect.left,
            right: rect.right - hostRect.left,
            top: rect.top - hostRect.top,
            bottom: rect.bottom - hostRect.top
        });
    };

    const handleSort = (event: React.MouseEvent | React.KeyboardEvent): void => {
        if (!sortingEnabled) {
            return;
        }
        onSort(column.key, event.shiftKey);
    };

    return (
        <div
            className="txl-th"
            role="columnheader"
            aria-sort={ariaSort(sortDirection)}
            style={{
                width,
                minWidth: width,
                maxWidth: width,
                color: style.header.color,
                background: style.header.background,
                fontFamily: style.header.fontFamily,
                fontSize: style.header.fontSize,
                fontWeight: style.header.bold ? 700 : 400,
                fontStyle: style.header.italic ? "italic" : "normal",
                textDecoration: style.header.underline ? "underline" : "none",
                borderBottom: style.header.showBorder
                    ? `${style.header.borderWidth}px solid ${style.header.borderColor}`
                    : "none",
                borderRight: style.grid.showVertical
                    ? `${style.grid.width}px solid ${style.grid.color}`
                    : "none",
                padding: `0 ${style.grid.paddingX}px`,
                justifyContent:
                    alignment === "right"
                        ? "flex-end"
                        : alignment === "center"
                          ? "center"
                          : "flex-start"
            }}
        >
            <span
                className={`txl-th-label${sortingEnabled ? " is-sortable" : ""}${
                    style.header.wrapText ? " is-wrapped" : ""
                }`}
                title={column.displayName}
                role={sortingEnabled ? "button" : undefined}
                tabIndex={sortingEnabled ? 0 : undefined}
                onClick={handleSort}
                onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleSort(event);
                    }
                }}
            >
                {column.displayName}
            </span>

            {sortDirection && (
                <span className="txl-sort" aria-hidden="true">
                    {sortDirection === "asc" ? "▲" : "▼"}
                    {sortPriority !== null && (
                        <span className="txl-sort-order">{sortPriority}</span>
                    )}
                </span>
            )}

            {filtersEnabled && (
                <button
                    ref={buttonRef}
                    className={`txl-filter-btn${isFiltered ? " is-active" : ""}${
                        isFilterOpen ? " is-open" : ""
                    }`}
                    style={isFiltered ? { color: style.accent } : undefined}
                    aria-label={
                        isFiltered
                            ? `Filter ${column.displayName} (active)`
                            : `Filter ${column.displayName}`
                    }
                    aria-haspopup="dialog"
                    aria-expanded={isFilterOpen}
                    onClick={(event) => {
                        event.stopPropagation();
                        openFilter();
                    }}
                >
                    {isFiltered ? "▼*" : "▼"}
                </button>
            )}

            <span
                className="txl-resize"
                role="separator"
                aria-label={`Resize ${column.displayName}`}
                onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onResizeStart(column.key, event.clientX, width);
                }}
            />
        </div>
    );
}
