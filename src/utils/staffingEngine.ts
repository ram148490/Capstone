import {
  RestaurantProfile,
  HistoricalSalesRecord,
  LocalEvent,
  WeatherForecastDay,
  DayForecast,
  ShiftForecast,
  WeeklyForecastSummary,
  StaffRole,
  HourlyDistributionPoint,
  WhatIfScenario,
  WageType,
  FixedHoursConfig,
} from '../types';

// Helper to determine role shift hours factoring in non-scaling fixed prep and closing sanitizing blocks
export function getRoleShiftHours(
  role: StaffRole,
  baseShiftHours: number,
  fixedConfig?: FixedHoursConfig
): { hours: number; fixedHours: number; serviceHours: number } {
  const prepFixed = fixedConfig?.prepCookFixedHours ?? 2.5;
  const dishFixed = fixedConfig?.closingDishwasherFixedHours ?? 1.5;

  if (role === 'prepCooks') {
    // Prep cooks work fixed opening prep block (e.g. 2.5h) before service + service shift
    return {
      hours: Number((baseShiftHours + prepFixed).toFixed(1)),
      fixedHours: prepFixed,
      serviceHours: baseShiftHours,
    };
  }

  if (role === 'dishwashers') {
    // Closing dishwashers stay after service for fixed sanitation/station breakdown block
    return {
      hours: Number((baseShiftHours + dishFixed).toFixed(1)),
      fixedHours: dishFixed,
      serviceHours: baseShiftHours,
    };
  }

  return {
    hours: baseShiftHours,
    fixedHours: 0,
    serviceHours: baseShiftHours,
  };
}

export const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

// Helper to get next week dates starting from Monday Aug 31, 2026
export function getTargetWeekDates(startDateStr = '2026-08-31'): { date: string; dayOfWeek: string }[] {
  const dates = [];
  const [year, month, day] = startDateStr.split('-').map(Number);
  const baseDate = new Date(year, month - 1, day);

  for (let i = 0; i < 7; i++) {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const dayOfWeek = DAYS_OF_WEEK[i];
    dates.push({ date: dateStr, dayOfWeek });
  }
  return dates;
}

// Calculate baseline covers from historical data with day-of-week weighted averages
export function calculateBaseline(
  historicalData: HistoricalSalesRecord[],
  dayOfWeek: string,
  shiftName: string,
  restaurant?: RestaurantProfile
): { covers: number; sales: number } {
  const matching = (historicalData || []).filter(
    (h) =>
      h.dayOfWeek.toLowerCase() === dayOfWeek.toLowerCase() &&
      h.shift.toLowerCase() === shiftName.toLowerCase()
  );

  const avgCheck = restaurant?.averageCheckSize || 35;
  const isWeekend = ['Friday', 'Saturday', 'Sunday'].includes(dayOfWeek);
  const isDinner = shiftName.toLowerCase().includes('dinner');

  if (matching.length === 0) {
    // Check if there are other records for this shift to calculate relative day profile
    const sameShiftRecords = (historicalData || []).filter(
      (h) => h.shift.toLowerCase() === shiftName.toLowerCase()
    );

    if (sameShiftRecords.length > 0) {
      const avgShiftCovers =
        sameShiftRecords.reduce((sum, r) => sum + r.covers, 0) / sameShiftRecords.length;
      const dayFactor = isWeekend
        ? dayOfWeek === 'Sunday'
          ? 1.15
          : 1.4
        : dayOfWeek === 'Monday'
        ? 0.8
        : 0.95;
      const covers = Math.max(15, Math.round(avgShiftCovers * dayFactor));
      const sales = Math.round(covers * avgCheck);
      return { covers, sales };
    }

    // Concept-specific fallback based on seating capacity and style
    const seats = restaurant?.seatCount || 90;
    const isFastCasual =
      restaurant?.conceptType === 'FAST_CASUAL' ||
      restaurant?.serviceStyle === 'FAST_CASUAL' ||
      restaurant?.serviceStyle === 'COUNTER_SERVICE';

    let fallbackCovers = 50;
    if (isFastCasual) {
      // Fast casual: higher lunch volume (1.8x - 2.4x seats), moderate dinner
      fallbackCovers = !isDinner
        ? Math.round(seats * (isWeekend ? 1.0 : 2.2))
        : Math.round(seats * (isWeekend ? 0.65 : 0.85));
    } else {
      // Full service / Bistro / Pizzeria: higher dinner volume (1.0x - 2.2x seats)
      fallbackCovers = isDinner
        ? Math.round(seats * (isWeekend ? 2.1 : 1.1))
        : Math.round(seats * (isWeekend ? 0.9 : 0.45));
    }

    const sales = Math.round(fallbackCovers * avgCheck);
    return { covers: fallbackCovers, sales };
  }

  // Calculate weighted average (more recent records get higher weight)
  let totalCoversWeight = 0;
  let totalSalesWeight = 0;
  let totalWeight = 0;

  matching.forEach((record, index) => {
    const weight = 1 + index * 0.25;
    totalCoversWeight += record.covers * weight;
    totalSalesWeight += record.sales * weight;
    totalWeight += weight;
  });

  const avgCovers = Math.round(totalCoversWeight / totalWeight);
  const avgSales = Math.round(totalSalesWeight / totalWeight);

  return { covers: avgCovers, sales: avgSales };
}

