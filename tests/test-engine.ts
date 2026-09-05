// Ad-hoc regression test script for pure business logic (no server/db required).
// Run with: npx tsx scratchpad/test-engine.ts
import {
  getRoleShiftHours,
  calculateDetailedLaborCost,
  isTippedRole,
  calculateRecommendedStaff,
  calculateGutFeelStaff,
  generateWeeklyForecast,
  getEventMultiplier,
  getWeatherMultiplier,
  generateHourlyDistribution,
} from '../src/lib/staffingEngine';
import {
  calculateMAPE,
  calculateAccuracyPercentage,
  computeWeeklyAccuracyTrends,
  createShiftAccuracyLog,
} from '../src/lib/accuracyEngine';
import {
  generateScheduleCSV,
  generateKitchenScheduleText,
  parseICalData,
} from '../src/lib/calendarUtils';
import {
  RESTAURANT_PRESETS,
  SAMPLE_HISTORICAL_DATA,
  SAMPLE_LOCAL_EVENTS,
  SAMPLE_WEATHER_FORECAST,
  SAMPLE_STAFF_ROSTER,
} from '../src/data/restaurantPresets';
import {
  RestaurantProfile,
  DayForecast,
  ShiftForecast,
  Employee,
  ShiftAssignment,
  StaffRole,
} from '../src/types';

let pass = 0;
let fail = 0;
const failures: string[] = [];

function assert(cond: boolean, label: string, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    const msg = `  FAIL  ${label}${detail ? ' -- ' + detail : ''}`;
    console.log(msg);
    failures.push(`${label}${detail ? ' -- ' + detail : ''}`);
  }
}

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

const msk = RESTAURANT_PRESETS.find((p) => p.id === 'market-street-kitchen')!;
const hbe = RESTAURANT_PRESETS.find((p) => p.id === 'harvest-bowl-express')!;

// =====================================================================
section('Fixed prep/closing hour blocks (getRoleShiftHours)');
// =====================================================================
{
  const r1 = getRoleShiftHours('prepCooks', 5, msk.fixedHoursConfig);
  assert(r1.hours === 7.5, 'prepCooks: 5h shift + 2.5h fixed prep = 7.5h', `got ${r1.hours}`);
  assert(r1.fixedHours === 2.5, 'prepCooks: fixedHours reported = 2.5', `got ${r1.fixedHours}`);
  assert(r1.serviceHours === 5, 'prepCooks: serviceHours = base shift hours (5)', `got ${r1.serviceHours}`);

  const r2 = getRoleShiftHours('dishwashers', 7, msk.fixedHoursConfig);
  assert(r2.hours === 8.5, 'dishwashers: 7h shift + 1.5h fixed close = 8.5h', `got ${r2.hours}`);

  const r3 = getRoleShiftHours('servers', 5, msk.fixedHoursConfig);
  assert(r3.hours === 5 && r3.fixedHours === 0, 'servers: no fixed block added', `got ${JSON.stringify(r3)}`);

  // Custom restaurant-specific config (Harvest Bowl uses 2.0h prep / 1.0h close)
  const r4 = getRoleShiftHours('prepCooks', 5, hbe.fixedHoursConfig);
  assert(r4.hours === 7, 'Harvest Bowl prepCooks: 5h + 2.0h fixed = 7h (per-restaurant config respected)', `got ${r4.hours}`);
  const r5 = getRoleShiftHours('dishwashers', 6, hbe.fixedHoursConfig);
  assert(r5.hours === 7, 'Harvest Bowl dishwashers: 6h + 1.0h fixed = 7h', `got ${r5.hours}`);

  // Missing config -> defaults (2.5 / 1.5)
  const r6 = getRoleShiftHours('prepCooks', 5, undefined);
  assert(r6.hours === 7.5, 'prepCooks with no config falls back to default 2.5h', `got ${r6.hours}`);
}

