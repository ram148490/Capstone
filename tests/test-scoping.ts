// Ad-hoc regression test for restaurant-scoping (roster/POS/reset independence per restaurant).
// Talks directly to server/db.ts, exactly the functions the Express routes call.
// DESTRUCTIVE to data/shiftcast_db.json -- caller is responsible for git-restoring it afterward.
// Run with: npx tsx tests/test-scoping.ts
import fs from 'fs';
import path from 'path';

const DB_FILE = path.join(process.cwd(), 'data', 'shiftcast_db.json');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE); // force a fresh reseed on first loadDb()

import {
  loadDb,
  getUserRestaurantData,
  saveUserRestaurantData,
  switchUserProfilePreset,
  addPosRecords,
  resetUserToDemoData,
} from '../server/db';
import { Employee, HistoricalSalesRecord, ShiftAssignment } from '../src/types';

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

const db = loadDb();
const userId = db.users[0].id;
console.log(`Using demo user: ${userId}`);

// =====================================================================
section('Baseline: fresh user starts on Market Street Kitchen (default preset[0])');
// =====================================================================
const initial = getUserRestaurantData(userId);
assert(initial.profile.id === 'market-street-kitchen', 'Fresh account default profile id is market-street-kitchen', `got ${initial.profile.id}`);
const initialRosterNames = initial.roster.map((e) => e.name).sort();
console.log(`  (initial MSK roster: ${initialRosterNames.join(', ')})`);

// =====================================================================
section('Roster independence across restaurants (regression)');
// =====================================================================

const alice: Employee = {
  id: 'test-emp-alice', name: 'Alice TestServer', primaryRole: 'servers', secondaryRoles: [],
  wageType: 'TIPPED', hourlyWage: 10, tipEstimate: 20, maxHoursPerWeek: 35, availability: {},
};

// Simulates POST /api/restaurant/roster (no restaurantId passed by the frontend -- see apiClient.ts saveRoster())
saveUserRestaurantData(userId, { roster: [...initial.roster, alice] });

const afterAliceActive = getUserRestaurantData(userId);
assert(
  afterAliceActive.roster.some((e) => e.id === 'test-emp-alice'),
  'Alice appears in the active (MSK) roster immediately after saving'
);

const mskScoped1 = getUserRestaurantData(userId, 'market-street-kitchen');
assert(
  mskScoped1.roster.some((e) => e.id === 'test-emp-alice'),
  'Alice is persisted under the market-street-kitchen SCOPED key too'
);

// Switch to Harvest Bowl Express (simulates clicking a different preset in the header)
const hbeData = switchUserProfilePreset(userId, 'harvest-bowl-express');
assert(hbeData.profile.id === 'harvest-bowl-express', 'switchUserProfilePreset switches active profile id', `got ${hbeData.profile.id}`);
assert(
  !hbeData.roster.some((e) => e.id === 'test-emp-alice'),
  'REGRESSION: Harvest Bowl roster does NOT contain Alice (MSK employee) right after switching'
);

const bob: Employee = {
  id: 'test-emp-bob', name: 'Bob TestCashier', primaryRole: 'servers', secondaryRoles: [],
  wageType: 'NON_TIPPED', hourlyWage: 16.5, maxHoursPerWeek: 30, availability: {},
};
saveUserRestaurantData(userId, { roster: [...hbeData.roster, bob] });

const afterBobActive = getUserRestaurantData(userId);
assert(afterBobActive.profile.id === 'harvest-bowl-express', 'Active restaurant is still Harvest Bowl after adding Bob');
assert(afterBobActive.roster.some((e) => e.id === 'test-emp-bob'), 'Bob appears in active (Harvest Bowl) roster');
assert(!afterBobActive.roster.some((e) => e.id === 'test-emp-alice'), 'Alice still absent from active Harvest Bowl roster');

// Switch BACK to Market Street Kitchen -- the critical regression check
const mskAgain = switchUserProfilePreset(userId, 'market-street-kitchen');
assert(
  mskAgain.roster.some((e) => e.id === 'test-emp-alice'),
  'REGRESSION: Switching back to MSK still shows Alice (roster survived the round trip)'
);
assert(
  !mskAgain.roster.some((e) => e.id === 'test-emp-bob'),
  'REGRESSION: Switching back to MSK does NOT leak Bob (Harvest Bowl employee) into MSK roster'
);

// And Harvest Bowl's data should still independently have Bob when we go back to it
const hbeAgain = switchUserProfilePreset(userId, 'harvest-bowl-express');
assert(hbeAgain.roster.some((e) => e.id === 'test-emp-bob'), 'Harvest Bowl roster still has Bob on second visit');
assert(!hbeAgain.roster.some((e) => e.id === 'test-emp-alice'), 'Harvest Bowl roster still lacks Alice on second visit');

// =====================================================================
section('POS historical data independence across restaurants');
// =====================================================================
switchUserProfilePreset(userId, 'market-street-kitchen');
const mskPosRecord: HistoricalSalesRecord = {
  id: 'test-pos-msk-1', date: '2026-09-01', dayOfWeek: 'Tuesday', shift: 'Dinner',
  covers: 999, sales: 99999, laborCost: 1, laborHours: 1,
};
addPosRecords(userId, [mskPosRecord]);
const mskAfterPos = getUserRestaurantData(userId, 'market-street-kitchen');
assert(mskAfterPos.historicalData.some((r) => r.id === 'test-pos-msk-1'), 'Custom POS record saved under MSK scoped data');