// Calculate local event multiplier for a specific date and shift
export function getEventMultiplier(
  date: string,
  shiftName: string,
  events: LocalEvent[]
): { multiplier: number; activeEvents: LocalEvent[]; description: string } {
  const activeEvents = events.filter(
    (e) =>
      e.isEnabled &&
      e.date === date &&
      (e.affectedShifts.length === 0 ||
        e.affectedShifts.map((s) => s.toLowerCase()).includes(shiftName.toLowerCase()))
  );

  if (activeEvents.length === 0) {
    return { multiplier: 1.0, activeEvents: [], description: 'No major local events scheduled' };
  }

  // Compound multiplier with diminishing returns
  let totalBonus = 0;
  activeEvents.forEach((event) => {
    const bonus = event.volumeMultiplier - 1.0;
    totalBonus += bonus;
  });

  // Cap combined multiplier to realistic +65% max
  const finalMultiplier = Number(Math.min(1.65, Math.max(0.6, 1.0 + totalBonus)).toFixed(2));
  const desc = activeEvents.map((e) => `${e.title} (${e.rushWindow || e.category})`).join('; ');

  return { multiplier: finalMultiplier, activeEvents, description: desc };
}

// Calculate weather impact
export function getWeatherMultiplier(
  date: string,
  weatherForecast: WeatherForecastDay[],
  hasPatio: boolean
): { multiplier: number; weather: WeatherForecastDay; description: string } {
  const forecast = weatherForecast.find((w) => w.date === date) || {
    date,
    dayOfWeek: 'Monday',
    condition: 'Sunny',
    tempF: 75,
    rainChance: 0,
    patioOpen: true,
    volumeMultiplier: 1.0,
    notes: 'Normal conditions',
  };

  let mult = forecast.volumeMultiplier;
  if (!forecast.patioOpen && hasPatio) {
    mult = Math.min(mult, 0.88);
  }

  return {
    multiplier: mult,
    weather: forecast,
    description: `${forecast.condition}, ${forecast.tempF}°F. ${forecast.notes}`,
  };
}

