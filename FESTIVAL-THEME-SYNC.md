# Festival theme calendar

The public-site festival engine reads `public/festival-calendar.json`, uses
`Asia/Kolkata`, and applies a CSS-only theme while a verified occurrence is
active. When no occurrence is active, it removes its attributes and CSS
variables so the existing Animoro theme is restored. The runtime does not
change page content, SEO metadata, URLs, or structured data.

The catalog is in `scripts/festival-catalog.js`. Its scheduled updater reads
the public Google India holiday calendar and Office Holidays India calendar.
A date is promoted only when both feeds identify the same single day for that
festival and year. Conflicting, missing, or tentative dates are not promoted;
any prior verified occurrence remains in the JSON file as a fallback. Every
promoted occurrence records its source URLs and verification time. The
user-specified Diwali 2026 theme window is November 7–12; the source-reported
festival day is stored separately. Diwali's theme is currently disabled by
request, so this date remains recorded for reference but does not change the
site's appearance.

The initial calendar contains 41 source-agreed occurrences across 2026 and
2027. Twenty catalog festivals currently have no verified occurrence because
the configured feeds do not provide an unambiguous two-source match. The
configured feeds are not direct Government of India, IMD, or dedicated Islamic
or Christian calendar integrations; only Diwali also cites Drik Panchang.
Those source classes need stable, independently verifiable feeds before their
dates can be promoted. No placeholder dates are activated.

GitHub Actions runs the updater weekly and when its source code changes. It
commits changed data to `main`, and `workflow_dispatch` allows a manually
requested sync. The repository must allow Actions to write contents. The
production hosting integration must also deploy commits from `main` for
calendar changes to reach the website; no hosting credentials are stored in
this project.

If a source is unavailable, the workflow reports a failure and leaves the
existing calendar untouched. If feeds do not yet publish a future year, the
previous verified dates remain in place until matching source data is
available. Lunar observances can vary by location or moon sighting; tentative
feed entries are deliberately excluded.
