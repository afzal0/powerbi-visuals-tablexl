# Marketplace assets

Everything AppSource asks for, plus the harnesses that generate it. Regenerate
any image by re-running the scripts — nothing here is hand-edited, so the assets
stay in step with the visual's real styling.

| Asset | File | AppSource requirement | Status |
| --- | --- | --- | --- |
| Marketplace logo | `logo-300.png` | PNG, exactly 300×300 | ✅ |
| Screenshots | `screenshots/*.png` | PNG, exactly 1366×768, ≤1024 KB, 1–5 of them | ✅ 5 |
| In-product icon | `../assets/icon.png` | 20×20, shown in the visualizations pane | ✅ |
| Privacy policy | `../PRIVACY.md` | public https URL | ✅ |
| EULA | `../EULA.md` | own EULA or Microsoft's standard contract | ⚠️ two fields to complete |
| Support URL | GitHub issues | public https URL | ✅ |
| Sample `.pbix` | — | required, must work offline | ❌ **still needed** |

## Regenerating

```bash
# Screenshots — all five, straight to spec
./marketing/shoot.sh

# Logo (300×300) and the in-product icon
open marketing/logo.html marketing/icon-small.html   # or re-run the Chrome
                                                     # headless commands in git log
```

`shot.html` takes a `?scene=1..5` parameter and renders the visual inside a
Power BI-style report page at exactly 1366×768. Open it in a browser to preview
a scene before capturing.

## An important caveat on the screenshots

These are rendered from the visual's own stylesheet and layout rules, so they
are an accurate picture of what it draws — but they are **produced by a harness,
not captured from a running Power BI report**. Two things differ from a real
capture:

- Fonts fall back to Helvetica on macOS; Power BI on Windows renders Segoe UI.
- The surrounding report chrome is a simplified stand-in, not Power BI's own.

Before submitting, import the `.pbiviz` into Power BI Desktop, build the sample
report, and retake these from the real thing. Keep the framing and the callout
text — only the capture source needs to change.
