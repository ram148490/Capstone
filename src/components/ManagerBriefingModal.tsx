import React, { useState } from 'react';
import { DayForecast, RestaurantProfile, ManagerBriefingData } from '../types';
import { FileText, Sparkles, Check, Copy, Flame, Users, Wine, Clock, X } from 'lucide-react';

interface ManagerBriefingModalProps {
  day: DayForecast;
  restaurantProfile: RestaurantProfile;
  onClose: () => void;
}

export const ManagerBriefingModal: React.FC<ManagerBriefingModalProps> = ({
  day,
  restaurantProfile,
  onClose,
}) => {
  const [briefing, setBriefing] = useState<ManagerBriefingData>({
    managerFocus: `Manage seating turn-times tightly around the ${
      day.events.length > 0 ? day.events[0].title : 'expected peak rush'
    } while preserving high guest satisfaction and ticket pace.`,
    prepPriorities: [
      `Complete all morning line prep pars and portioning before 11:00 AM.`,
      `Stock hot station with 30% higher par on top-selling entrees and signature sides.`,
      `Prep extra salad bases, dressings, and desserts for peak dinner walk-ins.`,
    ],
    fohDirectives: [
      `Host Stand: Greet guests immediately with accurate wait quotes; protect reserved sections during peak.`,
      `Service Team: Suggest popular house appetizers and beverage pairings on initial greet.`,
    ],
    bohDirectives: [
      `Line Cooks: Maintain continuous ticket staging during the main rush to prevent station bottlenecks.`,
      `Dish & Utility: Keep sauté pans, skillets, and tableware cycling smoothly without turnaround delays.`,
    ],
    rushWindows: [
      day.events.length > 0 && day.events[0].rushWindow
        ? day.events[0].rushWindow
        : 'Primary dinner surge: 6:00 PM - 8:15 PM',
      'Midday lunch peak: 12:00 PM - 1:30 PM',
    ],
    upsellFocus:
      'Feature the signature house special entree and seasonal dessert combo.',
  });

  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerateAIBriefing = async () => {
    setIsLoadingAI(true);
    try {
      const res = await fetch('/api/briefing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dayForecast: day,
          restaurantProfile,
        }),
      });
      const data = await res.json();
      if (data.success && data.briefing) {
        setBriefing(data.briefing);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingAI(false);
    }
  };

  const copyBriefingText = () => {
    const text = `PRE-SHIFT GM BRIEFING - ${restaurantProfile.name.toUpperCase()}
Date: ${day.dayOfWeek} (${day.date}) | Covers: ${day.covers} | Est Sales: $${day.projectedSales.toLocaleString()}
Events: ${day.eventsImpact} | Weather: ${day.weatherImpact}

🎯 MANAGER FOCUS:
${briefing.managerFocus}

⏱️ RUSH WINDOWS:
${briefing.rushWindows.map((r) => `• ${r}`).join('\n')}

🔪 PREP & KITCHEN PRIORITIES:
${briefing.prepPriorities.map((p) => `• ${p}`).join('\n')}

🍷 FOH & HOST STAND DIRECTIVES:
${briefing.fohDirectives.map((f) => `• ${f}`).join('\n')}

🔥 BOH & LINE COOK DIRECTIVES:
${briefing.bohDirectives.map((b) => `• ${b}`).join('\n')}

💡 UPSELL FOCUS:
${briefing.upsellFocus}
`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-stone-800">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Daily Manager Pre-Shift Briefing
              </h3>
              <p className="text-xs text-stone-400">
                {day.dayOfWeek} ({day.date}) • {day.covers} Projected Covers • $
                {day.projectedSales.toLocaleString()} Sales
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerateAIBriefing}
              disabled={isLoadingAI}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 transition-colors disabled:opacity-40"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isLoadingAI ? 'Generating with AI...' : 'Refresh with AI'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Manager Core Focus */}
        <div className="bg-amber-950/20 border border-amber-500/30 p-3.5 rounded-xl space-y-1">
          <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
            Executive Shift Focus
          </div>
          <p className="text-xs font-medium text-stone-200 leading-relaxed">
            {briefing.managerFocus}
          </p>
        </div>

        {/* Rush Windows */}
        <div className="bg-stone-950/70 p-3.5 rounded-xl border border-stone-800 space-y-2">
          <div className="text-[11px] font-bold text-stone-300 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            Expected Peak Rush Windows
          </div>
          <ul className="space-y-1 text-xs text-stone-300">
            {briefing.rushWindows.map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Prep & Directives Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Prep Priorities */}
          <div className="bg-stone-950/70 p-3.5 rounded-xl border border-stone-800 space-y-2">
            <div className="text-[11px] font-bold text-stone-300 uppercase tracking-wider flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-rose-400" />
              Kitchen Prep Priorities
            </div>
            <ul className="space-y-1 text-xs text-stone-300">
              {briefing.prepPriorities.map((p, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-rose-400 font-bold">•</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* FOH Directives */}
          <div className="bg-stone-950/70 p-3.5 rounded-xl border border-stone-800 space-y-2">
            <div className="text-[11px] font-bold text-stone-300 uppercase tracking-wider flex items-center gap-1.5">
              <Wine className="w-3.5 h-3.5 text-purple-400" />
              FOH & Service Directives
            </div>
            <ul className="space-y-1 text-xs text-stone-300">
              {briefing.fohDirectives.map((f, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-purple-400 font-bold">•</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Upsell Special */}
        <div className="bg-emerald-950/20 border border-emerald-800/40 p-3 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold text-emerald-400 uppercase">
              Shift Upsell & Margin Focus
            </div>
            <div className="text-xs text-stone-200 mt-0.5">{briefing.upsellFocus}</div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-stone-800">
          <button
            onClick={copyBriefingText}
            className="px-4 py-2 rounded-xl bg-stone-800 text-stone-200 hover:bg-stone-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Briefing Text</span>
              </>
            )}
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-amber-500 text-stone-950 font-bold hover:bg-amber-400 text-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
