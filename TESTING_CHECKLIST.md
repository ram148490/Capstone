# ShiftCast — Manual Testing Checklist

**Code-verification pass completed 2026-09-06.** Every item below was verified against the
source: handler exists, inputs validated, failures handled. `[x]` = verified sound in code.
`[!]` = a bug was found here and **fixed** (see log). `[~]` = works, with a noted caveat.
Items that can only be confirmed in a running browser (visual/responsive) are marked `[b]`.

Priority sections per request — §7, §4, §5, §10 — were audited line-by-line.

Baseline after fixes: `npm run lint` clean · `npm test` 93/93 · `npm run test:scoping` 21/21 · `npm run test:http` 20/20.

**Later passes on this codebase:** a security audit (`SECURITY_AUDIT.md` — SEC-1…SEC-5 fixed) and a
focused accessibility pass (new `src/lib/useModalDialog.ts`; `role="dialog"`/focus-trap/Escape on all
11 modals; ~70 form controls labelled; `aria-live` toast; `role="switch"` toggles; `role="img"` charts).
The consolidated write-up of all four is the **ShiftCast QA Dossier** artifact.

---

## Bugs found & fixed

| # | View | Severity | Bug | Fix |
|---|------|----------|-----|-----|
| **BUG-1** | §10, §4 | High | `migrateAndSanitizeDb` (server/db.ts) hardcoded prep-cook = 7.5h and dishwasher = 6.5h (assumes a 5h shift) and **rewrote every assignment on every save and every load**. Real shifts are 4.5–7h, so a dinner (7h) prep cook — correctly 9.5h — was clobbered to 7.5h, along with its `cost`. Downstream: roster "weekly assigned hours" understated dinner prep/dish by 2h each (hiding overtime warnings), and the kitchen-pinboard text showed wrong hours. Ran on load too, so it corrupted seed data. | Stop rewriting `assign.hours`. Only backfill the informational `fixedHours` tag when genuinely absent; `cost` still reconciles to the stored real hours. Regression test added to `tests/test-scoping.ts` (dinner prep keeps 9.5h, dish 8.5h across a save). |
| **BUG-2** | §4, §8 | Medium | Kitchen Pinboard "Copy to Clipboard" (`TeamScheduleBuilder`) and "Copy Briefing Text" (`ManagerBriefingModal`) called `navigator.clipboard.writeText()` with no error handling, then **unconditionally reported success**. In an insecure context / older browser `navigator.clipboard` is `undefined` → uncaught `TypeError`, and the UI still says "Copied!". | Guard `navigator.clipboard`, wrap in `try/catch`, show an honest "select and copy manually" message on failure; only flip the "Copied!" state on real success. |
| **BUG-3** | §7 | Medium | Service Model `<select>` offered `CASUAL_DINING`, `FINE_DINING`, `BAR_LOUNGE` — **none are members of the `ServiceStyle` union** (`FULL_SERVICE\|FAST_CASUAL\|COUNTER_SERVICE\|BISTRO\|PIZZERIA\|BAR_TAPROOM`). An `as any` cast hid it; choosing one persisted a string no engine branch matches. Separately, the old option list had **no `BISTRO`/`PIZZERIA` entries**, so the Cedar Grove and Artisan Crust presets already rendered a **blank** Service Model dropdown. | Re-mapped the three options to `PIZZERIA` / `BISTRO` / `BAR_TAPROOM` (fixes the two blank presets); typed the cast as `ServiceStyle`. Added `normalizeServiceStyle()` in the modal initializer: any legacy/unknown value is mapped to a valid one on open (`CASUAL_DINING`→`FULL_SERVICE`, `FINE_DINING`→`BISTRO`, `BAR_LOUNGE`→`BAR_TAPROOM`, else `FULL_SERVICE`) so the field is never blank and every Save writes a valid value. Not auto-migrated in the DB — a stale value that's never opened in Settings stays put but is harmless (engine already treats it as full-service). |
| **BUG-4** | §3 | High | Importing a multi-event `.ics` file kept **only one event**. `handleImportICal` called `onAddEvent` in a `forEach`; each call closed over stale `localEvents`, firing N racing `saveEvents` and N toasts, and only the last `setLocalEvents` survived. | Added a bulk `onImportEvents(events[])` path — one state update, one save, one toast — mirroring the AI-discover flow. |
| **BUG-5** | §7 | Medium | Every numeric field in Restaurant Settings used `parseFloat(x) \|\| <constant>`, so a falsy parse (`0`, or empty mid-edit) **snapped the field to a magic default**. You could not type `0`, `0.5`, `8`→`0.5`, etc., and invalid values never reached submit validation. | Added `parseNum(raw, fallback)` — keeps the fallback only on `NaN`. `0` / decimals now pass through and are caught by the existing `validateForm` rules, so the "blank/invalid → error, no close" behavior actually works now. |
| **BUG-6** | §1, §4 | Low | The two CSV-export helpers created an object URL per download and never called `URL.revokeObjectURL` — a small blob leak that accumulates until page reload. | Added `URL.revokeObjectURL(url)` after the click in both `WeeklyForecastView` and `TeamScheduleBuilder`. |

