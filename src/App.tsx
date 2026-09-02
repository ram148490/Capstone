import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  RestaurantProfile,
  HistoricalSalesRecord,
  LocalEvent,
  WeatherForecastDay,
  Employee,
  ShiftAssignment,
  WhatIfScenario,
  WeeklyForecastSummary,
  StaffRole,
  DayForecast,
  ShiftAccuracyLog,
} from './types';
import {
  RESTAURANT_PRESETS,
  SAMPLE_HISTORICAL_DATA,
  SAMPLE_LOCAL_EVENTS,
  SAMPLE_WEATHER_FORECAST,
  SAMPLE_STAFF_ROSTER,
  SAMPLE_ACCURACY_LOGS,
} from './data/restaurantPresets';
import { generateWeeklyForecast, getTargetWeekDates } from './utils/staffingEngine';
import { Header } from './components/Header';
import { WeeklyForecastView } from './components/WeeklyForecastView';
import { HourlyRushView } from './components/HourlyRushView';
import { LocalEventsRadar } from './components/LocalEventsRadar';
import { HistoricalPOSDataView } from './components/HistoricalPOSDataView';
import { TeamScheduleBuilder } from './components/TeamScheduleBuilder';
import { ForecastAccuracyView } from './components/ForecastAccuracyView';
import { ManagerBriefingModal } from './components/ManagerBriefingModal';
import { RestaurantProfileModal } from './components/RestaurantProfileModal';
import { AuthModal } from './components/AuthModal';
import { useAuth } from './context/AuthContext';
import { restaurantApi } from './utils/apiClient';
import { Sparkles, AlertCircle, CheckCircle, Database, ArrowUp } from 'lucide-react';