// =====================================================================
section('Wage-type calculation: tipped vs non-tipped (isTippedRole)');
// =====================================================================
{
  // Explicit wageTypes map on preset (Market Street Kitchen: full-service)
  assert(isTippedRole('servers', msk) === true, 'MSK servers explicitly TIPPED');
  assert(isTippedRole('bartenders', msk) === true, 'MSK bartenders explicitly TIPPED');
  assert(isTippedRole('bussers', msk) === true, 'MSK bussers explicitly TIPPED');
  assert(isTippedRole('lineCooks', msk) === false, 'MSK lineCooks explicitly NON_TIPPED');
  assert(isTippedRole('managers', msk) === false, 'MSK managers explicitly NON_TIPPED');

  // Fast casual preset explicitly forces NON_TIPPED even for servers/bussers
  assert(isTippedRole('servers', hbe) === false, 'Harvest Bowl (fast-casual) servers explicitly NON_TIPPED');
  assert(isTippedRole('bussers', hbe) === false, 'Harvest Bowl (fast-casual) bussers explicitly NON_TIPPED');

  // Heuristic fallback path: profile with NO explicit wageTypes map
  const noWageTypesFullService: RestaurantProfile = { ...msk, wageTypes: undefined };
  assert(isTippedRole('servers', noWageTypesFullService) === true, 'Heuristic fallback (no wageTypes, full service): servers => TIPPED');

  const noWageTypesFastCasual: RestaurantProfile = { ...hbe, wageTypes: undefined };
  assert(
    isTippedRole('servers', noWageTypesFastCasual) === false,
    'Heuristic fallback (no wageTypes, fast-casual id=harvest-bowl-express): servers => NON_TIPPED'
  );

  // A fast-casual-*styled* restaurant that ISN'T the hardcoded 'harvest-bowl-express' id and has no wageTypes:
  // staffingEngine.isTippedRole only special-cases id === 'harvest-bowl-express', not serviceStyle/conceptType generally.
  const customFastCasualNoWageTypes: RestaurantProfile = {
    ...hbe,
    id: 'my-custom-fast-casual',
    wageTypes: undefined,
  };
  const heuristicResult = isTippedRole('servers', customFastCasualNoWageTypes);
  console.log(
    `  NOTE  isTippedRole heuristic for a custom FAST_CASUAL profile (no explicit wageTypes, id != 'harvest-bowl-express') returns servers TIPPED=${heuristicResult}. ` +
      `isTippedRole() only checks conceptType/serviceStyle/id==='harvest-bowl-express' -- serviceStyle IS 'FAST_CASUAL' here so it should still resolve to non-tipped via the serviceStyle check.`
  );
  assert(heuristicResult === false, 'Custom fast-casual (serviceStyle=FAST_CASUAL) without explicit wageTypes still resolves NON_TIPPED via serviceStyle check');
}

// =====================================================================
section('generateScheduleCSV wage-type fallback vs isTippedRole -- cross-check for divergence');
// =====================================================================
{
  // generateScheduleCSV() does NOT receive the restaurant object, only a flat wageTypes map.
  // Its internal fallback (when wageTypes[role] is undefined) is a hardcoded
  // ['servers','bartenders','bussers'] => TIPPED heuristic that has NO concept of fast-casual.
  // Construct a fast-casual day forecast/shift with wageTypes explicitly stripped (simulating a
  // user-registered restaurant whose profile never got wageTypes populated) to see if CSV output
  // disagrees with what isTippedRole() / the staffing engine would say.
  const fakeShift: ShiftForecast = {
    id: 'test-shift', name: 'Lunch', startTime: '11:00 AM', endTime: '3:00 PM', durationHours: 5,
    covers: 50, sales: 1000,
    recommendedStaff: { servers: 1, bartenders: 0, bussers: 0, hosts: 0, lineCooks: 1, prepCooks: 1, dishwashers: 1, managers: 1 },
    gutFeelStaff: { servers: 1, bartenders: 0, bussers: 0, hosts: 0, lineCooks: 1, prepCooks: 1, dishwashers: 1, managers: 1 },
    estimatedLaborCost: 500, gutLaborCost: 500, laborPercentage: 50, gutLaborPercentage: 50,
    costSavings: 0, understaffingRisk: 'NONE', overstaffingRisk: 'NONE', shiftNotes: '', hourlyBreakdown: [],
  };
  const fakeDay: DayForecast = {
    date: '2026-09-01', dayOfWeek: 'Tuesday', covers: 50, projectedSales: 1000, baselineCovers: 50,
    eventsImpactMultiplier: 1, weatherImpactMultiplier: 1, weatherImpact: '', eventsImpact: 'None',
    riskLevel: 'LOW', riskReason: '', shifts: [fakeShift], dailyTotalLaborCost: 500, dailyLaborPercentage: 50,
    dailySavings: 0, events: [], weather: SAMPLE_WEATHER_FORECAST[0],
  };

  const strippedHbe: RestaurantProfile = { ...hbe, name: 'Custom Fast Casual', wageTypes: undefined };
  const csvNoWageTypes = generateScheduleCSV([fakeDay], [], strippedHbe, []);
  const csvLines = csvNoWageTypes.split('\n');
  const serverRow = csvLines.find((l) => l.includes('"Server"') && l.includes('[Required - Unassigned]'));
  const csvSaysTipped = !!serverRow && serverRow.includes('Tipped Direct Wage');
  const engineSaysTipped = isTippedRole('servers', strippedHbe);

  console.log(`  NOTE  For a fast-casual profile with wageTypes stripped: CSV export labels servers as ${csvSaysTipped ? 'TIPPED' : 'NON_TIPPED'}, while staffingEngine.isTippedRole() says ${engineSaysTipped ? 'TIPPED' : 'NON_TIPPED'}.`);
  assert(
    csvSaysTipped === engineSaysTipped,
    'FIX CHECK: generateScheduleCSV wage-type fallback now agrees with staffingEngine.isTippedRole for the same restaurant/role when wageTypes is missing (generateScheduleCSV now delegates to isTippedRole() instead of its own hardcoded heuristic)',
    csvSaysTipped !== engineSaysTipped
      ? `generateScheduleCSV() still disagrees with isTippedRole() for this profile.`
      : undefined
  );
}