// Staffing recommendation algorithm based on covers, station productivity, and restaurant concept
export function calculateRecommendedStaff(
  covers: number,
  restaurant: RestaurantProfile,
  shiftName: string
): Record<StaffRole, number> {
  const p = restaurant.productivity;
  const isDinner = shiftName.toLowerCase().includes('dinner');
  const isFastCasual =
    restaurant.conceptType === 'FAST_CASUAL' ||
    restaurant.serviceStyle === 'FAST_CASUAL' ||
    restaurant.serviceStyle === 'COUNTER_SERVICE' ||
    restaurant.concept.toLowerCase().includes('fast-casual') ||
    restaurant.concept.toLowerCase().includes('counter') ||
    restaurant.id === 'harvest-bowl-express';

  const hasBar = restaurant.hasBar ?? (!isFastCasual);
  const hasHost = restaurant.hasHostStand ?? (!isFastCasual);

  const defaultRoles: StaffRole[] = isFastCasual
    ? ['servers', 'lineCooks', 'prepCooks', 'dishwashers', 'managers', 'bussers']
    : ['servers', 'bartenders', 'bussers', 'hosts', 'lineCooks', 'prepCooks', 'dishwashers', 'managers'];

  const enabledRoles =
    restaurant.enabledRoles && restaurant.enabledRoles.length > 0
      ? restaurant.enabledRoles
      : defaultRoles;

  const isRoleActive = (role: StaffRole) => {
    if (role === 'bartenders' && !hasBar) return false;
    if (role === 'hosts' && !hasHost) return false;
    return enabledRoles.includes(role);
  };

  let servers = 0;
  let bartenders = 0;
  let bussers = 0;
  let hosts = 0;
  let lineCooks = 0;
  let prepCooks = 0;
  let dishwashers = 0;
  let managers = 1;

  const fixedPrepFloor = restaurant.fixedHoursConfig?.fixedPrepCookHeadcount ?? 1;
  const fixedDishFloor = restaurant.fixedHoursConfig?.fixedClosingDishwasherHeadcount ?? 1;

  if (isFastCasual) {
    // Fast-casual / counter service model (e.g. Harvest Bowl Express)
    // Servers act as Counter Staff / Cashiers / Expedite Runners
    servers = isRoleActive('servers') ? Math.max(1, Math.ceil(covers / (p.coversPerServer || 38))) : 0;
    bartenders = 0; // Strictly zero for fast-casual/no-bar concepts
    hosts = 0; // Strictly zero for fast-casual/no-host concepts
    lineCooks = isRoleActive('lineCooks') ? Math.max(1, Math.ceil(covers / (p.coversPerLineCook || 36))) : 0;
    // Fixed pre-service prep floor: minimum guaranteed prep headcount even on low covers
    prepCooks = isRoleActive('prepCooks')
      ? Math.max(fixedPrepFloor, covers > 120 ? Math.ceil(covers / 90) : fixedPrepFloor)
      : 0;
    // Closing dishwasher floor: minimum guaranteed closing dishwasher for station sanitation
    dishwashers = isRoleActive('dishwashers')
      ? Math.max(fixedDishFloor, covers > 55 ? Math.ceil(covers / (p.coversPerDishwasher || 85)) : fixedDishFloor)
      : 0;
    bussers = isRoleActive('bussers')
      ? covers > 90
        ? Math.max(0, Math.ceil((covers - 80) / (p.coversPerBusser || 75)))
        : 0
      : 0;
    managers = isRoleActive('managers') ? 1 : 0;
  } else {
    // Full-service dining / Bistro / Pizzeria
    servers = isRoleActive('servers') ? Math.max(1, Math.ceil(covers / (p.coversPerServer || 22))) : 0;
    bartenders = isRoleActive('bartenders')
      ? covers < 35 && !isDinner
        ? 1
        : Math.max(1, Math.ceil(covers / (p.coversPerBartender || 45)))
      : 0;
    lineCooks = isRoleActive('lineCooks') ? Math.max(1, Math.ceil(covers / (p.coversPerLineCook || 28))) : 0;
    bussers = isRoleActive('bussers') && covers > 40
      ? Math.max(1, Math.ceil(covers / (p.coversPerBusser || 40)))
      : 0;
    // Closing dishwasher floor: fixed closing sanitation headcount (1 minimum guaranteed even on slow covers)
    dishwashers = isRoleActive('dishwashers')
      ? Math.max(fixedDishFloor, covers > 45 ? Math.ceil(covers / (p.coversPerDishwasher || 70)) : fixedDishFloor)
      : 0;
    hosts = isRoleActive('hosts')
      ? covers > 55
        ? Math.max(1, Math.ceil(covers / (p.coversPerHost || 65)))
        : isDinner && covers > 35
        ? 1
        : 0
      : 0;
    // Fixed pre-service prep floor: guaranteed prep cook for pre-service station mise en place
    prepCooks = isRoleActive('prepCooks')
      ? Math.max(fixedPrepFloor, covers > 150 ? 1 + Math.floor((covers - 150) / 100) : fixedPrepFloor)
      : 0;
    managers = isRoleActive('managers') ? 1 : 0;
  }

  return {
    servers,
    bartenders,
    bussers,
    hosts,
    lineCooks,
    prepCooks,
    dishwashers,
    managers,
  };
}

