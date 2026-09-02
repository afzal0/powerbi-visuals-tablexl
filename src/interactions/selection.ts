import powerbi from "powerbi-visuals-api";
import ISelectionId = powerbi.visuals.ISelectionId;
// The selection manager exchanges the opaque extensibility variant of the id.
import IHostSelectionId = powerbi.extensibility.ISelectionId;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;

import { RowModel } from "../data/types";

/**
 * Wraps the host selection manager and keeps the row ids the grid needs to
 * highlight in sync with it, including selections restored from a bookmark.
 */
export class SelectionHandler {
    private readonly manager: ISelectionManager;
    private selectedKeys = new Set<string>();
    private rows: RowModel[] = [];

    constructor(host: IVisualHost, onExternalChange: () => void) {
        this.manager = host.createSelectionManager();
        // Bookmarks and cross-visual clears arrive through this callback.
        this.manager.registerOnSelectCallback((ids: IHostSelectionId[]) => {
            this.selectedKeys = new Set(ids.map((id) => (id as ISelectionId).getKey()));
            onExternalChange();
        });
    }

    /** Refreshes the row set the handler resolves selections against. */
    setRows(rows: RowModel[]): void {
        this.rows = rows;
    }

    /** Row ids currently highlighted, derived from the manager's selection. */
    getSelectedRowIds(): number[] {
        if (this.selectedKeys.size === 0) {
            return [];
        }
        const result: number[] = [];
        for (const row of this.rows) {
            if (this.selectedKeys.has(row.selectionId.getKey())) {
                result.push(row.id);
            }
        }
        return result;
    }

    async select(row: RowModel | null, multiSelect: boolean): Promise<void> {
        if (!row) {
            await this.manager.clear();
            this.selectedKeys.clear();
            return;
        }
        const ids = await this.manager.select(row.selectionId, multiSelect);
        this.selectedKeys = new Set(ids.map((id) => (id as ISelectionId).getKey()));
    }

    /** Right-click support, required for certification. */
    showContextMenu(row: RowModel | null, x: number, y: number): void {
        // Passing an empty selection id opens the visual-level menu.
        const selectionId = row ? row.selectionId : ({} as IHostSelectionId);
        this.manager.showContextMenu(selectionId, { x, y });
    }

    hasSelection(): boolean {
        return this.selectedKeys.size > 0;
    }
}
