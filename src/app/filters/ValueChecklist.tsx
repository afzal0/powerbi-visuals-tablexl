import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { DistinctValue } from "../../filtering/filterEngine";
import { BLANK_KEY } from "../../filtering/filterState";

interface Props {
    values: DistinctValue[];
    /** Keys currently ticked. */
    selected: Set<string>;
    showSearch: boolean;
    /** Height budget for the scrolling list, set by the popover. */
    listHeight: number;
    onToggle(key: string, checked: boolean): void;
    onSetMany(keys: string[], checked: boolean): void;
}

const ITEM_HEIGHT = 24;

/**
 * Excel's searchable value list. The rows are virtualised because a column can
 * easily contribute tens of thousands of distinct values within the data window.
 */
export function ValueChecklist(props: Props): JSX.Element {
    const { values, selected, showSearch, listHeight, onToggle, onSetMany } = props;
    const [search, setSearch] = React.useState("");
    const scrollRef = React.useRef<HTMLDivElement>(null);

    const filtered = React.useMemo(() => {
        const needle = search.trim().toLowerCase();
        if (!needle) {
            return values;
        }
        return values.filter((value) => value.display.toLowerCase().indexOf(needle) >= 0);
    }, [values, search]);

    const virtualizer = useVirtualizer({
        count: filtered.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => ITEM_HEIGHT,
        overscan: 12
    });

    // "Select all" acts on the search results, matching Excel's behaviour.
    const visibleKeys = React.useMemo(() => filtered.map((value) => value.key), [filtered]);
    const selectedVisible = visibleKeys.reduce(
        (count, key) => count + (selected.has(key) ? 1 : 0),
        0
    );
    const allChecked = visibleKeys.length > 0 && selectedVisible === visibleKeys.length;
    const someChecked = selectedVisible > 0 && !allChecked;

    const selectAllRef = React.useRef<HTMLInputElement>(null);
    React.useEffect(() => {
        if (selectAllRef.current) {
            selectAllRef.current.indeterminate = someChecked;
        }
    }, [someChecked]);

    return (
        <div className="txl-checklist">
            {showSearch && (
                <input
                    className="txl-input txl-search"
                    type="search"
                    placeholder="Search"
                    aria-label="Search values"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                />
            )}

            <label className="txl-check txl-check-all">
                <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allChecked}
                    onChange={(event) => onSetMany(visibleKeys, event.target.checked)}
                />
                <span>{search ? "(Select all results)" : "(Select all)"}</span>
            </label>

            <div className="txl-checklist-scroll" ref={scrollRef} style={{ height: listHeight }}>
                {filtered.length === 0 ? (
                    <div className="txl-empty">No matches</div>
                ) : (
                    <div
                        style={{
                            height: virtualizer.getTotalSize(),
                            position: "relative",
                            width: "100%"
                        }}
                    >
                        {virtualizer.getVirtualItems().map((virtualRow) => {
                            const value = filtered[virtualRow.index];
                            const label =
                                value.key === BLANK_KEY ? "(Blanks)" : value.display || "(Empty)";
                            return (
                                <label
                                    key={value.key}
                                    className="txl-check"
                                    title={`${label} — ${value.count}`}
                                    style={{
                                        position: "absolute",
                                        top: 0,
                                        left: 0,
                                        width: "100%",
                                        height: ITEM_HEIGHT,
                                        transform: `translateY(${virtualRow.start}px)`
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selected.has(value.key)}
                                        onChange={(event) =>
                                            onToggle(value.key, event.target.checked)
                                        }
                                    />
                                    <span className="txl-check-label">{label}</span>
                                    <span className="txl-check-count">{value.count}</span>
                                </label>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
