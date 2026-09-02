import * as React from "react";

import { ColumnModel } from "../../data/types";
import { DistinctValue } from "../../filtering/filterEngine";
import {
    ColumnFilter,
    ConditionFilter,
    ValuesFilter
} from "../../filtering/filterState";
import { SortDirection } from "../../filtering/filterEngine";
import { ConditionEditor } from "./ConditionEditor";
import { ValueChecklist } from "./ValueChecklist";

export interface AnchorRect {
    left: number;
    top: number;
    bottom: number;
    right: number;
}

interface Props {
    column: ColumnModel;
    anchor: AnchorRect;
    container: { width: number; height: number };
    values: DistinctValue[];
    current: ColumnFilter | undefined;
    showSearch: boolean;
    showConditions: boolean;
    sortDirection: SortDirection | null;
    /** Explains any divergence between the visual and a report-page filter. */
    scopeNote: string | null;
    onApply(filter: ColumnFilter | null): void;
    onSort(direction: SortDirection | null): void;
    onClose(): void;
}

const POPOVER_WIDTH = 260;
/** Below this much free space the menu is not usable as a dropdown. */
const MIN_USABLE_HEIGHT = 240;
/** Head, sort, condition, labels and actions — everything but the value list. */
const CHROME_HEIGHT = 292;
/** Compact mode lays the sort actions out in a row, which reclaims a block. */
const COMPACT_CHROME_SAVING = 62;

/**
 * Excel's column filter menu: sort actions, an optional condition, and a
 * searchable value list. Changes are staged and committed with Apply so that a
 * cross-filtered report page is not re-queried on every checkbox click.
 */