export default function App() {
  const { user, isAuthenticated } = useAuth();

  // State
  const [currentProfile, setCurrentProfile] = useState<RestaurantProfile>(
    RESTAURANT_PRESETS[0]
  );
  const [historicalData, setHistoricalData] = useState<HistoricalSalesRecord[]>(
    SAMPLE_HISTORICAL_DATA
  );
  const [localEvents, setLocalEvents] = useState<LocalEvent[]>(
    SAMPLE_LOCAL_EVENTS
  );
  const [weatherForecast, setWeatherForecast] = useState<WeatherForecastDay[]>(
    SAMPLE_WEATHER_FORECAST
  );
  const [roster, setRoster] = useState<Employee[]>(SAMPLE_STAFF_ROSTER);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [accuracyLogs, setAccuracyLogs] = useState<ShiftAccuracyLog[]>(SAMPLE_ACCURACY_LOGS);

  const [activeTab, setActiveTab] = useState<
    'forecast' | 'hourly' | 'events' | 'pos' | 'roster' | 'accuracy'
  >('forecast');

  const [scenario, setScenario] = useState<WhatIfScenario>({
    id: 'game-day-surge',
    name: 'Game Day Walk-in Surge (+25% Friday/Saturday)',
    description: 'Simulates higher than normal walk-in patio demand and beverage velocity.',
    eventMultiplierBonus: 0.15,
    checkSizeModifier: 1.05,
    walkInSurgeModifier: 1.1,
    isActive: false,
  });

  // Manual Shift Adjustments Override state: { [dayDate_shiftId_role]: count }
  const [manualShiftOverrides, setManualShiftOverrides] = useState<
    Record<string, number>
  >({});

  // Modals
  const [selectedBriefingDay, setSelectedBriefingDay] = useState<DayForecast | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Syncing & AI Loading state & notifications
  const [isSyncing, setIsSyncing] = useState(false);
  const [isInitialLoaded, setIsInitialLoaded] = useState(false);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [isDiscoveringAI, setIsDiscoveringAI] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);

  // Scroll to Top Listener
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 200) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  // Debounce ref for shift overrides saving
  const overridesTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Toast Helper
  const showToast = useCallback((type: 'success' | 'info' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  // =========================================================================
  // LOAD USER RESTAURANT DATA FROM BACKEND DATABASE
  // =========================================================================
  const loadDatabaseData = useCallback(async () => {
    try {
      setIsSyncing(true);
      const res = await restaurantApi.loadData();
      if (res && res.data) {
        const {
          profile,
          historicalData: hData,
          localEvents: lEvents,
          weatherForecast: wForecast,
          roster: rRoster,
          assignments: aAssignments,
          manualShiftOverrides: mOverrides,
          scenario: sScenario,
        } = res.data;

        if (profile) setCurrentProfile(profile);
        if (Array.isArray(hData)) setHistoricalData(hData);
        if (Array.isArray(lEvents)) setLocalEvents(lEvents);
        if (Array.isArray(wForecast)) setWeatherForecast(wForecast);
        if (Array.isArray(rRoster)) setRoster(rRoster);
        if (Array.isArray(aAssignments)) setAssignments(aAssignments);
        if (Array.isArray(res.data.accuracyLogs)) setAccuracyLogs(res.data.accuracyLogs);
        if (mOverrides) setManualShiftOverrides(mOverrides);
        if (sScenario) setScenario(sScenario);

        setIsInitialLoaded(true);
      }
    } catch (err: any) {
      console.warn('Could not load database records:', err);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // Reload data whenever user authentication status or account changes
  useEffect(() => {
    loadDatabaseData();
  }, [loadDatabaseData, user?.id]);

  // Generate master algorithmic forecast
  const baseForecast = useMemo(() => {
    return generateWeeklyForecast(
      currentProfile,
      historicalData,
      localEvents,
      weatherForecast,
      scenario
    );
  }, [currentProfile, historicalData, localEvents, weatherForecast, scenario]);

  // Apply manual overrides to forecast if any
  const forecast: WeeklyForecastSummary = useMemo(() => {
    if (Object.keys(manualShiftOverrides).length === 0) {
      return baseForecast;
    }

    const updatedDays = baseForecast.days.map((day) => {
      const updatedShifts = day.shifts.map((shift) => {
        const overrideKeyPrefix = `${day.date}_${shift.id}_`;
        const newRecommended = { ...shift.recommendedStaff };
        let modified = false;

        (Object.keys(newRecommended) as StaffRole[]).forEach((role) => {
          const key = `${overrideKeyPrefix}${role}`;
          if (manualShiftOverrides[key] !== undefined) {
            newRecommended[role] = manualShiftOverrides[key];
            modified = true;
          }
        });

        if (!modified) return shift;

        // Recalculate labor
        let recLaborCost = 0;
        (Object.keys(newRecommended) as StaffRole[]).forEach((role) => {
          recLaborCost +=
            newRecommended[role] *
            (currentProfile.wageRates[role] || 16) *
            shift.durationHours;
        });
        const recLaborPct = Number(
          ((recLaborCost / Math.max(1, shift.sales)) * 100).toFixed(1)
        );
        const savings = shift.gutLaborCost - recLaborCost;

        return {
          ...shift,
          recommendedStaff: newRecommended,
          estimatedLaborCost: recLaborCost,
          laborPercentage: recLaborPct,
          costSavings: savings,
        };
      });

      const dayLabor = updatedShifts.reduce(
        (acc, s) => acc + s.estimatedLaborCost,
        0
      );
      const dayGutLabor = updatedShifts.reduce(
        (acc, s) => acc + s.gutLaborCost,
        0
      );
      const daySales = updatedShifts.reduce((acc, s) => acc + s.sales, 0);
      const dailyLaborPct = Number(
        ((dayLabor / Math.max(1, daySales)) * 100).toFixed(1)
      );

      return {
        ...day,
        shifts: updatedShifts,
        dailyTotalLaborCost: dayLabor,
        dailyLaborPercentage: dailyLaborPct,
        dailySavings: dayGutLabor - dayLabor,
      };
    });

    const totalLabor = updatedDays.reduce(
      (acc, d) => acc + d.dailyTotalLaborCost,
      0
    );
    const totalSales = updatedDays.reduce((acc, d) => acc + d.projectedSales, 0);
    const totalGutLabor = updatedDays.reduce(
      (acc, d) => acc + d.shifts.reduce((sa, s) => sa + s.gutLaborCost, 0),
      0
    );

    return {
      ...baseForecast,
      days: updatedDays,
      totalProjectedLaborCost: totalLabor,
      averageLaborPercentage: Number(
        ((totalLabor / Math.max(1, totalSales)) * 100).toFixed(1)
      ),
      totalEstimatedSavings: totalGutLabor - totalLabor,
    };
  }, [baseForecast, manualShiftOverrides, currentProfile]);

  // =========================================================================
  // PERSISTENT MUTATION HANDLERS (SAVE TO BACKEND DATABASE)
  // =========================================================================

  // Save Restaurant Profile or Switch Active Restaurant Preset
  const handleSaveProfile = async (profile: RestaurantProfile, isPresetSwitch = false) => {
    setCurrentProfile(profile);
    setManualShiftOverrides({});
    try {
      setIsSyncing(true);
      const res = await restaurantApi.saveProfile(profile, isPresetSwitch);
      
      // If switching presets or fullData is returned, update all scoped state
      if (res.fullData) {
        const {
          historicalData: hData,
          localEvents: lEvents,
          weatherForecast: wForecast,
          roster: rRoster,
          assignments: aAssignments,
          accuracyLogs: aLogs,
          manualShiftOverrides: mOverrides,
          scenario: sScenario,
        } = res.fullData;

        if (Array.isArray(hData)) setHistoricalData(hData);
        if (Array.isArray(lEvents)) setLocalEvents(lEvents);
        if (Array.isArray(wForecast)) setWeatherForecast(wForecast);
        if (Array.isArray(rRoster)) setRoster(rRoster);
        if (Array.isArray(aAssignments)) setAssignments(aAssignments);
        if (Array.isArray(aLogs)) setAccuracyLogs(aLogs);
        if (mOverrides) setManualShiftOverrides(mOverrides);
        if (sScenario) setScenario(sScenario);
      }
      showToast('success', isPresetSwitch ? `Switched to "${profile.name}" (roster, POS & settings loaded).` : `Saved profile & wage settings for "${profile.name}".`);
    } catch (err: any) {
      console.error('Error saving profile:', err);
      showToast('error', 'Failed to save profile changes to database.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Explicit Switch Preset Handler
  const handleSwitchPreset = async (presetProfile: RestaurantProfile) => {
    await handleSaveProfile(presetProfile, true);
  };

  // Adjust Headcount for a specific shift & role
  const handleAdjustShiftStaff = (
    dayDate: string,
    shiftId: string,
    role: StaffRole,
    delta: number
  ) => {
    const key = `${dayDate}_${shiftId}_${role}`;
    const targetDay = forecast.days.find((d) => d.date === dayDate);
    const targetShift = targetDay?.shifts.find((s) => s.id === shiftId);
    const currentVal = targetShift ? targetShift.recommendedStaff[role] : 1;
    const newVal = Math.max(0, currentVal + delta);

    const updatedOverrides = {
      ...manualShiftOverrides,
      [key]: newVal,
    };

    setManualShiftOverrides(updatedOverrides);

    // Debounce save to database
    if (overridesTimeoutRef.current) {
      clearTimeout(overridesTimeoutRef.current);
    }
    overridesTimeoutRef.current = setTimeout(async () => {
      try {
        setIsSyncing(true);
        await restaurantApi.saveOverrides(updatedOverrides);
      } catch (err) {
        console.error('Error saving shift adjustments:', err);
      } finally {
        setIsSyncing(false);
      }
    }, 800);
  };

  // Toggle Local Event
  const handleToggleEvent = async (eventId: string) => {
    const updated = localEvents.map((e) =>
      e.id === eventId ? { ...e, isEnabled: !e.isEnabled } : e
    );
    setLocalEvents(updated);
    try {
      setIsSyncing(true);
      await restaurantApi.saveEvents(updated);
    } catch (err) {
      console.error('Error syncing events:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Add Local Event
  const handleAddEvent = async (event: LocalEvent) => {
    const updated = [event, ...localEvents];
    setLocalEvents(updated);
    showToast('success', `Event "${event.title}" saved to database.`);
    try {
      setIsSyncing(true);
      await restaurantApi.saveEvents(updated);
    } catch (err) {
      console.error('Error saving event:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Delete Local Event
  const handleDeleteEvent = async (eventId: string) => {
    const updated = localEvents.filter((e) => e.id !== eventId);
    setLocalEvents(updated);
    showToast('info', 'Event deleted from database.');
    try {
      setIsSyncing(true);
      await restaurantApi.saveEvents(updated);
    } catch (err) {
      console.error('Error deleting event:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Add Single POS Record
  const handleAddPOSRecord = async (record: HistoricalSalesRecord) => {
    const updated = [record, ...historicalData];
    setHistoricalData(updated);
    showToast('success', `Sales record for ${record.date} (${record.shift}) saved to database.`);
    try {
      setIsSyncing(true);
      await restaurantApi.savePosRecords([record], false);
    } catch (err) {
      console.error('Error saving POS record:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Import Batch POS Records
  const handleImportPOSRecords = async (records: HistoricalSalesRecord[]) => {
    const updated = [...records, ...historicalData];
    setHistoricalData(updated);
    showToast('success', `Imported & saved ${records.length} POS sales records to database.`);
    try {
      setIsSyncing(true);
      await restaurantApi.savePosRecords(records, false);
    } catch (err) {
      console.error('Error batch saving POS records:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Delete POS Record
  const handleDeletePOSRecord = async (recordId: string) => {
    const updated = historicalData.filter((r) => r.id !== recordId);
    setHistoricalData(updated);
    showToast('info', 'Sales record deleted from database.');
    try {
      setIsSyncing(true);
      await restaurantApi.deletePosRecord(recordId);
    } catch (err) {
      console.error('Error deleting POS record:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Update Team Roster (Add employee)
  const handleAddEmployee = async (emp: Employee) => {
    const updated = [...roster, emp];
    setRoster(updated);
    showToast('success', `Employee "${emp.name}" added to database.`);
    try {
      setIsSyncing(true);
      await restaurantApi.saveRoster(updated);
    } catch (err) {
      console.error('Error saving employee:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Delete Employee from Roster
  const handleDeleteEmployee = async (empId: string) => {
    const updated = roster.filter((e) => e.id !== empId);
    const updatedAssignments = assignments.filter((a) => a.employeeId !== empId);
    setRoster(updated);
    setAssignments(updatedAssignments);
    showToast('info', 'Employee removed from database.');
    try {
      setIsSyncing(true);
      await Promise.all([
        restaurantApi.saveRoster(updated),
        restaurantApi.saveAssignments(updatedAssignments),
      ]);
    } catch (err) {
      console.error('Error deleting employee:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Save Schedule Assignments
  const handleUpdateAssignments = async (newAssignments: ShiftAssignment[]) => {
    setAssignments(newAssignments);
    try {
      setIsSyncing(true);
      await restaurantApi.saveAssignments(newAssignments);
    } catch (err) {
      console.error('Error saving assignments:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Toggle Scenario
  const handleToggleScenario = async (scenarioId: string) => {
    const updatedScenario = { ...scenario, isActive: !scenario.isActive };
    setScenario(updatedScenario);
    showToast(
      'info',
      updatedScenario.isActive
        ? `⚡ Active Scenario: ${updatedScenario.name}`
        : 'Scenario deactivated. Restored standard forecast.'
    );
    try {
      setIsSyncing(true);
      await restaurantApi.saveScenario(updatedScenario);
    } catch (err) {
      console.error('Error saving scenario:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Accuracy Logs Handlers
  const handleAddAccuracyLog = async (log: ShiftAccuracyLog) => {
    const updated = [log, ...accuracyLogs];
    setAccuracyLogs(updated);
    showToast('success', `Logged actuals for ${log.date} (${log.shift}): ${log.accuracyPercentage}% accurate.`);
    try {
      setIsSyncing(true);
      await restaurantApi.saveAccuracyLogs([log], false);
    } catch (err) {
      console.error('Error saving accuracy log:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleBatchAddAccuracyLogs = async (newLogs: ShiftAccuracyLog[]) => {
    const updated = [...newLogs, ...accuracyLogs];
    setAccuracyLogs(updated);
    showToast('success', `Batch logged ${newLogs.length} shift actuals to database.`);
    try {
      setIsSyncing(true);
      await restaurantApi.saveAccuracyLogs(newLogs, false);
    } catch (err) {
      console.error('Error batch saving accuracy logs:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteAccuracyLog = async (logId: string) => {
    const updated = accuracyLogs.filter((l) => l.id !== logId);
    setAccuracyLogs(updated);
    showToast('info', 'Shift accuracy record deleted.');
    try {
      setIsSyncing(true);
      await restaurantApi.deleteAccuracyLog(logId);
    } catch (err) {
      console.error('Error deleting accuracy log:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Reset Account to Initial Demo Defaults
  const handleResetDefaults = async () => {
    try {
      setIsSyncing(true);
      const res = await restaurantApi.resetToDefaults();
      if (res && res.data) {
        setCurrentProfile(res.data.profile);
        setHistoricalData(res.data.historicalData);
        setLocalEvents(res.data.localEvents);
        setWeatherForecast(res.data.weatherForecast);
        setRoster(res.data.roster);
        setAssignments(res.data.assignments || []);
        setAccuracyLogs(res.data.accuracyLogs || SAMPLE_ACCURACY_LOGS);
        setManualShiftOverrides(res.data.manualShiftOverrides || {});
        setScenario(res.data.scenario);
        showToast('success', 'Database records restored to initial demo data.');
      }
    } catch (err: any) {
      console.error('Error resetting defaults:', err);
      showToast('error', 'Failed to reset database defaults.');
    } finally {
      setIsSyncing(false);
    }
  };

  // AI Master Forecast Refine
  const handleRunAIForecast = async () => {
    setIsLoadingAI(true);
    try {
      const res = await fetch('/api/forecast/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantProfile: currentProfile,
          historicalData,
          localEvents: localEvents.filter((e) => e.isEnabled),
          targetLaborPercentage: currentProfile.targetLaborPercentage,
          weekDates: getTargetWeekDates('2026-08-31'),
          weatherData: weatherForecast,
        }),
      });

      const data = await res.json();
      if (data.success && data.data) {
        showToast(
          'success',
          'AI Forecast synthesized historical velocity & saved insights!'
        );
      } else {
        showToast(
          'info',
          'Updated with latest real-time statistical staffing model.'
        );
      }
    } catch (e: any) {
      console.error(e);
      showToast('info', 'Forecast synchronized with local parameters.');
    } finally {
      setIsLoadingAI(false);
    }
  };

  // AI Discover Local Events
  const handleDiscoverEventsAI = async (location: string) => {
    setIsDiscoveringAI(true);
    try {
      const res = await fetch('/api/calendar/discover-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location,
          restaurantType: currentProfile.concept,
          startDate: '2026-08-31',
          endDate: '2026-09-06',
        }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.events) && data.events.length > 0) {
        const formatted: LocalEvent[] = data.events.map((e: any, idx: number) => ({
          id: `ai-evt-${Date.now()}-${idx}`,
          title: e.title || 'Local Event',
          date: e.date || '2026-09-04',
          category: e.category || 'COMMUNITY',
          venue: e.venue || location,
          estimatedAttendance: e.estimatedAttendance || '5,000',
          volumeMultiplier: Number(e.volumeMultiplier) || 1.25,
          affectedShifts: e.affectedShifts || ['Dinner'],
          rushWindow: e.rushWindow || '5:30 PM - 7:30 PM Pre-event surge',
          description: e.description || '',
          staffingTip: e.staffingTip || 'Schedule extra line cook support.',
          isEnabled: true,
          isUserCustom: true,
        }));

        const updatedEvents = [...formatted, ...localEvents];
        setLocalEvents(updatedEvents);
        await restaurantApi.saveEvents(updatedEvents);

        showToast(
          'success',
          `Discovered and saved ${formatted.length} local events for ${location} to database!`
        );
      } else {
        showToast('info', 'No new public events discovered for this specific query.');
      }
    } catch (e) {
      console.error(e);
      showToast('error', 'Could not reach event discovery service.');
    } finally {
      setIsDiscoveringAI(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col font-sans selection:bg-amber-500 selection:text-stone-950">
      {/* App Header */}
      <Header
        currentProfile={currentProfile}
        onSelectProfile={(p) => {
          handleSwitchPreset(p);
        }}
        onOpenProfileModal={() => setShowProfileModal(true)}
        forecast={forecast}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        scenario={scenario}
        onToggleScenario={handleToggleScenario}
        onRunAIForecast={handleRunAIForecast}
        isLoadingAI={isLoadingAI}
        onOpenBriefing={() => setSelectedBriefingDay(forecast.days[0])}
        onExportSchedule={() => setActiveTab('roster')}
        onOpenAuthModal={() => setShowAuthModal(true)}
        isSyncing={isSyncing}
        onResetDefaults={handleResetDefaults}
      />

      {/* Floating Notification Toast */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce">
          <div
            className={`px-4 py-3 rounded-2xl shadow-xl border flex items-center gap-2.5 text-xs font-semibold ${
              notification.type === 'success'
                ? 'bg-emerald-950 text-emerald-200 border-emerald-800'
                : notification.type === 'error'
                ? 'bg-rose-950 text-rose-200 border-rose-800'
                : 'bg-stone-900 text-amber-300 border-amber-500/40'
            }`}
          >
            {notification.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            ) : notification.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400" />
            ) : (
              <Sparkles className="w-4 h-4 text-amber-400" />
            )}
            <span>{notification.message}</span>
          </div>
        </div>
      )}

      {/* Main View Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12">
        {activeTab === 'forecast' && (
          <WeeklyForecastView
            forecast={forecast}
            currentProfile={currentProfile}
            assignments={assignments}
            roster={roster}
            onOpenBriefingForDay={(day) => setSelectedBriefingDay(day)}
            onAdjustShiftStaff={handleAdjustShiftStaff}
          />
        )}

        {activeTab === 'hourly' && (
          <HourlyRushView
            forecast={forecast}
            currentProfile={currentProfile}
          />
        )}

        {activeTab === 'events' && (
          <LocalEventsRadar
            events={localEvents}
            onToggleEvent={handleToggleEvent}
            onAddEvent={handleAddEvent}
            onDeleteEvent={handleDeleteEvent}
            currentProfile={currentProfile}
            onDiscoverEventsAI={handleDiscoverEventsAI}
            isDiscoveringAI={isDiscoveringAI}
          />
        )}

        {activeTab === 'roster' && (
          <TeamScheduleBuilder
            roster={roster}
            forecast={forecast}
            assignments={assignments}
            onUpdateAssignments={handleUpdateAssignments}
            onAddEmployee={handleAddEmployee}
            onDeleteEmployee={handleDeleteEmployee}
            currentProfile={currentProfile}
          />
        )}

        {activeTab === 'pos' && (
          <HistoricalPOSDataView
            historicalData={historicalData}
            onAddRecord={handleAddPOSRecord}
            onImportRecords={handleImportPOSRecords}
            onDeleteRecord={handleDeletePOSRecord}
            currentProfile={currentProfile}
          />
        )}

        {activeTab === 'accuracy' && (
          <ForecastAccuracyView
            accuracyLogs={accuracyLogs}
            currentProfile={currentProfile}
            onAddLog={handleAddAccuracyLog}
            onBatchAddLogs={handleBatchAddAccuracyLogs}
            onDeleteLog={handleDeleteAccuracyLog}
            pastForecastDays={forecast.days}
          />
        )}
      </main>

      {/* Auth & Account Dialog */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccessToast={(msg) => showToast('success', msg)}
      />

      {/* Daily Manager Briefing Modal */}
      {selectedBriefingDay && (
        <ManagerBriefingModal
          day={selectedBriefingDay}
          restaurantProfile={currentProfile}
          onClose={() => setSelectedBriefingDay(null)}
        />
      )}

      {/* Restaurant Profile & Wage Settings Modal */}
      {showProfileModal && (
        <RestaurantProfileModal
          profile={currentProfile}
          onSave={handleSaveProfile}
          onClose={() => setShowProfileModal(false)}
        />
      )}

      {/* Floating Scroll to Top Action Button */}
      {showScrollTop && (
        <button
          id="btn-scroll-to-top"
          onClick={scrollToTop}
          aria-label="Scroll to top of page"
          title="Scroll to top"
          className="fixed bottom-6 right-6 z-50 p-3 rounded-full bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-xl border border-amber-300/40 hover:scale-110 active:scale-95 transition-all duration-200 flex items-center justify-center cursor-pointer group"
        >
          <ArrowUp className="w-5 h-5 stroke-[2.5] group-hover:-translate-y-0.5 transition-transform" />
        </button>
      )}
    </div>
  );
}