// =====================================================================
section('Labor cost calculation: tipped/non-tipped + fixed/variable split (calculateDetailedLaborCost)');
// =====================================================================
{
  const staff: Record<StaffRole, number> = {
    servers: 2, bartenders: 1, bussers: 0, hosts: 0,
    lineCooks: 2, prepCooks: 1, dishwashers: 1, managers: 1,
  };
  const shiftHours = 5;
  const detail = calculateDetailedLaborCost(staff, msk.wageRates, shiftHours, msk);

  // Manual expected computation
  const prepHours = shiftHours + msk.fixedHoursConfig!.prepCookFixedHours; // 7.5
  const dishHours = shiftHours + msk.fixedHoursConfig!.closingDishwasherFixedHours; // 6.5
  const expectedServers = 2 * msk.wageRates.servers * shiftHours;
  const expectedBartenders = 1 * msk.wageRates.bartenders * shiftHours;
  const expectedLineCooks = 2 * msk.wageRates.lineCooks * shiftHours;
  const expectedPrep = 1 * msk.wageRates.prepCooks * prepHours;
  const expectedDish = 1 * msk.wageRates.dishwashers * dishHours;
  const expectedManagers = 1 * msk.wageRates.managers * shiftHours;
  const expectedTotal = expectedServers + expectedBartenders + expectedLineCooks + expectedPrep + expectedDish + expectedManagers;
  const expectedTipped = expectedServers + expectedBartenders; // servers+bartenders are TIPPED for MSK
  const expectedNonTipped = expectedTotal - expectedTipped;
  const expectedFixed = 1 * msk.wageRates.prepCooks * msk.fixedHoursConfig!.prepCookFixedHours + 1 * msk.wageRates.dishwashers * msk.fixedHoursConfig!.closingDishwasherFixedHours;
  const expectedVariable = expectedTotal - expectedFixed;

  assert(detail.totalCost === Math.round(expectedTotal), 'Total labor cost matches manual calc', `expected ~${Math.round(expectedTotal)}, got ${detail.totalCost}`);
  assert(detail.tippedCost === Math.round(expectedTipped), 'Tipped cost bucket matches manual calc (servers+bartenders)', `expected ~${Math.round(expectedTipped)}, got ${detail.tippedCost}`);
  // nonTippedCost/variableLaborCost are intentionally derived as (roundedTotal - roundedOtherBucket),
  // not independently rounded, so that the buckets always reconcile exactly to totalCost (see fix in
  // calculateDetailedLaborCost). Expected values here mirror that derivation rather than
  // Math.round()'ing the raw non-tipped/variable sum in isolation.
  assert(detail.nonTippedCost === Math.round(expectedTotal) - Math.round(expectedTipped), 'Non-tipped cost bucket matches manual calc (derived from rounded total, not independently rounded)', `expected ${Math.round(expectedTotal) - Math.round(expectedTipped)}, got ${detail.nonTippedCost}`);
  assert(detail.tippedCost + detail.nonTippedCost === detail.totalCost, 'tippedCost + nonTippedCost == totalCost (no leakage/double count)', `${detail.tippedCost}+${detail.nonTippedCost} != ${detail.totalCost}`);
  assert(detail.fixedLaborCost === Math.round(expectedFixed), 'Fixed labor cost (prep+close blocks) matches manual calc', `expected ~${Math.round(expectedFixed)}, got ${detail.fixedLaborCost}`);
  assert(detail.variableLaborCost === Math.round(expectedTotal) - Math.round(expectedFixed), 'Variable labor cost matches manual calc (derived from rounded total, not independently rounded)', `expected ${Math.round(expectedTotal) - Math.round(expectedFixed)}, got ${detail.variableLaborCost}`);
  assert(detail.fixedLaborCost + detail.variableLaborCost === detail.totalCost, 'fixedLaborCost + variableLaborCost == totalCost (no leakage/double count)', `${detail.fixedLaborCost}+${detail.variableLaborCost} != ${detail.totalCost}`);
  assert(detail.roleHours.prepCooks === 7.5, 'roleHours.prepCooks reflects fixed block (7.5h)', `got ${detail.roleHours.prepCooks}`);
  assert(detail.roleHours.dishwashers === 6.5, 'roleHours.dishwashers reflects fixed block (6.5h)', `got ${detail.roleHours.dishwashers}`);
  assert(detail.roleHours.servers === 5, 'roleHours.servers unaffected by fixed blocks', `got ${detail.roleHours.servers}`);

  // Zero-headcount role should not contribute fixed/variable cost at all
  const zeroPrepStaff = { ...staff, prepCooks: 0 };
  const detailZero = calculateDetailedLaborCost(zeroPrepStaff, msk.wageRates, shiftHours, msk);
  assert(detailZero.roleCosts.prepCooks === 0, 'Zero-headcount prepCooks contributes $0 despite fixed-hours config', `got ${detailZero.roleCosts.prepCooks}`);
}

