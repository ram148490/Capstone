import React, { useState } from 'react';
import {
  Employee,
  StaffRole,
  WeeklyForecastSummary,
  ShiftAssignment,
  RestaurantProfile,
  WageType,
} from '../../types';
import {
  Users,
  UserPlus,
  Sparkles,
  Printer,
  Download,
  AlertCircle,
  CheckCircle,
  Clock,
  Phone,
  Flame,
  Wine,
  Utensils,
  Trash2,
  Edit2,
  DollarSign,
} from 'lucide-react';
import { generateScheduleCSV, generateKitchenScheduleText } from '../../lib/calendarUtils';
import { getRoleShiftHours, isTippedRole } from '../../lib/staffingEngine';
import { validateForm } from '../../lib/formValidation';
import { useModalDialog } from '../../lib/useModalDialog';

interface TeamScheduleBuilderProps {
  roster: Employee[];
  forecast: WeeklyForecastSummary;
  assignments: ShiftAssignment[];
  onUpdateAssignments: (assignments: ShiftAssignment[]) => void;
  onAddEmployee: (emp: Employee) => void;
  onDeleteEmployee: (empId: string) => void;
  currentProfile: RestaurantProfile;
}

export const TeamScheduleBuilder: React.FC<TeamScheduleBuilderProps> = ({
  roster,
  forecast,
  assignments,
  onUpdateAssignments,
  onAddEmployee,
  onDeleteEmployee,
  currentProfile,
}) => {
  const [showAddEmpModal, setShowAddEmpModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const addEmpModalRef = useModalDialog(() => setShowAddEmpModal(false), showAddEmpModal);
  const printModalRef = useModalDialog(() => setShowPrintModal(false), showPrintModal);
  const [empFormError, setEmpFormError] = useState<string | null>(null);

  // New Employee Form
  const [empName, setEmpName] = useState('');
  const [empRole, setEmpRole] = useState<StaffRole>('servers');
  const [empWageType, setEmpWageType] = useState<WageType>(
    currentProfile.wageTypes?.['servers'] || (currentProfile.serviceStyle !== 'FAST_CASUAL' ? 'TIPPED' : 'NON_TIPPED')
  );
  const [empWage, setEmpWage] = useState(
    currentProfile.wageRates?.['servers'] || 10
  );
  const [empTipEstimate, setEmpTipEstimate] = useState(20);
  const [empMaxHours, setEmpMaxHours] = useState(35);
  const [empPhone, setEmpPhone] = useState('(512) 555-0199');

  // Update defaults when role changes in modal
  const handleRoleChange = (newRole: StaffRole) => {
    setEmpRole(newRole);
    const suggestedWageType = isTippedRole(newRole, currentProfile) ? 'TIPPED' : 'NON_TIPPED';
    setEmpWageType(suggestedWageType);
    setEmpWage(currentProfile.wageRates[newRole] || (suggestedWageType === 'TIPPED' ? 10 : 22));
  };

  // Compute total weekly assigned hours for each employee
  const employeeHoursMap: Record<string, number> = {};
  roster.forEach((emp) => {
    employeeHoursMap[emp.id] = 0;
  });

  assignments.forEach((a) => {
    if (employeeHoursMap[a.employeeId] !== undefined) {
      employeeHoursMap[a.employeeId] += a.hours;
    }
  });

  // 1-Click Auto Assign Algorithm with Role-Specific Fixed Hours & Wage-Type Awareness
  const handleAutoAssign = () => {
    const newAssignments: ShiftAssignment[] = [];
    const tracker: Record<string, number> = {};
    roster.forEach((e) => (tracker[e.id] = 0));

    forecast.days.forEach((day) => {
      day.shifts.forEach((shift) => {
        const isLunch = shift.name.toLowerCase().includes('lunch');

        (Object.keys(shift.recommendedStaff) as StaffRole[]).forEach((role) => {
          const neededCount = shift.recommendedStaff[role] || 0;
          let assignedForRole = 0;

          // Calculate exact role hours taking into account prep cooks' fixed opening hours & dishwashers' fixed closing sanitation
          const roleHours = getRoleShiftHours(
            role,
            shift.durationHours,
            currentProfile.fixedHoursConfig
          ).hours;

          // Find eligible employees
          const candidates = roster
            .filter((emp) => {
              const matchesRole =
                emp.primaryRole === role || emp.secondaryRoles.includes(role);
              const avail = emp.availability[day.dayOfWeek] || 'ANY';
              const isAvailable =
                avail === 'ANY' ||
                (isLunch ? avail === 'LUNCH' : avail === 'DINNER');
              const maxAllowed = emp.maxHoursPerWeek || 40;
              const notOverbooked = (tracker[emp.id] || 0) + roleHours <= maxAllowed;
              return matchesRole && isAvailable && notOverbooked;
            })
            .sort((a, b) => (tracker[a.id] || 0) - (tracker[b.id] || 0)); // prioritize least loaded

          for (const cand of candidates) {
            if (assignedForRole >= neededCount) break;

            // Check if already assigned to this specific shift
            const alreadyAssignedThisShift = newAssignments.some(
              (na) =>
                na.date === day.date &&
                na.shiftName === shift.name &&
                na.employeeId === cand.id
            );

            if (!alreadyAssignedThisShift) {
              // Employee's wage type is a fixed property of the employee, never flipping per shift
              const effectiveWageType =
                cand.wageType ||
                (isTippedRole(cand.primaryRole, currentProfile) ? 'TIPPED' : 'NON_TIPPED');

              newAssignments.push({
                id: `asg-${day.date}-${shift.name}-${cand.id}-${Date.now()}`,
                date: day.date,
                shiftName: shift.name,
                role,
                employeeId: cand.id,
                employeeName: cand.name,
                wageType: effectiveWageType,
                hourlyWage: cand.hourlyWage,
                hours: roleHours,
                fixedHours:
                  role === 'prepCooks'
                    ? (currentProfile.fixedHoursConfig?.prepCookFixedHours ?? 2.5)
                    : role === 'dishwashers'
                    ? (currentProfile.fixedHoursConfig?.closingDishwasherFixedHours ?? 1.5)
                    : 0,
                cost: Number((cand.hourlyWage * roleHours).toFixed(2)),
              });
              tracker[cand.id] = (tracker[cand.id] || 0) + roleHours;
              assignedForRole++;
            }
          }
        });
      });
    });

    onUpdateAssignments(newAssignments);
  };

  const handleCreateEmployee = (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateForm([
      { label: 'Full name', value: empName, required: true },
      { label: empWageType === 'TIPPED' ? 'Direct employer wage' : 'Flat hourly rate', value: empWage, required: true, positive: true },
      ...(empWageType === 'TIPPED'
        ? [{ label: 'Expected tips', value: empTipEstimate, nonNegative: true }]
        : []),
      { label: 'Max hours / week', value: empMaxHours, required: true, positive: true, max: 168 },
    ]);
    if (validationError) {
      setEmpFormError(validationError);
      return;
    }
    setEmpFormError(null);

    const newEmp: Employee = {
      id: `emp-${Date.now()}`,
      name: empName,
      primaryRole: empRole,
      secondaryRoles: [],
      wageType: empWageType,
      hourlyWage: Number(empWage),
      tipEstimate: empWageType === 'TIPPED' ? Number(empTipEstimate) : undefined,
      maxHoursPerWeek: Number(empMaxHours),
      phone: empPhone,
      availability: {
        Monday: 'ANY',
        Tuesday: 'ANY',
        Wednesday: 'ANY',
        Thursday: 'ANY',
        Friday: 'ANY',
        Saturday: 'ANY',
        Sunday: 'ANY',
      },
    };

    onAddEmployee(newEmp);
    setShowAddEmpModal(false);
    setEmpName('');
  };

  const handleDownloadCSV = () => {
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

  return (
    <div className="space-y-6 pb-12">
      {/* Top Roster & Shift Action Ribbon */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-400 shrink-0" />
                <span>Schedule Sync & Team Roster Builder</span>
              </h2>
              <span className="text-[10px] font-semibold uppercase tracking-wider bg-stone-800 text-stone-300 border border-stone-700 px-2 py-0.5 rounded-md">
                7shifts & HotSchedules Compatible
              </span>
            </div>
            <p className="text-xs text-stone-300">
              ShiftCast v1 calculates demand-driven headcount by station. This module maps your staff roster to recommended shift requirements with 1-click CSV export for your external scheduling system.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              id="btn-auto-assign"
              onClick={handleAutoAssign}
              className="text-xs font-bold bg-amber-500 hover:bg-amber-400 text-stone-950 px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-colors shadow"
            >
              <Sparkles className="w-4 h-4" />
              <span>1-Click Auto-Assign Shifts</span>
            </button>

            <button
              onClick={() => {
                setEmpFormError(null);
                setShowAddEmpModal(true);
              }}
              className="text-xs font-semibold bg-stone-800 hover:bg-stone-700 text-stone-200 px-3 py-2 rounded-xl border border-stone-700 flex items-center gap-1.5 transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5 text-blue-400" />
              <span>Add Staff</span>
            </button>

            <button
              onClick={() => setShowPrintModal(true)}
              className="text-xs font-semibold bg-stone-800 hover:bg-stone-700 text-stone-200 px-3 py-2 rounded-xl border border-stone-700 flex items-center gap-1.5 transition-colors"
            >
              <Printer className="w-3.5 h-3.5 text-emerald-400" />
              <span>Print Pinboard</span>
            </button>

            <button
              onClick={handleDownloadCSV}
              className="text-xs font-semibold bg-stone-800 hover:bg-stone-700 text-stone-200 px-3 py-2 rounded-xl border border-stone-700 flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Export CSV (Toast/7shifts)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Staff Roster Cards & Workload Balance */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">Staff Roster & Weekly Assigned Hours</h3>
          <span className="text-xs bg-stone-800 text-stone-300 px-2 py-0.5 rounded-full font-medium">
            {roster.length} Active Employees
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {roster.map((emp) => {
            const assignedHours = employeeHoursMap[emp.id] || 0;
            const isOvertime = assignedHours > 40;
            const isNearMax = assignedHours >= emp.maxHoursPerWeek;
            const isTipped = emp.wageType === 'TIPPED' || (
              !emp.wageType && isTippedRole(emp.primaryRole, currentProfile)
            );

            return (
              <div
                key={emp.id}
                className="bg-stone-950/70 p-3.5 rounded-xl border border-stone-800 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white line-clamp-1">{emp.name}</span>
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

                  <div className="flex items-center gap-1.5 text-[11px] text-stone-400 mt-1">
                    <span className="font-semibold text-stone-300">
                      {emp.primaryRole.replace('Cooks', ' Cook')}
                    </span>
                    <span>•</span>
                    <span className="font-mono text-stone-200">${emp.hourlyWage}/hr</span>
                    {isTipped && emp.tipEstimate && (
                      <span className="text-[10px] text-amber-400/80">
                        (+${emp.tipEstimate} tips)
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-stone-400 mt-0.5">
                    Max: {emp.maxHoursPerWeek}h/wk
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-stone-800/80 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-stone-400 uppercase">Assigned</div>
                    <div
                      className={`text-sm font-extrabold flex items-center gap-1 ${
                        isOvertime
                          ? 'text-rose-400'
                          : isNearMax
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      <span>{assignedHours} hrs</span>
                      {isOvertime && (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400" title="Overtime warning!" />
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onDeleteEmployee(emp.id)}
                    className="text-stone-500 hover:text-rose-400 p-1 text-xs"
                    title="Remove from roster"
                    aria-label={`Remove ${emp.name} from roster`}
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Weekly Shift Grid Table */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">Weekly Shift Assignment Matrix</h3>
          <span className="text-xs text-stone-400">
            {assignments.length} filled shifts scheduled
          </span>
        </div>

        <div className="space-y-4">
          {forecast.days.map((day) => (
            <div
              key={day.date}
              className="bg-stone-950/60 p-4 rounded-xl border border-stone-800/80 space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 pb-2 border-b border-stone-800/60">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-white">
                    {day.dayOfWeek} ({day.date})
                  </span>
                  <span className="text-xs text-amber-400 font-semibold">
                    {day.covers} covers projected
                  </span>
                </div>
                <div className="text-xs text-stone-400">
                  Target Labor: ${day.dailyTotalLaborCost.toLocaleString()} ({day.dailyLaborPercentage}%)
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {day.shifts.map((shift) => {
                  const shiftAssigns = assignments.filter(
                    (a) => a.date === day.date && a.shiftName === shift.name
                  );

                  return (
                    <div
                      key={shift.id}
                      className="bg-stone-900/80 p-3 rounded-lg border border-stone-800"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs font-bold text-white mb-2">
                        <span className="min-w-0 truncate">
                          {shift.name} ({shift.startTime} - {shift.endTime})
                        </span>
                        <span className="text-[11px] text-stone-400 shrink-0">
                          {shiftAssigns.length} assigned
                        </span>
                      </div>

                      {shiftAssigns.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {shiftAssigns.map((a) => (
                            <span
                              key={a.id}
                              className="text-[11px] font-medium px-2 py-0.5 rounded bg-stone-800 text-stone-200 border border-stone-700 flex items-center gap-1"
                            >
                              <span className="text-[9px] uppercase font-bold text-amber-400">
                                [{a.role.substring(0, 3)}]
                              </span>
                              {a.employeeName}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-stone-500 italic flex items-center gap-1">
                          <span>Unassigned. Click "1-Click Auto-Assign" above.</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Employee Modal */}
      {showAddEmpModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            ref={addEmpModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-emp-title"
            tabIndex={-1}
            className="bg-stone-900 border border-stone-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto outline-none"
          >
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <h3 id="add-emp-title" className="text-base font-bold text-white">Add Team Member</h3>
              <button
                type="button"
                onClick={() => setShowAddEmpModal(false)}
                aria-label="Close"
                className="text-stone-400 hover:text-white text-sm"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>

            <form onSubmit={handleCreateEmployee} className="space-y-3 text-xs" noValidate>
              {empFormError && (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-800/80 bg-rose-950/60 px-3 py-2 text-rose-300">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{empFormError}</span>
                </div>
              )}

              <div>
                <label htmlFor="emp-name" className="block text-stone-300 font-semibold mb-1">Full Name</label>
                <input
                  id="emp-name"
                  type="text"
                  required
                  value={empName}
                  onChange={(e) => setEmpName(e.target.value)}
                  placeholder="e.g. Maya Lin"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="emp-role" className="block text-stone-300 font-semibold mb-1">Primary Role</label>
                  <select
                    id="emp-role"
                    value={empRole}
                    onChange={(e) => handleRoleChange(e.target.value as StaffRole)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200"
                  >
                    <option value="servers">
                      {currentProfile.serviceStyle === 'FAST_CASUAL' || currentProfile.serviceStyle === 'COUNTER_SERVICE'
                        ? 'Counter Staff / Cashier'
                        : 'Server'}
                    </option>
                    {(currentProfile.hasBar ?? true) && <option value="bartenders">Bartender</option>}
                    <option value="lineCooks">Line Cook</option>
                    <option value="prepCooks">Prep Cook</option>
                    <option value="bussers">Busser</option>
                    <option value="dishwashers">Dishwasher</option>
                    {(currentProfile.hasHostStand ?? true) && <option value="hosts">Host</option>}
                    <option value="managers">Manager</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="emp-wagetype" className="block text-stone-300 font-semibold mb-1">Wage Classification</label>
                  <select
                    id="emp-wagetype"
                    value={empWageType}
                    onChange={(e) => {
                      const newType = e.target.value as WageType;
                      setEmpWageType(newType);
                      if (newType === 'TIPPED' && empWage > 15) {
                        setEmpWage(10);
                      } else if (newType === 'NON_TIPPED' && empWage < 15) {
                        setEmpWage(22);
                      }
                    }}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200"
                  >
                    <option value="TIPPED">Tipped (Sub-Minimum Direct Wage)</option>
                    <option value="NON_TIPPED">Non-Tipped (Full Flat Wage)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="emp-wage" className="block text-stone-300 font-semibold mb-1">
                    {empWageType === 'TIPPED' ? 'Direct Employer Wage ($/hr)' : 'Flat Hourly Rate ($/hr)'}
                  </label>
                  <input
                    id="emp-wage"
                    type="number"
                    step="0.5"
                    min="0"
                    required
                    value={empWage}
                    onChange={(e) => setEmpWage(Number(e.target.value))}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200"
                  />
                  <span className="text-[10px] text-stone-400 mt-0.5 block">
                    {empWageType === 'TIPPED'
                      ? 'Direct cash wage paid by restaurant (e.g. $10/hr).'
                      : 'Standard flat rate without tips.'}
                  </span>
                </div>

                {empWageType === 'TIPPED' ? (
                  <div>
                    <label htmlFor="emp-tips" className="block text-stone-300 font-semibold mb-1">
                      Expected Tips ($/hr, paid by guests)
                    </label>
                    <input
                      id="emp-tips"
                      type="number"
                      step="1"
                      min="0"
                      value={empTipEstimate}
                      onChange={(e) => setEmpTipEstimate(Number(e.target.value))}
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200"
                    />
                    <span className="text-[10px] text-stone-400 mt-0.5 block">
                      Guest tips (excluded from restaurant payroll labor cost).
                    </span>
                  </div>
                ) : (
                  <div>
                    <label htmlFor="emp-phone" className="block text-stone-300 font-semibold mb-1">Phone Number</label>
                    <input
                      id="emp-phone"
                      type="tel"
                      value={empPhone}
                      onChange={(e) => setEmpPhone(e.target.value)}
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="emp-maxhours" className="block text-stone-300 font-semibold mb-1">Max Hours / Week</label>
                  <input
                    id="emp-maxhours"
                    type="number"
                    min="1"
                    max="168"
                    required
                    value={empMaxHours}
                    onChange={(e) => setEmpMaxHours(Number(e.target.value))}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200"
                  />
                </div>

                {empWageType === 'TIPPED' && (
                  <div>
                    <label htmlFor="emp-phone" className="block text-stone-300 font-semibold mb-1">Phone Number</label>
                    <input
                      id="emp-phone"
                      type="tel"
                      value={empPhone}
                      onChange={(e) => setEmpPhone(e.target.value)}
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => setShowAddEmpModal(false)}
                  className="px-4 py-2 rounded-xl bg-stone-800 text-stone-300 hover:bg-stone-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-500 text-stone-950 font-bold hover:bg-amber-400 text-xs"
                >
                  Save Team Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Kitchen Pinboard Print Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            ref={printModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pinboard-title"
            tabIndex={-1}
            className="bg-stone-900 border border-stone-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto outline-none"
          >
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <h3 id="pinboard-title" className="text-base font-bold text-white flex items-center gap-2">
                <Printer className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                <span>Kitchen Pinboard & Text Schedule</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowPrintModal(false)}
                aria-label="Close"
                className="text-stone-400 hover:text-white text-sm"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>

            <textarea
              readOnly
              rows={14}
              aria-label="Generated text schedule"
              value={generateKitchenScheduleText(
                forecast.days,
                assignments,
                currentProfile.name
              )}
              className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-xs font-mono text-stone-200 select-all focus:outline-none"
            />

            <div className="flex items-center justify-between pt-2 border-t border-stone-800">
              <span className="text-xs text-stone-400">
                Copy text to post in staff group chat or pin to kitchen board.
              </span>
              <button
                onClick={async () => {
                  const text = generateKitchenScheduleText(
                    forecast.days,
                    assignments,
                    currentProfile.name
                  );
                  try {
                    if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
                    await navigator.clipboard.writeText(text);
                    alert('Schedule copied to clipboard!');
                  } catch {
                    alert(
                      'Could not copy automatically. Select the text above and copy it manually.'
                    );
                  }
                }}
                className="px-4 py-2 rounded-xl bg-emerald-500 text-stone-950 font-bold hover:bg-emerald-400 text-xs"
              >
                Copy to Clipboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