export function FilterPopover(props: Props): JSX.Element {
    const {
        column,
        anchor,
        container,
        values,
        current,
        showSearch,
        showConditions,
        sortDirection,
        scopeNote,
        onApply,
        onSort,
        onClose
    } = props;

    const allKeys = React.useMemo(() => values.map((value) => value.key), [values]);

    // Staged state: an absent values-filter means "everything is ticked".
    const [selected, setSelected] = React.useState<Set<string>>(() => {
        if (current && current.kind === "values") {
            return new Set(current.included);
        }
        return new Set(allKeys);
    });
    const [condition, setCondition] = React.useState<ConditionFilter | null>(
        current && current.kind === "condition" ? current : null
    );

    const rootRef = React.useRef<HTMLDivElement>(null);

    // Focus the panel on open so keyboard users land inside it, and trap Escape.
    React.useEffect(() => {
        const node = rootRef.current;
        if (!node) {
            return;
        }
        const focusable = node.querySelector<HTMLElement>(
            "button, input, select, [tabindex]:not([tabindex='-1'])"
        );
        focusable?.focus();
    }, []);

    const handleKeyDown = (event: React.KeyboardEvent): void => {
        if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
            return;
        }
        if (event.key !== "Tab") {
            return;
        }
        const node = rootRef.current;
        if (!node) {
            return;
        }
        const items = Array.from(
            node.querySelectorAll<HTMLElement>(
                "button:not([disabled]), input:not([disabled]), select:not([disabled])"
            )
        ).filter((element) => element.offsetParent !== null);
        if (items.length === 0) {
            return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    const toggle = (key: string, checked: boolean): void => {
        setSelected((previous) => {
            const next = new Set(previous);
            if (checked) {
                next.add(key);
            } else {
                next.delete(key);
            }
            return next;
        });
    };

    const setMany = (keys: string[], checked: boolean): void => {
        setSelected((previous) => {
            const next = new Set(previous);
            for (const key of keys) {
                if (checked) {
                    next.add(key);
                } else {
                    next.delete(key);
                }
            }
            return next;
        });
    };

    const apply = (): void => {
        if (condition) {
            onApply(condition);
            return;
        }
        // Nothing excluded means the column is unfiltered.
        if (selected.size === allKeys.length) {
            onApply(null);
            return;
        }
        const filter: ValuesFilter = { kind: "values", included: Array.from(selected) };
        onApply(filter);
    };

    const clear = (): void => {
        setSelected(new Set(allKeys));
        setCondition(null);
        onApply(null);
    };

    const spaceBelow = container.height - anchor.bottom - 8;
    const spaceAbove = anchor.top - 8;

    /*
     * In a small visual there is nowhere to hang a dropdown without cutting off
     * its buttons, so the menu becomes a sheet covering the visual instead.
     * That keeps Apply reachable however little room the report gives us.
     */
    const compact =
        container.width < 320 || Math.max(spaceBelow, spaceAbove) < MIN_USABLE_HEIGHT;

    let style: React.CSSProperties;
    let panelHeight: number;

    if (compact) {
        panelHeight = Math.max(150, container.height - 8);
        style = {
            left: 4,
            top: 4,
            width: Math.max(170, container.width - 8),
            height: panelHeight
        };
    } else {
        const openUpwards = spaceBelow < MIN_USABLE_HEIGHT && spaceAbove > spaceBelow;
        const width = Math.min(POPOVER_WIDTH, container.width - 8);
        panelHeight = Math.min(
            container.height - 8,
            Math.max(MIN_USABLE_HEIGHT, openUpwards ? spaceAbove : spaceBelow)
        );
        style = {
            left: Math.max(4, Math.min(anchor.left, Math.max(4, container.width - width - 4))),
            width,
            maxHeight: panelHeight
        };
        if (openUpwards) {
            style.bottom = Math.max(4, container.height - anchor.top + 2);
        } else {
            style.top = anchor.bottom + 2;
        }
    }

    // The list gives up its space first; the body scrolls if that is not enough.
    const chrome = compact ? CHROME_HEIGHT - COMPACT_CHROME_SAVING : CHROME_HEIGHT;
    const listHeight = Math.max(84, Math.min(240, panelHeight - chrome));

    return (
        <div
            ref={rootRef}
            className={`txl-popover${compact ? " is-compact" : ""}`}
            style={style}
            role="dialog"
            aria-label={`Filter ${column.displayName}`}
            onKeyDown={handleKeyDown}
            onClick={(event) => event.stopPropagation()}
        >
            <div className="txl-popover-head">
                <span className="txl-popover-title" title={column.displayName}>
                    {column.displayName}
                </span>
                <button className="txl-icon-btn" aria-label="Close filter menu" onClick={onClose}>
                    ✕
                </button>
            </div>

            <div className="txl-popover-body">
            <div className="txl-popover-sort">
                <button
                    className={`txl-menu-btn${sortDirection === "asc" ? " is-active" : ""}`}
                    onClick={() => onSort("asc")}
                >
                    Sort A → Z
                </button>
                <button
                    className={`txl-menu-btn${sortDirection === "desc" ? " is-active" : ""}`}
                    onClick={() => onSort("desc")}
                >
                    Sort Z → A
                </button>
                {sortDirection && (
                    <button className="txl-menu-btn" onClick={() => onSort(null)}>
                        Clear sort
                    </button>
                )}
            </div>

            {showConditions && (
                <div className="txl-popover-section">
                    <div className="txl-popover-label">Condition</div>
                    <ConditionEditor
                        kind={column.kind}
                        value={condition}
                        onChange={setCondition}
                    />
                </div>
            )}

            <div className="txl-popover-section txl-popover-values">
                <div className="txl-popover-label">Values</div>
                <ValueChecklist
                    values={values}
                    selected={selected}
                    showSearch={showSearch}
                    listHeight={listHeight}
                    onToggle={toggle}
                    onSetMany={setMany}
                />
                {condition && (
                    <div className="txl-note">A condition is set; it overrides the ticked values.</div>
                )}
            </div>
            </div>

            {scopeNote && <div className="txl-note txl-note-scope">{scopeNote}</div>}

            <div className="txl-popover-actions">
                <button className="txl-btn" onClick={clear}>
                    Clear
                </button>
                <div className="txl-spacer" />
                <button className="txl-btn" onClick={onClose}>
                    Cancel
                </button>
                <button className="txl-btn txl-btn-primary" onClick={apply}>
                    Apply
                </button>
            </div>
        </div>
    );
}
