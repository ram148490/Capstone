import React, { useState } from 'react';
import { LocalEvent, EventCategory, RestaurantProfile } from '../../types';
import {
  Sparkles,
  Calendar,
  Plus,
  Upload,
  Trophy,
  Music,
  PartyPopper,
  Building2,
  Users2,
  Check,
  Trash2,
  Sliders,
  ExternalLink,
  MapPin,
  AlertCircle,
} from 'lucide-react';
import { parseICalData } from '../../lib/calendarUtils';
import { validateForm } from '../../lib/formValidation';

interface LocalEventsRadarProps {
  events: LocalEvent[];
  onToggleEvent: (eventId: string) => void;
  onAddEvent: (event: LocalEvent) => void;
  onDeleteEvent: (eventId: string) => void;
  currentProfile: RestaurantProfile;
  onDiscoverEventsAI: (location: string) => Promise<void>;
  isDiscoveringAI: boolean;
}

export const LocalEventsRadar: React.FC<LocalEventsRadarProps> = ({
  events,
  onToggleEvent,
  onAddEvent,
  onDeleteEvent,
  currentProfile,
  onDiscoverEventsAI,
  isDiscoveringAI,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showICalModal, setShowICalModal] = useState(false);
  const [addEventError, setAddEventError] = useState<string | null>(null);
  const [icalError, setIcalError] = useState<string | null>(null);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [locationQuery, setLocationQuery] = useState(currentProfile.location);

  // New Event Form State
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('2026-09-04');
  const [newCategory, setNewCategory] = useState<EventCategory>('SPORTS');
  const [newVenue, setNewVenue] = useState('Local Arena / Stadium');
  const [newAttendance, setNewAttendance] = useState('10,000 attendees');
  const [newMultiplier, setNewMultiplier] = useState(1.3);
  const [newShifts, setNewShifts] = useState<string[]>(['Dinner']);
  const [newRushWindow, setNewRushWindow] = useState('5:30 PM - 7:30 PM Pre-event surge');
  const [newDescription, setNewDescription] = useState('');
  const [newStaffingTip, setNewStaffingTip] = useState('');

  // iCal paste state
  const [icsRawText, setIcsRawText] = useState('');

  const getCategoryIcon = (category: EventCategory) => {
    switch (category) {
      case 'SPORTS':
        return <Trophy className="w-4 h-4 text-amber-400" />;
      case 'CONCERT':
        return <Music className="w-4 h-4 text-purple-400" />;
      case 'FESTIVAL':
        return <PartyPopper className="w-4 h-4 text-rose-400" />;
      case 'CONFERENCE':
        return <Building2 className="w-4 h-4 text-blue-400" />;
      default:
        return <Users2 className="w-4 h-4 text-emerald-400" />;
    }
  };

  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateForm([
      { label: 'Event title', value: newTitle, required: true },
      { label: 'Date', value: newDate, required: true },
      { label: 'Volume multiplier', value: newMultiplier, positive: true },
    ]);
    if (validationError) {
      setAddEventError(validationError);
      return;
    }
    setAddEventError(null);

    const event: LocalEvent = {
      id: `evt-${Date.now()}`,
      title: newTitle,
      date: newDate,
      category: newCategory,
      venue: newVenue,
      estimatedAttendance: newAttendance,
      volumeMultiplier: Number(newMultiplier),
      affectedShifts: newShifts,
      rushWindow: newRushWindow,
      description: newDescription || `${newTitle} impacting foot traffic in the neighborhood.`,
      staffingTip: newStaffingTip || 'Schedule extra line cook and bartender support.',
      isEnabled: true,
      isUserCustom: true,
    };

    onAddEvent(event);
    setShowAddModal(false);
    // Reset
    setNewTitle('');
    setNewDescription('');
    setNewStaffingTip('');
  };

  const handleImportICal = () => {
    if (!icsRawText.trim()) {
      setIcalError('Paste the contents of an .ics calendar file before importing.');
      return;
    }
    const parsed = parseICalData(icsRawText);
    if (parsed.length === 0) {
      setIcalError('No calendar events found. Make sure you pasted a valid VCALENDAR / VEVENT block.');
      return;
    }
    setIcalError(null);
    parsed.forEach((p) => {
      if (p.title && p.date) {
        onAddEvent({
          id: p.id || `ics-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          title: p.title,
          date: p.date,
          category: p.category || 'COMMUNITY',
          venue: p.venue || 'Local Venue',
          volumeMultiplier: p.volumeMultiplier || 1.25,
          affectedShifts: p.affectedShifts || ['Dinner'],
          rushWindow: p.rushWindow || 'Expected evening rush',
          description: p.description || p.title,
          staffingTip: 'Added from calendar import',
          isEnabled: true,
          isUserCustom: true,
        });
      }
    });
    setIcsRawText('');
    setShowICalModal(false);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner & AI Search */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
              <span>Local Calendar Integrations & Event Radar</span>
            </h2>
            <p className="text-xs text-stone-300">
              Surrounding sports games, concerts, festivals, and conferences drive huge guest surges.
              ShiftCast monitors local venue calendars to calculate exact staffing multipliers.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              id="btn-add-event"
              onClick={() => {
                setAddEventError(null);
                setShowAddModal(true);
              }}
              className="text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-stone-950 px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-colors shadow"
            >
              <Plus className="w-4 h-4" />
              <span>Add Custom Event</span>
            </button>

            <button
              id="btn-import-ical"
              onClick={() => {
                setIcalError(null);
                setShowICalModal(true);
              }}
              className="text-xs font-semibold bg-stone-800 hover:bg-stone-700 text-stone-200 px-3.5 py-2 rounded-xl border border-stone-700 flex items-center gap-1.5 transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-blue-400" />
              <span>Import .ICS / iCal</span>
            </button>
          </div>
        </div>

        {/* AI Discovery Search Bar */}
        <div className="pt-4 border-t border-stone-800/80 flex flex-col sm:flex-row sm:items-start gap-3">
          <div className="flex-1 relative">
            <MapPin className="w-4 h-4 text-stone-400 absolute left-3.5 top-[1.15rem] -translate-y-1/2" />
            <input
              type="text"
              value={locationQuery}
              onChange={(e) => {
                setLocationQuery(e.target.value);
                if (discoverError) setDiscoverError(null);
              }}
              placeholder="Enter neighborhood / city (e.g. Austin Downtown, Chicago Lincoln Park, Seattle Ballard)..."
              className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-10 pr-4 py-2 text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            {discoverError && (
              <p className="mt-1 text-[11px] text-rose-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 shrink-0" />
                {discoverError}
              </p>
            )}
          </div>

          <button
            id="btn-ai-discover"
            onClick={() => {
              if (!locationQuery.trim()) {
                setDiscoverError('Enter a neighborhood or city to search for events.');
                return;
              }
              setDiscoverError(null);
              onDiscoverEventsAI(locationQuery);
            }}
            disabled={isDiscoveringAI}
            className={`text-xs font-bold px-4 py-2 rounded-xl flex items-center justify-center gap-2 transition-all whitespace-nowrap ${
              isDiscoveringAI
                ? 'bg-amber-600/40 text-amber-200 cursor-not-allowed animate-pulse'
                : 'bg-stone-800 hover:bg-stone-700 text-amber-300 border border-amber-500/30'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>{isDiscoveringAI ? 'Scanning Venues & Venues...' : 'Discover Events with AI'}</span>
          </button>
        </div>
      </div>

      {/* Events Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {events.map((evt) => {
          const isBoost = evt.volumeMultiplier > 1.0;
          const percentChange = Math.round((evt.volumeMultiplier - 1.0) * 100);

          return (
            <div
              key={evt.id}
              className={`p-4.5 rounded-2xl border transition-all ${
                evt.isEnabled
                  ? 'bg-stone-900 border-stone-800 hover:border-stone-700 shadow-sm'
                  : 'bg-stone-950/40 border-stone-900 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-stone-950 border border-stone-800 text-stone-300">
                    {getCategoryIcon(evt.category)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-extrabold text-white">
                        {evt.title}
                      </span>
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 border border-stone-700">
                        {evt.category}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-stone-400 mt-1 flex-wrap">
                      <span>📅 {evt.date}</span>
                      <span>•</span>
                      <span>📍 {evt.venue}</span>
                      {evt.estimatedAttendance && (
                        <>
                          <span>•</span>
                          <span className="text-stone-300 font-medium">
                            👥 {evt.estimatedAttendance}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Enable/Disable Toggle Switch */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onToggleEvent(evt.id)}
                    className={`w-9 h-5 rounded-full transition-colors relative flex items-center p-0.5 ${
                      evt.isEnabled ? 'bg-amber-500' : 'bg-stone-800'
                    }`}
                    title={evt.isEnabled ? 'Active in forecast' : 'Ignored in forecast'}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-stone-950 transition-transform ${
                        evt.isEnabled ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>

                  {evt.isUserCustom && (
                    <button
                      onClick={() => onDeleteEvent(evt.id)}
                      className="p-1 rounded text-stone-500 hover:text-rose-400 transition-colors"
                      title="Delete custom event"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Impact Breakdown */}
              <div className="mt-3.5 pt-3 border-t border-stone-800/80 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-400">Demand Multiplier:</span>
                  <span
                    className={`font-extrabold px-2 py-0.5 rounded ${
                      isBoost
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : 'bg-stone-800 text-stone-300'
                    }`}
                  >
                    {isBoost ? `+${percentChange}% Volume Surge` : `${percentChange}%`}
                  </span>
                </div>

                {evt.rushWindow && (
                  <div className="text-xs text-stone-300 bg-stone-950/80 p-2 rounded-lg border border-stone-800/80">
                    <strong className="text-amber-400">Peak Window:</strong> {evt.rushWindow}
                  </div>
                )}

                {evt.staffingTip && (
                  <div className="text-xs text-stone-400">
                    💡 <strong className="text-stone-300">Operational Tip:</strong>{' '}
                    {evt.staffingTip}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Custom Event Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-400" />
                <span>Add Local Event or Private Party</span>
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-stone-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateEvent} className="space-y-3.5 text-xs" noValidate>
              {addEventError && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-800/80 bg-rose-950/60 px-3 py-2 text-rose-300">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{addEventError}</span>
                </div>
              )}

              <div>
                <label className="block text-stone-300 font-semibold mb-1">
                  Event Title *
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. City Half Marathon, Tech Keynote, Private Buyout..."
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-300 font-semibold mb-1">
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-stone-300 font-semibold mb-1">
                    Category
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as EventCategory)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="SPORTS">Sports Match / Game</option>
                    <option value="CONCERT">Concert / Theater</option>
                    <option value="FESTIVAL">Festival / Block Party</option>
                    <option value="CONFERENCE">Convention / Expo</option>
                    <option value="COMMUNITY">Community / Race</option>
                    <option value="PRIVATE_PARTY">Private Group Buyout</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-300 font-semibold mb-1">
                    Venue / Location
                  </label>
                  <input
                    type="text"
                    value={newVenue}
                    onChange={(e) => setNewVenue(e.target.value)}
                    placeholder="e.g. 0.5 miles from dining room"
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200"
                  />
                </div>

                <div>
                  <label className="block text-stone-300 font-semibold mb-1">
                    Est. Crowd Size
                  </label>
                  <input
                    type="text"
                    value={newAttendance}
                    onChange={(e) => setNewAttendance(e.target.value)}
                    placeholder="e.g. 5,000 attendees"
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-stone-300 font-semibold">
                    Volume Multiplier: +{Math.round((newMultiplier - 1) * 100)}%
                  </label>
                  <span className="text-amber-400 font-bold">{newMultiplier}x</span>
                </div>
                <input
                  type="range"
                  min="0.7"
                  max="1.7"
                  step="0.05"
                  value={newMultiplier}
                  onChange={(e) => setNewMultiplier(parseFloat(e.target.value))}
                  className="w-full accent-amber-500"
                />
              </div>

              <div>
                <label className="block text-stone-300 font-semibold mb-1">
                  Peak Rush Window
                </label>
                <input
                  type="text"
                  value={newRushWindow}
                  onChange={(e) => setNewRushWindow(e.target.value)}
                  placeholder="e.g. Pre-event rush 5:00 PM - 7:00 PM"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200"
                />
              </div>

              <div>
                <label className="block text-stone-300 font-semibold mb-1">
                  Staffing & Prep Advice
                </label>
                <input
                  type="text"
                  value={newStaffingTip}
                  onChange={(e) => setNewStaffingTip(e.target.value)}
                  placeholder="e.g. Add 1 bartender and double draft keg backups"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-stone-800 text-stone-300 hover:bg-stone-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-500 text-stone-950 font-bold hover:bg-amber-400"
                >
                  Save & Include in Forecast
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* iCal Import Modal */}
      {showICalModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Upload className="w-4 h-4 text-blue-400" />
                <span>Import iCal (.ics) Calendar Feed</span>
              </h3>
              <button
                onClick={() => setShowICalModal(false)}
                className="text-stone-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-stone-300">
              Paste the raw text of an .ics calendar file from local sports teams, concert venues,
              or convention center calendars to extract upcoming events automatically.
            </p>

            {icalError && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-800/80 bg-rose-950/60 px-3 py-2 text-xs text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{icalError}</span>
              </div>
            )}

            <textarea
              rows={8}
              value={icsRawText}
              onChange={(e) => setIcsRawText(e.target.value)}
              placeholder="BEGIN:VCALENDAR&#10;BEGIN:VEVENT&#10;SUMMARY:Championship Game&#10;DTSTART:20260904T180000Z&#10;LOCATION:Stadium...&#10;END:VEVENT&#10;END:VCALENDAR"
              className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-xs font-mono text-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-800">
              <button
                type="button"
                onClick={() => setShowICalModal(false)}
                className="px-4 py-2 rounded-xl bg-stone-800 text-stone-300 hover:bg-stone-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImportICal}
                disabled={!icsRawText.trim()}
                className="px-4 py-2 rounded-xl bg-blue-500 text-white font-bold hover:bg-blue-400 disabled:opacity-40 text-xs"
              >
                Parse & Import Events
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
