import powerbi from "powerbi-visuals-api";
import ITooltipService = powerbi.extensibility.ITooltipService;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;

import { ColumnModel, RowModel } from "../data/types";

/** How many fields a row tooltip lists before it is truncated. */
const MAX_TOOLTIP_ITEMS = 12;

/**
 * Report-canvas tooltips for the hovered row.
 *
 * These are the host's own tooltips rather than browser title text, so they
 * follow report theming and respect the tooltip settings on the visual.
 */
export class TooltipHandler {
    private readonly service: ITooltipService;

    constructor(host: IVisualHost) {
        this.service = host.tooltipService;
    }

    private buildItems(
        row: RowModel,
        columns: ColumnModel[],
        focusedColumn: ColumnModel | null
    ): VisualTooltipDataItem[] {
        const items: VisualTooltipDataItem[] = [];
        // Lead with the cell under the pointer, which is what the user is asking about.
        if (focusedColumn) {
            items.push({
                displayName: focusedColumn.displayName,
                value: row.display[focusedColumn.index] || "(blank)"
            });
        }
        for (const column of columns) {
            if (items.length >= MAX_TOOLTIP_ITEMS) {
                break;
            }
            if (focusedColumn && column.key === focusedColumn.key) {
                continue;
            }
            items.push({
                displayName: column.displayName,
                value: row.display[column.index] || "(blank)"
            });
        }
        return items;
    }

    show(
        row: RowModel,
        columns: ColumnModel[],
        focusedColumn: ColumnModel | null,
        x: number,
        y: number
    ): void {
        if (!this.service.enabled()) {
            return;
        }
        this.service.show({
            coordinates: [x, y],
            isTouchEvent: false,
            dataItems: this.buildItems(row, columns, focusedColumn),
            identities: [row.selectionId]
        });
    }

    move(row: RowModel, x: number, y: number): void {
        if (!this.service.enabled()) {
            return;
        }
        this.service.move({
            coordinates: [x, y],
            isTouchEvent: false,
            identities: [row.selectionId]
        });
    }

    hide(): void {
        if (!this.service.enabled()) {
            return;
        }
        this.service.hide({ isTouchEvent: false, immediately: false });
    }
}
