import { ExportKind } from "../export/download";
import { ResolvedStyle } from "../formatting/theme";

interface Props {
    style: ResolvedStyle;
    enableCsv: boolean;
    enableXlsx: boolean;
    enablePdf: boolean;
    exportAvailable: boolean;
    exportMessage?: string;
    busyKind: ExportKind | null;
    filteredCount: number;
    totalCount: number;
    hasFilters: boolean;
    truncated: boolean;
    status: string | null;
    onExport(kind: ExportKind): void;
    onClearFilters(): void;
}

const LABELS: { [K in ExportKind]: string } = {
    csv: "CSV",
    xlsx: "Excel",
    pdf: "PDF"
};

/**
 * Actions strip above the grid. Export buttons are disabled — with the reason
 * surfaced as a tooltip — whenever the host or tenant blocks downloads, rather
 * than failing only once the user clicks.
 */
export function Toolbar(props: Props): JSX.Element {
    const {
        style,
        enableCsv,
        enableXlsx,
        enablePdf,
        exportAvailable,
        exportMessage,
        busyKind,
        filteredCount,
        totalCount,
        hasFilters,
        truncated,
        status,
        onExport,
        onClearFilters
    } = props;

    const kinds: ExportKind[] = [];
    if (enableCsv) {
        kinds.push("csv");
    }
    if (enableXlsx) {
        kinds.push("xlsx");
    }
    if (enablePdf) {
        kinds.push("pdf");
    }

    const countLabel = hasFilters
        ? `${filteredCount.toLocaleString()} of ${totalCount.toLocaleString()} rows`
        : `${totalCount.toLocaleString()} rows`;

    return (
        <div
            className="txl-toolbar"
            style={{
                color: style.body.color,
                background: style.header.background,
                borderBottom: `1px solid ${style.grid.color}`
            }}
        >
            {kinds.map((kind) => (
                <button
                    key={kind}
                    className="txl-btn"
                    disabled={!exportAvailable || busyKind !== null}
                    title={exportAvailable ? `Export as ${LABELS[kind]}` : exportMessage}
                    onClick={() => onExport(kind)}
                >
                    {busyKind === kind ? "Working…" : LABELS[kind]}
                </button>
            ))}

            {hasFilters && (
                <button className="txl-btn" onClick={onClearFilters} title="Clear all filters">
                    Clear filters
                </button>
            )}

            <div className="txl-spacer" />

            {status && <span className="txl-status">{status}</span>}

            {truncated && (
                <span
                    className="txl-warn"
                    title="Only the first 30,000 rows are available to this visual."
                >
                    First 30,000 rows
                </span>
            )}

            <span className="txl-count">{countLabel}</span>
        </div>
    );
}