// Typical "Gut Feel" baseline staffing scheduled without data/events
export function calculateGutFeelStaff(
  dayOfWeek: string,
  shiftName: string,
  restaurant?: RestaurantProfile
): Record<StaffRole, number> {
  const isWeekend = ['Friday', 'Saturday'].includes(dayOfWeek);
  const isSunday = dayOfWeek === 'Sunday';
  const isDinner = shiftName.toLowerCase().includes('dinner');

  const isFastCasual =
    restaurant?.conceptType === 'FAST_CASUAL' ||
    restaurant?.serviceStyle === 'FAST_CASUAL' ||
    restaurant?.serviceStyle === 'COUNTER_SERVICE' ||
    restaurant?.concept.toLowerCase().includes('fast-casual') ||
    restaurant?.id === 'harvest-bowl-express';

  const hasBar = restaurant?.hasBar ?? (!isFastCasual);
  const hasHost = restaurant?.hasHostStand ?? (!isFastCasual);

  const enabledRoles = restaurant?.enabledRoles;
  const isRoleActive = (role: StaffRole) => {
    if (role === 'bartenders' && !hasBar) return false;
    if (role === 'hosts' && !hasHost) return false;
    if (enabledRoles && !enabledRoles.includes(role)) return false;
    return true;
  };

  let staff: Record<StaffRole, number>;

  if (isFastCasual) {
    if (isWeekend) {
      staff = {
        servers: 2,
        bartenders: 0,
        bussers: 0,
        hosts: 0,
        lineCooks: 2,
        prepCooks: 1,
        dishwashers: 1,
        managers: 1,
      };
    } else if (isDinner) {
      staff = {
        servers: 2,
        bartenders: 0,
        bussers: 0,
        hosts: 0,
        lineCooks: 2,
        prepCooks: 0,
        dishwashers: 1,
        managers: 1,
      };
    } else {
      // Weekday lunch
      staff = {
        servers: 3,
        bartenders: 0,
        bussers: 1,
        hosts: 0,
        lineCooks: 3,
        prepCooks: 1,
        dishwashers: 1,
        managers: 1,
      };
    }
  } else if (isWeekend) {
    if (isDinner) {
      staff = {
        servers: 5,
        bartenders: 2,
        bussers: 2,
        hosts: 1,
        lineCooks: 4,
        prepCooks: 1,
        dishwashers: 2,
        managers: 1,
      };
    } else {
      staff = {
        servers: 3,
        bartenders: 1,
        bussers: 1,
        hosts: 1,
        lineCooks: 2,
        prepCooks: 1,
        dishwashers: 1,
        managers: 1,
      };
    }
  } else if (isSunday) {
    staff = {
      servers: 3,
      bartenders: 1,
      bussers: 1,
      hosts: 1,
      lineCooks: 2,
      prepCooks: 1,
      dishwashers: 1,
      managers: 1,
    };
  } else if (isDinner) {
    // Weekday Full-Service dinner
    staff = {
      servers: 4,
      bartenders: 1,
      bussers: 1,
      hosts: 1,
      lineCooks: 3,
      prepCooks: 0,
      dishwashers: 1,
      managers: 1,
    };
  } else {
    // Weekday lunch
    staff = {
      servers: 3,
      bartenders: 1,
      bussers: 1,
      hosts: 1,
      lineCooks: 2,
      prepCooks: 1,
      dishwashers: 1,
      managers: 1,
    };
  }

  // Strictly enforce concept active roles
  (Object.keys(staff) as StaffRole[]).forEach((role) => {
    if (!isRoleActive(role)) {
      staff[role] = 0;
    }
  });

  return staff;
}

export interface LaborCostDetail {
  totalCost: number;
  tippedCost: number;
  nonTippedCost: number;
  fixedLaborCost: number;
  variableLaborCost: number;
  roleCosts: Record<StaffRole, number>;
  roleHours: Record<StaffRole, number>;
  roleWageRates: Record<StaffRole, number>;
}