## Open observations (documented, not fixed)

- **OBS-A** §5 — `computeWeeklyAccuracyTrends` and the batch-log date generator build date
  strings via `new Date(d+'T12:00:00').toISOString().split('T')[0]`; this can shift a day
  in timezones ≈ UTC+12 or beyond. US-only demo; the noon anchor keeps normal US zones safe.
- **OBS-B** §5 — "Daypart Performance" tab shows an empty grid (no empty-state copy) when
  there are zero accuracy logs.
- **OBS-C** §7 — Only 3 of 6 productivity standards (server / line cook / bartender) are
  editable; busser / dishwasher / host fall back to engine defaults.
- **OBS-D** §9 — Auth modal backdrop click doesn't dismiss (X only) — consistent with the
  app's other modals.
- **OBS-E** §8 — "Refresh with AI" in the briefing modal silently keeps the default on
  failure (no error surfaced).
- **OBS-F** §10 — Responsive / mobile-width behavior is CSS-only and needs a browser pass.

---

## 0. Global / App Shell

### Header — top bar
- [x] Brand logo / "ShiftCast" title + "Volume & Staffing AI" badge
- [x] `#restaurant-select` lists all 4 presets (`RESTAURANT_PRESETS.map`)
- [x] Switch preset → `handleSwitchPreset`→`handleSaveProfile(_, true)` → toast + `fullData` reload
- [x] Switch preset clears manual overrides — `handleSaveProfile` calls `setManualShiftOverrides({})`
- [x] `#btn-run-gemini-forecast` — disables + "Analyzing…" while `isLoadingAI`; `finally` always clears; always toasts (success/info/catch-info)
- [x] `#btn-header-overflow-menu` toggles dropdown; closes on `onMouseLeave`
- [x] Sync dot: emerald pulse idle / amber spin while `isSyncing`

### Header — overflow dropdown
- [x] "Manager Sign In" / `#btn-auth-modal` → opens Auth modal (logged out)
- [x] "Account Details" → opens Auth modal (logged in)
- [x] "Log Out" → `logout()` clears session
- [x] `#btn-edit-restaurant-profile` → opens Restaurant Settings modal
- [x] `#btn-briefing` → opens Briefing modal for `forecast.days[0]`
- [x] `#btn-export-schedule` → `setActiveTab('roster')`
- [x] "Reset to Demo Data" → `confirm()` gate; OK → `handleResetDefaults` → toast + full reload; scoped-key staleness covered by `test:scoping`

### Header — KPI strip
- [x] Net Savings/Overage pill — `describeNetImpact` drives green/rose + noun + sign (`formatSignedCurrency` never emits `+$-`)
- [x] Week label "Aug 31 – Sep 06, 2026" (static)
- [x] Covers / Revenue / Labor % from `forecast`
- [x] Labor % pill amber when `averageLaborPercentage > targetLaborPercentage`
- [x] Scenario toggle — `handleToggleScenario` flips `isActive`, toasts both ways, saves; `test-engine` confirms active changes output and inactive is a no-op

### Header — navigation
- [x] `#tab-forecast` selects primary view
- [x] `#tab-more-tools` dropdown lists 5 modules; closes on mouse-leave
- [x] `#tab-hourly` / `#tab-events` / `#tab-roster` / `#tab-accuracy` / `#tab-pos` each `setActiveTab`
- [x] Active secondary tool name + "Active" badge in the tab label
- [x] "← Return to Forecast" shown on non-forecast views

### Global floating
- [x] Toast — `showToast` sets + `setTimeout(…4000)` clears; icon/color per type
- [x] `#btn-scroll-to-top` — scroll listener > 200px toggles `showScrollTop`; `scrollToTop` smooth-scrolls; passive listener cleaned up on unmount

---