// =====================================================================
section('Restaurant-scoped wage config actually used (regression: Harvest Bowl must not use MSK rates)');
// =====================================================================
{
  const staff: Record<StaffRole, number> = { servers: 1, bartenders: 0, bussers: 0, hosts: 0, lineCooks: 1, prepCooks: 1, dishwashers: 1, managers: 1 };
  const mskDetail = calculateDetailedLaborCost(staff, msk.wageRates, 5, msk);
  const hbeDetail = calculateDetailedLaborCost(staff, hbe.wageRates, 5, hbe);
  assert(mskDetail.totalCost !== hbeDetail.totalCost, 'Two different restaurant wage configs produce different labor costs for identical staff counts', `MSK=${mskDetail.totalCost} HBE=${hbeDetail.totalCost}`);
  assert(mskDetail.tippedCost > 0 && hbeDetail.tippedCost === 0, 'MSK (full-service) has tipped cost > 0, Harvest Bowl (fast-casual, all NON_TIPPED) has tipped cost == 0', `MSK tipped=${mskDetail.tippedCost} HBE tipped=${hbeDetail.tippedCost}`);
}

// =====================================================================
section('Recommended vs gut-feel staffing (sanity + role gating)');
// =====================================================================
{
  const staffFull = calculateRecommendedStaff(150, msk, 'Dinner');
  assert(staffFull.servers > 0, 'Full-service dinner @150 covers recommends servers > 0');
  assert(staffFull.bartenders > 0, 'Full-service (hasBar) recommends bartenders > 0');

  const staffFC = calculateRecommendedStaff(150, hbe, 'Dinner');
  assert(staffFC.bartenders === 0, 'Fast-casual (no bar) recommends 0 bartenders regardless of covers', `got ${staffFC.bartenders}`);
  assert(staffFC.hosts === 0, 'Fast-casual (no host stand) recommends 0 hosts', `got ${staffFC.hosts}`);

  // Disabled role should never appear even if it would otherwise be recommended
  const restaurantNoBussers: RestaurantProfile = { ...msk, enabledRoles: msk.enabledRoles.filter((r) => r !== 'bussers') };
  const staffNoBussers = calculateRecommendedStaff(200, restaurantNoBussers, 'Dinner');
  assert(staffNoBussers.bussers === 0, 'enabledRoles gating: disabled role (bussers) forced to 0 even at high covers', `got ${staffNoBussers.bussers}`);

  const gut = calculateGutFeelStaff('Friday', 'Dinner', msk);
  assert(gut.servers > 0, 'Gut-feel Friday dinner staffing has servers > 0');

  const gutFC = calculateGutFeelStaff('Friday', 'Dinner', hbe);
  assert(gutFC.bartenders === 0 && gutFC.hosts === 0, 'Gut-feel staffing also respects fast-casual role gating (no bar/host)', `got ${JSON.stringify(gutFC)}`);
}