export function isTippedRole(role: StaffRole, restaurant?: RestaurantProfile): boolean {
  if (restaurant?.wageTypes && restaurant.wageTypes[role] !== undefined) {
    return restaurant.wageTypes[role] === 'TIPPED';
  }
  // Default concept-aware heuristic:
  const isFastCasual =
    restaurant?.conceptType === 'FAST_CASUAL' ||
    restaurant?.serviceStyle === 'FAST_CASUAL' ||
    restaurant?.serviceStyle === 'COUNTER_SERVICE' ||
    restaurant?.id === 'harvest-bowl-express';

  if (isFastCasual) return false;
  return role === 'servers' || role === 'bartenders' || role === 'bussers';
}

// Compute comprehensive labor cost factoring in tipped direct cash wages and fixed non-scaling prep/close blocks
export function calculateDetailedLaborCost(
  staff: Record<StaffRole, number>,
  wages: Record<StaffRole, number>,
  baseShiftHours: number,
  restaurant?: RestaurantProfile
): LaborCostDetail {
  let totalCost = 0;
  let tippedCost = 0;
  let nonTippedCost = 0;
  let fixedLaborCost = 0;
  let variableLaborCost = 0;

  const roleCosts: Record<StaffRole, number> = {
    servers: 0,
    bartenders: 0,
    bussers: 0,
    hosts: 0,
    lineCooks: 0,
    prepCooks: 0,
    dishwashers: 0,
    managers: 0,
  };

  const roleHours: Record<StaffRole, number> = {
    servers: baseShiftHours,
    bartenders: baseShiftHours,
    bussers: baseShiftHours,
    hosts: baseShiftHours,
    lineCooks: baseShiftHours,
    prepCooks: baseShiftHours,
    dishwashers: baseShiftHours,
    managers: baseShiftHours,
  };

  const roleWageRates: Record<StaffRole, number> = {
    servers: wages?.servers ?? 10,
    bartenders: wages?.bartenders ?? 11.5,
    bussers: wages?.bussers ?? 12,
    hosts: wages?.hosts ?? 16,
    lineCooks: wages?.lineCooks ?? 23,
    prepCooks: wages?.prepCooks ?? 19,
    dishwashers: wages?.dishwashers ?? 16.5,
    managers: wages?.managers ?? 30,
  };

  const fixedConfig = restaurant?.fixedHoursConfig;

  (Object.keys(staff) as StaffRole[]).forEach((role) => {
    const count = staff[role] || 0;
    const rate = wages && wages[role] !== undefined ? wages[role] : (roleWageRates[role] || 16);
    const hourBreakdown = getRoleShiftHours(role, baseShiftHours, fixedConfig);
    const totalRoleHours = hourBreakdown.hours;
    roleHours[role] = totalRoleHours;

    if (count <= 0) return;

    const costForRole = count * rate * totalRoleHours;
    roleCosts[role] = Math.round(costForRole);
    totalCost += costForRole;

    const tipped = isTippedRole(role, restaurant);
    if (tipped) {
      tippedCost += costForRole;
    } else {
      nonTippedCost += costForRole;
    }

    // Differentiate fixed prep & closing dish sanitation from variable cover-driven labor
    if (role === 'prepCooks') {
      const fixedHeadcount = Math.min(count, fixedConfig?.fixedPrepCookHeadcount ?? 1);
      const fixedPrepPart = fixedHeadcount * rate * hourBreakdown.fixedHours;
      fixedLaborCost += fixedPrepPart;
      variableLaborCost += (costForRole - fixedPrepPart);
    } else if (role === 'dishwashers') {
      const fixedHeadcount = Math.min(count, fixedConfig?.fixedClosingDishwasherHeadcount ?? 1);
      const fixedDishPart = fixedHeadcount * rate * hourBreakdown.fixedHours;
      fixedLaborCost += fixedDishPart;
      variableLaborCost += (costForRole - fixedDishPart);
    } else {
      variableLaborCost += costForRole;
    }
  });

  return {
    totalCost: Math.round(totalCost),
    tippedCost: Math.round(tippedCost),
    nonTippedCost: Math.round(nonTippedCost),
    fixedLaborCost: Math.round(fixedLaborCost),
    variableLaborCost: Math.round(variableLaborCost),
    roleCosts,
    roleHours,
    roleWageRates,
  };
}

