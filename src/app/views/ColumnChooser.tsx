import * as React from "react";

import { ColumnModel } from "../../data/types";

interface Props {
    /** Columns the reader may switch on and off. */
    pool: ColumnModel[];
    /** Columns the author pinned; shown for context, not editable. */
    pinned: ColumnModel[];
    selected: string[];
    /** 0 means no cap. */
    maxColumns: number;
    container: { width: number; height: number };
    onApply(columns: string[]): void;
    onClose(): void;
}

/**
 * Picks which of the author's optional columns the current view shows.
 *
 * Choices are staged and committed with Apply, matching the filter menu, so a
 * cross-filtered report page is not re-queried on every checkbox click.
 */
export function ColumnChooser(props: Props): JSX.Element {
    const { pool, pinned, selected, maxColumns, container, onApply, onClose } = props;

    const [chosen, setChosen] = React.useState<Set<string>>(() => new Set(selected));
    const [search, setSearch] = React.useState("");
    const rootRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        rootRef.current?.querySelector<HTMLElement>("input, button")?.focus();
    }, []);

    const shown = React.useMemo(() => {
        const needle = search.trim().toLowerCase();
        return needle
            ? pool.filter((column) => column.displayName.toLowerCase().indexOf(needle) >= 0)
            : pool;
    }, [pool, search]);

    const atCap = maxColumns > 0 && chosen.size >= maxColumns;

    const toggle = (key: string, on: boolean): void => {
        setChosen((previous) => {
            const next = new Set(previous);
            if (on) {
                if (maxColumns > 0 && next.size >= maxColumns) {
                    return previous;
                }
                next.add(key);
            } else {
                next.delete(key);
            }
            return next;
        });
    };

    const setAll = (on: boolean): void => {
        if (!on) {
            setChosen(new Set());
            return;
        }
        const keys = shown.map((column) => column.key);
        setChosen(new Set(maxColumns > 0 ? keys.slice(0, maxColumns) : keys));
    };

    // Sits under the toolbar button, or fills the visual when there is no room.
    const compact = container.width < 320 || container.height < 300;
    const panelStyle: React.CSSProperties = compact
        ? { left: 4, top: 4, width: Math.max(170, container.width - 8), height: container.height - 8 }
        : { left: 6, top: 34, width: 246, maxHeight: Math.max(200, container.height - 60) };

    return (
        <div
            ref={rootRef}
            className="txl-popover txl-chooser"
            style={panelStyle}
            role="dialog"
            aria-label="Choose columns"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
                if (event.key === "Escape") {
                    event.stopPropagation();
                    onClose();
                }
            }}
        >
            <div className="txl-popover-head">
                <span className="txl-popover-title">Columns</span>
                <button className="txl-icon-btn" aria-label="Close column chooser" onClick={onClose}>
                    ✕
                </button>
            </div>

            <div className="txl-popover-body">
                <div className="txl-popover-section">
                    {pool.length > 8 && (
                        <input
                            className="txl-input txl-search"
                            type="search"
                            placeholder="Search columns"
                            aria-label="Search columns"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                    )}

                    {pool.length === 0 ? (
                        <div className="txl-empty">
                            The report author has not made any columns optional.
                        </div>
                    ) : (
                        <>
                            <div className="txl-chooser-actions">
                                <button className="txl-link" onClick={() => setAll(true)}>
                                    Select all
                                </button>
                                <button className="txl-link" onClick={() => setAll(false)}>
                                    Clear
                                </button>
                                {maxColumns > 0 && (
                                    <span className="txl-chooser-count">
                                        {chosen.size} / {maxColumns}
                                    </span>
                                )}
                            </div>

                            {shown.map((column) => {
                                const on = chosen.has(column.key);
                                return (
                                    <label
                                        key={column.key}
                                        className={`txl-check${!on && atCap ? " is-disabled" : ""}`}
                                        title={column.displayName}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={on}
                                            disabled={!on && atCap}
                                            onChange={(event) =>
                                                toggle(column.key, event.target.checked)
                                            }
                                        />
                                        <span className="txl-check-label">
                                            {column.displayName}
                                        </span>
                                    </label>
                                );
                            })}
                        </>
                    )}
                </div>

                {pinned.length > 0 && (
                    <div className="txl-popover-section">
                        <div className="txl-popover-label">Always shown</div>
                        {pinned.map((column) => (
                            <label
                                key={column.key}
                                className="txl-check is-disabled"
                                title={`${column.displayName} — set by the report author`}
                            >
                                <input type="checkbox" checked readOnly disabled />
                                <span className="txl-check-label">{column.displayName}</span>
                            </label>
                        ))}
                    </div>
                )}
            </div>

            <div className="txl-popover-actions">
                <div className="txl-spacer" />
                <button className="txl-btn" onClick={onClose}>
                    Cancel
                </button>
                <button
                    className="txl-btn txl-btn-primary"
                    onClick={() => onApply(Array.from(chosen))}
                >
                    Apply
                </button>
            </div>
        </div>
    );
}
