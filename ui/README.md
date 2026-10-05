# Shared JTG Craft interface

`design.css` and `design.js` are the single source for desktop and Android visual
styling, eight saved themes, bounded/filterable console output and the grouped
properties editor. Platform navigation remains distinct: desktop keeps its fixed
sidebar; mobile uses its hamburger drawer without bottom tabs.

Run `node tools/sync-ui.cjs` from the repository root after editing these files.
It embeds marked blocks into both renderers, desktop CSS and the mobile CSS
patches. Existing backend adapters and platform-specific renderer logic remain
separate. Desktop start/build and the mobile APK builder run this sync as well.
Existing OTA file paths continue to contain the complete UI, without depending
on additional runtime files.

`tools/check-ui.cjs` uses Playwright and a mock backend to verify themes and
persistence, start/stop/command dispatch, log filtering/copying/bounded retention,
property validation/value preservation and responsive desktop/mobile layouts.
It does not start Minecraft or modify real server files. Set `NODE_PATH` to a
directory containing Playwright, then run `node tools/check-ui.cjs`. Screenshots
are saved under `ui-preview/`. `JTG_TEST_BROWSER` can override the Edge executable.

Properties save only collects fields in `#props-form`; unrelated Settings inputs
cannot become an `undefined` server.properties key. Unknown property values and
custom generation modes are retained. Visual changes do not automatically
restart a running server.

Native APK checks and a phone launch are needed to verify Android system-bar
colours and real server execution. Browser integration tests use simulated APIs.