## 1. Weekly Shift Forecast

- [x] Anomaly banner renders when a HIGH-risk event day exists; "View {day} Shift" sets `selectedDayIndex`
- [x] 7-bar covers chart; bar `onClick` → `setSelectedDayIndex(data.index)`; custom tooltip (covers + baseline)
- [x] Day-focus panel: name/date, per-shift FOH/BOH via `calculateFOHBOH`, % vs 4-wk baseline
- [x] Executive summary: `executiveInsight`, Projected Labor + Net Savings badges, 4 advice cards (RISK_MITIGATION styled rose)
- [x] Filter "All 7 Days" / "Weekend Surges" / "High Impact & Event Days" — `filteredDays` logic correct; count pill updates
- [!] **`#btn-export-forecast-csv`** — `generateScheduleCSV` + blob download verified (CSV regression tests pass); **BUG-6** blob URL now revoked
- [x] Day cards: date badge, weather pill + "(Patio Closed)", "Volume Surge Alert" on HIGH, event chips w/ +%, covers/sales/labor metrics
- [x] "Briefing" button per day → `onOpenBriefingForDay(day)`
- [x] Per-shift header: name, times, duration, FOH•BOH, covers, sales
- [x] Labor breakdown: `estimatedLaborCost`+%, tipped/flat/fixed; "Saved $X vs Gut Feel" OR "High Understaffing Risk!" per `costSavings`/`understaffingRisk`
- [x] "Station Breakdown" toggle expands/collapses (`expandedShiftId`)
- [x] 8 role pills: count, "Gut: N", tipped/flat tag, $rate/h; modified (count≠gut) highlighted amber
- [x] `−` stepper: `onAdjustShiftStaff(…,-1)`, `Math.max(0,…)`, `disabled={count<=0}`, debounced save (800ms)
- [x] `+` stepper: `onAdjustShiftStaff(…,+1)`, debounced save
- [x] Stepper change recalculates shift labor/%/savings (App `forecast` useMemo applies overrides) and persists across tab switch
- [x] Expanded panel: 3 labor-composition cards + hourly cover-flow grid (peaks amber) + "Shift Notes:"

---

## 2. Hourly Rush Curves

- [x] Day ribbon: 7 buttons, abbrev + "{covers} cov"; selected amber, surge days amber border
- [x] Day button `onClick` → `setSelectedDayDate`; `selectedDay` falls back to `days[0]`
- [x] Ribbon `overflow-x-auto scrollbar-none`
- [x] Header: day/date + `weatherImpact` pill; event chips w/ `rushWindow`
- [x] "Total Day Covers" + "Projected Sales" boxes
- [x] Per shift: name+times, covers/sales, station target line
- [x] Hourly cards: hour, "PEAK" tag, guest count, proportional bar (`heightPercent`, guarded by `,1`), Floor/Kitchen counts
- [x] `generateHourlyDistribution` sums ≈ covers (test-engine tolerance ±3)

---

## 3. Local Events Radar

- [x] `#btn-add-event` → opens Add modal, clears `addEventError`
- [x] `#btn-import-ical` → opens iCal modal, clears `icalError`
- [x] Location input prefilled from `currentProfile.location`, editable, clears `discoverError` on type
- [x] `#btn-ai-discover` empty location → inline "Enter a neighborhood or city…"
- [x] `#btn-ai-discover` with location → "Scanning…" + disabled; `handleDiscoverEventsAI` toasts success(count)/info/error; `finally` clears
- [x] Discovered events prepend as a single bulk `setLocalEvents` + one `saveEvents` (App handler), marked `isUserCustom`
- [x] Event card: category icon, title, tag, date/venue/attendance; disabled → dimmed
- [x] Toggle switch → `onToggleEvent` → `saveEvents`; forecast recalculates (`getEventMultiplier` only counts `isEnabled`)
- [x] Trash icon only on `isUserCustom` → `onDeleteEvent` → toast
- [x] Multiplier pill / Peak Window / Operational Tip conditional render
- **Add Custom Event modal**
- [x] `✕` and "Cancel" close without save
- [x] Blank title → `validateForm` "Event title is required."
- [x] Multiplier `positive` check (slider is 0.7–1.7 so always valid in practice)
- [x] Title / Date(default 2026-09-04) / Category(6 opts) / Venue / Crowd / Rush Window / Staffing Tip inputs
- [x] Volume Multiplier range slider — label "+X%" / "Nx" updates live
- [x] "Save & Include in Forecast" → `onAddEvent` → toast, card enabled, forecast updates; form partially resets
- **iCal Import modal**
- [x] `✕` / "Cancel" close
- [x] "Parse & Import Events" disabled while textarea empty
- [x] Non-calendar text → "No calendar events found…"
- [!] **Valid multi-VEVENT block → BUG-4 fixed:** all events now imported via bulk `onImportEvents`, modal closes, textarea clears; also new guard "…no events had both a title and a start date."

