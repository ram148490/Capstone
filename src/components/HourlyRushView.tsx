import React, { useState } from 'react';
import { WeeklyForecastSummary, RestaurantProfile, DayForecast } from '../types';
import { TrendingUp, Users, Clock, AlertTriangle, Sparkles, Flame, Wine } from 'lucide-react';

interface HourlyRushViewProps {
  forecast: WeeklyForecastSummary;
  currentProfile: RestaurantProfile;
}

export const HourlyRushView: React.FC<HourlyRushViewProps> = ({
  forecast,
  currentProfile,
}) => {
  const [selectedDayDate, setSelectedDayDate] = useState<string>(forecast.days[4]?.date || forecast.days[0].date);

  const selectedDay =
    forecast.days.find((d) => d.date === selectedDayDate) || forecast.days[0];

  return (
    <div className="space-y-6 pb-12">
      {/* Day Selector Ribbon */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>Intra-Day Rush Radar & Hourly Demand Curves</span>
          </h2>
          <p className="text-xs text-stone-400 mt-0.5">
            Identify exact rush spikes to stagger shift in-times and prevent station bottlenecks.
          </p>
        </div>

        {/* Day Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {forecast.days.map((day) => {
            const isSelected = day.date === selectedDayDate;
            const isSurge = day.riskLevel === 'HIGH';

            return (
              <button
                key={day.date}
                onClick={() => setSelectedDayDate(day.date)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex flex-col items-center min-w-[72px] border ${
                  isSelected
                    ? 'bg-amber-500 text-stone-950 border-amber-400 shadow-md'
                    : isSurge
                    ? 'bg-stone-800 text-amber-300 border-amber-500/40 hover:bg-stone-700'
                    : 'bg-stone-950 text-stone-400 border-stone-800 hover:text-stone-200 hover:bg-stone-800'
                }`}
              >
                <span className="text-[10px] uppercase font-semibold">
                  {day.dayOfWeek.substring(0, 3)}
                </span>
                <span className="text-sm font-extrabold">{day.covers} cov</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Day Hourly Overview */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-stone-800">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-white">
                {selectedDay.dayOfWeek} Curve ({selectedDay.date})
              </h3>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-stone-800 text-stone-300 border border-stone-700">
                {selectedDay.weatherImpact}
              </span>
            </div>
            {selectedDay.events.length > 0 && (
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {selectedDay.events.map((e) => (
                  <span
                    key={e.id}
                    className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    {e.title} ({e.rushWindow || 'Impact Shift'})
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="bg-stone-950 px-3 py-1.5 rounded-lg border border-stone-800">
              <span className="text-stone-400">Total Day Covers:</span>{' '}
              <strong className="text-amber-300 text-sm">{selectedDay.covers}</strong>
            </div>
            <div className="bg-stone-950 px-3 py-1.5 rounded-lg border border-stone-800">
              <span className="text-stone-400">Projected Sales:</span>{' '}
              <strong className="text-emerald-400 text-sm">
                ${selectedDay.projectedSales.toLocaleString()}
              </strong>
            </div>
          </div>
        </div>

        {/* Shifts Hourly Visualizer */}
        <div className="space-y-6">
          {selectedDay.shifts.map((shift) => {
            const maxHourGuests = Math.max(
              ...shift.hourlyBreakdown.map((h) => h.expectedGuests),
              1
            );

            return (
              <div
                key={shift.id}
                className="bg-stone-950/70 border border-stone-800/80 rounded-xl p-4.5 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-bold text-white bg-stone-900 px-3 py-1 rounded-lg border border-stone-800">
                      {shift.name} Service ({shift.startTime} - {shift.endTime})
                    </span>
                    <span className="text-xs text-stone-400">
                      {shift.covers} covers • ${shift.sales.toLocaleString()} sales
                    </span>
                  </div>

                  <div className="text-xs text-stone-400">
                    Station Target:{' '}
                    <span className="text-amber-300 font-semibold">
                      {shift.recommendedStaff.lineCooks} Line Cooks
                    </span>{' '}
                    •{' '}
                    <span className="text-blue-300 font-semibold">
                      {shift.recommendedStaff.servers} Servers
                    </span>{' '}
                    •{' '}
                    <span className="text-purple-300 font-semibold">
                      {shift.recommendedStaff.bartenders} Bartender
                    </span>
                  </div>
                </div>

                {/* Hourly Bars */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 pt-2">
                  {shift.hourlyBreakdown.map((point) => {
                    const heightPercent = Math.min(100, Math.round((point.expectedGuests / maxHourGuests) * 100));

                    return (
                      <div
                        key={point.hour}
                        className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${
                          point.isPeak
                            ? 'bg-amber-950/30 border-amber-500/50 ring-1 ring-amber-500/20'
                            : 'bg-stone-900/60 border-stone-800'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-stone-200">
                            {point.hour}
                          </span>
                          {point.isPeak && (
                            <span className="text-[10px] uppercase font-bold bg-amber-500 text-stone-950 px-1.5 py-0.2 rounded font-mono">
                              PEAK
                            </span>
                          )}
                        </div>

                        {/* Bar Graphic */}
                        <div className="my-3 space-y-1">
                          <div className="text-xl font-extrabold text-white">
                            {point.expectedGuests}{' '}
                            <span className="text-[11px] font-normal text-stone-400">
                              guests
                            </span>
                          </div>
                          <div className="w-full h-2 bg-stone-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                point.isPeak
                                  ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                                  : 'bg-stone-600'
                              }`}
                              style={{ width: `${heightPercent}%` }}
                            />
                          </div>
                        </div>

                        {/* Staff Deployment at this Hour */}
                        <div className="pt-2 border-t border-stone-800/80 space-y-1 text-[11px]">
                          <div className="flex items-center justify-between text-blue-300">
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              Floor:
                            </span>
                            <span className="font-bold">
                              {point.recommendedFloorStaff} on floor
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-amber-300">
                            <span className="flex items-center gap-1">
                              <Flame className="w-3 h-3" />
                              Kitchen:
                            </span>
                            <span className="font-bold">
                              {point.recommendedKitchenStaff} on line
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
