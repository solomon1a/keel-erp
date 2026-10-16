# Keel Design Guidelines — Light Mode (v1.0)

Keel is calm, precise and dense enough for daily ERP work. Use the tokens in `tokens.css` (`--kl-*`) and don't hard-code values.

## Foundations
- **Primary (Keel Teal):** `#0E6B5C` (primary-500). Hover `#0A5A4D` (600), pressed `#0A4F45` (700). Tint `#ECF7F4` (50) for selected rows and subtle highlights.
- **Ink:** `#0F1B1E` (neutral-900) for text. Muted text `#66727A` (500). Borders `#D9DFE0` (200). App background `#FAFBFB` (25). Surfaces are white.
- **Accent (Brass):** `#C08A3E`. Use it sparingly: avatars, highlights and marketing. Never use it for interactive controls.
- **Semantic:** success `#15803D`, warning `#B45309`, danger `#C42B2B`, info `#2563EB`. Each one has `-bg` and `-border` tints for badges and alerts.
- **Module accents** are for launcher tiles and the module icon in the top bar only. Don't use them on buttons or in body text.
- **Spacing:** 4px base (4, 8, 12, 16, 20, 24, 32, 40, 48, 64). **Radius:** 4/6/8/12/16. Controls use 8, cards use 12, launcher tiles use about 24% of the tile size.
- **Shadows:** xs on buttons, sm on cards and tables, md on popovers, lg on modals.

## Typography (EN + 简体中文)
- Stack: `"Inter", "Noto Sans SC", "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`. Latin glyphs come from Inter and Hanzi fall through to Noto Sans SC, so a mixed string such as "订单 S00480" reads as one consistent text.
- Scale: 12 / 13 / **14 (body)** / 16 / 18 / 22 / 28 / 36. Weights are 400, 500, 600 and 700.
- Line-height: 1.45 for Latin and **1.65 for Chinese** (`:lang(zh)`). Headings use 1.25.
- Latin headings use -0.015em tracking. **Chinese gets 0 tracking**, because negative tracking makes Hanzi collide.
- Don't use italics in Chinese. For emphasis, use weight 600.
- Use `font-variant-numeric: tabular-nums` (`.tabular`) for every number column, date and amount.
- Load Noto Sans SC with `unicode-range` subsetting (Google Fonts handles this automatically) so that EN users don't download CJK glyphs.

## Buttons
- Height is 34px (md), 28px (sm) or 40–42px (lg, for auth forms). Padding is 0 14px, radius 8, weight 600.
- **Primary:** teal fill with white text. Use only one per view, such as "New quotation" or "Confirm".
- **Secondary:** white fill, neutral-200 border and neutral-800 text.
- **Ghost:** no border. Use it in toolbars ("Filters", "Group by").
- **Danger:** `#C42B2B` fill. Use it only for destructive confirmations.
- Focus state: `0 0 0 3px var(--kl-color-semantic-focus-ring)`. Disabled state: 45% opacity, no shadow.
- Labels: write EN in sentence case ("New quotation") and keep ZH short, 2–4 characters (新建报价、确认、删除).

## Inputs
- Height 40 in forms and 32 in toolbars. 1px neutral-200 border, radius 8, 12px horizontal padding.
- Labels sit above the field in 13px/600 neutral-700. Don't use placeholder-only labels.
- Focus: primary-500 border plus a focus ring. Error: danger border, with a 12px danger helper text below.
- Allow for ZH labels being about 30–40% shorter than EN, and for EN being longer. Never set fixed label widths.

## Tables (list views)
- Header row: 40px, neutral-25 background, 12px/600 neutral-500 text.
- Body rows: 44px with a neutral-100 row divider. Selected rows use primary-50.
- Right-align numbers and amounts using tabular figures. Left-align text. Use status badges in the last column.
- Keep the toolbar above the table: a search field with filter chips, Filters, Group by, a pagination count and the view switcher.
- Don't use zebra stripes or vertical gridlines.

## Cards
- White surface, neutral-200 border, radius 12, shadow-sm, 14–16px padding (24–28px for content cards).
- KPI cards show a 12px label, a 22px/700 value and a 12px semantic delta.

## Navigation
- Top bar: 52px, white, with a bottom border. It holds the logo icon and "Keel" on the left, then the current module's icon (in its accent colour) and name, then the module menu as ghost tabs with the active tab on a neutral-50 fill. Global search (⌘K), the EN/中文 switch and the avatar sit on the right.
- App launcher: an 84px tile with an accent gradient (radius 20) and a white 40px line icon, with a 14px/500 label below. Allow 28–36px gutters and centre the grid.

## Iconography
- 24px grid, 2px safe padding, **1.75 stroke**, round caps and joins, no fills.
- Use `currentColor`. Use sizes 16, 20 and 24, and 40+ only inside tiles.

## Logo
- The mark is a vertical stem (the mast or stem post), a rising sail arm and a hull-shaped wedge, which together read as a **K**. It sits on a rounded square with a 15/64 radius.
- Leave clear space equal to the stem width × 2 around the mark. The minimum size is 16px (favicon); at 16px, use the icon without the wordmark.
- Use the teal tile on light backgrounds and the mint tile (`#5FD3B8`) with ink on dark backgrounds.

## Do / Don't
| Do | Don't |
|---|---|
| Use one primary action per screen | Put several teal buttons side by side |
| Pair every status colour with a text label | Rely on colour alone |
| Leave text containers free to grow (ZH and EN lengths differ) | Truncate Chinese mid-character or with fixed widths |
| Use the neutral palette for most of the UI | Use module accents as UI colours |
| Use tabular numbers for money | Use proportional digits in tables |
| Use 0 tracking and 1.65 line-height for ZH | Use negative tracking or faux-bold/italic in Hanzi |
| Test both locales before shipping | Ship EN-only screenshots as the spec |

## EN / ZH notes
- Set `<html lang="zh-CN">` when the UI is in Chinese so that `:lang(zh)` rules and correct glyph forms apply.
- Use full-width CJK punctuation in ZH copy (，。：？) and keep ASCII for codes and numbers (S00480, ¥48,200.00).
- Date format: EN 2026-10-16 (ISO) in tables. ZH may use 2026年10月16日 in prose.
- Put a space between Hanzi and Latin or numbers in UI strings ("POS 收银", "13 个应用").

## Dark mode (v1.1)
- Turn it on with `<html data-theme="dark">`. `tokens.css` remaps the neutrals, primary, brass and semantic colours plus the shadows. Components that use `--kl-color-semantic-*` and `--kl-color-neutral-*` switch automatically, so don't hard-code `#fff`.
- Background `#0B1214`, surface `#121A1D`, border `#2A363A`, text `#EEF2F3`, muted text `#8B989D`. Primary buttons use `#1F9C85` and selected rows use `#0F2A26`.
- Status colours become lighter tints on dark backgrounds (success `#4ADE80`, warning `#F5B454`, danger `#F87171`, info `#7AA7FF`).
- On dark surfaces, use the mint brand tile (`keel-icon-dark`) and the dark lockup. Module tiles stay the same.

## Favicons (v1.1)
- At 16px and 32px, use the dedicated `favicon-16.svg` and `favicon-32.svg`. They're snapped to whole pixels, with a 3px stem and a clear 1px gap between sail and hull. `favicon.ico` contains these exact bitmaps. Use the full mark from 48px up.