---

## 4. Team Roster & Schedule

- [!] **`#btn-auto-assign`** — `handleAutoAssign` builds fresh `newAssignments` (role match, availability, `notOverbooked`), replaces the array; `roleHours` from `getRoleShiftHours(role, shift.durationHours, cfg)` is **correct per shift** and now (BUG-1) survives the DB round-trip; counts + employee-hour totals update
- [x] "Add Staff" → opens modal, clears `empFormError`
- [x] "Print Pinboard" → opens modal
- [!] "Export CSV (Toast/7shifts)" → `generateScheduleCSV` download; **BUG-6** blob URL now revoked
- [x] Roster cards: "{n} Active Employees" matches; name, tipped/flat tag, role, $wage/hr, (+$tips), max hrs
- [!] Assigned-hours color (emerald/amber/rose + alert >40) — now accurate after **BUG-1** (was understating dinner prep/dish by 2h and hiding overtime)
- [x] Trash → `onDeleteEmployee` → removes emp + their assignments, `Promise.all` two saves, toast
- [x] Matrix: per-day covers + target labor $/%; per-shift "{n} assigned" or "Unassigned…" empty text
- **Add Team Member modal**
- [x] `✕` / "Cancel" close
- [x] Blank name → "Full name is required."
- [x] Wage ≤ 0 → `positive` error; Max hours > 168 → `max` error; expected tips `nonNegative`
- [x] Full Name input
- [x] Primary Role select adapts: Counter Staff vs Server by `serviceStyle`; Bartender hidden `!hasBar`; Host hidden `!hasHostStand`
- [x] Role change → `handleRoleChange` updates wage-type + wage default
- [x] Wage Classification select — flips wage default (>15→10 tipped, <15→22 non-tipped) and swaps tips/phone field
- [x] Wage number input (step 0.5, min 0)
- [x] Expected Tips shown only when TIPPED
- [x] Phone input present in exactly one place per wage type (verified both branches)
- [x] Max Hours/Week input (min 1, max 168)
- [x] "Save Team Member" → `onAddEmployee` → toast, card appears, name resets
- **Kitchen Pinboard modal**
- [x] `✕` closes
- [x] Read-only textarea shows `generateKitchenScheduleText` (select-all class present)
- [!] **"Copy to Clipboard"** — **BUG-2 fixed:** guarded + `try/catch`; honest fallback message; `alert('copied')` only on real success

---

## 5. Forecast Accuracy & MAPE

- [x] `#btn-open-log-actual-modal` → opens single-log modal, clears `logFormError`
- [x] `#btn-quick-fill-actuals` → opens batch modal
- [x] KPI 1 Last Week Accuracy — %, WoW arrow (emerald/rose), shift count, MAPE; `'N/A'`/`'--'` when no `lastWeekMetric`
- [x] KPI 2 Multi-Week MAPE — `calculateMAPE`/`calculateAccuracyPercentage` (test-engine: empty→0, known sample 5.56)
- [x] KPI 3 Volume Bias — net covers variance + Balanced/Under/Over + revenue delta; guards on `lastWeekMetric`
- [x] KPI 4 Peak Precision — best/worst shift; `'N/A'`/`'--'` fallbacks
- [x] "Multi-Week Accuracy Trends" — AreaChart (accuracy/MAPE, 90% ref line) + BarChart (predicted vs actual); custom tooltips; empty `weeklyTrends` renders bare axes (no crash)
- [x] "Shift-by-Shift Log Table" — every log; variance sign-colored, MAPE %, accuracy badge (≥92 green / ≥80 amber / <80 rose); `overflow-x-auto`
- [x] Per-row trash → `onDeleteLog` → toast, KPIs recompute
- [~] "Daypart Performance" — one card per shift type w/ accuracy/MAPE/progress/totals/insight — **OBS-B:** empty grid, no empty-state text, when there are 0 logs
- [x] "Filter Week" select — "All Available Weeks (n)" + per-week options; `filteredLogs` filters table
- **Log Actual Shift Covers modal**
- [x] `✕` / "Cancel" close
- [x] Blank date → error; predicted ≤ 0 → `positive` error; actual negative → `nonNegative` error; revenue negative → error (empty revenue skipped, `isBlank('')`)
- [x] Shift Date (default yesterday) / Daypart select (4) / Predicted (min 1) / Actual (min 0) / Revenue (placeholder = covers×check) / Weather / Notes
- [x] Live "Calculated Variance" + "MAPE" preview — `actualCovers > 0` guard prevents divide-by-zero/NaN
- [x] "Save Shift Log" → "Saving…" disabled; `createShiftAccuracyLog`; `onAddLog` → toast "%…"; row appears; notes/event reset; `finally` clears `isSubmitting`
- **Batch Auto-Log modal**
- [x] `✕` / "Cancel" close
- [x] Info text names `currentProfile.name`, 7 days / 14 shifts
- [~] "Batch Log 14 Shifts" → "Generating…" disabled; `handleGeneratePastWeekLogs` (i=7..1 × 2 = 14); `onBatchAddLogs` → toast; charts/table populate — **OBS-A:** generated dates use `toISOString()` (minor TZ skew at extreme longitudes)

