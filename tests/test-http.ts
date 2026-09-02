// Black-box HTTP regression test against a live `npx tsx server.ts` instance on :3000.
// Exercises the exact routes/apiClient.ts calls the real frontend makes (default demo user,
// no Authorization header -- see authMiddleware in server.ts).
// DESTRUCTIVE to data/shiftcast_db.json -- caller must git-restore it afterward.
// Run with: npx tsx tests/test-http.ts

const BASE = 'http://localhost:3000';
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
function section(t: string) { console.log(`\n=== ${t} ===`); }

async function main() {
  section('Health & demo auth');
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  assert(health.status === 'ok', 'GET /api/health returns ok');

  const demoLogin = await fetch(`${BASE}/api/auth/demo`, { method: 'POST' }).then((r) => r.json());
  assert(demoLogin.success === true && !!demoLogin.token, 'POST /api/auth/demo logs in and returns a JWT');
  const token = demoLogin.token as string;
  const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const me = await fetch(`${BASE}/api/auth/me`, { headers: authHeaders }).then((r) => r.json());
  assert(me.success === true && me.user.email === 'manager@rustictable.com', 'GET /api/auth/me returns the demo manager profile');

  section('Restaurant-scoping over real HTTP routes (matches apiClient.ts exactly)');

  // Load current data (default/active restaurant)
  let data = await fetch(`${BASE}/api/restaurant/data`, { headers: authHeaders }).then((r) => r.json());
  assert(data.data.profile.id === 'market-street-kitchen', 'Default active restaurant is market-street-kitchen', `got ${data.data.profile.id}`);

  const baseRoster = data.data.roster;
  const alice = {
    id: 'http-test-alice', name: 'Alice HttpTest', primaryRole: 'servers', secondaryRoles: [],
    wageType: 'TIPPED', hourlyWage: 10, tipEstimate: 20, maxHoursPerWeek: 35, availability: {},
  };
  // Exactly what restaurantApi.saveRoster() does: POST /api/restaurant/roster, no restaurantId
  const saveRosterRes = await fetch(`${BASE}/api/restaurant/roster`, {
    method: 'POST', headers: authHeaders, body: JSON.stringify({ roster: [...baseRoster, alice] }),
  }).then((r) => r.json());
  assert(saveRosterRes.success && saveRosterRes.roster.some((e: any) => e.id === 'http-test-alice'), 'POST /api/restaurant/roster persists Alice on MSK');

  // Switch preset exactly like clicking a different restaurant in the header (restaurantApi.saveProfile(profile, true))
  const hbePresetRes = await fetch(`${BASE}/api/restaurant/data`).then(() => null); // no-op warm
  const switchToHbe = await fetch(`${BASE}/api/restaurant/switch-preset`, {
    method: 'POST', headers: authHeaders, body: JSON.stringify({ presetId: 'harvest-bowl-express' }),
  }).then((r) => r.json());
  assert(switchToHbe.success && switchToHbe.data.profile.id === 'harvest-bowl-express', 'POST /api/restaurant/switch-preset switches active restaurant');
  assert(!switchToHbe.data.roster.some((e: any) => e.id === 'http-test-alice'), 'REGRESSION: Harvest Bowl roster over HTTP does not contain Alice right after switching');

  const bob = {
    id: 'http-test-bob', name: 'Bob HttpTest', primaryRole: 'servers', secondaryRoles: [],
    wageType: 'NON_TIPPED', hourlyWage: 16.5, maxHoursPerWeek: 30, availability: {},
  };
  await fetch(`${BASE}/api/restaurant/roster`, {
    method: 'POST', headers: authHeaders, body: JSON.stringify({ roster: [...switchToHbe.data.roster, bob] }),
  }).then((r) => r.json());

  // Switch back to MSK -- the critical round-trip check, now via real HTTP + Express middleware
  const backToMsk = await fetch(`${BASE}/api/restaurant/switch-preset`, {
    method: 'POST', headers: authHeaders, body: JSON.stringify({ presetId: 'market-street-kitchen' }),
  }).then((r) => r.json());
  assert(backToMsk.data.roster.some((e: any) => e.id === 'http-test-alice'), 'REGRESSION (HTTP): switching back to MSK still has Alice');
  assert(!backToMsk.data.roster.some((e: any) => e.id === 'http-test-bob'), 'REGRESSION (HTTP): switching back to MSK does not leak Bob from Harvest Bowl');

  section('Reset-to-defaults staleness bug, over real HTTP routes');
  const resetRes = await fetch(`${BASE}/api/restaurant/reset-defaults`, { method: 'POST', headers: authHeaders }).then((r) => r.json());
  assert(!resetRes.data.roster.some((e: any) => e.id === 'http-test-alice'), 'Immediately after HTTP reset, Alice is gone from active roster');

  await fetch(`${BASE}/api/restaurant/switch-preset`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ presetId: 'harvest-bowl-express' }) });
  const backAfterReset = await fetch(`${BASE}/api/restaurant/switch-preset`, {
    method: 'POST', headers: authHeaders, body: JSON.stringify({ presetId: 'market-street-kitchen' }),
  }).then((r) => r.json());
  const resurrected = backAfterReset.data.roster.some((e: any) => e.id === 'http-test-alice');
  console.log(`  NOTE  (HTTP) After reset -> switch away -> switch back: Alice resurrected = ${resurrected}`);
  assert(!resurrected, 'BUG CHECK (HTTP, confirms server/db.ts-level finding): reset should survive a switch-away-and-back round trip', resurrected ? 'Confirmed over real HTTP routes: reset-to-defaults does not stick once you revisit the restaurant.' : undefined);

  section('AI-dependent endpoints (no GEMINI_API_KEY configured -- expect graceful fallback, not a crash)');
  const aiForecast = await fetch(`${BASE}/api/forecast/ai-analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ restaurantProfile: backAfterReset.data.profile, historicalData: [], localEvents: [], targetLaborPercentage: 28, weekDates: [], weatherData: [] }),
  });
  const aiForecastJson = await aiForecast.json();
  assert(aiForecast.status === 200 && aiForecastJson.isFallback === true, 'POST /api/forecast/ai-analyze returns HTTP 200 fallback (not a 500) when no API key is set', JSON.stringify(aiForecastJson));

  const discoverEvents = await fetch(`${BASE}/api/calendar/discover-events`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location: 'Austin, TX', restaurantType: 'Bistro', startDate: '2026-09-01', endDate: '2026-09-07' }),
  });
  const discoverJson = await discoverEvents.json();
  assert(discoverEvents.status === 200 && discoverJson.success === false, 'POST /api/calendar/discover-events returns HTTP 200 graceful fallback (not a 500)', JSON.stringify(discoverJson));

  const briefing = await fetch(`${BASE}/api/briefing/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dayForecast: { date: '2026-09-01', dayOfWeek: 'Tuesday', covers: 100, projectedSales: 3000, shifts: [] }, restaurantProfile: { name: 'X', concept: 'Y' } }),
  });
  const briefingJson = await briefing.json();
  assert(briefing.status === 200 && briefingJson.success === false, 'POST /api/briefing/generate returns HTTP 200 graceful fallback (not a 500)', JSON.stringify(briefingJson));

  const posParse = await fetch(`${BASE}/api/pos/parse`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText: 'Monday 8/25 Lunch: 42 covers, $1806 sales' }),
  });
  const posParseJson = await posParse.json();
  assert(posParse.status === 200 && posParseJson.success === false, 'POST /api/pos/parse returns HTTP 200 graceful fallback (not a 500)', JSON.stringify(posParseJson));

  section('Auth edge cases');
  const badLogin = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'nope@nope.com', password: 'wrongpass' }),
  });
  assert(badLogin.status === 401, 'POST /api/auth/login with bad credentials returns 401', `got ${badLogin.status}`);

  const shortPwRegister = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'shorttest@test.com', password: '123', name: 'T', restaurantName: 'T' }),
  });
  assert(shortPwRegister.status === 400, 'POST /api/auth/register with <6 char password returns 400', `got ${shortPwRegister.status}`);

  const noAuthData = await fetch(`${BASE}/api/restaurant/data`); // no Authorization header at all
  const noAuthJson = await noAuthData.json();
  assert(noAuthData.status === 200 && noAuthJson.data.profile.id, 'GET /api/restaurant/data with NO auth header at all still works (defaults to demo user) -- matches authMiddleware fallback design', JSON.stringify(noAuthJson).slice(0, 120));

  console.log(`\n\n===== SUMMARY: ${pass} passed, ${fail} failed =====`);
  if (fail > 0) {
    console.log('\nFailed checks:');
    failures.forEach((f) => console.log(' - ' + f));
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL ERROR running HTTP test suite:', e);
  process.exit(1);
});
