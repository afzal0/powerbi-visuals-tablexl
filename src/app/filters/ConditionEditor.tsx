import * as React from "react";

import { ColumnKind } from "../../data/types";
import {
    ConditionFilter,
    FilterOp,
    isBinaryOp,
    isUnaryOp,
    operatorLabel,
    operatorsFor
} from "../../filtering/filterState";

interface Props {
    kind: ColumnKind;
    value: ConditionFilter | null;
    onChange(value: ConditionFilter | null): void;
}

/** Native input type so the browser supplies the right keyboard and picker. */
function inputType(kind: ColumnKind): string {
    if (kind === "number") {
        return "number";
    }
    if (kind === "date") {
        return "date";
    }
    return "text";
}

/**
 * The condition half of a column filter: an operator plus one or two operands,
 * mirroring Excel's Text/Number/Date Filters submenus.
 */
export function ConditionEditor(props: Props): JSX.Element {
    const { kind, value, onChange } = props;
    const operators = operatorsFor(kind);
    const op: FilterOp | "" = value ? value.op : "";

    const update = (next: Partial<ConditionFilter>): void => {
        const base: ConditionFilter = value ?? { kind: "condition", op: operators[0], v1: "", v2: "" };
        onChange({ ...base, ...next, kind: "condition" });
    };

    const handleOperator = (event: React.ChangeEvent<HTMLSelectElement>): void => {
        const next = event.target.value as FilterOp | "";
        if (next === "") {
            onChange(null);
            return;
        }
        update({ op: next });
    };

    return (
        <div className="txl-condition">
            <select
                className="txl-select"
                aria-label="Filter condition"
                value={op}
                onChange={handleOperator}
            >
                <option value="">(no condition)</option>
                {operators.map((candidate) => (
                    <option key={candidate} value={candidate}>
                        {operatorLabel(candidate, kind)}
                    </option>
                ))}
            </select>

            {value && !isUnaryOp(value.op) && (
                <input
                    className="txl-input"
                    type={inputType(kind)}
                    aria-label="Filter value"
                    value={value.v1}
                    placeholder={kind === "text" ? "value" : ""}
                    onChange={(event) => update({ v1: event.target.value })}
                />
            )}

            {value && isBinaryOp(value.op) && (
                <>
                    <span className="txl-condition-and">and</span>
                    <input
                        className="txl-input"
                        type={inputType(kind)}
                        aria-label="Second filter value"
                        value={value.v2}
                        onChange={(event) => update({ v2: event.target.value })}
                    />
                </>
            )}
        </div>
    );
}
