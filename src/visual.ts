"use strict";

import "./../style/visual.less";

import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import VisualObjectInstance = powerbi.VisualObjectInstance;

import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { formattingSettings, FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { IFilter } from "powerbi-models";

import { App } from "./app/App";
import { ExportAvailability, HostActions } from "./app/appTypes";
import { transform } from "./data/transform";
import { TableModel } from "./data/types";
import { checkExportAvailability, downloadFile, ExportKind } from "./export/download";
import { buildCsv } from "./export/exportCsv";
import { buildPdf } from "./export/exportPdf";
import { buildWorkbook } from "./export/xlsxWriter";
import { ExportView } from "./export/viewSnapshot";
import { applyToHost, buildJsonFilters, restoreFromJsonFilters } from "./filtering/filterBridge";
import {
    deserializeFilters,
    FilterMap,
    serializeFilters
} from "./filtering/filterState";
import { resolveStyle } from "./formatting/theme";
import { SelectionHandler } from "./interactions/selection";
import { TooltipHandler } from "./interactions/tooltips";
import {
    buildColumnFormattingGroups,
    buildConditionalFormattingGroups,
    buildTotalsGroups,
    COLUMN_OBJECT,
    CONDITIONAL_OBJECT
} from "./settings/columnCards";
import { TableXLSettings } from "./settings/settingsModel";

const GENERAL_OBJECT = "general";
const SAVED_STATE_PROPERTY = "savedState";
const CROSS_FILTER_DEBOUNCE_MS = 200;
const PERSIST_DEBOUNCE_MS = 400;

/**
 * CompositeCard is abstract, so per-column cards are assembled as plain objects
 * with the same shape rather than through a subclass per card.
 */
function compositeCard(
    name: string,
    displayName: string,
    groups: formattingSettings.Group[]
): formattingSettings.CompositeCard {
    return { name, displayName, groups } as unknown as formattingSettings.CompositeCard;
}

/**
 * An Excel-style table visual: per-column filtering and sorting, rich
 * formatting, and export of the current view to CSV, Excel or PDF.
 *
 * This class owns only the host lifecycle. All rendering and view state lives
 * in the React tree, which is mounted once and re-rendered with fresh props.
 */
export class Visual implements IVisual {
    private readonly host: IVisualHost;
    private readonly target: HTMLElement;
    private readonly root: Root;
    private readonly formattingService: FormattingSettingsService;
    private readonly selection: SelectionHandler;
    private readonly tooltips: TooltipHandler;
    private readonly actions: HostActions;

    private settings: TableXLSettings = new TableXLSettings();
    private model: TableModel | null = null;
    private snapshotId = 0;
    private pendingOptions: VisualUpdateOptions | null = null;
    private renderedSnapshotId = -1;

    private filters: FilterMap = {};
    private filtersRevision = 0;
    private initialised = false;
    private lastPushedJson = "";
    private exportAvailability: ExportAvailability = { ok: false };

    private crossFilterTimer: number | null = null;
    private persistTimer: number | null = null;
    private destroyed = false;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.target = options.element;
        this.formattingService = new FormattingSettingsService(this.host.createLocalizationManager());
        this.root = createRoot(this.target);
        this.selection = new SelectionHandler(this.host, () => this.render());
        this.tooltips = new TooltipHandler(this.host);

        this.actions = {
            onFiltersChanged: (filters) => this.handleFiltersChanged(filters),
            onSelectRow: (row, multiSelect) => {
                void this.selection.select(row, multiSelect).then(() => this.render());
            },
            onContextMenu: (row, x, y) => this.selection.showContextMenu(row, x, y),
            onColumnResize: (columnKey, width) => this.persistColumnWidth(columnKey, width),
            onCellHover: (row, columnKey, x, y) => {
                const columns = this.model ? this.model.columns : [];
                const column = columnKey
                    ? (columns.find((candidate) => candidate.key === columnKey) ?? null)
                    : null;
                this.tooltips.show(row, columns, column, x, y);
            },
            onCellMove: (row, x, y) => this.tooltips.move(row, x, y),
            onHoverEnd: () => this.tooltips.hide(),
            onRendered: (snapshotId) => this.finishRendering(snapshotId),
            onRenderFailed: (error) => this.failRendering(error),
            exportFile: (kind, view) => this.exportFile(kind, view)
        };

        // Export buttons stay disabled until the host confirms the privilege.
        void checkExportAvailability(this.host).then((availability) => {
            if (this.destroyed) {
                return;
            }
            this.exportAvailability = availability;
            this.render();
        });
    }

    public update(options: VisualUpdateOptions): void {
        this.pendingOptions = options;
        try {
            this.host.eventService.renderingStarted(options);

            const dataView: DataView | undefined = options.dataViews?.[0];
            this.settings = this.formattingService.populateFormattingSettingsModel(
                TableXLSettings,
                dataView
            );
            this.model = transform(dataView, this.host);
            this.selection.setRows(this.model ? this.model.rows : []);

            this.adoptHostFilters(options, dataView);
            this.snapshotId++;
            this.render(options.viewport);
        } catch (error) {
            this.failRendering(error);
        }
    }

    /**
     * Picks up filter state the visual did not set itself: the state persisted
     * with the report on first load, and later any report-level filter change
     * that did not originate here (a bookmark, or the report filter pane).
     */
    private adoptHostFilters(options: VisualUpdateOptions, dataView: DataView | undefined): void {
        const columns = this.model ? this.model.columns : [];
        const crossScope = this.settings.filtering.scope.value === "cross";
        const incomingJson = JSON.stringify(options.jsonFilters ?? []);

        if (!this.initialised) {
            this.initialised = true;
            const restored = crossScope
                ? restoreFromJsonFilters(options.jsonFilters as IFilter[] | undefined, columns)
                : {};
            const savedRaw = dataView?.metadata?.objects?.[GENERAL_OBJECT]?.[
                SAVED_STATE_PROPERTY
            ] as string | undefined;
            const saved = deserializeFilters(savedRaw);
            // Report filters win when present; otherwise fall back to the
            // state saved alongside the visual.
            this.filters = Object.keys(restored).length > 0 ? restored : saved;
            this.filtersRevision++;
            this.lastPushedJson = incomingJson;
            return;
        }

        if (!crossScope) {
            return;
        }
        if (incomingJson === this.lastPushedJson) {
            return;
        }
        this.lastPushedJson = incomingJson;

        // The host may normalise what we pushed, and some filters (date value
        // lists, for instance) cannot round-trip exactly. Compare the incoming
        // filters against our own state projected through the same round trip,
        // so only a genuinely external change replaces what the user set up.
        const incoming = restoreFromJsonFilters(
            options.jsonFilters as IFilter[] | undefined,
            columns
        );
        const echoOfOurs = restoreFromJsonFilters(
            buildJsonFilters(columns, this.filters),
            columns
        );
        if (serializeFilters(incoming) === serializeFilters(echoOfOurs)) {
            return;
        }

        this.filters = incoming;
        this.filtersRevision++;
    }

    private handleFiltersChanged(filters: FilterMap): void {
        this.filters = filters;

        if (this.persistTimer !== null) {
            clearTimeout(this.persistTimer);
        }
        this.persistTimer = window.setTimeout(() => {
            this.persistTimer = null;
            this.persistFilterState(filters);
        }, PERSIST_DEBOUNCE_MS);

        if (this.settings.filtering.scope.value !== "cross") {
            return;
        }

        // Each push re-queries the whole page, so coalesce rapid changes.
        if (this.crossFilterTimer !== null) {
            clearTimeout(this.crossFilterTimer);
        }
        this.crossFilterTimer = window.setTimeout(() => {
            this.crossFilterTimer = null;
            const columns = this.model ? this.model.columns : [];
            const jsonFilters = buildJsonFilters(columns, filters);
            this.lastPushedJson = JSON.stringify(jsonFilters);
            applyToHost(this.host, jsonFilters);
        }, CROSS_FILTER_DEBOUNCE_MS);
    }

    /** Keeps local filters across report reloads, where nothing is pushed. */
    private persistFilterState(filters: FilterMap): void {
        const instance: VisualObjectInstance = {
            objectName: GENERAL_OBJECT,
            selector: null,
            properties: { [SAVED_STATE_PROPERTY]: serializeFilters(filters) }
        };
        this.host.persistProperties({ merge: [instance] });
    }

    private persistColumnWidth(columnKey: string, width: number): void {
        const instance: VisualObjectInstance = {
            objectName: COLUMN_OBJECT,
            // A metadata selector addresses the column by its query name.
            selector: { metadata: columnKey } as powerbi.data.Selector,
            properties: { width }
        };
        this.host.persistProperties({ merge: [instance] });
    }

    private async exportFile(kind: ExportKind, view: ExportView): Promise<ExportAvailability> {
        const exportSettings = this.settings.exportSettings;
        const baseName = exportSettings.fileName.value || "table-export";

        if (kind === "csv") {
            return downloadFile(this.host, "csv", baseName, buildCsv(view), "Table export (CSV)");
        }
        if (kind === "xlsx") {
            const bytes = buildWorkbook(view, {
                sheetName: baseName,
                autoFilter: exportSettings.xlsxAutoFilter.value,
                freezeHeader: exportSettings.xlsxFreezeHeader.value
            });
            return downloadFile(this.host, "xlsx", baseName, bytes, "Table export (Excel)");
        }
        const buffer = buildPdf(view, {
            title: exportSettings.pdfTitle.value,
            orientation: exportSettings.pdfOrientation.value as "portrait" | "landscape" | "auto",
            pageSize: exportSettings.pdfPageSize.value as string,
            fitToWidth: exportSettings.pdfFitToWidth.value,
            repeatHeader: exportSettings.pdfRepeatHeader.value,
            pageNumbers: exportSettings.pdfPageNumbers.value
        });
        return downloadFile(this.host, "pdf", baseName, buffer, "Table export (PDF)");
    }

    private lastViewport = { width: 0, height: 0 };

    private render(viewport?: powerbi.IViewport): void {
        if (this.destroyed) {
            return;
        }
        if (viewport) {
            this.lastViewport = { width: viewport.width, height: viewport.height };
        }
        const style = resolveStyle(this.settings, this.host.colorPalette);
        this.root.render(
            React.createElement(App, {
                snapshotId: this.snapshotId,
                model: this.model,
                settings: this.settings,
                style,
                locale: this.host.locale,
                viewport: this.lastViewport,
                hostFilters: this.filters,
                filtersRevision: this.filtersRevision,
                selectedRowIds: this.selection.getSelectedRowIds(),
                allowInteractions: this.host.hostCapabilities.allowInteractions !== false,
                exportAvailability: this.exportAvailability,
                actions: this.actions
            })
        );
    }

    /**
     * Signals completion once the React commit for a given update has painted.
     * Firing here rather than at the end of update() is what makes the reported
     * render time reflect what the user actually sees.
     */
    private finishRendering(snapshotId: number): void {
        if (!this.pendingOptions || snapshotId === this.renderedSnapshotId) {
            return;
        }
        this.renderedSnapshotId = snapshotId;
        this.host.eventService.renderingFinished(this.pendingOptions);
    }

    private failRendering(error: unknown): void {
        const message = error instanceof Error ? error.message : String(error);
        if (this.pendingOptions) {
            this.host.eventService.renderingFailed(this.pendingOptions, message);
        }
    }

    /**
     * Builds the format pane. Per-column cards are appended here because the
     * formatting service hydrates visual-level objects only, so column settings
     * are read from each column's own metadata instead.
     */
    public getFormattingModel(): powerbi.visuals.FormattingModel {
        const columns = this.model ? this.model.columns : [];
        const cards: formattingSettings.Cards[] = this.settings.baseCards();

        if (columns.length > 0) {
            // Totals gain one aggregation group per column.
            this.settings.totals.groups = [
                this.settings.totals.appearance,
                ...buildTotalsGroups(columns)
            ];
            cards.push(
                compositeCard(COLUMN_OBJECT, "Specific column", buildColumnFormattingGroups(columns)),
                compositeCard(
                    CONDITIONAL_OBJECT,
                    "Conditional formatting",
                    buildConditionalFormattingGroups(columns)
                )
            );
        }

        this.settings.cards = cards;
        return this.formattingService.buildFormattingModel(this.settings);
    }

    public destroy(): void {
        this.destroyed = true;
        if (this.crossFilterTimer !== null) {
            clearTimeout(this.crossFilterTimer);
        }
        if (this.persistTimer !== null) {
            clearTimeout(this.persistTimer);
        }
        this.tooltips.hide();
        this.root.unmount();
    }
}