---

## 6. Historical POS Data

- [x] "Add Record" → opens manual modal, clears `addFormError`
- [x] "Import POS CSV / Report" → opens import modal, clears `importError`
- [x] Baseline strip: 7 day cards, `dayStats` uses `Math.max(1,count)` so no NaN on empty
- [x] "{n} shifts" count reflects `filteredRecords`
- [x] Search input — `date/dayOfWeek/eventTag/notes` substring match
- [x] Shift filter select (All / Lunch / Dinner)
- [x] Table capped at `.slice(0, 30)`
- [x] Row: date+day, shift tag, covers, sales, labor $, labor % (green/amber vs target), weather, event tag + notes
- [x] Per-row trash → `onDeleteRecord` → toast, day averages recompute
- **Import modal**
- [x] `✕` / "Cancel" close
- [x] "Parse & Ingest" disabled while empty
- [x] Empty text → "Paste at least one row…"
- [x] `/api/pos/parse` success → maps records → `onImportRecords`; non-success → line-by-line CSV fallback parser; no valid rows → "Could not read any valid rows…"; fetch throw → catch → "Import failed…"; `finally` clears `isParsingPOS`
- [x] Valid CSV → "Parsing…", records prepend, toast "Imported & saved N…", modal closes, textarea clears
- **Manual Add modal**
- [x] `✕` / "Cancel" close
- [x] Blank date → error; negative covers/sales/labor → `nonNegative` errors
- [x] Date / Day-of-Week(7) / Shift(2) / Covers(min 0) / Sales(min 0) / Labor Cost(min 0) / Weather(4) / Event Tag inputs
- [x] "Save Shift Record" → `onAddRecord` → toast, row appears
- [~] `laborHours` (98) and `notes` ('') are fixed defaults — no input in the modal (cosmetic, engine tolerates)

---

## 7. Restaurant Settings modal

- [x] `✕` / "Cancel" close without save (`handleSave` only calls `onClose` after `validateForm` passes)
- [x] Restaurant Name / Concept / Location — text, `required`
- [!] **Service Model select** — **BUG-3 fixed:** 6 options now all valid `ServiceStyle` values (also un-blanks the BISTRO/PIZZERIA presets); legacy/unknown persisted values normalized on open via `normalizeServiceStyle()`; choosing Fast-Casual / Quick Counter forces `hasBar`+`hasHostStand` off
- [x] "Has Bar / Taproom Program" checkbox — toggles `bartenders` in `enabledRoles`
- [x] "Has Dedicated Host Stand" checkbox — toggles `hosts` in `enabledRoles`
- [!] Average Check Size — `required`, `positive`; **BUG-5:** `parseNum` now lets you type `0`/decimals (caught on submit) instead of snapping to 35
- [!] Target Labor Cost % — `required`, `positive`, `max 100`; **BUG-5** applied
- [!] Dining Room Seats — `required`, `positive`; **BUG-5** applied
- [x] "Has Outdoor Patio Seating" checkbox — reveals/hides Patio Seats; `patioSeats` validated `nonNegative` only when `hasPatio`
- [!] Patio Seats — **BUG-5** applied (`parseNum`)
- [!] 8 per-role wage cards: wage $ input + Wage Type select (Tipped/Non-Tipped); tipped cards amber; every wage `required`+`nonNegative`; **BUG-5** applied to wage input
- [!] Fixed Prep Hours (0–6, step 0.5) — `nonNegative`; **BUG-5** applied
- [!] Prep Floor Headcount (1–4) — `positive`; **BUG-5** applied
- [!] Closing Sanitation Hours (0–4, step 0.5) — `nonNegative`; **BUG-5** applied
- [!] Closing Dish Headcount (1–4) — `positive`; **BUG-5** applied
- [~] Covers / Server, Line Cook, Bartender — `required`, `positive`; **BUG-5** applied — **OBS-C:** busser/dishwasher/host productivity not editable here
- [x] Any required field blank/invalid on submit → rose banner via `validateForm`, no `onClose` — now actually reachable for numeric fields after BUG-5
- [x] "Save Profile & Recalculate" → `onSave(form)` → `handleSaveProfile` → `setCurrentProfile` + `setManualShiftOverrides({})` → toast → `baseForecast` useMemo recomputes

