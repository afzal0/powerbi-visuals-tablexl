import { ResolvedStyle } from "../formatting/theme";

interface Props {
    style: ResolvedStyle;
}

/**
 * Shown when no fields are bound. Explains what the visual needs rather than
 * rendering an empty frame, which is also a certification requirement.
 */
export function LandingPage(props: Props): JSX.Element {
    const { style } = props;
    return (
        <div
            className="txl-landing"
            style={{ background: style.body.background, color: style.body.color }}
        >
            <div className="txl-landing-inner">
                <h2 className="txl-landing-title">Excel-style table</h2>
                <p className="txl-landing-text">
                    Add fields to <strong>Columns</strong> to build the table.
                </p>
                <ul className="txl-landing-list">
                    <li>Filter any column from its header, Excel style</li>
                    <li>Sort one column, or several with Shift-click</li>
                    <li>Export the current view to CSV, Excel or PDF</li>
                </ul>
            </div>
        </div>
    );
}
