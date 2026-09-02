import React, { useState } from 'react';
import { HistoricalSalesRecord, RestaurantProfile } from '../types';
import {
  Layers,
  Upload,
  Plus,
  TrendingUp,
  DollarSign,
  Users,
  Calendar,
  Sparkles,
  Search,
  Filter,
  Trash2,
} from 'lucide-react';

interface HistoricalPOSDataViewProps {
  historicalData: HistoricalSalesRecord[];
  onAddRecord: (record: HistoricalSalesRecord) => void;
  onImportRecords: (records: HistoricalSalesRecord[]) => void;
  onDeleteRecord?: (id: string) => void;
  currentProfile: RestaurantProfile;
}

export const HistoricalPOSDataView: React.FC<HistoricalPOSDataViewProps> = ({
  historicalData,
  onAddRecord,
  onImportRecords,
  onDeleteRecord,
  currentProfile,
}) => {
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [rawPOSText, setRawPOSText] = useState('');
  const [isParsingPOS, setIsParsingPOS] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [shiftFilter, setShiftFilter] = useState<string>('ALL');

  // Manual record state
  const [mDate, setMDate] = useState('2026-08-28');
  const [mDay, setMDay] = useState('Friday');
  const [mShift, setMShift] = useState('Dinner');
  const [mCovers, setMCovers] = useState(215);
  const [mSales, setMSales] = useState(9950);
  const [mLaborCost, setMLaborCost] = useState(2180);
  const [mLaborHours, setMLaborHours] = useState(98);
  const [mWeather, setMWeather] = useState('Sunny');
  const [mEventTag, setMEventTag] = useState('');
  const [mNotes, setMNotes] = useState('');

  // Calculate day-of-week averages
  const dayStats = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(
    (dayName) => {
      const records = historicalData.filter(
        (h) => h.dayOfWeek.toLowerCase() === dayName.toLowerCase()
      );
      const totalCovers = records.reduce((acc, r) => acc + r.covers, 0);
      const totalSales = records.reduce((acc, r) => acc + r.sales, 0);
      const totalLabor = records.reduce((acc, r) => acc + r.laborCost, 0);
      const count = Math.max(1, records.length);

      return {
        day: dayName,
        avgCovers: Math.round(totalCovers / count),
        avgSales: Math.round(totalSales / count),
        avgLaborPct: Number(((totalLabor / Math.max(1, totalSales)) * 100).toFixed(1)),
        sampleCount: records.length,
      };
    }
  );

  const filteredRecords = historicalData.filter((r) => {
    if (shiftFilter !== 'ALL' && r.shift.toLowerCase() !== shiftFilter.toLowerCase()) {
      return false;
    }
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      return (
        r.date.includes(q) ||
        r.dayOfWeek.toLowerCase().includes(q) ||
        (r.eventTag && r.eventTag.toLowerCase().includes(q)) ||
        (r.notes && r.notes.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleParsePOS = async () => {
    if (!rawPOSText.trim()) return;
    setIsParsingPOS(true);

    try {
      const res = await fetch('/api/pos/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: rawPOSText }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.records) && data.records.length > 0) {
        const formatted: HistoricalSalesRecord[] = data.records.map(
          (r: any, idx: number) => ({
            id: `pos-${Date.now()}-${idx}`,
            date: r.date || '2026-08-20',
            dayOfWeek: r.dayOfWeek || 'Friday',
            shift: r.shift || 'Dinner',
            covers: Number(r.covers) || 120,
            sales: Number(r.sales) || 5500,
            laborCost: Number(r.laborCost) || 1500,
            laborHours: Number(r.laborHours) || 65,
            weather: r.weather || 'Sunny',
            eventTag: r.eventTag || '',
            notes: r.notes || 'Imported via POS report',
          })
        );
        onImportRecords(formatted);
        setShowImportModal(false);
        setRawPOSText('');
      } else {
        // Fallback simple line-by-line CSV parser
        const lines = rawPOSText.split('\n').filter((l) => l.trim().length > 0);
        const parsed: HistoricalSalesRecord[] = [];
        lines.forEach((line, idx) => {
          const parts = line.split(/[,\t]/);
          if (parts.length >= 3 && !isNaN(Number(parts[2]))) {
            parsed.push({
              id: `csv-${Date.now()}-${idx}`,
              date: parts[0] || '2026-08-25',
              dayOfWeek: parts[1] || 'Friday',
              shift: 'Dinner',
              covers: Number(parts[2]) || 150,
              sales: Number(parts[3]) || 7000,
              laborCost: Number(parts[4]) || 1900,
              laborHours: 75,
              weather: 'Sunny',
            });
          }
        });
        if (parsed.length > 0) {
          onImportRecords(parsed);
          setShowImportModal(false);
          setRawPOSText('');
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsParsingPOS(false);
    }
  };

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const rec: HistoricalSalesRecord = {
      id: `h-manual-${Date.now()}`,
      date: mDate,
      dayOfWeek: mDay,
      shift: mShift,
      covers: Number(mCovers),
      sales: Number(mSales),
      laborCost: Number(mLaborCost),
      laborHours: Number(mLaborHours),
      weather: mWeather,
      eventTag: mEventTag,
      notes: mNotes,
    };
    onAddRecord(rec);
    setShowAddModal(false);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <Layers className="w-5 h-5 text-amber-400" />
              <span>Historical POS Sales & Guest Volume Engine</span>
            </h2>
            <p className="text-xs text-stone-300">
              ShiftCast trains its forecast models on your actual POS numbers. Track day-of-week
              velocity and connect Toast, Square, Clover, or spreadsheet dumps.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddModal(true)}
              className="text-xs font-semibold bg-stone-800 hover:bg-stone-700 text-stone-200 px-3.5 py-2 rounded-xl border border-stone-700 flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              <span>Add Record</span>
            </button>

            <button
              onClick={() => setShowImportModal(true)}
              className="text-xs font-bold bg-amber-500 hover:bg-amber-400 text-stone-950 px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-colors shadow"
            >
              <Upload className="w-4 h-4" />
              <span>Import POS CSV / Report</span>
            </button>
          </div>
        </div>

        {/* Day of Week Baseline Averages Strip */}
        <div className="pt-4 border-t border-stone-800/80">
          <div className="text-xs font-semibold text-stone-400 mb-2.5 uppercase tracking-wider">
            Baseline Day-of-Week Patterns (4-Week Rolling Average)
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
            {dayStats.map((stat) => (
              <div
                key={stat.day}
                className="bg-stone-950/80 p-3 rounded-xl border border-stone-800 text-center"
              >
                <div className="text-[11px] font-bold text-stone-300 uppercase">
                  {stat.day.substring(0, 3)}
                </div>
                <div className="text-base font-extrabold text-amber-300 mt-1">
                  {stat.avgCovers}{' '}
                  <span className="text-[10px] font-normal text-stone-400">cov</span>
                </div>
                <div className="text-xs font-bold text-emerald-400 mt-0.5">
                  ${stat.avgSales.toLocaleString()}
                </div>
                <div className="text-[10px] text-stone-400 mt-0.5">
                  Labor: {stat.avgLaborPct}%
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Table Section with Filter / Search */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white">Sales & Labor Audit Records</h3>
            <span className="text-xs bg-stone-800 text-stone-300 px-2 py-0.5 rounded-full font-medium">
              {filteredRecords.length} shifts
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter date, event, note..."
                className="bg-stone-950 border border-stone-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-amber-500 w-44"
              />
            </div>

            {/* Shift Filter */}
            <select
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value)}
              className="bg-stone-950 border border-stone-800 rounded-xl px-3 py-1.5 text-xs text-stone-200 focus:outline-none"
            >
              <option value="ALL">All Shifts</option>
              <option value="Lunch">Lunch Only</option>
              <option value="Dinner">Dinner Only</option>
            </select>
          </div>
        </div>

        {/* Scrollable Records Table */}
        <div className="overflow-x-auto rounded-xl border border-stone-800/80">
          <table className="w-full text-left text-xs text-stone-300">
            <thead className="bg-stone-950 text-stone-400 font-semibold uppercase tracking-wider text-[10px] border-b border-stone-800">
              <tr>
                <th className="px-4 py-3">Date & Day</th>
                <th className="px-4 py-3">Shift</th>
                <th className="px-4 py-3 text-right">Covers</th>
                <th className="px-4 py-3 text-right">Gross Sales</th>
                <th className="px-4 py-3 text-right">Labor Cost ($)</th>
                <th className="px-4 py-3 text-right">Labor %</th>
                <th className="px-4 py-3">Weather</th>
                <th className="px-4 py-3">Events / Notes</th>
                {onDeleteRecord && <th className="px-4 py-3 text-center">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/60 bg-stone-900/40">
              {filteredRecords.slice(0, 30).map((record) => {
                const laborPct = Number(
                  ((record.laborCost / Math.max(1, record.sales)) * 100).toFixed(1)
                );
                return (
                  <tr key={record.id} className="hover:bg-stone-800/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-white">
                      <div>{record.date}</div>
                      <div className="text-[10px] text-stone-400">{record.dayOfWeek}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="bg-stone-800 px-2 py-0.5 rounded text-stone-200 font-semibold">
                        {record.shift}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-extrabold text-amber-300">
                      {record.covers}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-400">
                      ${record.sales.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-stone-200">
                      ${record.laborCost.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`px-1.5 py-0.5 rounded font-bold ${
                          laborPct <= currentProfile.targetLaborPercentage
                            ? 'text-emerald-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {laborPct}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-stone-400">{record.weather || 'Sunny'}</td>
                    <td className="px-4 py-3 text-stone-400 max-w-xs truncate">
                      {record.eventTag && (
                        <span className="inline-block bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded text-[10px] font-semibold mr-1">
                          {record.eventTag}
                        </span>
                      )}
                      {record.notes}
                    </td>
                    {onDeleteRecord && (
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => onDeleteRecord(record.id)}
                          title="Delete record from database"
                          className="p-1 hover:bg-stone-800 text-stone-500 hover:text-rose-400 rounded transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* POS Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>AI POS & Sales Report Importer</span>
              </h3>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-stone-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-stone-300 leading-relaxed">
              Paste raw daily sales summaries from <strong>Toast POS</strong>,{' '}
              <strong>Square</strong>, <strong>Clover</strong>, <strong>Aloha</strong>, or your
              weekly Excel/CSV export. Gemini AI will automatically parse covers, sales, shift
              dates, and labor costs into clean training records.
            </p>

            <textarea
              rows={8}
              value={rawPOSText}
              onChange={(e) => setRawPOSText(e.target.value)}
              placeholder="Date, Shift, Covers, Net Sales, Labor Cost&#10;2026-08-21, Dinner, 218, $10140, $2210&#10;2026-08-22, Lunch, 98, $4560, $1090&#10;2026-08-22, Dinner, 242, $11250, $2310"
              className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-xs font-mono text-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-800">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 rounded-xl bg-stone-800 text-stone-300 hover:bg-stone-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleParsePOS}
                disabled={isParsingPOS || !rawPOSText.trim()}
                className="px-4 py-2 rounded-xl bg-amber-500 text-stone-950 font-bold hover:bg-amber-400 disabled:opacity-40 text-xs flex items-center gap-1.5"
              >
                {isParsingPOS ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5 animate-spin" />
                    <span>Parsing POS Report...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Parse & Ingest Data</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Add Record Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <h3 className="text-base font-bold text-white">Add Historical Shift Record</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-stone-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleManualAdd} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-300 font-semibold mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={mDate}
                    onChange={(e) => setMDate(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200"
                  />
                </div>
                <div>
                  <label className="block text-stone-300 font-semibold mb-1">Day of Week</label>
                  <select
                    value={mDay}
                    onChange={(e) => setMDay(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200"
                  >
                    {[
                      'Monday',
                      'Tuesday',
                      'Wednesday',
                      'Thursday',
                      'Friday',
                      'Saturday',
                      'Sunday',
                    ].map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-stone-300 font-semibold mb-1">Shift</label>
                  <select
                    value={mShift}
                    onChange={(e) => setMShift(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200"
                  >
                    <option value="Lunch">Lunch</option>
                    <option value="Dinner">Dinner</option>
                  </select>
                </div>
                <div>
                  <label className="block text-stone-300 font-semibold mb-1">Covers</label>
                  <input
                    type="number"
                    required
                    value={mCovers}
                    onChange={(e) => setMCovers(Number(e.target.value))}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200"
                  />
                </div>
                <div>
                  <label className="block text-stone-300 font-semibold mb-1">Sales ($)</label>
                  <input
                    type="number"
                    required
                    value={mSales}
                    onChange={(e) => setMSales(Number(e.target.value))}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-300 font-semibold mb-1">
                    Labor Cost ($)
                  </label>
                  <input
                    type="number"
                    required
                    value={mLaborCost}
                    onChange={(e) => setMLaborCost(Number(e.target.value))}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200"
                  />
                </div>
                <div>
                  <label className="block text-stone-300 font-semibold mb-1">Weather</label>
                  <select
                    value={mWeather}
                    onChange={(e) => setMWeather(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200"
                  >
                    <option value="Sunny">Sunny / Clear</option>
                    <option value="Rain">Rain / Storm</option>
                    <option value="Cloudy">Cloudy</option>
                    <option value="Cold">Cold</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-stone-300 font-semibold mb-1">
                  Event Tag (Optional)
                </label>
                <input
                  type="text"
                  value={mEventTag}
                  onChange={(e) => setMEventTag(e.target.value)}
                  placeholder="e.g. Downtown Live Music, Game Night"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-stone-800 text-stone-300 hover:bg-stone-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-500 text-stone-950 font-bold hover:bg-amber-400 text-xs"
                >
                  Save Shift Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