---

## 8. Manager Briefing modal

- [x] Header: day/date/covers/sales
- [~] "Refresh with AI" → "Generating…" disabled; `/api/briefing/generate`; on `data.success && data.briefing` → `setBriefing` — **OBS-E:** silent on failure
- [x] `✕` and "Done" close
- [x] All sections render from `briefing` state (default data always present)
- [!] **"Copy Briefing Text"** — **BUG-2 fixed:** async + `try/catch`; "Copied to Clipboard!" flips only on success, else fallback alert

---

## 9. Auth / Login modal

- [x] Opens from "Manager Sign In" / `#btn-auth-modal`; `X` closes
- [x] "Log In" / "Create Account" toggle switches `mode` + clears `errorMessage`
- [x] Login: Email + Password; Register adds Manager Name, Restaurant Name, Concept
- [x] Blank required field → `validateForm` inline error
- [x] Malformed email → "Enter a valid email address." (regex)
- [x] Register password < 6 → "Password must be at least 6 characters." (also enforced server-side)
- [x] Valid login → spinner, `login()`, toast "Welcome back!…", `onClose`, `loadDatabaseData` refires on `user?.id` change
- [x] Valid register → `register()`, toast "Account created…", close
- [x] Failed auth → `err.message` from server (`apiFetch` throws `data.error`) in rose banner; `finally` clears `isSubmitting`
- [x] "Instant Demo…" → `loginDemo()` → toast, close, demo data loads; catch → error
- [x] Account view: Manager/Restaurant/Email/"Cloud Synced"; "Log Out" → toast; "Close" closes
- [~] **OBS-D:** backdrop click doesn't close (X only) — consistent with app

---

## 10. Cross-cutting regression

- [!] **Stepper / toggle / add / delete persist across tab switch and reload** — all mutation handlers do optimistic `setState` + `restaurantApi.*` save; `loadDatabaseData` refires on mount and `user?.id`. **BUG-1** was breaking this for prep/dish assignment hours specifically — now fixed + regression-tested.
- [x] Reset to Demo Data restores every view — `resetUserToDemoData` clears all scoped keys (covered by `test:scoping` "reset staleness" check)
- [x] Switching preset scopes POS / roster / events / accuracy logs / scenario — `getRestaurantStorageKey` + `switchUserProfilePreset`; covered by `test:scoping` (roster + POS independence, round-trips)
- [x] Scenario + manual overrides + AI refine layered — independent state slices; `forecast` useMemo composes `baseForecast` (scenario) then overrides; AI refine only toasts (no state mutation). `test-engine` confirms scenario on/off determinism.
- [b] **OBS-F:** Mobile widths — header wrap, tab dropdown, table horizontal scroll (`overflow-x-auto`), modal `max-h-[90vh] overflow-y-auto`, toast `left-4 sm:left-auto` — present in markup; needs a browser pass to confirm.

---

## Files changed in this pass

- `server/db.ts` — BUG-1
- `src/App.tsx` — BUG-4 (bulk import handler)
- `src/components/views/LocalEventsRadar.tsx` — BUG-4
- `src/components/views/TeamScheduleBuilder.tsx` — BUG-2, BUG-6
- `src/components/views/WeeklyForecastView.tsx` — BUG-6
- `src/components/modals/ManagerBriefingModal.tsx` — BUG-2
- `src/components/modals/RestaurantProfileModal.tsx` — BUG-3, BUG-5
- `tests/test-scoping.ts` — BUG-1 regression test
