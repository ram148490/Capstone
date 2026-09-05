import React, { useState } from 'react';
import {
  Sparkles,
  TrendingUp,
  DollarSign,
  Users,
  ShieldCheck,
  TrendingDown,
  Calendar,
  Layers,
  Sliders,
  Store,
  FileText,
  Printer,
  ChevronDown,
  User,
  Database,
  RefreshCw,
  LogOut,
  Target,
} from 'lucide-react';
import { RestaurantProfile, WeeklyForecastSummary, WhatIfScenario } from '../../types';
import { RESTAURANT_PRESETS } from '../../data/restaurantPresets';
import { useAuth } from '../../context/AuthContext';
import { describeNetImpact } from '../../lib/format';

interface HeaderProps {
  currentProfile: RestaurantProfile;
  onSelectProfile: (profile: RestaurantProfile) => void;
  onOpenProfileModal: () => void;
  forecast: WeeklyForecastSummary;
  activeTab: 'forecast' | 'hourly' | 'events' | 'pos' | 'roster' | 'accuracy';
  setActiveTab: (tab: 'forecast' | 'hourly' | 'events' | 'pos' | 'roster' | 'accuracy') => void;
  scenario: WhatIfScenario;
  onToggleScenario: (scenarioId: string) => void;
  onRunAIForecast: () => void;
  isLoadingAI: boolean;
  onOpenBriefing: () => void;
  onExportSchedule: () => void;
  onOpenAuthModal: () => void;
  isSyncing?: boolean;
  onResetDefaults?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentProfile,
  onSelectProfile,
  onOpenProfileModal,
  forecast,
  activeTab,
  setActiveTab,
  scenario,
  onToggleScenario,
  onRunAIForecast,
  isLoadingAI,
  onOpenBriefing,
  onExportSchedule,
  onOpenAuthModal,
  isSyncing = false,
  onResetDefaults,
}) => {
  const { user, isAuthenticated, logout } = useAuth();
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [showToolsMenu, setShowToolsMenu] = useState(false);

  const MORE_TOOLS: Array<{
    id: 'hourly' | 'events' | 'roster' | 'accuracy' | 'pos';
    name: string;
    description: string;
    icon: React.FC<{ className?: string }>;
  }> = [
    {
      id: 'hourly',
      name: 'Hourly Rush Curves',
      description: '15-min volume distribution & station bottlenecks',
      icon: TrendingUp,
    },
    {
      id: 'events',
      name: 'Local Events Radar',
      description: 'Stadium games, concerts, conventions & weather impact',
      icon: Sparkles,
    },
    {
      id: 'roster',
      name: 'Schedule Sync & Team Roster',
      description: 'Headcount requirements & 7shifts / HotSchedules schedule export',
      icon: Users,
    },
    {
      id: 'accuracy',
      name: 'Forecast Accuracy & MAPE',
      description: 'Shift actuals logging & multi-week precision analytics',
      icon: Target,
    },
    {
      id: 'pos',
      name: 'Historical POS Data',
      description: 'Upload POS CSV records & demand pattern correlation',
      icon: Layers,
    },
  ];

  const activeSecondaryTool = MORE_TOOLS.find((t) => t.id === activeTab);
  const netImpact = describeNetImpact(forecast.totalEstimatedSavings);

  return (
    <header className="bg-stone-900 text-stone-100 border-b border-stone-800 sticky top-0 z-40 shadow-md">
      {/* Top Bar: Clean Brand, Restaurant Switcher, Single Primary Action + Overflow Menu */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center text-stone-950 font-bold text-lg shadow-inner shrink-0">
            <TrendingUp className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2">
                ShiftCast
                <span className="text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Volume & Staffing AI
                </span>
              </h1>
            </div>
            <p className="text-xs text-stone-400 hidden sm:block">
              Demand forecasting & shift labor optimization for independent restaurants
            </p>
          </div>
        </div>

        {/* Header Right: Restaurant selector, Single Primary Action (AI Refine), Overflow Menu */}
        <div className="flex items-center gap-2.5 self-start md:self-center flex-wrap">
          {/* Preset Selector */}
          <div className="relative inline-block text-left min-w-0">
            <select
              id="restaurant-select"
              value={currentProfile.id}
              onChange={(e) => {
                const found = RESTAURANT_PRESETS.find((p) => p.id === e.target.value);
                if (found) onSelectProfile(found);
              }}
              className="max-w-[52vw] sm:max-w-none bg-stone-800 text-stone-200 text-xs sm:text-sm font-medium rounded-lg border border-stone-700 py-1.5 pl-2.5 pr-7 focus:ring-2 focus:ring-amber-500 focus:outline-none cursor-pointer truncate"
            >
              {RESTAURANT_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.concept.split('&')[0].trim()})
                </option>
              ))}
            </select>
          </div>

          {/* The Single Primary Orange Action */}
          <button
            id="btn-run-gemini-forecast"
            onClick={onRunAIForecast}
            disabled={isLoadingAI}
            className={`text-xs font-bold px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow-md cursor-pointer ${
              isLoadingAI
                ? 'bg-amber-600/50 text-amber-200 cursor-not-allowed animate-pulse'
                : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950'
            }`}
          >
            <Sparkles className="w-4 h-4 fill-stone-950" />
            <span>{isLoadingAI ? 'Analyzing...' : 'AI Refine & Insights'}</span>
          </button>

          {/* Unified Settings & Account Overflow Menu */}
          <div className="relative">
            <button
              id="btn-header-overflow-menu"
              onClick={() => setShowOverflowMenu(!showOverflowMenu)}
              className="flex items-center gap-1.5 text-xs bg-stone-800 hover:bg-stone-700 text-stone-200 px-3 py-1.5 rounded-lg border border-stone-700 font-medium transition-colors cursor-pointer"
              title="Settings, Tools & Account"
            >
              {isAuthenticated && user ? (
                <span
                  className={`w-2 h-2 rounded-full mr-0.5 ${
                    isSyncing ? 'bg-amber-400 animate-spin' : 'bg-emerald-400 animate-pulse'
                  }`}
                />
              ) : (
                <Sliders className="w-3.5 h-3.5 text-stone-400" />
              )}
              <span>{isAuthenticated && user ? user.name.split(' ')[0] : 'Settings & Tools'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
            </button>

            {/* Overflow Dropdown */}
            {showOverflowMenu && (
              <div
                className="absolute right-0 mt-1.5 w-64 max-w-[calc(100vw-2rem)] bg-stone-900 border border-stone-800 rounded-xl shadow-2xl py-1.5 z-50 text-xs text-stone-300 divide-y divide-stone-800/80"
                onMouseLeave={() => setShowOverflowMenu(false)}
              >
                {/* Account / Session Header */}
                <div className="p-2.5 bg-stone-950/60">
                  {isAuthenticated && user ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white truncate">{user.name}</span>
                        <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                          <Database className="w-2.5 h-2.5" /> Synced
                        </span>
                      </div>
                      <div className="text-[11px] text-stone-400 truncate">{user.restaurantName}</div>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => {
                            setShowOverflowMenu(false);
                            onOpenAuthModal();
                          }}
                          className="text-[11px] text-amber-300 hover:text-amber-200 underline cursor-pointer"
                        >
                          Account Details
                        </button>
                        <span className="text-stone-600">•</span>
                        <button
                          onClick={() => {
                            setShowOverflowMenu(false);
                            logout();
                          }}
                          className="text-[11px] text-rose-400 hover:text-rose-300 cursor-pointer"
                        >
                          Log Out
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-[11px] text-stone-400">Local demo workspace</div>
                      <button
                        id="btn-auth-modal"
                        onClick={() => {
                          setShowOverflowMenu(false);
                          onOpenAuthModal();
                        }}
                        className="w-full flex items-center justify-center gap-1.5 text-xs bg-stone-800 hover:bg-stone-700 text-stone-200 py-1.5 px-3 rounded-lg border border-stone-700 transition-colors font-medium cursor-pointer"
                      >
                        <User className="w-3.5 h-3.5 text-stone-400" />
                        <span>Manager Sign In</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Core Tools */}
                <div className="py-1">
                  <button
                    id="btn-edit-restaurant-profile"
                    onClick={() => {
                      setShowOverflowMenu(false);
                      onOpenProfileModal();
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-stone-800 flex items-center gap-2.5 text-stone-200 cursor-pointer"
                  >
                    <Store className="w-3.5 h-3.5 text-amber-400" />
                    <div>
                      <div className="font-medium">Restaurant Settings</div>
                      <div className="text-[10px] text-stone-400">Profile, capacity & labor targets</div>
                    </div>
                  </button>

                  <button
                    id="btn-briefing"
                    onClick={() => {
                      setShowOverflowMenu(false);
                      onOpenBriefing();
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-stone-800 flex items-center gap-2.5 text-stone-200 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-400" />
                    <div>
                      <div className="font-medium">Manager Shift Briefing</div>
                      <div className="text-[10px] text-stone-400">Printable shift handover cards</div>
                    </div>
                  </button>

                  <button
                    id="btn-export-schedule"
                    onClick={() => {
                      setShowOverflowMenu(false);
                      onExportSchedule();
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-stone-800 flex items-center gap-2.5 text-stone-200 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-emerald-400" />
                    <div>
                      <div className="font-medium">Export Schedule</div>
                      <div className="text-[10px] text-stone-400">PDF / Print staff assignments</div>
                    </div>
                  </button>
                </div>

                {/* Reset Action */}
                {onResetDefaults && (
                  <div className="py-1">
                    <button
                      onClick={() => {
                        setShowOverflowMenu(false);
                        if (confirm('Reset your database records back to initial demo data?')) {
                          onResetDefaults();
                        }
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-stone-800 flex items-center gap-2.5 text-stone-400 hover:text-stone-200 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-stone-500" />
                      <span>Reset to Demo Data</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI Highlight Strip with Prominent Estimated Net Savings */}
      <div className="bg-stone-950 border-t border-stone-800/80 px-4 sm:px-6 lg:px-8 py-2">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-y-2 gap-x-6 text-xs">
          <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
            {/* Spotlight Primary Metric: Estimated Net Savings vs. Overage */}
            <div
              className={`flex items-center gap-2 px-3 py-1 rounded-xl shadow-sm border ${
                netImpact.isNegative
                  ? 'bg-rose-950/70 border-rose-500/40'
                  : 'bg-emerald-950/70 border-emerald-500/40'
              }`}
            >
              {netImpact.isNegative ? (
                <TrendingDown className="w-4 h-4 text-rose-400" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              )}
              <span
                className={`text-[11px] font-bold uppercase tracking-wide ${
                  netImpact.isNegative ? 'text-rose-300' : 'text-emerald-300'
                }`}
              >
                Est. {netImpact.noun}:
              </span>
              <span
                className={`font-black text-base sm:text-lg tracking-tight ${
                  netImpact.isNegative ? 'text-rose-300' : 'text-emerald-300'
                }`}
              >
                {netImpact.amount}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-stone-400">Week:</span>
              <span className="font-medium text-stone-300">Aug 31 – Sep 06, 2026</span>
            </div>

            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-stone-400" />
              <span className="text-stone-400">Projected Covers:</span>
              <span className="font-semibold text-stone-200">
                {forecast.totalProjectedCovers.toLocaleString()}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-stone-400" />
              <span className="text-stone-400">Projected Revenue:</span>
              <span className="font-semibold text-stone-200">
                ${forecast.totalProjectedSales.toLocaleString()}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-stone-400">Labor %:</span>
              <span
                className={`font-semibold px-2 py-0.5 rounded text-xs ${
                  forecast.averageLaborPercentage <= currentProfile.targetLaborPercentage
                    ? 'bg-stone-800 text-stone-200 border border-stone-700'
                    : 'bg-amber-950/70 text-amber-300 border border-amber-800'
                }`}
              >
                {forecast.averageLaborPercentage}% (Target: {currentProfile.targetLaborPercentage}%)
              </span>
            </div>
          </div>

          {/* Scenario simulator pill */}
          <div className="flex items-center gap-2">
            <span className="text-stone-400 flex items-center gap-1">
              <Sliders className="w-3 h-3 text-amber-400" />
              Scenario:
            </span>
            <button
              onClick={() => onToggleScenario(scenario.id)}
              className={`text-[11px] font-medium px-2.5 py-1 rounded-md border transition-all cursor-pointer ${
                scenario.isActive
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                  : 'bg-stone-900 text-stone-400 border-stone-800 hover:text-stone-200'
              }`}
            >
              {scenario.isActive ? `⚡ Active: ${scenario.name}` : '⚙️ Simulate Weather/Rush'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-stone-800">
        <div className="flex items-center gap-1 sm:gap-4 flex-wrap min-w-0">
          {/* Primary Core View: Weekly Shift Forecast (Visible by default) */}
          <button
            id="tab-forecast"
            onClick={() => {
              setActiveTab('forecast');
              setShowToolsMenu(false);
            }}
            className={`py-2.5 px-3.5 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 cursor-pointer ${
              activeTab === 'forecast'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Weekly Shift Forecast</span>
          </button>

          {/* More Tools Dropdown */}
          <div className="relative">
            <button
              id="tab-more-tools"
              onClick={() => setShowToolsMenu(!showToolsMenu)}
              className={`py-2.5 px-3.5 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 cursor-pointer ${
                activeSecondaryTool
                  ? 'border-amber-400 text-amber-400'
                  : 'border-transparent text-stone-400 hover:text-stone-200'
              }`}
            >
              {activeSecondaryTool ? (
                <>
                  <activeSecondaryTool.icon className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="max-w-[45vw] sm:max-w-none truncate">
                    <span className="hidden sm:inline">More Tools: </span>
                    <strong className="text-white font-semibold">{activeSecondaryTool.name}</strong>
                  </span>
                </>
              ) : (
                <>
                  <Sliders className="w-4 h-4 text-stone-400" />
                  <span>More Tools</span>
                </>
              )}
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${
                  showToolsMenu ? 'rotate-180 text-amber-400' : 'text-stone-500'
                }`}
              />
            </button>

            {/* Tools Dropdown Menu */}
            {showToolsMenu && (
              <div
                className="absolute left-0 mt-1 w-80 max-w-[calc(100vw-2rem)] bg-stone-900 border border-stone-800 rounded-xl shadow-2xl py-2 px-1 z-50 divide-y divide-stone-800/60"
                onMouseLeave={() => setShowToolsMenu(false)}
              >
                <div className="px-3 py-1.5 text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
                  Deep-Dive Operational Modules
                </div>

                <div className="py-1 space-y-0.5">
                  {MORE_TOOLS.map((tool) => {
                    const IconComponent = tool.icon;
                    const isSelected = activeTab === tool.id;

                    return (
                      <button
                        key={tool.id}
                        id={`tab-${tool.id}`}
                        onClick={() => {
                          setActiveTab(tool.id);
                          setShowToolsMenu(false);
                        }}
                        className={`w-full text-left px-3 py-2.5 rounded-lg flex items-start gap-3 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                            : 'hover:bg-stone-800/80 text-stone-300'
                        }`}
                      >
                        <div
                          className={`p-1.5 rounded-md mt-0.5 ${
                            isSelected
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-stone-800 text-stone-400'
                          }`}
                        >
                          <IconComponent className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-xs text-white flex items-center justify-between">
                            <span>{tool.name}</span>
                            {isSelected && (
                              <span className="text-[10px] text-amber-400 font-bold bg-amber-950 px-1.5 py-0.2 rounded border border-amber-800">
                                Active
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-stone-400 line-clamp-1 mt-0.5">
                            {tool.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick return button if manager is in a secondary tool */}
        {activeTab !== 'forecast' && (
          <button
            onClick={() => setActiveTab('forecast')}
            className="shrink-0 text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1.5 font-medium py-1 px-2.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-colors cursor-pointer whitespace-nowrap"
          >
            <span className="sm:hidden">← Forecast</span>
            <span className="hidden sm:inline">← Return to Forecast</span>
          </button>
        )}
      </div>
    </header>
  );
};
