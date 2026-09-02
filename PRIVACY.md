# Privacy policy — Excel-Style Table

**Last updated:** 2 September 2026
**Publisher:** Afzal Khan
**Contact:** fzlkhan0@gmail.com

## Summary

Excel-Style Table does not collect, transmit, store or share any data. It has
no network access, no analytics and no telemetry. Everything it does happens
inside the Power BI session running on your own device.

## What the visual does with your data

Power BI passes the visual the rows and columns you place in its field wells.
The visual holds those values in memory only for as long as it takes to draw
the table, filter and sort it, and build any file you ask it to export. Nothing
is written anywhere else, and nothing outlives the browser session.

Filtering, sorting and exporting all run locally. When you export to CSV, Excel
or PDF, the file is generated on your device and handed to Power BI's own
download service, which saves it wherever you choose. The file never passes
through the publisher or any third party.

## Network access

The visual makes no network requests of any kind — no HTTP calls, no
WebSockets, no external fonts, images or scripts. Every library it uses is
bundled inside the package.

This is verifiable rather than a promise: the published package is scanned by
Microsoft's own tooling (`pbiviz package --certification-audit`) and reports
zero external requests. The visual declares no `WebAccess` privilege, so the
Power BI sandbox would block such a request even if one existed.

## Data collected by the publisher

None. The publisher receives no data from the visual — no usage statistics, no
error reports, no identifiers, no contents of your reports. There is no account
to create and no service to sign in to.

## Cookies and local storage

The visual sets no cookies and writes nothing to browser storage.

## Settings you configure

Formatting choices, column widths and saved filters are stored by Power BI
inside your own report file, using Power BI's standard settings mechanism. They
are your data, held under your organisation's Power BI tenant, and the
publisher has no access to them.

## Permissions the visual requests

The visual declares a single Power BI privilege, `ExportContent`, which allows
it to hand an exported file to Power BI's download service. It is marked
non-essential: if your administrator has downloads from custom visuals turned
off, the table works normally and only the export buttons are disabled.

## Your data protection rights

Because the publisher neither collects nor processes personal data through this
visual, there is no personal data to access, correct, export or erase. Data
shown in the visual remains under the control of your own organisation and its
Power BI tenant, governed by that organisation's policies and Microsoft's
[Power BI privacy terms](https://privacy.microsoft.com/privacystatement).

## Children

The visual is a business reporting component and is not directed at children.

## Changes to this policy

Any change will be published in this file, with the date above updated. The
revision history is public in the repository.

## Contact

Questions about this policy: fzlkhan0@gmail.com, or open an issue at
https://github.com/afzal0/powerbi-visuals-tablexl/issues
