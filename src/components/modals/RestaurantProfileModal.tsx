import React, { useState } from 'react';
import { RestaurantProfile, StaffRole, ServiceStyle } from '../../types';
import { Store, DollarSign, Users, Sliders, X, Check, AlertTriangle } from 'lucide-react';
import { validateForm, FieldCheck } from '../../lib/formValidation';
import { useModalDialog } from '../../lib/useModalDialog';

interface RestaurantProfileModalProps {
  profile: RestaurantProfile;
  onSave: (updated: RestaurantProfile) => void;
  onClose: () => void;
}

/** Valid Service Model values the dropdown offers. */
const SERVICE_STYLES: ServiceStyle[] = [
  'FULL_SERVICE',
  'FAST_CASUAL',
  'PIZZERIA',
  'BISTRO',
  'COUNTER_SERVICE',
  'BAR_TAPROOM',
];

/**
 * Map a persisted serviceStyle onto a value the dropdown can actually show.
 * Older builds let users save strings that were never in the ServiceStyle union
 * (CASUAL_DINING / FINE_DINING / BAR_LOUNGE); left alone they render the <select>
 * blank and get re-saved as-is. Normalise on open so the field is never blank and
 * every Save writes a valid value. The engine already treats all of these as
 * full-service, so behaviour is unchanged.
 */
function normalizeServiceStyle(style: string | undefined): ServiceStyle {
  if (style && SERVICE_STYLES.includes(style as ServiceStyle)) {
    return style as ServiceStyle;
  }
  const legacy: Record<string, ServiceStyle> = {
    CASUAL_DINING: 'FULL_SERVICE',
    FINE_DINING: 'BISTRO',
    BAR_LOUNGE: 'BAR_TAPROOM',
  };
  return legacy[style ?? ''] ?? 'FULL_SERVICE';
}