// Drop-in compatible compute total labor cost
export function calculateLaborCost(
  staff: Record<StaffRole, number>,
  wages: Record<StaffRole, number>,
  hours: number,
  restaurant?: RestaurantProfile
): number {
  return calculateDetailedLaborCost(staff, wages, hours, restaurant).totalCost;
}

// Generate hourly arrival curve
export function generateHourlyDistribution(
  covers: number,
  shiftName: string,
  activeEvents: LocalEvent[]
): HourlyDistributionPoint[] {
  const isDinner = shiftName.toLowerCase().includes('dinner');
  const points: HourlyDistributionPoint[] = [];

  const hasConcert = activeEvents.some((e) => e.category === 'CONCERT' || e.category === 'SPORTS');

  if (isDinner) {
    const hours = ['4:00 PM', '5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM', '10:00 PM'];
    let weights = [0.06, 0.14, 0.25, 0.26, 0.16, 0.09, 0.04];

    if (hasConcert) {
      // Skew peak earlier (5-7pm) for pre-event rush
      weights = [0.08, 0.24, 0.30, 0.15, 0.10, 0.08, 0.05];
    }

    hours.forEach((hour, idx) => {
      const guests = Math.round(covers * weights[idx]);
      const isPeak = weights[idx] >= 0.2;
      points.push({
        hour,
        expectedGuests: guests,
        isPeak,
        recommendedFloorStaff: Math.max(2, Math.ceil(guests / 12)),
        recommendedKitchenStaff: Math.max(2, Math.ceil(guests / 15)),
      });
    });
  } else {
    // Lunch
    const hours = ['11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM'];
    const weights = [0.12, 0.38, 0.32, 0.12, 0.06];

    hours.forEach((hour, idx) => {
      const guests = Math.round(covers * weights[idx]);
      const isPeak = weights[idx] >= 0.3;
      points.push({
        hour,
        expectedGuests: guests,
        isPeak,
        recommendedFloorStaff: Math.max(2, Math.ceil(guests / 14)),
        recommendedKitchenStaff: Math.max(1, Math.ceil(guests / 18)),
      });
    });
  }

  return points;
}