// =====================================================================
section('Event multiplier compounding + cap (getEventMultiplier)');
// =====================================================================
{
  const events = SAMPLE_LOCAL_EVENTS.filter((e) => e.isEnabled).slice(0, 2);
  if (events.length >= 1) {
    const single = getEventMultiplier(events[0].date, events[0].affectedShifts[0] || 'Dinner', [events[0]]);
    assert(
      Math.abs(single.multiplier - events[0].volumeMultiplier) < 0.001,
      'Single active event: multiplier equals the event volumeMultiplier',
      `expected ${events[0].volumeMultiplier}, got ${single.multiplier}`
    );
  }

  const noEvents = getEventMultiplier('2099-01-01', 'Dinner', SAMPLE_LOCAL_EVENTS);
  assert(noEvents.multiplier === 1.0, 'No matching events on date => multiplier 1.0 (no volume change)', `got ${noEvents.multiplier}`);

  // Synthetic stacking test to verify the +65% cap
  const stackedEvents = [
    { ...SAMPLE_LOCAL_EVENTS[0], id: 'a', date: '2026-12-25', isEnabled: true, affectedShifts: ['Dinner'], volumeMultiplier: 1.5 },
    { ...SAMPLE_LOCAL_EVENTS[0], id: 'b', date: '2026-12-25', isEnabled: true, affectedShifts: ['Dinner'], volumeMultiplier: 1.5 },
  ];
  const stacked = getEventMultiplier('2026-12-25', 'Dinner', stackedEvents as any);
  assert(stacked.multiplier === 1.65, 'Two +50% events compound but are capped at +65% max', `got ${stacked.multiplier}`);
  assert(stacked.activeEvents.length === 2, 'Both stacked events reported as active', `got ${stacked.activeEvents.length}`);
}

// =====================================================================
section('Weather multiplier + patio closure (getWeatherMultiplier)');
// =====================================================================
{
  const rainDay = SAMPLE_WEATHER_FORECAST.find((w) => w.condition === 'Rain' && !w.patioOpen);
  if (rainDay) {
    const res = getWeatherMultiplier(rainDay.date, SAMPLE_WEATHER_FORECAST, true);
    assert(res.multiplier <= 0.88, 'Closed patio on a patio-restaurant caps multiplier at <= 0.88', `got ${res.multiplier}`);
  } else {
    console.log('  SKIP  No rain/closed-patio day found in SAMPLE_WEATHER_FORECAST to test against');
  }

  const missingDate = getWeatherMultiplier('2099-06-01', SAMPLE_WEATHER_FORECAST, true);
  assert(missingDate.multiplier === 1.0, 'Missing date in forecast falls back to neutral 1.0 multiplier', `got ${missingDate.multiplier}`);
}

// =====================================================================
section('Hourly distribution curve (generateHourlyDistribution)');
// =====================================================================
{
  const dinner = generateHourlyDistribution(140, 'Dinner', []);
  const sumGuests = dinner.reduce((a, p) => a + p.expectedGuests, 0);
  assert(Math.abs(sumGuests - 140) <= 3, 'Dinner hourly distribution guest sum ~= total covers (rounding tolerance)', `sum=${sumGuests} expected~140`);
  assert(dinner.some((p) => p.isPeak), 'Dinner distribution has at least one peak hour flagged');

  const lunch = generateHourlyDistribution(80, 'Lunch', []);
  const sumLunch = lunch.reduce((a, p) => a + p.expectedGuests, 0);
  assert(Math.abs(sumLunch - 80) <= 3, 'Lunch hourly distribution guest sum ~= total covers', `sum=${sumLunch} expected~80`);
}

