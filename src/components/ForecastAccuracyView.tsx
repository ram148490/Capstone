import React, { useState, useMemo } from 'react';
import {
  ShiftAccuracyLog,
  WeeklyAccuracyMetric,
  RestaurantProfile,
  DayForecast,
} from '../types';
import {
  calculateMAPE,
  calculateAccuracyPercentage,
  computeWeeklyAccuracyTrends,
  createShiftAccuracyLog,
} from '../utils/accuracyEngine';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from 'recharts';
import {
  Target,
  TrendingUp,
  TrendingDown,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
  Clock,
  Sparkles,
  Info,
  Trash2,
  ChevronRight,
  Filter,
  BarChart3,
  Award,
  ArrowUpRight,
  ArrowDownRight,
  HelpCircle,
} from 'lucide-react';

interface ForecastAccuracyViewProps {
  accuracyLogs: ShiftAccuracyLog[];
  currentProfile: RestaurantProfile;
  onAddLog: (log: ShiftAccuracyLog) => Promise<void>;
  onBatchAddLogs: (logs: ShiftAccuracyLog[]) => Promise<void>;
  onDeleteLog: (id: string) => Promise<void>;
  pastForecastDays?: DayForecast[];
}

export const ForecastAccuracyView: React.FC<ForecastAccuracyViewProps> = ({
  accuracyLogs,
  currentProfile,
  onAddLog,
  onBatchAddLogs,
  onDeleteLog,
}) => {
  // UI Tabs & Filters inside Accuracy View
  const [selectedWeekKey, setSelectedWeekKey] = useState<string | 'ALL'>('ALL');
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isBatchQuickFillOpen, setIsBatchQuickFillOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeViewMode, setActiveViewMode] = useState<'trends' | 'shift_logs' | 'shift_breakdown'>('trends');

  // Form State for Single Shift Logging
  const [formData, setFormData] = useState({
    date: new Date(Date.now() - 86400000).toISOString().split('T')[0], // yesterday
    shift: 'Dinner',
    predictedCovers: 95,
    actualCovers: 98,
    actualSales: '',
    weatherObserved: 'Clear & Mild (68°F)',
    eventObserved: '',
    notes: '',
  });

  // Calculate multi-week trends
  const weeklyTrends = useMemo(() => {
    return computeWeeklyAccuracyTrends(accuracyLogs);
  }, [accuracyLogs]);

  // Overall Global MAPE & Accuracy
  const overallMAPE = useMemo(() => {
    return calculateMAPE(accuracyLogs);
  }, [accuracyLogs]);

  const overallAccuracy = useMemo(() => {
    return calculateAccuracyPercentage(overallMAPE);
  }, [overallMAPE]);

  // Last Week's Metric (Most recent completed week)
  const lastWeekMetric = useMemo(() => {
    if (weeklyTrends.length === 0) return null;
    return weeklyTrends[weeklyTrends.length - 1];
  }, [weeklyTrends]);

  // Prior Week Metric for week-over-week delta
  const priorWeekMetric = useMemo(() => {
    if (weeklyTrends.length < 2) return null;
    return weeklyTrends[weeklyTrends.length - 2];
  }, [weeklyTrends]);

  const accuracyWeekOverWeekDelta = useMemo(() => {
    if (!lastWeekMetric || !priorWeekMetric) return null;
    return Number((lastWeekMetric.accuracyPercentage - priorWeekMetric.accuracyPercentage).toFixed(1));
  }, [lastWeekMetric, priorWeekMetric]);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    if (selectedWeekKey === 'ALL') {
      return [...accuracyLogs].sort((a, b) => b.date.localeCompare(a.date));
    }
    const targetWeek = weeklyTrends.find((w) => w.weekKey === selectedWeekKey);
    return targetWeek ? [...targetWeek.shifts].sort((a, b) => b.date.localeCompare(a.date)) : [];
  }, [accuracyLogs, selectedWeekKey, weeklyTrends]);

  // Shift Type Accuracy Breakdown (Lunch vs Dinner vs Brunch/Late Night)
  const shiftTypeStats = useMemo(() => {
    const map: Record<string, { totalPred: number; totalAct: number; logs: ShiftAccuracyLog[] }> = {};
    accuracyLogs.forEach((log) => {
      if (!map[log.shift]) {
        map[log.shift] = { totalPred: 0, totalAct: 0, logs: [] };
      }
      map[log.shift].totalPred += log.predictedCovers;
      map[log.shift].totalAct += log.actualCovers;
      map[log.shift].logs.push(log);
    });

    return Object.entries(map).map(([shiftName, data]) => {
      const shiftMape = calculateMAPE(data.logs);
      const shiftAcc = calculateAccuracyPercentage(shiftMape);
      const totalVar = data.totalAct - data.totalPred;
      return {
        shiftName,
        totalPred: data.totalPred,
        totalAct: data.totalAct,
        mape: shiftMape,
        accuracyPercentage: shiftAcc,
        variance: totalVar,
        shiftCount: data.logs.length,
      };
    });
  }, [accuracyLogs]);

  // Chart Data Preparation
  const multiWeekChartData = useMemo(() => {
    return weeklyTrends.map((w) => ({
      weekLabel: w.weekLabel.replace(' (Last Week)', ''),
      accuracy: w.accuracyPercentage,
      mape: w.mape,
      predictedCovers: w.totalPredictedCovers,
      actualCovers: w.totalActualCovers,
      variance: w.totalVarianceCovers,
      shiftCount: w.shiftCount,
    }));
  }, [weeklyTrends]);

  // Handle Form Submit
  const handleSingleLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const dateObj = new Date(formData.date + 'T12:00:00');
      const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long' });

      const newLog = createShiftAccuracyLog({
        date: formData.date,
        dayOfWeek,
        shift: formData.shift,
        predictedCovers: Number(formData.predictedCovers) || 0,
        actualCovers: Number(formData.actualCovers) || 0,
        averageCheckSize: currentProfile.averageCheckSize,
        actualSales: formData.actualSales ? Number(formData.actualSales) : undefined,
        weatherObserved: formData.weatherObserved || undefined,
        eventObserved: formData.eventObserved || undefined,
        notes: formData.notes || undefined,
      });

      await onAddLog(newLog);
      setIsLogModalOpen(false);
      // Reset form
      setFormData((prev) => ({
        ...prev,
        notes: '',
        eventObserved: '',
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick fill last 7 days actuals generator
  const handleGeneratePastWeekLogs = async () => {
    setIsSubmitting(true);
    try {
      const pastDays: ShiftAccuracyLog[] = [];
      const today = new Date();
      const shifts = ['Lunch', 'Dinner'];

      // Generate 7 days of realistic actuals based on restaurant concept
      for (let i = 7; i >= 1; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const dayOfWeek = d.toLocaleDateString('en-US', { weekday: 'long' });
        const isWeekend = dayOfWeek === 'Friday' || dayOfWeek === 'Saturday';

        shifts.forEach((shift) => {
          let basePred = shift === 'Lunch' ? 45 : 90;
          if (isWeekend) basePred = shift === 'Lunch' ? 65 : 145;

          // Add realistic variance (-8% to +10%)
          const varianceMultiplier = 0.92 + Math.random() * 0.18;
          const actualCovers = Math.round(basePred * varianceMultiplier);

          pastDays.push(
            createShiftAccuracyLog({
              date: dateStr,
              dayOfWeek,
              shift,
              predictedCovers: basePred,
              actualCovers,
              averageCheckSize: currentProfile.averageCheckSize,
              weatherObserved: isWeekend ? 'Sunny & Warm (74°F)' : 'Partly Cloudy',
              notes: actualCovers > basePred ? 'Walk-in patio surge' : 'Standard steady service',
            })
          );
        });
      }

      await onBatchAddLogs(pastDays);
      setIsBatchQuickFillOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Action Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                Forecast Accuracy & Shift Actuals Tracker
                <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  MAPE Algorithm
                </span>
              </h2>
              <p className="text-xs text-stone-400">
                Evaluate model precision, compare predicted covers vs actual shift covers, and track accuracy trends over time.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            id="btn-open-log-actual-modal"
            onClick={() => setIsLogModalOpen(true)}
            className="text-xs font-semibold px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer"
          >
            <PlusCircle className="w-4 h-4 stroke-[2.5]" />
            <span>Log Actual Shift Covers</span>
          </button>

          <button
            id="btn-quick-fill-actuals"
            onClick={() => setIsBatchQuickFillOpen(true)}
            className="text-xs font-medium px-3.5 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Batch Auto-Log Past Shifts</span>
          </button>
        </div>
      </div>

      {/* KPI Top Highlight Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Last Week Forecast Accuracy */}
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-stone-400 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-emerald-400" />
              Last Week Accuracy
            </span>
            {lastWeekMetric && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">
                {lastWeekMetric.shiftCount} Shifts
              </span>
            )}
          </div>
          <div className="my-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black tracking-tight text-white">
                {lastWeekMetric ? `${lastWeekMetric.accuracyPercentage}%` : 'N/A'}
              </span>
              {accuracyWeekOverWeekDelta !== null && (
                <span
                  className={`text-xs font-bold flex items-center ${
                    accuracyWeekOverWeekDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {accuracyWeekOverWeekDelta >= 0 ? (
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5" />
                  )}
                  {accuracyWeekOverWeekDelta >= 0 ? `+${accuracyWeekOverWeekDelta}%` : `${accuracyWeekOverWeekDelta}%`} WoW
                </span>
              )}
            </div>
            <p className="text-[11px] text-stone-400 mt-1">
              {lastWeekMetric ? lastWeekMetric.weekLabel : 'No logs recorded yet'}
            </p>
          </div>
          <div className="text-[11px] text-stone-400 pt-2 border-t border-stone-800/80 flex items-center justify-between">
            <span>Last Week MAPE:</span>
            <span className="font-semibold text-stone-200">
              {lastWeekMetric ? `${lastWeekMetric.mape}%` : '--'}
            </span>
          </div>
        </div>

        {/* 2. Overall Multi-Week MAPE */}
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-stone-400 flex items-center gap-1.5">
              <Target className="w-4 h-4 text-amber-400" />
              Multi-Week MAPE
            </span>
            <span className="text-[10px] text-stone-500">Mean Abs. % Error</span>
          </div>
          <div className="my-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black tracking-tight text-amber-400">
                {overallMAPE}%
              </span>
              <span className="text-xs text-stone-400">
                (Acc: <span className="text-stone-200 font-bold">{overallAccuracy}%</span>)
              </span>
            </div>
            <p className="text-[11px] text-stone-400 mt-1">
              Industry gold standard benchmark: &lt; 8.0% error
            </p>
          </div>
          <div className="text-[11px] text-stone-400 pt-2 border-t border-stone-800/80 flex items-center justify-between">
            <span>Total Evaluated Shifts:</span>
            <span className="font-semibold text-stone-200">{accuracyLogs.length} shifts</span>
          </div>
        </div>

        {/* 3. Last Week Covers Variance & Bias */}
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-stone-400 flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              Forecast Volume Bias
            </span>
            {lastWeekMetric && (
              <span
                className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                  lastWeekMetric.biasDirection === 'BALANCED'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : lastWeekMetric.biasDirection === 'UNDER'
                    ? 'bg-amber-950 text-amber-300 border border-amber-800'
                    : 'bg-blue-950 text-blue-300 border border-blue-800'
                }`}
              >
                {lastWeekMetric.biasDirection === 'BALANCED'
                  ? 'Balanced'
                  : lastWeekMetric.biasDirection === 'UNDER'
                  ? 'Under-Forecast'
                  : 'Over-Forecast'}
              </span>
            )}
          </div>
          <div className="my-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black tracking-tight text-white">
                {lastWeekMetric
                  ? `${lastWeekMetric.totalActualCovers - lastWeekMetric.totalPredictedCovers > 0 ? '+' : ''}${
                      lastWeekMetric.totalActualCovers - lastWeekMetric.totalPredictedCovers
                    }`
                  : '0'}
              </span>
              <span className="text-xs text-stone-400">covers net variance</span>
            </div>
            <p className="text-[11px] text-stone-400 mt-1">
              {lastWeekMetric
                ? `Actual: ${lastWeekMetric.totalActualCovers} vs Pred: ${lastWeekMetric.totalPredictedCovers}`
                : '--'}
            </p>
          </div>
          <div className="text-[11px] text-stone-400 pt-2 border-t border-stone-800/80 flex items-center justify-between">
            <span>Net Revenue Delta:</span>
            <span
              className={`font-semibold ${
                lastWeekMetric && lastWeekMetric.totalVarianceSales >= 0
                  ? 'text-emerald-400'
                  : 'text-rose-400'
              }`}
            >
              {lastWeekMetric
                ? `${lastWeekMetric.totalVarianceSales >= 0 ? '+' : ''}$${Math.abs(
                    lastWeekMetric.totalVarianceSales
                  ).toLocaleString()}`
                : '--'}
            </span>
          </div>
        </div>

        {/* 4. Best vs Worst Shift Insight */}
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-stone-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Peak Precision Shift
            </span>
            <span className="text-[10px] text-stone-400">Last Week</span>
          </div>
          <div className="my-1.5 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-300 font-bold truncate">
                {lastWeekMetric?.bestShift
                  ? `${lastWeekMetric.bestShift.day} ${lastWeekMetric.bestShift.shift}`
                  : 'N/A'}
              </span>
              <span className="text-emerald-400 font-bold">
                {lastWeekMetric?.bestShift ? `${lastWeekMetric.bestShift.accuracyPercentage}%` : '--'}
              </span>
            </div>
            <div className="text-[11px] text-stone-400 flex items-center justify-between pt-1 border-t border-stone-800/60">
              <span className="text-rose-300 font-medium">Largest Gap:</span>
              <span className="text-stone-300">
                {lastWeekMetric?.worstShift
                  ? `${lastWeekMetric.worstShift.day} (${lastWeekMetric.worstShift.accuracyPercentage}%)`
                  : '--'}
              </span>
            </div>
          </div>
          <div className="text-[10px] text-stone-400 bg-stone-950/60 rounded p-1.5 border border-stone-800/50 mt-1">
            💡 {lastWeekMetric?.worstShift?.reason || 'Predictive tuning recommended'}
          </div>
        </div>
      </div>

      {/* Sub-Navigation: View Modes & Week Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveViewMode('trends')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeViewMode === 'trends'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-stone-900 text-stone-400 hover:text-stone-200 border border-stone-800'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Multi-Week Accuracy Trends</span>
          </button>

          <button
            onClick={() => setActiveViewMode('shift_logs')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeViewMode === 'shift_logs'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-stone-900 text-stone-400 hover:text-stone-200 border border-stone-800'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Shift-by-Shift Log Table</span>
          </button>

          <button
            onClick={() => setActiveViewMode('shift_breakdown')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeViewMode === 'shift_breakdown'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-stone-900 text-stone-400 hover:text-stone-200 border border-stone-800'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Daypart Performance</span>
          </button>
        </div>

        {/* Week Range Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-stone-400" />
          <span className="text-xs text-stone-400">Filter Week:</span>
          <select
            value={selectedWeekKey}
            onChange={(e) => setSelectedWeekKey(e.target.value)}
            className="bg-stone-900 text-stone-200 text-xs font-medium rounded-lg border border-stone-700 py-1.5 px-2.5 focus:ring-1 focus:ring-amber-500 focus:outline-none cursor-pointer"
          >
            <option value="ALL">All Available Weeks ({weeklyTrends.length} Weeks)</option>
            {weeklyTrends.map((w) => (
              <option key={w.weekKey} value={w.weekKey}>
                {w.weekLabel} (Acc: {w.accuracyPercentage}%)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* VIEW MODE 1: MULTI-WEEK ACCURACY & COVERS TREND CHARTS */}
      {activeViewMode === 'trends' && (
        <div className="space-y-6">
          {/* Chart 1: Forecast Accuracy % and MAPE Trend */}
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  Weekly Forecast Accuracy & MAPE Trendline
                </h3>
                <p className="text-xs text-stone-400">
                  Tracking Mean Absolute Percentage Error (MAPE) and Overall Accuracy % across consecutive weeks.
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
                  Accuracy % (Higher is better)
                </span>
                <span className="flex items-center gap-1 text-rose-400 font-semibold">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block" />
                  MAPE Error % (Lower is better)
                </span>
              </div>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={multiWeekChartData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="accGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="mapeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#292524" />
                  <XAxis dataKey="weekLabel" stroke="#78716c" tick={{ fill: '#a8a29e', fontSize: 11 }} />
                  <YAxis
                    domain={[0, 100]}
                    stroke="#78716c"
                    tick={{ fill: '#a8a29e', fontSize: 11 }}
                    unit="%"
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-stone-950 border border-stone-800 rounded-xl p-3 shadow-xl text-xs space-y-1.5">
                            <p className="font-bold text-white">{label}</p>
                            <p className="text-emerald-400 font-semibold">
                              Forecast Accuracy: {data.accuracy}%
                            </p>
                            <p className="text-rose-400 font-semibold">
                              MAPE Error: {data.mape}%
                            </p>
                            <p className="text-stone-400">
                              Evaluated Shifts: {data.shiftCount}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <ReferenceLine y={90} stroke="#10b981" strokeDasharray="3 3" label={{ value: '90% Target', fill: '#10b981', fontSize: 10, position: 'insideTopRight' }} />
                  <Area
                    type="monotone"
                    dataKey="accuracy"
                    name="Accuracy %"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#accGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="mape"
                    name="MAPE %"
                    stroke="#f43f5e"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#mapeGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Predicted Covers vs Actual Covers by Week */}
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-amber-400" />
                  Weekly Guest Covers: Predicted vs Actual Delivered
                </h3>
                <p className="text-xs text-stone-400">
                  Visual volume comparison showing where shifts experienced walk-in surges or weather lulls.
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1 text-amber-400 font-semibold">
                  <span className="w-2.5 h-2.5 rounded bg-amber-500 inline-block" />
                  Predicted Covers
                </span>
                <span className="flex items-center gap-1 text-cyan-400 font-semibold">
                  <span className="w-2.5 h-2.5 rounded bg-cyan-400 inline-block" />
                  Actual Covers
                </span>
              </div>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={multiWeekChartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#292524" />
                  <XAxis dataKey="weekLabel" stroke="#78716c" tick={{ fill: '#a8a29e', fontSize: 11 }} />
                  <YAxis stroke="#78716c" tick={{ fill: '#a8a29e', fontSize: 11 }} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        const variance = data.actualCovers - data.predictedCovers;
                        return (
                          <div className="bg-stone-950 border border-stone-800 rounded-xl p-3 shadow-xl text-xs space-y-1.5">
                            <p className="font-bold text-white">{label}</p>
                            <div className="flex justify-between gap-4">
                              <span className="text-stone-400">Predicted Covers:</span>
                              <span className="font-bold text-amber-400">{data.predictedCovers}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-stone-400">Actual Covers:</span>
                              <span className="font-bold text-cyan-400">{data.actualCovers}</span>
                            </div>
                            <div className="flex justify-between gap-4 pt-1 border-t border-stone-800">
                              <span className="text-stone-400">Net Variance:</span>
                              <span className={`font-bold ${variance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {variance >= 0 ? `+${variance}` : variance} covers
                              </span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="predictedCovers" name="Predicted Covers" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actualCovers" name="Actual Covers" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* VIEW MODE 2: SHIFT-BY-SHIFT ACCURACY LOGS TABLE */}
      {activeViewMode === 'shift_logs' && (
        <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-4 sm:p-5 border-b border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-stone-900/60">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-400" />
                Shift Actuals Log History
              </h3>
              <p className="text-xs text-stone-400">
                Detailed comparison for every logged shift with MAPE % calculation, weather context, and shift notes.
              </p>
            </div>
            <div className="text-xs text-stone-400">
              Showing <span className="text-white font-bold">{filteredLogs.length}</span> logged shifts
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-950/80 text-stone-400 uppercase tracking-wider font-semibold border-b border-stone-800">
                <tr>
                  <th className="py-3 px-4">Date & Day</th>
                  <th className="py-3 px-4">Shift</th>
                  <th className="py-3 px-4 text-right">Predicted Covers</th>
                  <th className="py-3 px-4 text-right">Actual Covers</th>
                  <th className="py-3 px-4 text-right">Variance</th>
                  <th className="py-3 px-4 text-right">Error (MAPE)</th>
                  <th className="py-3 px-4 text-right">Accuracy %</th>
                  <th className="py-3 px-4">Shift Notes & Factors</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-800/60">
                {filteredLogs.map((log) => {
                  const isHighAccuracy = log.accuracyPercentage >= 92;
                  const isModerateAccuracy = log.accuracyPercentage >= 80 && log.accuracyPercentage < 92;
                  const isHighError = log.accuracyPercentage < 80;

                  return (
                    <tr key={log.id} className="hover:bg-stone-800/40 transition-colors">
                      <td className="py-3 px-4 font-medium text-stone-200 whitespace-nowrap">
                        <div>{log.date}</div>
                        <div className="text-[10px] text-stone-400">{log.dayOfWeek}</div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-stone-800 text-stone-300 font-semibold">
                          {log.shift}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right font-medium text-amber-400">
                        {log.predictedCovers}
                      </td>

                      <td className="py-3 px-4 text-right font-bold text-stone-100">
                        {log.actualCovers}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span
                          className={`font-semibold ${
                            log.varianceCovers > 0
                              ? 'text-emerald-400'
                              : log.varianceCovers < 0
                              ? 'text-rose-400'
                              : 'text-stone-400'
                          }`}
                        >
                          {log.varianceCovers > 0 ? `+${log.varianceCovers}` : log.varianceCovers} covers
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-medium text-stone-300">
                        {log.percentError}%
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                            isHighAccuracy
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : isModerateAccuracy
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {log.accuracyPercentage}%
                        </span>
                      </td>

                      <td className="py-3 px-4 text-stone-300 max-w-xs truncate">
                        {log.notes || log.weatherObserved || log.eventObserved || (
                          <span className="text-stone-600 italic">No notes</span>
                        )}
                        {log.weatherObserved && (
                          <div className="text-[10px] text-stone-400 truncate">
                            🌤️ {log.weatherObserved}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => onDeleteLog(log.id)}
                          className="p-1 text-stone-500 hover:text-rose-400 hover:bg-stone-800 rounded transition-colors cursor-pointer"
                          title="Delete Shift Log"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW MODE 3: DAYPART & SHIFT TYPE ACCURACY BREAKDOWN */}
      {activeViewMode === 'shift_breakdown' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {shiftTypeStats.map((stat) => (
            <div
              key={stat.shiftName}
              className="bg-stone-900 border border-stone-800 rounded-2xl p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs uppercase font-bold text-amber-400 tracking-wider">
                    {stat.shiftName} Shift Analysis
                  </span>
                  <span className="text-[11px] text-stone-400 bg-stone-800 px-2 py-0.5 rounded">
                    {stat.shiftCount} Shifts Logged
                  </span>
                </div>

                <div className="flex items-baseline justify-between my-2">
                  <div>
                    <span className="text-2xl font-black text-white">
                      {stat.accuracyPercentage}%
                    </span>
                    <span className="text-xs text-stone-400 ml-1.5">Accuracy</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-rose-400">
                      {stat.mape}%
                    </span>
                    <span className="text-[11px] text-stone-400 ml-1">MAPE</span>
                  </div>
                </div>

                {/* Progress Bar for Accuracy */}
                <div className="w-full bg-stone-800 h-2 rounded-full overflow-hidden my-3">
                  <div
                    className={`h-full rounded-full ${
                      stat.accuracyPercentage >= 90
                        ? 'bg-emerald-500'
                        : stat.accuracyPercentage >= 80
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                    }`}
                    style={{ width: `${Math.min(100, stat.accuracyPercentage)}%` }}
                  />
                </div>

                <div className="space-y-2 text-xs pt-2 border-t border-stone-800">
                  <div className="flex justify-between text-stone-300">
                    <span className="text-stone-400">Total Predicted Volume:</span>
                    <span className="font-semibold text-amber-400">{stat.totalPred.toLocaleString()} covers</span>
                  </div>
                  <div className="flex justify-between text-stone-300">
                    <span className="text-stone-400">Total Actual Delivered:</span>
                    <span className="font-semibold text-cyan-400">{stat.totalAct.toLocaleString()} covers</span>
                  </div>
                  <div className="flex justify-between text-stone-300">
                    <span className="text-stone-400">Cumulative Variance:</span>
                    <span
                      className={`font-semibold ${
                        stat.variance >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {stat.variance >= 0 ? `+${stat.variance}` : stat.variance} covers
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-stone-800/70 text-[11px] text-stone-400">
                {stat.mape < 7 ? (
                  <span className="text-emerald-300">✅ Very high predictive stability for this shift.</span>
                ) : stat.variance > 0 ? (
                  <span className="text-amber-300">⚠️ Tends to experience higher walk-in spikes than predicted.</span>
                ) : (
                  <span className="text-blue-300">ℹ️ Occasionally over-staffs due to unpredictable early slowdowns.</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL 1: LOG ACTUAL SHIFT COVERS */}
      {isLogModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">Log Past Shift Actual Covers</h3>
              </div>
              <button
                onClick={() => setIsLogModalOpen(false)}
                className="text-stone-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSingleLogSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-300 font-medium mb-1">Shift Date</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-700 rounded-lg p-2 text-stone-100 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-stone-300 font-medium mb-1">Shift Daypart</label>
                  <select
                    value={formData.shift}
                    onChange={(e) => setFormData({ ...formData, shift: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-700 rounded-lg p-2 text-stone-100 focus:outline-none focus:border-amber-500 cursor-pointer"
                  >
                    <option value="Dinner">Dinner (5:00 PM - 10:00 PM)</option>
                    <option value="Lunch">Lunch (11:30 AM - 3:00 PM)</option>
                    <option value="Weekend Brunch">Weekend Brunch (10:00 AM - 3:00 PM)</option>
                    <option value="Late Night">Late Night (10:00 PM - 1:00 AM)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-300 font-medium mb-1">Predicted Covers</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={formData.predictedCovers}
                    onChange={(e) => setFormData({ ...formData, predictedCovers: Number(e.target.value) })}
                    className="w-full bg-stone-950 border border-stone-700 rounded-lg p-2 text-amber-400 font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-stone-300 font-medium mb-1">Actual Covers Delivered</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={formData.actualCovers}
                    onChange={(e) => setFormData({ ...formData, actualCovers: Number(e.target.value) })}
                    className="w-full bg-stone-950 border border-stone-700 rounded-lg p-2 text-emerald-400 font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-stone-300 font-medium mb-1">
                  Actual Shift Revenue (Optional, calculated if blank)
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2 text-stone-500">$</span>
                  <input
                    type="number"
                    placeholder={`e.g. ${formData.actualCovers * currentProfile.averageCheckSize}`}
                    value={formData.actualSales}
                    onChange={(e) => setFormData({ ...formData, actualSales: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-700 rounded-lg p-2 pl-6 text-stone-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-stone-300 font-medium mb-1">Weather Observed</label>
                <input
                  type="text"
                  placeholder="e.g. Sunny & Warm (72°F) or Heavy Rain"
                  value={formData.weatherObserved}
                  onChange={(e) => setFormData({ ...formData, weatherObserved: e.target.value })}
                  className="w-full bg-stone-950 border border-stone-700 rounded-lg p-2 text-stone-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-stone-300 font-medium mb-1">Shift Notes / Variances</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Large walk-in soccer team of 25 at 6:30 PM, or unexpected patio closure due to wind."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full bg-stone-950 border border-stone-700 rounded-lg p-2 text-stone-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Instant calculation preview */}
              <div className="bg-stone-950/70 border border-stone-800 rounded-xl p-3 flex items-center justify-between text-xs">
                <div>
                  <span className="text-stone-400">Calculated Variance:</span>
                  <span
                    className={`ml-1.5 font-bold ${
                      formData.actualCovers - formData.predictedCovers >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {formData.actualCovers - formData.predictedCovers >= 0 ? '+' : ''}
                    {formData.actualCovers - formData.predictedCovers} covers
                  </span>
                </div>
                <div>
                  <span className="text-stone-400">MAPE:</span>
                  <span className="ml-1.5 font-mono font-bold text-amber-300">
                    {formData.actualCovers > 0
                      ? `${(
                          (Math.abs(formData.actualCovers - formData.predictedCovers) /
                            formData.actualCovers) *
                          100
                        ).toFixed(1)}%`
                      : '0%'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsLogModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSubmitting ? 'Saving...' : 'Save Shift Log'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: QUICK BATCH FILL MODAL */}
      {isBatchQuickFillOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">Batch Log Past Week Actuals</h3>
              </div>
              <button
                onClick={() => setIsBatchQuickFillOpen(false)}
                className="text-stone-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-stone-300 leading-relaxed">
              This will automatically create and log realistic POS actual covers for the past 7 days (14 shifts) calibrated to {currentProfile.name}&apos;s average covers and check size, allowing you to instantly see week-over-week MAPE trends and accuracy metrics.
            </p>

            <div className="bg-stone-950 border border-stone-800 rounded-xl p-3 space-y-1 text-stone-400">
              <p>• Dates: Last 7 calendar days</p>
              <p>• Shifts: Lunch & Dinner</p>
              <p>• Simulated Real Variance: &plusmn;5% to 12% realistic guest fluctuations</p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setIsBatchQuickFillOpen(false)}
                className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleGeneratePastWeekLogs}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isSubmitting ? 'Generating...' : 'Batch Log 14 Shifts'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