switchUserProfilePreset(userId, 'harvest-bowl-express');
const hbeAfterSwitch = getUserRestaurantData(userId, 'harvest-bowl-express');
assert(
  !hbeAfterSwitch.historicalData.some((r) => r.id === 'test-pos-msk-1'),
  'REGRESSION: Harvest Bowl historicalData does NOT contain the MSK-only POS record'
);

// =====================================================================
section('"Reset to Defaults" scoping staleness check');
// =====================================================================
// Active restaurant is Harvest Bowl at this point (from the block above). Switch back to MSK
// (which currently holds our modified roster incl. Alice) before resetting.
switchUserProfilePreset(userId, 'market-street-kitchen');
const beforeReset = getUserRestaurantData(userId);
assert(beforeReset.roster.some((e) => e.id === 'test-emp-alice'), 'Sanity: MSK roster has Alice immediately before reset');

resetUserToDemoData(userId);
const rightAfterReset = getUserRestaurantData(userId);
assert(
  !rightAfterReset.roster.some((e) => e.id === 'test-emp-alice'),
  'Immediately after reset, active roster no longer shows Alice (looks reset)'
);
assert(rightAfterReset.profile.id === 'market-street-kitchen', 'Reset restores active profile to market-street-kitchen (preset[0])', `got ${rightAfterReset.profile.id}`);

// Now switch away and back -- does the reset "stick", or does stale scoped data resurrect Alice?
switchUserProfilePreset(userId, 'harvest-bowl-express');
const mskAfterResetRoundTrip = switchUserProfilePreset(userId, 'market-street-kitchen');
const aliceResurrected = mskAfterResetRoundTrip.roster.some((e) => e.id === 'test-emp-alice');
console.log(`  NOTE  After reset -> switch away -> switch back to MSK: Alice present = ${aliceResurrected}`);
assert(
  !aliceResurrected,
  'BUG CHECK: resetUserToDemoData() should also clear the scoped userId__market-street-kitchen key, not just the active-user pointer, so a reset survives switching restaurants and back',
  aliceResurrected
    ? `resetUserToDemoData() only overwrites db.restaurantData[userId] and never touches the scoped key (db.restaurantData["${userId}__market-street-kitchen"]). That scoped key still holds the PRE-reset data (with Alice). The very next switch-away-and-back reloads the stale scoped copy, silently undoing the reset the user just asked for.`
    : undefined
);

// =====================================================================
section('Assignment sanitize must NOT rewrite per-shift prep/dish hours (regression)');
// =====================================================================
// migrateAndSanitizeDb() runs on every saveUserRestaurantData(). It used to hardcode
// prep cooks to 7.5h and dishwashers to 6.5h ("5h shift + fixed block"), silently
// corrupting every non-5h shift. MSK Dinner is a 7h shift, so a dinner prep cook works
// 7 + 2.5 = 9.5h and a dinner dishwasher works 7 + 1.5 = 8.5h -- those must survive a save.
switchUserProfilePreset(userId, 'market-street-kitchen');
const dinnerPrep: ShiftAssignment = {
  id: 'test-asg-dinner-prep', date: '2026-09-04', shiftName: 'Dinner', role: 'prepCooks',
  employeeId: 'x', employeeName: 'Test Prep', wageType: 'NON_TIPPED', hourlyWage: 19,
  hours: 9.5, fixedHours: 2.5, cost: Number((19 * 9.5).toFixed(2)),
};
const dinnerDish: ShiftAssignment = {
  id: 'test-asg-dinner-dish', date: '2026-09-04', shiftName: 'Dinner', role: 'dishwashers',
  employeeId: 'y', employeeName: 'Test Dish', wageType: 'NON_TIPPED', hourlyWage: 16.5,
  hours: 8.5, fixedHours: 1.5, cost: Number((16.5 * 8.5).toFixed(2)),
};
saveUserRestaurantData(userId, { assignments: [dinnerPrep, dinnerDish] });
const afterSave = getUserRestaurantData(userId);
const savedPrep = afterSave.assignments.find((a) => a.id === 'test-asg-dinner-prep');
const savedDish = afterSave.assignments.find((a) => a.id === 'test-asg-dinner-dish');
assert(savedPrep?.hours === 9.5, 'REGRESSION: dinner (7h) prep cook keeps 9.5h after save, not clamped to 7.5h', `got ${savedPrep?.hours}`);
assert(savedDish?.hours === 8.5, 'REGRESSION: dinner (7h) dishwasher keeps 8.5h after save, not clamped to 6.5h', `got ${savedDish?.hours}`);
assert(savedPrep?.cost === Number((19 * 9.5).toFixed(2)), 'dinner prep cook cost stays consistent with its real hours', `got ${savedPrep?.cost}`);

// =====================================================================
console.log(`\n\n===== SUMMARY: ${pass} passed, ${fail} failed =====`);
if (fail > 0) {
  console.log('\nFailed checks:');
  failures.forEach((f) => console.log(' - ' + f));
}
process.exit(fail > 0 ? 1 : 0);
