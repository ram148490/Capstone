import { ShiftAccuracyLog, WeeklyAccuracyMetric, RestaurantProfile } from '../types';

/**
 * Calculates Mean Absolute Percentage Error (MAPE)
 * MAPE = (1/n) * sum( |Actual_i - Predicted_i| / Actual_i ) * 100
 */
export function calculateMAPE(logs: ShiftAccuracyLog[]): number {
  if (!logs || logs.length === 0) return 0;
  const totalPercentageError = logs.reduce((acc, log) => {
    const actual = Math.max(1, log.actualCovers);
    const error = Math.abs(actual - log.predictedCovers) / actual;
    return acc + error;
  }, 0);
  return Number(((totalPercentageError / logs.length) * 100).toFixed(2));
}

/**
 * Calculates forecast accuracy percentage (100% - MAPE%)
 */
export function calculateAccuracyPercentage(mape: number): number {
  return Math.max(0, Number((100 - mape).toFixed(1)));
}

/**
 * Group accuracy logs into multi-week chronological buckets
 */
export function computeWeeklyAccuracyTrends(logs: ShiftAccuracyLog[]): WeeklyAccuracyMetric[] {
  if (!logs || logs.length === 0) return [];

  // Sort logs chronologically by date
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));

  // Determine week groupings based on 7-day Monday-Sunday chunks or ISO week
  const weekMap = new Map<string, ShiftAccuracyLog[]>();

  sorted.forEach((log) => {
    const dateObj = new Date(log.date + 'T12:00:00');
    // Calculate Monday start of this week
    const day = dateObj.getDay(); // 0 is Sunday, 1 is Monday...
    const diff = (day === 0 ? -6 : 1) - day;
    const monday = new Date(dateObj);
    monday.setDate(dateObj.getDate() + diff);
    const mondayStr = monday.toISOString().split('T')[0];

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const sundayStr = sunday.toISOString().split('T')[0];

    const weekKey = `${mondayStr}_${sundayStr}`;
    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, []);
    }
    weekMap.get(weekKey)!.push(log);
  });

  const weeklyMetrics: WeeklyAccuracyMetric[] = [];
  const entries = Array.from(weekMap.entries());

  entries.forEach(([weekKey, shiftLogs], idx) => {
    const [startDate, endDate] = weekKey.split('_');
    
    // Format week label
    const startObj = new Date(startDate + 'T12:00:00');
    const endObj = new Date(endDate + 'T12:00:00');
    const startMonth = startObj.toLocaleString('en-US', { month: 'short' });
    const endMonth = endObj.toLocaleString('en-US', { month: 'short' });
    const isLastWeek = idx === entries.length - 1;
    
    const weekLabel = `${startMonth} ${startObj.getDate()} - ${endMonth !== startMonth ? endMonth + ' ' : ''}${endObj.getDate()}${isLastWeek ? ' (Last Week)' : ''}`;

    const totalPredictedCovers = shiftLogs.reduce((acc, s) => acc + s.predictedCovers, 0);
    const totalActualCovers = shiftLogs.reduce((acc, s) => acc + s.actualCovers, 0);
    const totalPredictedSales = shiftLogs.reduce((acc, s) => acc + s.predictedSales, 0);
    const totalActualSales = shiftLogs.reduce((acc, s) => acc + s.actualSales, 0);

    const mape = calculateMAPE(shiftLogs);
    const accuracyPercentage = calculateAccuracyPercentage(mape);
    const totalVarianceCovers = totalActualCovers - totalPredictedCovers;
    const totalVarianceSales = totalActualSales - totalPredictedSales;

    const biasPercentage = totalPredictedCovers > 0 
      ? Number(((totalActualCovers - totalPredictedCovers) / totalPredictedCovers * 100).toFixed(1))
      : 0;

    let biasDirection: 'OVER' | 'UNDER' | 'BALANCED' = 'BALANCED';
    if (biasPercentage < -2.0) biasDirection = 'OVER'; // Predicted more than actual
    else if (biasPercentage > 2.0) biasDirection = 'UNDER'; // Predicted less than actual

    // Find best and worst shifts
    let bestShift: WeeklyAccuracyMetric['bestShift'] | undefined;
    let worstShift: WeeklyAccuracyMetric['worstShift'] | undefined;

    let highestAcc = -1;
    let lowestAcc = 999;

    shiftLogs.forEach((s) => {
      const acc = s.accuracyPercentage || calculateAccuracyPercentage(s.percentError);
      if (acc > highestAcc) {
        highestAcc = acc;
        bestShift = {
          day: s.dayOfWeek,
          shift: s.shift,
          accuracyPercentage: acc,
          covers: s.actualCovers,
        };
      }
      if (acc < lowestAcc) {
        lowestAcc = acc;
        worstShift = {
          day: s.dayOfWeek,
          shift: s.shift,
          accuracyPercentage: acc,
          error: s.percentError,
          reason: s.notes || (s.varianceCovers > 0 ? 'Unexpected walk-in surge' : 'Slow weather slowdown'),
        };
      }
    });

    weeklyMetrics.push({
      weekKey,
      weekLabel,
      startDate,
      endDate,
      totalPredictedCovers,
      totalActualCovers,
      totalPredictedSales,
      totalActualSales,
      mape,
      accuracyPercentage,
      totalVarianceCovers,
      totalVarianceSales,
      shiftCount: shiftLogs.length,
      biasDirection,
      biasPercentage,
      bestShift,
      worstShift,
      shifts: shiftLogs,
    });
  });

  return weeklyMetrics;
}

/**
 * Creates a new shift accuracy log entry with automated variance and percentage error
 */
export function createShiftAccuracyLog(params: {
  id?: string;
  date: string;
  dayOfWeek: string;
  shift: string;
  predictedCovers: number;
  actualCovers: number;
  averageCheckSize: number;
  actualSales?: number;
  weatherObserved?: string;
  eventObserved?: string;
  notes?: string;
}): ShiftAccuracyLog {
  const predictedSales = params.predictedCovers * params.averageCheckSize;
  const actualSales = params.actualSales || (params.actualCovers * params.averageCheckSize);
  
  const varianceCovers = params.actualCovers - params.predictedCovers;
  const varianceSales = actualSales - predictedSales;
  
  const actual = Math.max(1, params.actualCovers);
  const percentError = Number(((Math.abs(actual - params.predictedCovers) / actual) * 100).toFixed(2));
  const accuracyPercentage = Number(Math.max(0, 100 - percentError).toFixed(1));

  return {
    id: params.id || `acc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    date: params.date,
    dayOfWeek: params.dayOfWeek,
    shift: params.shift,
    predictedCovers: params.predictedCovers,
    actualCovers: params.actualCovers,
    predictedSales: Math.round(predictedSales),
    actualSales: Math.round(actualSales),
    varianceCovers,
    varianceSales,
    percentError,
    accuracyPercentage,
    weatherObserved: params.weatherObserved,
    eventObserved: params.eventObserved,
    notes: params.notes,
    loggedAt: new Date().toISOString(),
  };
}