// Master forecast generator combining all algorithms
export function generateWeeklyForecast(
  restaurant: RestaurantProfile,
  historicalData: HistoricalSalesRecord[],
  localEvents: LocalEvent[],
  weatherForecast: WeatherForecastDay[],
  scenario?: WhatIfScenario
): WeeklyForecastSummary {
  const weekDates = getTargetWeekDates('2026-08-31');
  const days: DayForecast[] = [];

  let totalCovers = 0;
  let totalSales = 0;
  let totalRecLabor = 0;
  let totalGutLabor = 0;

  weekDates.forEach(({ date, dayOfWeek }) => {
    const shiftsForDay: ShiftForecast[] = [];
    const activeShifts = restaurant.shifts.filter((s) => s.daysActive.includes(dayOfWeek));

    let dayCovers = 0;
    let daySales = 0;
    let dayBaselineCovers = 0;
    let dayTotalLabor = 0;
    let dayGutLabor = 0;

    const dayEvents = localEvents.filter((e) => e.isEnabled && e.date === date);
    const { weather, description: weatherDesc } = getWeatherMultiplier(
      date,
      weatherForecast,
      restaurant.hasPatio
    );

    activeShifts.forEach((shiftConfig) => {
      const baseline = calculateBaseline(historicalData, dayOfWeek, shiftConfig.name, restaurant);
      dayBaselineCovers += baseline.covers;

      // Event multiplier
      const eventRes = getEventMultiplier(date, shiftConfig.name, localEvents);
      let eventMult = eventRes.multiplier;
      if (scenario && scenario.isActive) {
        eventMult += scenario.eventMultiplierBonus;
      }

      // Weather multiplier
      let weatherMult = weather.volumeMultiplier;
      if (scenario && scenario.isActive && scenario.weatherMod) {
        if (scenario.weatherMod === 'Rain') weatherMult = 0.85;
        if (scenario.weatherMod === 'Sunny') weatherMult = 1.1;
      }

      // Scenario Walk-in surge
      const scenarioSurge = scenario && scenario.isActive ? scenario.walkInSurgeModifier : 1.0;
      const scenarioCheckMod = scenario && scenario.isActive ? scenario.checkSizeModifier : 1.0;

      // Combined volume
      const projectedCovers = Math.round(
        baseline.covers * eventMult * weatherMult * scenarioSurge
      );

      const checkSize = restaurant.averageCheckSize * scenarioCheckMod;
      const projectedSales = Math.round(projectedCovers * checkSize);

      dayCovers += projectedCovers;
      daySales += projectedSales;

      // Staffing calculations
      const recommendedStaff = calculateRecommendedStaff(
        projectedCovers,
        restaurant,
        shiftConfig.name
      );
      const gutStaff = calculateGutFeelStaff(dayOfWeek, shiftConfig.name, restaurant);

      const recLaborDetail = calculateDetailedLaborCost(
        recommendedStaff,
        restaurant.wageRates,
        shiftConfig.durationHours,
        restaurant
      );
      const gutLaborDetail = calculateDetailedLaborCost(
        gutStaff,
        restaurant.wageRates,
        shiftConfig.durationHours,
        restaurant
      );

      const recLaborCost = recLaborDetail.totalCost;
      const gutLaborCost = gutLaborDetail.totalCost;

      const recLaborPct = Number(((recLaborCost / Math.max(1, projectedSales)) * 100).toFixed(1));
      const gutLaborPct = Number(((gutLaborCost / Math.max(1, projectedSales)) * 100).toFixed(1));

      const savings = gutLaborCost - recLaborCost;

      dayTotalLabor += recLaborCost;
      dayGutLabor += gutLaborCost;

      // Risk analysis
      const recCooks = recommendedStaff.lineCooks;
      const gutCooks = gutStaff.lineCooks;
      const recServers = recommendedStaff.servers;
      const gutServers = gutStaff.servers;

      let understaffingRisk: 'NONE' | 'LOW' | 'MEDIUM' | 'CRITICAL' = 'NONE';
      let overstaffingRisk: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' = 'NONE';

      if (projectedCovers > baseline.covers * 1.25 && (gutCooks < recCooks || gutServers < recServers)) {
        understaffingRisk = projectedCovers > 200 ? 'CRITICAL' : 'HIGH' as any;
      } else if (projectedCovers > baseline.covers * 1.15 && gutServers < recServers) {
        understaffingRisk = 'MEDIUM';
      }

      if (savings > 180 && projectedCovers < baseline.covers * 0.9) {
        overstaffingRisk = 'HIGH';
      } else if (savings > 90) {
        overstaffingRisk = 'MEDIUM';
      }

      const hourlyBreakdown = generateHourlyDistribution(
        projectedCovers,
        shiftConfig.name,
        eventRes.activeEvents
      );

      let shiftNotes = '';
      if (eventRes.activeEvents.length > 0) {
        shiftNotes = `Impacting Events: ${eventRes.activeEvents.map((e) => e.title).join(', ')}. ${eventRes.activeEvents[0].staffingTip || ''}`;
      } else if (weather.condition === 'Rain') {
        shiftNotes = 'Rain forecast; reduce patio setup and assign 1 server to support bar.';
      } else {
        shiftNotes = 'Standard expected pace.';
      }

      shiftsForDay.push({
        id: `${date}-${shiftConfig.id}`,
        name: shiftConfig.name,
        startTime: shiftConfig.startTime,
        endTime: shiftConfig.endTime,
        durationHours: shiftConfig.durationHours,
        covers: projectedCovers,
        sales: projectedSales,
        recommendedStaff,
        gutFeelStaff: gutStaff,
        estimatedLaborCost: recLaborCost,
        gutLaborCost: gutLaborCost,
        laborPercentage: recLaborPct,
        gutLaborPercentage: gutLaborPct,
        costSavings: savings,
        understaffingRisk,
        overstaffingRisk,
        shiftNotes,
        hourlyBreakdown,
        tippedLaborCost: recLaborDetail.tippedCost,
        nonTippedLaborCost: recLaborDetail.nonTippedCost,
        fixedLaborCost: recLaborDetail.fixedLaborCost,
        variableLaborCost: recLaborDetail.variableLaborCost,
        fixedPrepHours: restaurant.fixedHoursConfig?.prepCookFixedHours ?? 2.5,
        fixedClosingHours: restaurant.fixedHoursConfig?.closingDishwasherFixedHours ?? 1.5,
        roleHours: recLaborDetail.roleHours,
      });
    });

    totalCovers += dayCovers;
    totalSales += daySales;
    totalRecLabor += dayTotalLabor;
    totalGutLabor += dayGutLabor;

    const dailyLaborPct = Number(((dayTotalLabor / Math.max(1, daySales)) * 100).toFixed(1));
    const dailySavings = dayGutLabor - dayTotalLabor;

    const eventsMult = dayEvents.reduce((acc, e) => acc * e.volumeMultiplier, 1.0);
    const weatherMult = weather.volumeMultiplier;

    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    let riskReason = 'Steady normal operations';

    if (dayEvents.some((e) => e.volumeMultiplier >= 1.35)) {
      riskLevel = 'HIGH';
      riskReason = `Major high-attendance event: ${dayEvents.find((e) => e.volumeMultiplier >= 1.35)?.title}`;
    } else if (dayEvents.length > 0 || weather.condition === 'Rain') {
      riskLevel = 'MEDIUM';
      riskReason = dayEvents.length > 0 ? 'Local event volume shift' : 'Weather impact on patio seats';
    }

    days.push({
      date,
      dayOfWeek,
      covers: dayCovers,
      projectedSales: daySales,
      baselineCovers: dayBaselineCovers,
      eventsImpactMultiplier: Number(eventsMult.toFixed(2)),
      weatherImpactMultiplier: Number(weatherMult.toFixed(2)),
      weatherImpact: weatherDesc,
      eventsImpact: dayEvents.length > 0 ? dayEvents.map((e) => e.title).join(', ') : 'None',
      riskLevel,
      riskReason,
      shifts: shiftsForDay,
      dailyTotalLaborCost: dayTotalLabor,
      dailyLaborPercentage: dailyLaborPct,
      dailySavings,
      events: dayEvents,
      weather,
    });
  });

  const avgLaborPct = Number(((totalRecLabor / Math.max(1, totalSales)) * 100).toFixed(1));
  const totalSavings = totalGutLabor - totalRecLabor;

  return {
    startDate: weekDates[0].date,
    endDate: weekDates[6].date,
    totalProjectedCovers: totalCovers,
    totalProjectedSales: totalSales,
    totalProjectedLaborCost: totalRecLabor,
    averageLaborPercentage: avgLaborPct,
    gutFeelLaborCost: totalGutLabor,
    totalEstimatedSavings: totalSavings,
    totalPreventedStockoutOrDelayRiskHours: 14,
    executiveInsight:
      'Friday & Saturday present significant volume surges (+38% to +48%) driven by the Home Opener and Downtown Street Fair. Midweek Monday Lunch is historically overstaffed by 1 floor server and 1 support shift — right-sizing saves an estimated $840+ this week while safeguarding kitchen ticket times during Friday dinner peak.',
    days,
    operationalAdvice: [
      {
        title: 'Friday Night Surge Preparedness',
        description:
          'State University game day traffic will compress 70% of dinner covers between 4:45 PM and 7:15 PM. Keep all line cook stations active on tickets and complete station prep pars before 4:00 PM.',
        category: 'STAFFING',
      },
      {
        title: 'Right-Size Weekday Lunch Shifts',
        description:
          'ShiftCast identified $420 in excess labor scheduled on slow Monday & Tuesday lunch shifts. Adjusting floor coverage keeps staff productivity balanced and reduces labor % from 37% down to 28.5%.',
        category: 'RISK_MITIGATION',
      },
      {
        title: 'Weather & Seating Shift (Tuesday Rain)',
        description:
          'Tuesday afternoon rain closes outdoor seating. Reallocate floor support to accelerate indoor table turnover and ensure smooth take-out staging.',
        category: 'PREP',
      },
      {
        title: 'High-Velocity Menu & Combo Upsell',
        description:
          'Saturday Street Fair brings high foot traffic. Feature fast-turn popular entrees and beverage combos to maximize table velocity and gross margin.',
        category: 'REVENUE_OPPORTUNITY',
      },
    ],
  };
}