// =====================================================================
section('Full weekly forecast smoke test (generateWeeklyForecast) across all presets');
// =====================================================================
for (const preset of RESTAURANT_PRESETS) {
  const forecast = generateWeeklyForecast(preset, SAMPLE_HISTORICAL_DATA, SAMPLE_LOCAL_EVENTS, SAMPLE_WEATHER_FORECAST, undefined);
  assert(forecast.days.length === 7, `[${preset.id}] Forecast produces exactly 7 days`, `got ${forecast.days.length}`);
  const anyNaN = forecast.days.some((d) => Number.isNaN(d.covers) || Number.isNaN(d.projectedSales) || Number.isNaN(d.dailyTotalLaborCost));
  assert(!anyNaN, `[${preset.id}] No NaN values in covers/sales/labor across all days`);
  const allShiftsHaveStaff = forecast.days.every((d) => d.shifts.every((s) => Object.values(s.recommendedStaff).some((c) => c > 0)));
  assert(allShiftsHaveStaff, `[${preset.id}] Every shift has at least one recommended staff member`);
  assert(forecast.totalProjectedCovers > 0, `[${preset.id}] totalProjectedCovers > 0`, `got ${forecast.totalProjectedCovers}`);
}

// Scenario toggling should change output
{
  const base = generateWeeklyForecast(msk, SAMPLE_HISTORICAL_DATA, SAMPLE_LOCAL_EVENTS, SAMPLE_WEATHER_FORECAST, undefined);
  const scenario = {
    id: 'test-scenario', name: 'Test Surge', description: '', eventMultiplierBonus: 0.5,
    checkSizeModifier: 1.5, walkInSurgeModifier: 1.5, isActive: true,
  };
  const withScenario = generateWeeklyForecast(msk, SAMPLE_HISTORICAL_DATA, SAMPLE_LOCAL_EVENTS, SAMPLE_WEATHER_FORECAST, scenario);
  assert(withScenario.totalProjectedSales > base.totalProjectedSales, 'Active what-if surge scenario increases projected sales vs baseline', `base=${base.totalProjectedSales} scenario=${withScenario.totalProjectedSales}`);

  const inactiveScenario = { ...scenario, isActive: false };
  const withInactive = generateWeeklyForecast(msk, SAMPLE_HISTORICAL_DATA, SAMPLE_LOCAL_EVENTS, SAMPLE_WEATHER_FORECAST, inactiveScenario);
  assert(withInactive.totalProjectedSales === base.totalProjectedSales, 'isActive=false scenario has zero effect on forecast (matches baseline exactly)', `base=${base.totalProjectedSales} inactive=${withInactive.totalProjectedSales}`);
}

// =====================================================================
section('Forecast accuracy engine (MAPE / accuracy% / weekly trends)');
// =====================================================================
{
  assert(calculateMAPE([]) === 0, 'MAPE of empty log list is 0');

  const logs = [
    createShiftAccuracyLog({ date: '2026-08-24', dayOfWeek: 'Monday', shift: 'Lunch', predictedCovers: 100, actualCovers: 100, averageCheckSize: 30 }),
    createShiftAccuracyLog({ date: '2026-08-25', dayOfWeek: 'Tuesday', shift: 'Lunch', predictedCovers: 100, actualCovers: 90, averageCheckSize: 30 }),
  ];
  const mape = calculateMAPE(logs);
  // errors: |100-100|/100=0, |90-100|/90=0.1111 -> avg 0.05555 -> 5.56%
  assert(Math.abs(mape - 5.56) < 0.01, 'MAPE computed correctly for known 2-log sample', `expected ~5.56, got ${mape}`);
  assert(calculateAccuracyPercentage(mape) === Number((100 - mape).toFixed(1)), 'accuracyPercentage = 100 - MAPE');

  const perfectLog = createShiftAccuracyLog({ date: '2026-08-24', dayOfWeek: 'Monday', shift: 'Lunch', predictedCovers: 50, actualCovers: 50, averageCheckSize: 30 });
  assert(perfectLog.accuracyPercentage === 100, 'Perfect prediction (actual==predicted) yields 100% accuracy', `got ${perfectLog.accuracyPercentage}`);
  assert(perfectLog.varianceCovers === 0, 'Perfect prediction has 0 variance covers');

  const overLog = createShiftAccuracyLog({ date: '2026-08-24', dayOfWeek: 'Monday', shift: 'Dinner', predictedCovers: 100, actualCovers: 150, averageCheckSize: 30 });
  assert(overLog.varianceCovers === 50, 'Under-forecast (actual>predicted) has positive varianceCovers', `got ${overLog.varianceCovers}`);
  assert(overLog.percentError === 33.33, 'percentError computed against actual (denominator), not predicted', `expected 33.33, got ${overLog.percentError}`);

  const trends = computeWeeklyAccuracyTrends(logs);
  assert(trends.length === 1, 'Two logs in same calendar week bucket into exactly 1 weekly metric', `got ${trends.length} buckets`);
  assert(trends[0].shiftCount === 2, 'Weekly bucket shiftCount matches number of logs', `got ${trends[0].shiftCount}`);
}

