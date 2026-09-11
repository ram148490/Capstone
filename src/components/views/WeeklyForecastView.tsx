import React, { useState } from 'react';
import {
  DayForecast,
  ShiftForecast,
  StaffRole,
  WeeklyForecastSummary,
  RestaurantProfile,
  ShiftAssignment,
  Employee,
} from '../../types';
import {
  Sun,
  CloudRain,
  Cloud,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Utensils,
  Wine,
  Flame,
  Info,
  ArrowRight,
  ShieldAlert,
  Calendar,
  Layers,
  Building2,
  Clock,
  Download,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { generateScheduleCSV } from '../../lib/calendarUtils';
import { describeNetImpact } from '../../lib/format';

interface WeeklyForecastViewProps {
  forecast: WeeklyForecastSummary;
  currentProfile: RestaurantProfile;
  assignments?: ShiftAssignment[];
  roster?: Employee[];
  onOpenBriefingForDay: (day: DayForecast) => void;
  onAdjustShiftStaff: (
    dayDate: string,
    shiftId: string,
    role: StaffRole,
    delta: number
  ) => void;
}

export const WeeklyForecastView: React.FC<WeeklyForecastViewProps> = ({
  forecast,
  currentProfile,
  assignments = [],
  roster = [],
  onOpenBriefingForDay,
  onAdjustShiftStaff,
}) => {
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(4); // Default to Friday (index 4)
  const [filterMode, setFilterMode] = useState<'ALL' | 'WEEKEND' | 'RISK'>('ALL');
  const [expandedShiftId, setExpandedShiftId] = useState<string | null>(null);

  const handleExportCSV = () => {
    const csvContent = generateScheduleCSV(
      forecast.days,
      assignments,
      currentProfile,
      roster
    );
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const safeName = currentProfile.name.replace(/[^a-zA-Z0-9]/g, '_');
    link.setAttribute('download', `${safeName}_Schedule_Aug31_Sep06.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const filteredDays = forecast.days.filter((day) => {
    if (filterMode === 'WEEKEND') {
      return ['Friday', 'Saturday', 'Sunday'].includes(day.dayOfWeek);
    }
    if (filterMode === 'RISK') {
      return day.riskLevel === 'HIGH' || day.riskLevel === 'MEDIUM';
    }
    return true;
  });

  // Calculate high impact event for top anomaly banner
  const highImpactEventDay = forecast.days.find((d) => d.events.length > 0 && d.riskLevel === 'HIGH') || forecast.days.find((d) => d.events.length > 0);
  const featuredEvent = highImpactEventDay?.events[0];

  const focusDay = forecast.days[selectedDayIndex] || forecast.days[4] || forecast.days[0];

  // Helper to calculate FOH & BOH sums for a shift
  const calculateFOHBOH = (shift: ShiftForecast) => {
    const fohRoles: StaffRole[] = ['servers', 'bartenders', 'hosts', 'bussers'];
    const bohRoles: StaffRole[] = ['lineCooks', 'prepCooks', 'dishwashers'];

    const foh = fohRoles.reduce((sum, r) => sum + (shift.recommendedStaff[r] || 0), 0);
    const boh = bohRoles.reduce((sum, r) => sum + (shift.recommendedStaff[r] || 0), 0);
    return { foh, boh };
  };

  const getWeatherIcon = (condition: string) => {
    switch (condition) {
      case 'Rain':
      case 'Thunderstorm':
        return <CloudRain className="w-4 h-4 text-blue-400" />;
      case 'Cloudy':
        return <Cloud className="w-4 h-4 text-stone-400" />;
      default:
        return <Sun className="w-4 h-4 text-amber-400" />;
    }
  };

  const getRoleIcon = (role: StaffRole) => {
    switch (role) {
      case 'servers':
        return <Users className="w-3.5 h-3.5 text-blue-400" />;
      case 'bartenders':
        return <Wine className="w-3.5 h-3.5 text-purple-400" />;
      case 'lineCooks':
      case 'prepCooks':
        return <Flame className="w-3.5 h-3.5 text-amber-400" />;
      case 'dishwashers':
      case 'bussers':
      case 'hosts':
      case 'managers':
      default:
        return <Utensils className="w-3.5 h-3.5 text-emerald-400" />;
    }
  };

  // Chart data for 7-day rolling forecast (Figure 2 layout)
  const chartData = forecast.days.map((d, index) => ({
    name: d.dayOfWeek.substring(0, 3),
    fullName: d.dayOfWeek,
    covers: d.covers,
    baselineCovers: d.baselineCovers,
    date: d.date,
    index,
    isSelected: index === selectedDayIndex,
  }));

  return (
    <div className="space-y-6 pb-12">
      {/* View-level heading. The visual design leads with the covers chart rather
          than a title bar, but screen-reader users navigating by heading need an
          h2 here so the cards below (h3) don't orphan the outline under the app's
          h1. The other five tool views carry a visible h2 in their banner. */}
      <h2 className="visually-hidden">Weekly Shift Forecast</h2>

      {/* 1. Anomaly / Local-Event Alert Banner (as in Figure 2 of Project Plan) */}
      {featuredEvent && highImpactEventDay && (
        <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl px-4 py-3 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-amber-200 shadow-sm animate-fade-in">
          <div className="flex items-center gap-2.5">
            <span className="p-1 rounded-md bg-amber-500/20 text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </span>
            <span>
              <strong className="font-semibold text-white">Local event detected near {currentProfile.name}:</strong>{' '}
              {highImpactEventDay.dayOfWeek} traffic ({featuredEvent.title}) expected{' '}
              <span className="font-bold text-amber-300">
                +{Math.round((featuredEvent.volumeMultiplier - 1) * 100)}% above baseline
              </span>.
            </span>
          </div>
          <button
            onClick={() => setSelectedDayIndex(forecast.days.findIndex((d) => d.date === highImpactEventDay.date))}
            className="self-start sm:self-auto shrink-0 text-[11px] font-semibold bg-amber-500 hover:bg-amber-400 text-stone-950 px-2.5 py-1 rounded-md transition-colors whitespace-nowrap cursor-pointer"
          >
            View {highImpactEventDay.dayOfWeek} Shift
          </button>
        </div>
      )}

      {/* 2. 7-Day Rolling Covers Forecast & Shift Staffing Visual Overview (Figure 2 Mockup Section) */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 7-Day Covers Bar Chart */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <TrendingUp className="w-4 h-4" />
                </span>
                <h3 className="text-sm font-bold text-white tracking-tight">
                  7-Day Rolling Covers Forecast
                </h3>
              </div>
              <span className="text-[11px] text-stone-400">
                Click day to inspect staffing targets
              </span>
            </div>

            <div
              className="h-52 w-full pt-2"
              role="img"
              aria-label={`Bar chart of forecast covers across the week: ${forecast.days
                .map((d) => `${d.dayOfWeek} ${d.covers}`)
                .join(', ')}. Click a day below the chart to inspect its staffing.`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#292524" vertical={false} />
                  <XAxis dataKey="name" stroke="#78716c" fontSize={11} tickLine={false} />
                  <YAxis stroke="#78716c" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-stone-950 border border-stone-800 p-2.5 rounded-lg shadow-xl text-xs">
                            <div className="font-bold text-white">{data.fullName}</div>
                            <div className="text-amber-300 font-semibold mt-1">
                              Forecast Covers: {data.covers}
                            </div>
                            <div className="text-stone-400 text-[10px]">
                              Baseline: {data.baselineCovers}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="covers"
                    radius={[6, 6, 0, 0]}
                    onClick={(data) => setSelectedDayIndex(data.index)}
                    className="cursor-pointer"
                  >
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          entry.index === selectedDayIndex
                            ? '#f59e0b'
                            : ['Fri', 'Sat', 'Sun'].includes(entry.name)
                            ? '#d97706'
                            : '#78716c'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recommended Staff & Day Focus Card (matching Figure 2 right panel) */}
          <div className="lg:col-span-5 flex flex-col justify-between bg-stone-950/80 border border-stone-800 rounded-xl p-4 space-y-4">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-stone-800/80">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Recommended Staff — {focusDay.dayOfWeek}
                  </span>
                </div>
                <span className="text-[11px] text-stone-400">
                  {focusDay.date}
                </span>
              </div>

              {/* FOH / BOH Shift Summary Pills */}
              <div className="space-y-2 mt-3">
                {focusDay.shifts.map((shift) => {
                  const { foh, boh } = calculateFOHBOH(shift);
                  return (
                    <div
                      key={shift.id}
                      className="flex items-center justify-between bg-stone-900/80 border border-stone-800 px-3 py-2 rounded-lg text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-amber-300">{shift.name}</span>
                        <span className="text-[11px] text-stone-400">
                          ({shift.startTime.replace(':00', '')} - {shift.endTime.replace(':00', '')})
                        </span>
                      </div>
                      <div className="font-semibold text-stone-200 flex items-center gap-2">
                        <span className="bg-blue-950/80 text-blue-300 border border-blue-800/60 px-2 py-0.5 rounded text-[11px]">
                          {foh} FOH
                        </span>
                        <span className="text-stone-600">•</span>
                        <span className="bg-amber-950/80 text-amber-300 border border-amber-800/60 px-2 py-0.5 rounded text-[11px]">
                          {boh} BOH
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Focus Day Highlight Metric */}
            <div className="pt-3 border-t border-stone-800/80 flex items-center justify-between bg-stone-900/40 p-3 rounded-lg">
              <div>
                <div className="text-[10px] text-stone-400 uppercase tracking-wider font-semibold">
                  {focusDay.dayOfWeek.toUpperCase()} FORECAST
                </div>
                <div className="text-2xl font-black text-white tracking-tight">
                  {focusDay.covers}{' '}
                  <span className="text-xs font-normal text-stone-400">covers</span>
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs font-bold text-emerald-400 flex items-center justify-end gap-1">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>
                    {focusDay.covers >= focusDay.baselineCovers ? '↑' : '↓'}{' '}
                    {Math.abs(Math.round(((focusDay.covers - focusDay.baselineCovers) / focusDay.baselineCovers) * 100))}%
                  </span>
                </div>
                <div className="text-[10px] text-stone-400">vs. 4-wk baseline</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Executive Strategic Summary Card */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Sparkles className="w-4 h-4" />
              </span>
              <h3 className="text-base font-bold text-white tracking-tight">
                Weekly Operations Forecast & Labor Strategy
              </h3>
            </div>
            <p className="text-sm text-stone-300 leading-relaxed">
              {forecast.executiveInsight}
            </p>
          </div>

          {/* Metric Badges */}
          <div className="flex items-center gap-3 flex-wrap lg:justify-end">
            <div className="bg-stone-950 px-3.5 py-2.5 rounded-xl border border-stone-800">
              <div className="text-[11px] text-stone-400 uppercase tracking-wider font-semibold">
                Projected Labor
              </div>
              <div className="text-base sm:text-lg font-bold text-stone-200">
                ${forecast.totalProjectedLaborCost.toLocaleString()}
                <span className="text-xs font-normal text-stone-400 ml-1">
                  ({forecast.averageLaborPercentage}%)
                </span>
              </div>
            </div>

            {/* Elevated Primary KPI: Estimated Net Savings vs. Overage */}
            {(() => {
              const net = describeNetImpact(forecast.totalEstimatedSavings);
              return (
                <div
                  className={`px-4 sm:px-5 py-2.5 rounded-xl border shadow-sm ring-1 ${
                    net.isNegative
                      ? 'bg-rose-950/60 border-rose-500/40 ring-rose-500/20'
                      : 'bg-emerald-950/60 border-emerald-500/40 ring-emerald-500/20'
                  }`}
                >
                  <div
                    className={`text-[11px] uppercase tracking-wider font-bold flex items-center gap-1.5 ${
                      net.isNegative ? 'text-rose-300' : 'text-emerald-300'
                    }`}
                  >
                    {net.isNegative ? (
                      <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                    ) : (
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                    Estimated {net.noun}
                  </div>
                  <div
                    className={`text-2xl sm:text-3xl font-black tracking-tight ${
                      net.isNegative ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {net.amount}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Operational Priority Cards - No Truncation, Consistent Badges */}
        <div className="mt-5 pt-5 border-t border-stone-800/80 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {forecast.operationalAdvice.map((item, idx) => {
            const isRiskOrUrgent = item.category === 'RISK_MITIGATION';

            return (
              <div
                key={idx}
                className={`p-4 rounded-xl border transition-colors flex flex-col justify-between min-h-[140px] ${
                  isRiskOrUrgent
                    ? 'bg-stone-950/90 border-rose-900/40 hover:border-rose-700/60 ring-1 ring-rose-900/20'
                    : 'bg-stone-950/60 border-stone-800/70 hover:border-stone-700'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-xs font-bold text-stone-100 leading-snug">
                      {item.title}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded tracking-wider uppercase whitespace-nowrap shrink-0 ${
                        isRiskOrUrgent
                          ? 'bg-rose-950/80 text-rose-300 border border-rose-800/80 flex items-center gap-1'
                          : 'bg-stone-800 text-stone-300 border border-stone-700/80'
                      }`}
                    >
                      {isRiskOrUrgent && <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />}
                      {item.category.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-stone-300/90 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter / View Toggle Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-white">Daily Shift Schedule & Headcount</h3>
          <span className="text-xs bg-stone-800 text-stone-300 px-2 py-0.5 rounded-full font-medium">
            {filteredDays.length} Days
          </span>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex flex-wrap items-center gap-1.5 bg-stone-900 p-1 rounded-xl border border-stone-800">
            <button
              onClick={() => setFilterMode('ALL')}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                filterMode === 'ALL'
                  ? 'bg-amber-500 text-stone-950 shadow'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              All 7 Days
            </button>
            <button
              onClick={() => setFilterMode('WEEKEND')}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                filterMode === 'WEEKEND'
                  ? 'bg-amber-500 text-stone-950 shadow'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Weekend Surges (Fri–Sun)
            </button>
            <button
              onClick={() => setFilterMode('RISK')}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                filterMode === 'RISK'
                  ? 'bg-amber-500 text-stone-950 shadow'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              High Impact & Event Days
            </button>
          </div>

          <button
            id="btn-export-forecast-csv"
            onClick={handleExportCSV}
            className="text-xs font-semibold bg-stone-900 hover:bg-stone-800 text-stone-200 px-3 py-2 rounded-xl border border-stone-700/80 hover:border-stone-600 flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            title="Export CSV schedule with hourly rates and computed labor costs for Toast / 7shifts"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span>Export Schedule CSV</span>
          </button>
        </div>
      </div>

      {/* 7-Day Grid Cards */}
      <div className="grid grid-cols-1 gap-5">
        {filteredDays.map((day) => {
          const hasMajorEvents = day.events.length > 0;
          const isHighRisk = day.riskLevel === 'HIGH';

          return (
            <div
              key={day.date}
              className={`bg-stone-900 border rounded-2xl transition-all shadow-sm ${
                isHighRisk
                  ? 'border-amber-500/40 ring-1 ring-amber-500/20'
                  : 'border-stone-800 hover:border-stone-700'
              }`}
            >
              {/* Day Header */}
              <div className="p-4 sm:p-5 bg-stone-950/40 rounded-t-2xl border-b border-stone-800/80 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3.5">
                  <div
                    className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center font-bold text-center border ${
                      ['Friday', 'Saturday', 'Sunday'].includes(day.dayOfWeek)
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                        : 'bg-stone-800/80 border-stone-700 text-stone-200'
                    }`}
                  >
                    <span className="text-[10px] uppercase font-semibold text-stone-400 tracking-wider">
                      {day.dayOfWeek.substring(0, 3)}
                    </span>
                    <span className="text-base font-extrabold leading-none mt-0.5">
                      {day.date.split('-')[2]}
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-base font-bold text-white tracking-tight">
                        {day.dayOfWeek}
                      </h4>
                      <span className="text-xs text-stone-400">({day.date})</span>

                      {/* Weather pill */}
                      <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-stone-800 text-stone-300 border border-stone-700">
                        {getWeatherIcon(day.weather.condition)}
                        <span>
                          {day.weather.tempF}°F, {day.weather.condition}
                        </span>
                        {!day.weather.patioOpen && (
                          <span className="text-rose-400 font-medium ml-1">(Patio Closed)</span>
                        )}
                      </span>

                      {/* Risk pill */}
                      {day.riskLevel === 'HIGH' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-700 animate-pulse">
                          <AlertTriangle className="w-3 h-3" />
                          Volume Surge Alert
                        </span>
                      )}
                    </div>

                    {/* Local Events impacting this day */}
                    {hasMajorEvents ? (
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {day.events.map((evt) => (
                          <span
                            key={evt.id}
                            className="text-xs font-medium px-2 py-0.5 rounded-md bg-stone-800/90 text-amber-300 border border-amber-500/30 flex items-center gap-1"
                          >
                            <Sparkles className="w-3 h-3 text-amber-400" />
                            <span>{evt.title}</span>
                            <span className="bg-amber-500/20 px-1 rounded text-[10px] font-bold text-amber-200">
                              +{Math.round((evt.volumeMultiplier - 1) * 100)}% Volume
                            </span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-stone-400 mt-0.5">
                        Standard baseline demand profile
                      </p>
                    )}
                  </div>
                </div>

                {/* Day Summary Metrics */}
                <div className="flex items-center gap-4 sm:gap-6 self-end md:self-center flex-wrap">
                  <div className="text-right">
                    <div className="text-[11px] text-stone-400 uppercase tracking-wider">
                      Forecast Covers
                    </div>
                    <div className="text-base font-extrabold text-amber-300 flex items-center justify-end gap-1.5">
                      <span>{day.covers}</span>
                      <span className="text-xs font-normal text-stone-400">
                        (Base: {day.baselineCovers})
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[11px] text-stone-400 uppercase tracking-wider">
                      Est. Sales
                    </div>
                    <div className="text-base font-extrabold text-emerald-400">
                      ${day.projectedSales.toLocaleString()}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[11px] text-stone-400 uppercase tracking-wider">
                      Labor Target
                    </div>
                    <div
                      className={`text-base font-extrabold ${
                        day.dailyLaborPercentage <= currentProfile.targetLaborPercentage
                          ? 'text-emerald-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {day.dailyLaborPercentage}%
                    </div>
                  </div>

                  <button
                    onClick={() => onOpenBriefingForDay(day)}
                    className="text-xs font-medium bg-stone-800 hover:bg-stone-700 text-stone-200 px-3 py-2 rounded-lg border border-stone-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Info className="w-3.5 h-3.5 text-blue-400" />
                    <span>Briefing</span>
                  </button>
                </div>
              </div>

              {/* Shifts for the day */}
              <div className="p-4 sm:p-5 space-y-4">
                {day.shifts.map((shift) => {
                  const isExpanded = expandedShiftId === shift.id;
                  const { foh, boh } = calculateFOHBOH(shift);

                  return (
                    <div
                      key={shift.id}
                      className="bg-stone-950/70 border border-stone-800/80 rounded-xl p-4 transition-all"
                    >
                      {/* Shift Overview Bar with FOH / BOH Highlights */}
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-3 border-b border-stone-800/60">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-stone-900 text-amber-400 border border-stone-800 font-bold text-sm">
                            {shift.name}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-white">
                                {shift.startTime} – {shift.endTime}
                              </span>
                              <span className="text-xs text-stone-400">
                                ({shift.durationHours} hrs)
                              </span>
                              <span className="text-xs font-semibold bg-stone-800 text-stone-200 px-2 py-0.5 rounded border border-stone-700">
                                {foh} FOH • {boh} BOH
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-stone-300 mt-0.5">
                              <span>
                                Projected Covers:{' '}
                                <strong className="text-amber-300">{shift.covers}</strong>
                              </span>
                              <span>•</span>
                              <span>
                                Est. Sales:{' '}
                                <strong className="text-emerald-400">
                                  ${shift.sales.toLocaleString()}
                                </strong>
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Shift Labor & Savings Comparison */}
                        <div className="flex items-center gap-4 flex-wrap">
                          <div className="text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="text-stone-400">Optimized Labor: </span>
                              <strong className="text-white">
                                ${shift.estimatedLaborCost.toLocaleString()}
                              </strong>
                              <span className="text-stone-400 text-[11px]">
                                ({shift.laborPercentage}%)
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-stone-400 mt-0.5">
                              <span className="text-amber-300/90 font-medium">
                                Tipped: ${shift.tippedLaborCost?.toLocaleString() ?? 0}
                              </span>
                              <span>•</span>
                              <span className="text-stone-300 font-medium">
                                Flat: ${shift.nonTippedLaborCost?.toLocaleString() ?? 0}
                              </span>
                              {shift.fixedLaborCost > 0 && (
                                <>
                                  <span>•</span>
                                  <span className="text-emerald-400 font-medium">
                                    Fixed: ${shift.fixedLaborCost.toLocaleString()}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {shift.costSavings > 0 ? (
                            <div className="text-xs bg-emerald-950/60 text-emerald-300 border border-emerald-800/80 px-2.5 py-1 rounded-lg flex items-center gap-1 font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Saved ${shift.costSavings} vs Gut Feel</span>
                            </div>
                          ) : shift.understaffingRisk === 'CRITICAL' ? (
                            <div className="text-xs bg-rose-950/80 text-rose-300 border border-rose-800 px-2.5 py-1 rounded-lg flex items-center gap-1 font-bold animate-pulse">
                              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                              <span>High Understaffing Risk! Added Station Staff</span>
                            </div>
                          ) : null}

                          <button
                            type="button"
                            onClick={() => setExpandedShiftId(isExpanded ? null : shift.id)}
                            aria-expanded={isExpanded}
                            className="text-xs font-semibold text-stone-400 hover:text-stone-100 flex items-center gap-1 bg-stone-900 px-2.5 py-1 rounded-lg border border-stone-800 cursor-pointer"
                          >
                            <span>{isExpanded ? 'Hide Station Details' : 'Station Breakdown'}</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Headcount Role Pills (Collapsed or Expanded) */}
                      <div className="mt-3.5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                        {(
                          [
                            'servers',
                            'bartenders',
                            'lineCooks',
                            'prepCooks',
                            'bussers',
                            'dishwashers',
                            'hosts',
                            'managers',
                          ] as StaffRole[]
                        ).map((role) => {
                          const count = shift.recommendedStaff[role] || 0;
                          const gutCount = shift.gutFeelStaff[role] || 0;
                          const isModified = count !== gutCount;
                          const isTippedRole =
                            currentProfile.wageTypes?.[role] === 'TIPPED' ||
                            (['servers', 'bartenders', 'bussers'].includes(role) &&
                              currentProfile.serviceStyle !== 'FAST_CASUAL');
                          const roleHours =
                            shift.roleHours?.[role] ?? shift.durationHours;
                          const hasFixedExtra =
                            (role === 'prepCooks' && (shift.fixedPrepHours || 0) > 0) ||
                            (role === 'dishwashers' && (shift.fixedClosingHours || 0) > 0);

                          return (
                            <div
                              key={role}
                              className={`p-2 rounded-xl border flex flex-col justify-between ${
                                isModified
                                  ? 'bg-amber-950/20 border-amber-500/30'
                                  : 'bg-stone-900/60 border-stone-800'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-semibold text-stone-300 capitalize flex items-center gap-1">
                                  {getRoleIcon(role)}
                                  {role.replace('Cooks', ' Cook')}
                                </span>
                                <span
                                  className={`text-[8px] font-bold px-1 rounded uppercase ${
                                    isTippedRole
                                      ? 'bg-amber-500/20 text-amber-300'
                                      : 'bg-stone-800 text-stone-400'
                                  }`}
                                  title={isTippedRole ? 'Direct Cash Wage' : 'Flat Hourly Wage'}
                                >
                                  {isTippedRole ? 'Tipped' : 'Flat'}
                                </span>
                              </div>

                              <div className="flex items-baseline justify-between mt-1.5">
                                <span className="text-base font-extrabold text-white">
                                  {count}
                                </span>
                                <div className="flex items-center gap-1 text-[10px] text-stone-400">
                                  <span>Gut: {gutCount}</span>
                                </div>
                              </div>

                              {/* Role hours indicator */}
                              <div className="mt-1 flex items-center justify-between text-[9px] text-stone-400">
                                <span className={hasFixedExtra ? 'text-emerald-400 font-medium' : ''}>
                                  {roleHours}h shift
                                  {role === 'prepCooks' && (shift.fixedPrepHours || 0) > 0
                                    ? ` (+${shift.fixedPrepHours}h prep)`
                                    : role === 'dishwashers' && (shift.fixedClosingHours || 0) > 0
                                    ? ` (+${shift.fixedClosingHours}h close)`
                                    : ''}
                                </span>
                              </div>

                              {/* Manual Adjust Stepper */}
                              <div className="flex items-center justify-between mt-1.5 pt-1 border-t border-stone-800/60">
                                <button
                                  type="button"
                                  onClick={() =>
                                    onAdjustShiftStaff(day.date, shift.id, role, -1)
                                  }
                                  disabled={count <= 0}
                                  className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 disabled:opacity-30 text-xs flex items-center justify-center font-bold cursor-pointer"
                                  title="Decrease headcount"
                                  aria-label={`Decrease ${role} for ${day.dayOfWeek} ${shift.name} (currently ${count})`}
                                >
                                  <span aria-hidden="true">-</span>
                                </button>
                                <span className="text-[10px] text-stone-400 font-medium font-mono">
                                  ${(currentProfile.wageRates[role] || 16)}/h
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onAdjustShiftStaff(day.date, shift.id, role, 1)
                                  }
                                  className="w-5 h-5 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs flex items-center justify-center font-bold cursor-pointer"
                                  title="Increase headcount"
                                  aria-label={`Increase ${role} for ${day.dayOfWeek} ${shift.name} (currently ${count})`}
                                >
                                  <span aria-hidden="true">+</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Expanded View: Hourly Rush & Shift Operational Directives */}
                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t border-stone-800 space-y-4 bg-stone-900/40 p-3.5 rounded-xl">
                          {/* Granular Labor Cost Composition Panel */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                            <div className="bg-stone-950/80 border border-stone-800 rounded-xl p-3">
                              <div className="flex items-center justify-between text-xs text-stone-400 mb-1">
                                <span className="font-semibold text-stone-200">Wage Type Breakdown</span>
                                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-bold">
                                  Sub-Min Direct
                                </span>
                              </div>
                              <div className="space-y-1 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-stone-400">Tipped Direct Wage:</span>
                                  <span className="text-amber-300 font-bold font-mono">
                                    ${shift.tippedLaborCost?.toLocaleString() ?? 0}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-stone-400">BOH Flat Hourly:</span>
                                  <span className="text-stone-200 font-bold font-mono">
                                    ${shift.nonTippedLaborCost?.toLocaleString() ?? 0}
                                  </span>
                                </div>
                              </div>
                              <p className="text-[10px] text-stone-400 mt-2 leading-relaxed">
                                Avoids blended market rate distortions by calculating server/bartender payroll at direct cash rate ($10/hr).
                              </p>
                            </div>

                            <div className="bg-stone-950/80 border border-stone-800 rounded-xl p-3">
                              <div className="flex items-center justify-between text-xs text-stone-400 mb-1">
                                <span className="font-semibold text-stone-200">Fixed Opening/Closing Blocks</span>
                                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-bold">
                                  Protected Floor
                                </span>
                              </div>
                              <div className="space-y-1 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-stone-400">Fixed Prep Block:</span>
                                  <span className="text-emerald-400 font-bold font-mono">
                                    +{shift.fixedPrepHours ?? 0} hrs pre-open
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-stone-400">Fixed Sanitation Block:</span>
                                  <span className="text-emerald-400 font-bold font-mono">
                                    +{shift.fixedClosingHours ?? 0} hrs post-close
                                  </span>
                                </div>
                                <div className="flex justify-between pt-1 border-t border-stone-800/80">
                                  <span className="text-stone-400">Fixed Shift Cost:</span>
                                  <span className="text-emerald-300 font-bold font-mono">
                                    ${shift.fixedLaborCost?.toLocaleString() ?? 0}
                                  </span>
                                </div>
                              </div>
                              <p className="text-[10px] text-stone-400 mt-1.5 leading-relaxed">
                                Prep cooks and dishwashers are staffed for essential prep and sanitation regardless of day-of guest count.
                              </p>
                            </div>

                            <div className="bg-stone-950/80 border border-stone-800 rounded-xl p-3">
                              <div className="flex items-center justify-between text-xs text-stone-400 mb-1">
                                <span className="font-semibold text-stone-200">Variable Service Labor</span>
                                <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-bold">
                                  Volume Scaled
                                </span>
                              </div>
                              <div className="space-y-1 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-stone-400">Variable Floor/Kitchen:</span>
                                  <span className="text-blue-300 font-bold font-mono">
                                    ${shift.variableLaborCost?.toLocaleString() ?? 0}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-stone-400">Forecast Guest Covers:</span>
                                  <span className="text-stone-200 font-bold font-mono">
                                    {shift.covers} guests
                                  </span>
                                </div>
                                <div className="flex justify-between pt-1 border-t border-stone-800/80">
                                  <span className="text-stone-400">Total Shift Labor:</span>
                                  <span className="text-white font-bold font-mono">
                                    ${shift.estimatedLaborCost.toLocaleString()}
                                  </span>
                                </div>
                              </div>
                              <p className="text-[10px] text-stone-400 mt-1.5 leading-relaxed">
                                Dynamic staffing flexes with peak rush hours while respecting station productivity targets.
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                            <span className="text-xs font-bold text-stone-200 flex items-center gap-1.5">
                              <TrendingUp className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              Expected Hourly Cover Flow & Peak Windows:
                            </span>
                            <span className="text-[11px] text-stone-400">
                              Shift Notes: {shift.shiftNotes}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                            {shift.hourlyBreakdown.map((point) => (
                              <div
                                key={point.hour}
                                className={`p-2 rounded-lg border text-center ${
                                  point.isPeak
                                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-200'
                                    : 'bg-stone-950/60 border-stone-800 text-stone-300'
                                }`}
                              >
                                <div className="text-[10px] font-semibold">{point.hour}</div>
                                <div className="text-sm font-extrabold mt-0.5">
                                  {point.expectedGuests} covers
                                </div>
                                <div className="text-[9px] text-stone-400 mt-0.5">
                                  Floor: {point.recommendedFloorStaff} | Kitchen:{' '}
                                  {point.recommendedKitchenStaff}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};