export const RestaurantProfileModal: React.FC<RestaurantProfileModalProps> = ({
  profile,
  onSave,
  onClose,
}) => {
  const [form, setForm] = useState<RestaurantProfile>({
    ...profile,
    serviceStyle: normalizeServiceStyle(profile.serviceStyle),
  });
  const [formError, setFormError] = useState<string | null>(null);
  const panelRef = useModalDialog(onClose);

  /**
   * Parse a numeric <input> value, keeping the supplied fallback only when the
   * field is empty / mid-edit (NaN). Critically this still lets the user type a
   * literal "0" or "0.5" -- the old `parseFloat(x) || fallback` swallowed any
   * falsy result and snapped the field back to a magic constant, making some
   * values impossible to enter and hiding invalid input from submit validation.
   */
  const parseNum = (raw: string, fallback: number): number => {
    const n = parseFloat(raw);
    return Number.isNaN(n) ? fallback : n;
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    const wageChecks: FieldCheck[] = (Object.keys(form.wageRates) as StaffRole[]).map(
      (role) => ({
        label: `${role.replace('Cooks', ' cook')} wage rate`,
        value: form.wageRates[role],
        required: true,
        nonNegative: true,
      })
    );

    const validationError = validateForm([
      { label: 'Restaurant name', value: form.name, required: true },
      { label: 'Concept / cuisine', value: form.concept, required: true },
      { label: 'Location / neighborhood', value: form.location, required: true },
      { label: 'Average check size', value: form.averageCheckSize, required: true, positive: true },
      { label: 'Target labor cost %', value: form.targetLaborPercentage, required: true, positive: true, max: 100 },
      { label: 'Dining room seats', value: form.seatCount, required: true, positive: true },
      ...(form.hasPatio ? [{ label: 'Patio seats', value: form.patioSeats, nonNegative: true }] : []),
      ...wageChecks,
      { label: 'Fixed prep hours', value: form.fixedHoursConfig?.prepCookFixedHours, nonNegative: true },
      { label: 'Prep floor headcount', value: form.fixedHoursConfig?.fixedPrepCookHeadcount, positive: true },
      { label: 'Closing sanitation hours', value: form.fixedHoursConfig?.closingDishwasherFixedHours, nonNegative: true },
      { label: 'Closing dish headcount', value: form.fixedHoursConfig?.fixedClosingDishwasherHeadcount, positive: true },
      { label: 'Covers / server', value: form.productivity.coversPerServer, required: true, positive: true },
      { label: 'Covers / line cook', value: form.productivity.coversPerLineCook, required: true, positive: true },
      { label: 'Covers / bartender', value: form.productivity.coversPerBartender, required: true, positive: true },
    ]);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);

    onSave(form);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="restaurant-settings-title"
        tabIndex={-1}
        className="bg-stone-900 border border-stone-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto outline-none"
      >
        <div className="flex items-center justify-between pb-3 border-b border-stone-800">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Store className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h3 id="restaurant-settings-title" className="text-base font-bold text-white">Restaurant Operational Parameters</h3>
              <p className="text-xs text-stone-400">
                Calibrate seating capacity, wage rates, check size, and labor targets
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close restaurant settings"
            className="p-1 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4 text-xs" noValidate>
          {formError && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-800/80 bg-rose-950/60 px-3 py-2 text-rose-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* General info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="rp-name" className="block text-stone-300 font-semibold mb-1">Restaurant Name</label>
              <input
                id="rp-name"
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200"
              />
            </div>
            <div>
              <label htmlFor="rp-concept" className="block text-stone-300 font-semibold mb-1">Concept / Cuisine</label>
              <input
                id="rp-concept"
                type="text"
                required
                value={form.concept}
                onChange={(e) => setForm({ ...form, concept: e.target.value })}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200"
              />
            </div>
          </div>

          <div>
            <label htmlFor="rp-location" className="block text-stone-300 font-semibold mb-1">
              Location / Neighborhood
            </label>
            <input
              id="rp-location"
              type="text"
              required
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="e.g. Austin, TX - Downtown"
              className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200"
            />
          </div>

          {/* Service Style & Operational Configuration */}
          <div className="pt-2 border-t border-stone-800 space-y-3">
            <div className="text-xs font-bold text-stone-300 uppercase tracking-wider">
              Service Style & Operational Roles
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="rp-service-model" className="block text-stone-300 font-semibold mb-1">Service Model</label>
                <select
                  id="rp-service-model"
                  value={form.serviceStyle || 'FULL_SERVICE'}
                  onChange={(e) => {
                    const style = e.target.value as ServiceStyle;
                    const isCounter = style === 'FAST_CASUAL' || style === 'COUNTER_SERVICE';
                    setForm({
                      ...form,
                      serviceStyle: style,
                      hasBar: isCounter ? false : form.hasBar,
                      hasHostStand: isCounter ? false : form.hasHostStand,
                    });
                  }}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200"
                >
                  <option value="FULL_SERVICE">Full Service Dining</option>
                  <option value="FAST_CASUAL">Fast-Casual / Counter Service</option>
                  <option value="PIZZERIA">Casual Dining & Pizzeria</option>
                  <option value="BISTRO">Fine Dining & Bistro</option>
                  <option value="COUNTER_SERVICE">Quick Counter Service</option>
                  <option value="BAR_TAPROOM">Bar & Taproom</option>
                </select>
              </div>

              <div className="flex flex-col justify-center gap-2 pt-1">
                <label className="flex items-center gap-2 text-stone-200 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.hasBar ?? true}
                    onChange={(e) => {
                      const hasBar = e.target.checked;
                      const enabledRoles = hasBar
                        ? Array.from(new Set([...(form.enabledRoles || []), 'bartenders' as StaffRole]))
                        : (form.enabledRoles || []).filter((r) => r !== 'bartenders');
                      setForm({ ...form, hasBar, enabledRoles });
                    }}
                    className="rounded accent-amber-500 w-4 h-4"
                  />
                  <span>Has Bar / Taproom Program</span>
                </label>

                <label className="flex items-center gap-2 text-stone-200 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.hasHostStand ?? true}
                    onChange={(e) => {
                      const hasHostStand = e.target.checked;
                      const enabledRoles = hasHostStand
                        ? Array.from(new Set([...(form.enabledRoles || []), 'hosts' as StaffRole]))
                        : (form.enabledRoles || []).filter((r) => r !== 'hosts');
                      setForm({ ...form, hasHostStand, enabledRoles });
                    }}
                    className="rounded accent-amber-500 w-4 h-4"
                  />
                  <span>Has Dedicated Host Stand</span>
                </label>
              </div>
            </div>
          </div>

          {/* Core Economics */}
          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-stone-800">
            <div>
              <label htmlFor="rp-check-size" className="block text-stone-300 font-semibold mb-1">
                Average Check Size ($)
              </label>
              <input
                id="rp-check-size"
                type="number"
                step="0.5"
                min="0"
                required
                value={form.averageCheckSize}
                onChange={(e) =>
                  setForm({ ...form, averageCheckSize: parseNum(e.target.value, form.averageCheckSize) })
                }
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200"
              />
            </div>

            <div>
              <label htmlFor="rp-target-labor" className="block text-stone-300 font-semibold mb-1">
                Target Labor Cost %
              </label>
              <input
                id="rp-target-labor"
                type="number"
                step="0.5"
                min="0"
                max="100"
                required
                value={form.targetLaborPercentage}
                onChange={(e) =>
                  setForm({ ...form, targetLaborPercentage: parseNum(e.target.value, form.targetLaborPercentage) })
                }
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200"
              />
            </div>

            <div>
              <label htmlFor="rp-seats" className="block text-stone-300 font-semibold mb-1">
                Dining Room Seats
              </label>
              <input
                id="rp-seats"
                type="number"
                min="0"
                required
                value={form.seatCount}
                onChange={(e) =>
                  setForm({ ...form, seatCount: parseNum(e.target.value, form.seatCount) })
                }
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200"
              />
            </div>
          </div>

          {/* Patio */}
          <div className="flex items-center gap-4 bg-stone-950/60 p-3 rounded-xl border border-stone-800">
            <label className="flex items-center gap-2 text-stone-200 font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={form.hasPatio}
                onChange={(e) => setForm({ ...form, hasPatio: e.target.checked })}
                className="rounded accent-amber-500 w-4 h-4"
              />
              <span>Has Outdoor Patio Seating</span>
            </label>
            {form.hasPatio && (
              <div className="flex items-center gap-2">
                <label htmlFor="rp-patio-seats" className="text-stone-400">Patio Seats:</label>
                <input
                  id="rp-patio-seats"
                  type="number"
                  min="0"
                  value={form.patioSeats}
                  onChange={(e) =>
                    setForm({ ...form, patioSeats: parseNum(e.target.value, form.patioSeats ?? 0) })
                  }
                  className="w-20 bg-stone-950 border border-stone-800 rounded-lg px-2 py-1 text-stone-200"
                />
              </div>
            )}
          </div>

          {/* Wage Rates & Wage Type by Role (Tipped vs Non-Tipped) */}
          <div className="pt-2 border-t border-stone-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-stone-300 uppercase tracking-wider">
                Wage Structure & Tipped Wage Classification
              </div>
              <span className="text-[10px] text-amber-400 font-medium bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/40">
                Direct Wage Liability Engine
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-stone-950 border border-stone-800 text-[11px] text-stone-300 space-y-1">
              <p className="font-semibold text-amber-300 flex items-center gap-1.5">
                <span>⚖️</span> Tipped vs. Non-Tipped Wage Accuracy Rule
              </p>
              <p className="text-stone-400 leading-relaxed text-[11px]">
                Full-service restaurants pay tipped roles (servers, bartenders, bussers) a sub-minimum direct employer cash wage (e.g. $10/hr) with customer tips making up the rest. Back-of-house roles (line cooks, prep cooks, dishwashers) earn a full flat hourly rate (e.g. $22–$24/hr). Classifying wage types ensures server labor is not artificially inflated and kitchen labor is not understated.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {(Object.keys(form.wageRates) as StaffRole[]).map((role) => {
                const currentWageType = form.wageTypes?.[role] || (
                  ['servers', 'bartenders', 'bussers'].includes(role) && form.serviceStyle !== 'FAST_CASUAL'
                    ? 'TIPPED'
                    : 'NON_TIPPED'
                );
                const isTipped = currentWageType === 'TIPPED';

                return (
                  <div
                    key={role}
                    className={`p-2.5 rounded-xl border transition-all ${
                      isTipped
                        ? 'bg-amber-950/15 border-amber-600/30'
                        : 'bg-stone-950 border-stone-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor={`rp-wage-${role}`} className="text-[11px] font-semibold text-stone-200 capitalize">
                        {role.replace('Cooks', ' Cook')}
                      </label>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                          isTipped
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-stone-800 text-stone-300'
                        }`}
                      >
                        {isTipped ? 'Tipped Direct' : 'Flat Wage'}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div>
                        <div className="flex justify-between text-[10px] text-stone-400 mb-0.5">
                          <span>{isTipped ? 'Direct Cash Wage' : 'Hourly Rate'}:</span>
                          <span className="text-stone-300 font-mono">${form.wageRates[role]}/hr</span>
                        </div>
                        <input
                          id={`rp-wage-${role}`}
                          type="number"
                          step="0.5"
                          min="0"
                          value={form.wageRates[role]}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              wageRates: {
                                ...form.wageRates,
                                [role]: parseNum(e.target.value, form.wageRates[role]),
                              },
                            })
                          }
                          className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2 py-1 text-stone-200 text-xs font-mono"
                        />
                      </div>

                      <div>
                        <label htmlFor={`rp-wagetype-${role}`} className="block text-[10px] text-stone-400 mb-0.5">Wage Type:</label>
                        <select
                          id={`rp-wagetype-${role}`}
                          value={currentWageType}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              wageTypes: {
                                ...(form.wageTypes || {}),
                                [role]: e.target.value as 'TIPPED' | 'NON_TIPPED',
                              },
                            })
                          }
                          className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2 py-1 text-stone-200 text-[11px]"
                        >
                          <option value="TIPPED">Tipped (Sub-Min + Tips)</option>
                          <option value="NON_TIPPED">Non-Tipped (Flat Hourly)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Fixed Prep & Closing Sanitation Time Blocks */}
          <div className="pt-2 border-t border-stone-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-stone-300 uppercase tracking-wider">
                Fixed Prep & Closing Sanitation Time Blocks
              </div>
              <span className="text-[10px] text-emerald-400 font-medium bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                Fixed Headcount Floor
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-stone-950 border border-stone-800 text-[11px] text-stone-300 space-y-1">
              <p className="font-semibold text-emerald-300 flex items-center gap-1.5">
                <span>⏱️</span> Fixed Hours Operational Reality
              </p>
              <p className="text-stone-400 leading-relaxed text-[11px]">
                Prep cooks arrive 2–3 hours prior to doors opening to prep stocks, butchery, and mise en place regardless of whether 30 or 150 guests visit that day. Likewise, closing dishwashers remain 1–2 hours after kitchen shutdown for scrub-down and sanitation. Modeling these fixed hours prevents under-budgeting labor on low-cover days.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-200">
                    Pre-Opening Prep Cook Hours
                  </span>
                  <span className="text-[10px] font-mono bg-stone-800 px-1.5 py-0.5 rounded text-amber-300">
                    +{form.fixedHoursConfig?.prepCookFixedHours ?? 2.5} hrs before service
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="rp-prep-hours" className="block text-[10px] text-stone-400 mb-1">
                      Fixed Prep Hours:
                    </label>
                    <input
                      id="rp-prep-hours"
                      type="number"
                      step="0.5"
                      min="0"
                      max="6"
                      value={form.fixedHoursConfig?.prepCookFixedHours ?? 2.5}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          fixedHoursConfig: {
                            prepCookFixedHours: parseNum(
                              e.target.value,
                              form.fixedHoursConfig?.prepCookFixedHours ?? 2.5
                            ),
                            closingDishwasherFixedHours:
                              form.fixedHoursConfig?.closingDishwasherFixedHours ?? 1.5,
                            fixedPrepCookHeadcount:
                              form.fixedHoursConfig?.fixedPrepCookHeadcount ?? 1,
                            fixedClosingDishwasherHeadcount:
                              form.fixedHoursConfig?.fixedClosingDishwasherHeadcount ?? 1,
                          },
                        })
                      }
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2 py-1 text-stone-200 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label htmlFor="rp-prep-headcount" className="block text-[10px] text-stone-400 mb-1">
                      Prep Floor Headcount:
                    </label>
                    <input
                      id="rp-prep-headcount"
                      type="number"
                      min="1"
                      max="4"
                      value={form.fixedHoursConfig?.fixedPrepCookHeadcount ?? 1}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          fixedHoursConfig: {
                            prepCookFixedHours:
                              form.fixedHoursConfig?.prepCookFixedHours ?? 2.5,
                            closingDishwasherFixedHours:
                              form.fixedHoursConfig?.closingDishwasherFixedHours ?? 1.5,
                            fixedPrepCookHeadcount: parseNum(
                              e.target.value,
                              form.fixedHoursConfig?.fixedPrepCookHeadcount ?? 1
                            ),
                            fixedClosingDishwasherHeadcount:
                              form.fixedHoursConfig?.fixedClosingDishwasherHeadcount ?? 1,
                          },
                        })
                      }
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2 py-1 text-stone-200 font-mono text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-200">
                    Post-Close Dish Sanitation Hours
                  </span>
                  <span className="text-[10px] font-mono bg-stone-800 px-1.5 py-0.5 rounded text-amber-300">
                    +{form.fixedHoursConfig?.closingDishwasherFixedHours ?? 1.5} hrs after close
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="rp-close-hours" className="block text-[10px] text-stone-400 mb-1">
                      Closing Sanitation Hours:
                    </label>
                    <input
                      id="rp-close-hours"
                      type="number"
                      step="0.5"
                      min="0"
                      max="4"
                      value={form.fixedHoursConfig?.closingDishwasherFixedHours ?? 1.5}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          fixedHoursConfig: {
                            prepCookFixedHours:
                              form.fixedHoursConfig?.prepCookFixedHours ?? 2.5,
                            closingDishwasherFixedHours: parseNum(
                              e.target.value,
                              form.fixedHoursConfig?.closingDishwasherFixedHours ?? 1.5
                            ),
                            fixedPrepCookHeadcount:
                              form.fixedHoursConfig?.fixedPrepCookHeadcount ?? 1,
                            fixedClosingDishwasherHeadcount:
                              form.fixedHoursConfig?.fixedClosingDishwasherHeadcount ?? 1,
                          },
                        })
                      }
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2 py-1 text-stone-200 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label htmlFor="rp-close-headcount" className="block text-[10px] text-stone-400 mb-1">
                      Closing Dish Headcount:
                    </label>
                    <input
                      id="rp-close-headcount"
                      type="number"
                      min="1"
                      max="4"
                      value={form.fixedHoursConfig?.fixedClosingDishwasherHeadcount ?? 1}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          fixedHoursConfig: {
                            prepCookFixedHours:
                              form.fixedHoursConfig?.prepCookFixedHours ?? 2.5,
                            closingDishwasherFixedHours:
                              form.fixedHoursConfig?.closingDishwasherFixedHours ?? 1.5,
                            fixedPrepCookHeadcount:
                              form.fixedHoursConfig?.fixedPrepCookHeadcount ?? 1,
                            fixedClosingDishwasherHeadcount: parseNum(
                              e.target.value,
                              form.fixedHoursConfig?.fixedClosingDishwasherHeadcount ?? 1
                            ),
                          },
                        })
                      }
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2 py-1 text-stone-200 font-mono text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Station Productivity Standards */}
          <div className="pt-2 border-t border-stone-800 space-y-2">
            <div className="text-xs font-bold text-stone-300 uppercase tracking-wider">
              Productivity Standards (Covers Handled Per Shift)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div>
                <label htmlFor="rp-cps" className="block text-[11px] text-stone-400 mb-1">Covers / Server</label>
                <input
                  id="rp-cps"
                  type="number"
                  min="1"
                  value={form.productivity.coversPerServer}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      productivity: {
                        ...form.productivity,
                        coversPerServer: parseNum(e.target.value, form.productivity.coversPerServer),
                      },
                    })
                  }
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg px-2 py-1 text-stone-200"
                />
              </div>

              <div>
                <label htmlFor="rp-cplc" className="block text-[11px] text-stone-400 mb-1">Covers / Line Cook</label>
                <input
                  id="rp-cplc"
                  type="number"
                  min="1"
                  value={form.productivity.coversPerLineCook}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      productivity: {
                        ...form.productivity,
                        coversPerLineCook: parseNum(e.target.value, form.productivity.coversPerLineCook),
                      },
                    })
                  }
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg px-2 py-1 text-stone-200"
                />
              </div>

              <div>
                <label htmlFor="rp-cpb" className="block text-[11px] text-stone-400 mb-1">Covers / Bartender</label>
                <input
                  id="rp-cpb"
                  type="number"
                  min="1"
                  value={form.productivity.coversPerBartender}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      productivity: {
                        ...form.productivity,
                        coversPerBartender: parseNum(e.target.value, form.productivity.coversPerBartender),
                      },
                    })
                  }
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg px-2 py-1 text-stone-200"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-stone-800 text-stone-300 hover:bg-stone-700 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-amber-500 text-stone-950 font-bold hover:bg-amber-400"
            >
              Save Profile & Recalculate
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