// =====================================================================
section('CSV schedule export (generateScheduleCSV) -- regression tests');
// =====================================================================
{
  const shift: ShiftForecast = {
    id: 'dinner-shift', name: 'Dinner', startTime: '4:00 PM', endTime: '11:00 PM', durationHours: 7,
    covers: 200, sales: 8400,
    recommendedStaff: { servers: 2, bartenders: 1, bussers: 0, hosts: 0, lineCooks: 1, prepCooks: 1, dishwashers: 1, managers: 1 },
    gutFeelStaff: { servers: 2, bartenders: 1, bussers: 0, hosts: 0, lineCooks: 1, prepCooks: 1, dishwashers: 1, managers: 1 },
    estimatedLaborCost: 1000, gutLaborCost: 1000, laborPercentage: 12, gutLaborPercentage: 12,
    costSavings: 0, understaffingRisk: 'NONE', overstaffingRisk: 'NONE', shiftNotes: '', hourlyBreakdown: [],
  };
  const day: DayForecast = {
    date: '2026-09-04', dayOfWeek: 'Friday', covers: 200, projectedSales: 8400, baselineCovers: 180,
    eventsImpactMultiplier: 1, weatherImpactMultiplier: 1, weatherImpact: '', eventsImpact: 'None',
    riskLevel: 'LOW', riskReason: '', shifts: [shift], dailyTotalLaborCost: 1000, dailyLaborPercentage: 12,
    dailySavings: 0, events: [], weather: SAMPLE_WEATHER_FORECAST[0],
  };

  // Roster: one TIPPED server at a custom rate, and the classic "salaried employee in a normally-tipped
  // role" case (like the seeded Jessica Taylor NON_TIPPED $30/hr server in server/db.ts migration logic).
  const roster: Employee[] = [
    { id: 'e-server-1', name: 'Alice Server', primaryRole: 'servers', secondaryRoles: [], wageType: 'TIPPED', hourlyWage: 10, tipEstimate: 20, maxHoursPerWeek: 35, availability: {} },
    { id: 'e-server-2', name: 'Salaried, Sam "The Manager" Server', primaryRole: 'servers', secondaryRoles: [], wageType: 'NON_TIPPED', hourlyWage: 30, maxHoursPerWeek: 35, availability: {} },
  ];
  const assignments: ShiftAssignment[] = [
    { id: 'a1', date: '2026-09-04', shiftName: 'Dinner', role: 'servers', employeeId: 'e-server-1', employeeName: 'Alice Server', wageType: 'TIPPED', hourlyWage: 10, hours: 7, cost: 70 },
    { id: 'a2', date: '2026-09-04', shiftName: 'Dinner', role: 'servers', employeeId: 'e-server-2', employeeName: 'Salaried, Sam "The Manager" Server', wageType: 'NON_TIPPED', hourlyWage: 30, hours: 7, cost: 210 },
  ];

  const csv = generateScheduleCSV([day], assignments, msk, roster);
  const lines = csv.split('\n');

  assert(lines[0].startsWith('"Date","Day","Shift","Role"'), 'CSV header row present and correctly ordered');

  const aliceRow = lines.find((l) => l.includes('Alice Server'));
  assert(!!aliceRow && aliceRow.includes('Tipped Direct Wage') && aliceRow.includes('"10.00"'), 'Assigned tipped employee (Alice) shows her own wage type & rate, not the role default', aliceRow);

  const samRow = lines.find((l) => l.includes('Salaried, Sam'));
  assert(!!samRow && samRow.includes('Non-Tipped Flat Wage') && samRow.includes('"30.00"'), 'Assigned non-tipped employee (Sam) uses employee-specific wage type/rate even though role default for servers is TIPPED', samRow);
  // Regression: verify CSV quoting correctly escapes the embedded comma+quotes in Sam's name
  assert(!!samRow && samRow.startsWith('"2026-09-04","Friday","Dinner","Server","Salaried, Sam ""The Manager"" Server"'), 'CSV properly escapes commas and embedded double-quotes in employee names', samRow);

  const prepRow = lines.find((l) => l.includes('"Prep Cook"') && l.includes('[Required - Unassigned]'));
  assert(!!prepRow, 'Unassigned Prep Cook slot row exists');
  assert(!!prepRow && prepRow.includes('"9.5"'), 'CSV Shift Hours for unassigned prep cook includes fixed pre-opening block (7h shift + 2.5h fixed = 9.5h)', prepRow);
  assert(!!prepRow && /Fixed Pre-Opening Prep \(\+2\.5h\) \+ Service/.test(prepRow), 'CSV Hours Type column documents the fixed prep block explicitly', prepRow);

  const dishRow = lines.find((l) => l.includes('"Dishwasher"') && l.includes('[Required - Unassigned]'));
  assert(!!dishRow && dishRow.includes('"8.5"'), 'CSV Shift Hours for unassigned dishwasher includes fixed closing block (7h shift + 1.5h fixed = 8.5h)', dishRow);

  // Only 1 remaining unassigned server slot should exist: recommendedStaff.servers=2, 2 assignments already made.
  const serverUnassignedRows = lines.filter((l) => l.includes('"Server"') && l.includes('[Required - Unassigned]'));
  assert(serverUnassignedRows.length === 0, 'No leftover unassigned Server rows once assignments cover the recommended headcount (2 needed, 2 assigned)', `found ${serverUnassignedRows.length}`);

  // Bartender: recommended 1, 0 assigned => exactly 1 unassigned bartender row, tipped
  const bartenderRows = lines.filter((l) => l.includes('"Bartender"'));
  assert(bartenderRows.length === 1, 'Exactly 1 bartender row (1 recommended, 0 assigned => 1 unassigned)', `found ${bartenderRows.length}`);
  assert(bartenderRows[0].includes('Tipped Direct Wage'), 'Unassigned bartender row uses role-level wageTypes default (TIPPED for MSK)');
}

