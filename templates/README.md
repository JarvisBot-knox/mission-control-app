# App Factory Templates

Static HTML templates used by the App Factory to generate client-facing sites and internal dashboards. Every template is self-contained — no server required, opens directly in a browser.

---

## Templates

### `premium_static_app`

**Purpose:** Public-facing marketing / product site for a client app. Intended for use as the delivered artifact when a build job produces a static site.

**Layout:** Nav → Hero (headline + CTA + visual) → 3-feature row → About/body with stats → Footer.

### `operator_dashboard`

**Purpose:** Internal-facing operator or admin dashboard. Intended for monitoring, reporting, or ops tooling delivered as a static HTML file.

**Layout:** Sticky header with status indicator + dark/light toggle → 4 stat cards with sparklines → Primary sortable data table → Secondary data table → Footer. Right-side activity feed panel visible at ≥1100px.

---

## Placeholders

All placeholders use the `{{VAR_NAME}}` syntax. Replace before delivery.

### Shared (both templates)

| Placeholder | Description |
|---|---|
| `{{SITE_TITLE}}` | Page title and primary brand name |
| `{{PRIMARY_COLOR}}` | Primary brand color — CSS color value, e.g. `#6366f1` |
| `{{ACCENT_COLOR}}` | Accent color — CSS color value, e.g. `#f59e0b` |
| `{{COPYRIGHT_YEAR}}` | Year for copyright line, e.g. `2026` |
| `{{COPYRIGHT_OWNER}}` | Entity name for copyright, e.g. `Pitch Laboratories LLC` |

### `premium_static_app` only

Both templates include a dark/light mode toggle in the nav — no placeholder needed, it's wired via inline JS.

| Placeholder | Description |
|---|---|
| `{{EYEBROW_LABEL}}` | Small uppercase label above the H1 |
| `{{HERO_HEADLINE_LINE_1}}` | First line of the hero headline |
| `{{HERO_HEADLINE_LINE_2}}` | Second line — rendered in primary color |
| `{{HERO_SUBHEADLINE}}` | Hero supporting paragraph |
| `{{CTA_LABEL}}` | Text for the primary CTA button |
| `{{HERO_VISUAL_LABEL}}` | Placeholder label inside the hero visual box |
| `{{FEATURES_HEADLINE}}` | H2 above the 3-feature grid |
| `{{FEATURE_1_ICON}}` / `{{FEATURE_2_ICON}}` / `{{FEATURE_3_ICON}}` | Single emoji or character for each feature icon |
| `{{FEATURE_1_TITLE}}` / `{{FEATURE_2_TITLE}}` / `{{FEATURE_3_TITLE}}` | Feature card headings |
| `{{FEATURE_1_BODY}}` / `{{FEATURE_2_BODY}}` / `{{FEATURE_3_BODY}}` | Feature card body text |
| `{{ABOUT_HEADLINE}}` | H2 for the about section |
| `{{ABOUT_BODY_1}}` / `{{ABOUT_BODY_2}}` | Two body paragraphs in the about section |
| `{{STAT_1_VALUE}}` / `{{STAT_2_VALUE}}` / `{{STAT_3_VALUE}}` | Numeric or short stat values, e.g. `12k+` |
| `{{STAT_1_LABEL}}` / `{{STAT_2_LABEL}}` / `{{STAT_3_LABEL}}` | Labels below each stat value |

### `operator_dashboard` only

| Placeholder | Description |
|---|---|
| `{{DASHBOARD_SUBTITLE}}` | Small subtitle shown next to the brand name in the header |
| `{{LAST_UPDATED}}` | Timestamp string for the header, e.g. `May 20, 2026 09:00` |
| `{{SYSTEM_STATUS_LABEL}}` | Text inside the live status indicator, e.g. `All systems operational` |
| `{{STATS_PERIOD_LABEL}}` | Period label above the stat cards, e.g. `Last 30 days` |
| `{{STAT_1_LABEL}}` through `{{STAT_4_LABEL}}` | Stat card labels |
| `{{STAT_1_VALUE}}` through `{{STAT_4_VALUE}}` | Stat card values |
| `{{STAT_1_DELTA}}` through `{{STAT_4_DELTA}}` | Delta text, e.g. `+12% vs last period` |
| `{{STAT_1_DELTA_CLASS}}` through `{{STAT_4_DELTA_CLASS}}` | CSS class for delta color: `up`, `down`, or leave blank for muted |
| `{{TABLE_TITLE}}` | Heading above the data table |
| `{{TABLE_FILTER_1}}` / `{{TABLE_FILTER_2}}` / `{{TABLE_FILTER_3}}` | Filter pill labels |
| `{{TABLE_COL_1}}` through `{{TABLE_COL_4}}` | Table column headings |
| `{{ROW_1_COL_1}}` through `{{ROW_3_COL_4}}` | Data cells for the 3 example rows |
| `{{TABLE_ROW_COUNT}}` / `{{TABLE_TOTAL_COUNT}}` | Pagination count display |
| `{{TABLE_2_TITLE}}` | Heading for the second data table |
| `{{TABLE_2_FILTER_1}}` / `{{TABLE_2_FILTER_2}}` / `{{TABLE_2_FILTER_3}}` | Second table filter pill labels |
| `{{TABLE_2_COL_1}}` through `{{TABLE_2_COL_4}}` | Second table column headings |
| `{{ROW_4_COL_1}}` through `{{ROW_6_COL_4}}` | Data cells for rows 4–6 (second table) |
| `{{TABLE_2_ROW_COUNT}}` / `{{TABLE_2_TOTAL_COUNT}}` | Second table pagination count display |
| `{{ACTIVITY_TITLE}}` | Heading for the right-side activity feed panel |
| `{{ACTIVITY_1_TIME}}` through `{{ACTIVITY_8_TIME}}` | Timestamp strings for feed items, e.g. `09:42:01` |
| `{{ACTIVITY_1_TEXT}}` through `{{ACTIVITY_8_TEXT}}` | Event description text for each feed item |
| `{{FOOTER_VERSION_LABEL}}` | Version string in the footer, e.g. `v1.2.0` |
| `{{FOOTER_SUPPORT_LABEL}}` | Support contact or link text in the footer |

---

## Adding a New Template

1. Create a new directory under `templates/` with a descriptive slug, e.g. `templates/landing_page_split/`
2. Add a single `index.html` — self-contained, no external CDN or asset references
3. Use `{{VAR_NAME}}` for every value that changes per deployment
4. Add an entry to this README documenting the template purpose and all placeholders
5. Test by opening the file directly in a browser before committing
