# Excel-Style Table — Power BI custom visual

A table you can work like a spreadsheet: filter and sort any column from its
header, format it far beyond the built-in table, and export or print exactly
what is on screen as CSV, Excel or PDF.

## Features

**Excel-style column filters.** Every header has a filter menu with a
searchable, counted checkbox list of the column's distinct values plus a
type-aware condition (contains / begins with / equals for text; `=`, `>`, `<`,
between for numbers; before / after / between for dates; is-blank for anything).
The value list for a column reflects the *other* columns' filters but not its
own, matching Excel's AutoFilter. Changes are staged and committed with **Apply**.

**Filter scope toggle.** *Column filters → Filter scope* chooses between:
- **This visual only** (default) — pure client-side filtering, like Excel.
- **Whole report page** — the same filters are also pushed to the report through
  the Power BI filter API, so other visuals react. Where a filter cannot be
  expressed faithfully at report level (measures, blank values, "ends with",
  and date value-lists which become a covering range) the menu says so rather
  than diverging silently.

**Sorting.** Click a header to cycle ascending → descending → none;
Shift-click to add columns to a multi-column sort, with priority numbers shown.
Blanks always sort last, and text sorts in natural order ("Item 2" before
"Item 10").

**Export & print.** Toolbar buttons export the *current view* — filtered,
sorted, with the hidden columns dropped and the formatting applied:
- **CSV** — RFC 4180 quoting with a UTF-8 BOM so Excel reads it correctly.
- **Excel** — a real `.xlsx` with fonts, fills, conditional-formatting colours,
  number formats, column widths, a frozen header row and Excel's AutoFilter.
  Values are written typed, so numbers and dates stay numbers and dates.
- **PDF** — paginated, with the header repeated on every page, page numbers,
  an optional title, and portrait/landscape/fit-to-width options. This is also
  the print path: the visual runs in a sandboxed iframe where `window.print()`
  is unreliable.

**Formatting.** Header and value fonts/colours, alternating row colours, row
density and height, gridlines and outline, cell padding, a totals row with a
per-column aggregation (sum / average / min / max / count / distinct count),
row numbers, a sticky header, and per-column settings — width, alignment,
display units, decimal places, wrap, colours, hide — keyed by query name so they
survive reordering and renaming in the field well. Conditional formatting per
column supports colour scales, data bars (with a shared zero axis when values
go negative) and up to three rules.

**Also supported:** row selection and cross-highlighting, right-click context
menus, report-canvas tooltips, bookmarks, keyboard navigation with ARIA grid
semantics, high-contrast mode, and host-locale number and date formatting.

## Requirements and limits

- Power BI Desktop or the Power BI service. Export needs the tenant setting
  **"Allow downloads from custom visuals"**; the buttons disable themselves with
  the reason in a tooltip when it is off.
- The visual receives up to **30,000 rows** (the standard data window). When the
  data is larger the toolbar says so, and filtering/sorting/export apply to that
  window.
- Exported files are capped at 30 MB by the host download service.

## Development

```bash
npm install
npm run start        # dev server; needs `pbiviz install-cert` once and
                     # "Developer visual" enabled in the Power BI service
npm run typecheck
npm run lint
npm run package      # release build: certification audit + fix applied
```

`npm run package` builds `dist/*.pbiviz`. It intentionally passes
`--certification-fix`, which strips unused `XMLHttpRequest` code from the
bundled jsPDF (the visual itself never makes network requests). That flag does
not persist between builds, which is why it lives in the script.

## Architecture

```
src/
  visual.ts              IVisual lifecycle only: rendering events, host services,
                         filter persistence and cross-filter push, format model
  app/                   React tree — App owns sort/filter/width/scroll state so
                         a formatting change never resets the user's view
    grid/                virtualised grid, header cells, keyboard navigation
    filters/             filter popover, value checklist, condition editor
  data/                  DataView -> column/row model, locale formatting, totals
  filtering/             filter state, pure filter/sort engine, filter-API bridge
  formatting/            resolved style model, conditional formatting engine
  export/                shared view snapshot -> CSV / XLSX / PDF, download gate
  settings/              format-pane cards, per-column dynamic cards
```

Two deliberate choices are worth knowing about:

- **The `.xlsx` writer is hand-written** (`src/export/xlsxWriter.ts`, ~450 lines
  over `fflate`). A full workbook library added roughly a megabyte to a bundle
  that ships as a single file, and depended on Node polyfills the visual build
  no longer provides. Writing the OOXML parts directly keeps the package at
  ~260 KB with full control over styling.
- **Sorting and filtering are our own pure functions** rather than a table
  library's. The semantics required are Excel's, not a generic grid's — blanks
  last in both directions, natural text order, whole-day date comparisons,
  facets computed from the other columns — and expressing them directly is both
  smaller and clearer than configuring a dependency to match.

Per-column format-pane settings are read from each column's own metadata
objects, because `populateFormattingSettingsModel` only hydrates visual-level
objects. The per-column cards are therefore built in `getFormattingModel()`.

## Before publishing to AppSource

- Replace the placeholder `supportUrl` and `gitHubUrl` in `pbiviz.json` with
  real URLs.
- Push the reviewed source to a lowercase `certification` branch that matches
  the submitted package, then submit through Partner Center.