// =====================================================================
section('Kitchen schedule text export (generateKitchenScheduleText) + iCal parsing');
// =====================================================================
{
  const forecast = generateWeeklyForecast(msk, SAMPLE_HISTORICAL_DATA, SAMPLE_LOCAL_EVENTS, SAMPLE_WEATHER_FORECAST, undefined);
  const text = generateKitchenScheduleText(forecast.days, [], msk.name);
  assert(text.includes(msk.name.toUpperCase()), 'Kitchen schedule text includes restaurant name header');
  assert(text.includes('Recommended Headcount'), 'Kitchen schedule text shows recommended headcount when no assignments exist');

  const ics = `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Downtown Jazz Festival\r\nDTSTART:20260906T180000Z\r\nLOCATION:Main Street Park\r\nDESCRIPTION:Annual jazz festival\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  const parsed = parseICalData(ics);
  assert(parsed.length === 1, 'parseICalData extracts exactly 1 VEVENT', `got ${parsed.length}`);
  assert(parsed[0].date === '2026-09-06', 'parseICalData correctly parses DTSTART into YYYY-MM-DD', `got ${parsed[0].date}`);
  assert(parsed[0].category === 'FESTIVAL', 'parseICalData category-guesses "festival" in title/description as FESTIVAL', `got ${parsed[0].category}`);
}

// =====================================================================
console.log(`\n\n===== SUMMARY: ${pass} passed, ${fail} failed =====`);
if (fail > 0) {
  console.log('\nFailed checks:');
  failures.forEach((f) => console.log(' - ' + f));
  process.exit(1);
}
