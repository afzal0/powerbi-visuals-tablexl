import * as React from "react";

import { ResolvedStyle } from "../../formatting/theme";
import { MAX_VIEW_NAME_LENGTH, ViewDef } from "../../views/viewTypes";

interface Props {
    views: ViewDef[];
    activeId: string;
    locked: boolean;
    canAdd: boolean;
    style: ResolvedStyle;
    /** Explains where a reader's sheets live; shown as a hint on the strip. */
    persistenceHint: string | null;
    onActivate(id: string): void;
    onCreate(): void;
    onRename(id: string, name: string): void;
    onDelete(id: string): void;
}

/**
 * Excel-style worksheet tabs along the bottom of the visual.
 *
 * Arrow keys move between tabs with a roving tabindex rather than the browser
 * shortcuts Excel uses — Ctrl+PageUp/PageDown switch browser tabs and cannot be
 * intercepted from inside the visual's sandboxed iframe.
 */
export function ViewTabs(props: Props): JSX.Element {
    const {
        views,
        activeId,
        locked,
        canAdd,
        style,
        persistenceHint,
        onActivate,
        onCreate,
        onRename,
        onDelete
    } = props;

    const [editing, setEditing] = React.useState<string | null>(null);
    const [draft, setDraft] = React.useState("");
    const inputRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        if (editing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editing]);

    const commit = (): void => {
        if (editing) {
            const name = draft.trim();
            if (name) {
                onRename(editing, name);
            }
        }
        setEditing(null);
    };

    const startRename = (view: ViewDef): void => {
        if (locked) {
            return;
        }
        setDraft(view.name);
        setEditing(view.id);
    };

    const onTabKeyDown = (event: React.KeyboardEvent, index: number): void => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
            return;
        }
        event.preventDefault();
        const next =
            event.key === "ArrowLeft"
                ? (index - 1 + views.length) % views.length
                : (index + 1) % views.length;
        onActivate(views[next].id);
    };

    return (
        <div
            className="txl-tabs"
            role="tablist"
            aria-label="Views"
            style={{
                background: style.header.background,
                borderTop: `1px solid ${style.grid.color}`,
                color: style.header.color
            }}
        >
            {views.map((view, index) => {
                const isActive = view.id === activeId;
                return editing === view.id ? (
                    <input
                        key={view.id}
                        ref={inputRef}
                        className="txl-tab-input"
                        value={draft}
                        maxLength={MAX_VIEW_NAME_LENGTH}
                        aria-label="View name"
                        onChange={(event) => setDraft(event.target.value)}
                        onBlur={commit}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                commit();
                            } else if (event.key === "Escape") {
                                event.preventDefault();
                                setEditing(null);
                            }
                        }}
                    />
                ) : (
                    <div
                        key={view.id}
                        className={`txl-tab${isActive ? " is-active" : ""}`}
                        role="tab"
                        aria-selected={isActive}
                        tabIndex={isActive ? 0 : -1}
                        title={view.name}
                        style={
                            isActive
                                ? { background: style.body.background, color: style.body.color }
                                : undefined
                        }
                        onClick={() => onActivate(view.id)}
                        onDoubleClick={() => startRename(view)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                onActivate(view.id);
                            } else if (event.key === "F2") {
                                event.preventDefault();
                                startRename(view);
                            } else {
                                onTabKeyDown(event, index);
                            }
                        }}
                    >
                        <span className="txl-tab-name">{view.name}</span>
                        {!locked && views.length > 1 && isActive && (
                            <button
                                className="txl-tab-close"
                                aria-label={`Delete ${view.name}`}
                                title={`Delete ${view.name}`}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onDelete(view.id);
                                }}
                            >
                                ✕
                            </button>
                        )}
                    </div>
                );
            })}

            {!locked && (
                <button
                    className="txl-tab-add"
                    aria-label="Add view"
                    title={canAdd ? "Add view" : "The maximum number of views has been reached"}
                    disabled={!canAdd}
                    onClick={onCreate}
                >
                    +
                </button>
            )}

            <span className="txl-spacer" />
            {persistenceHint && <span className="txl-tabs-hint">{persistenceHint}</span>}
        </div>
    );
}
