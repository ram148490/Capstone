import { LocalEvent, ShiftAssignment, DayForecast, ShiftForecast, RestaurantProfile, StaffRole, Employee } from '../types';
import { isTippedRole } from './staffingEngine';

const DEFAULT_WAGES: Record<string, number> = {
  servers: 16.0,
  bartenders: 18.5,
  bussers: 15.0,
  hosts: 16.0,
  lineCooks: 22.0,
  prepCooks: 18.0,
  dishwashers: 16.0,
  managers: 30.0,
};

export const ROLE_DISPLAY_LABELS: Record<string, string> = {
  servers: 'Server',
  bartenders: 'Bartender',
  bussers: 'Busser',
  hosts: 'Host',
  lineCooks: 'Line Cook',
  prepCooks: 'Prep Cook',
  dishwashers: 'Dishwasher',
  managers: 'Manager',
};

// Parse raw .ics iCal content into LocalEvents
export function parseICalData(icsContent: string): Partial<LocalEvent>[] {
  const events: Partial<LocalEvent>[] = [];
  const lines = icsContent.split(/\r\n|\n|\r/);

  let inEvent = false;
  let currentEvent: Record<string, string> = {};

  for (let line of lines) {
    line = line.trim();
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      currentEvent = {};
    } else if (line === 'END:VEVENT') {
      inEvent = false;
      if (currentEvent.SUMMARY && currentEvent.DTSTART) {
        // Parse date (e.g., 20260904 or 20260904T180000Z)
        let rawDate = currentEvent.DTSTART;
        let dateStr = '';
        if (rawDate.length >= 8) {
          const yyyy = rawDate.substring(0, 4);
          const mm = rawDate.substring(4, 6);
          const dd = rawDate.substring(6, 8);
          dateStr = `${yyyy}-${mm}-${dd}`;
        }

        const title = currentEvent.SUMMARY || 'Local Event';
        const description = currentEvent.DESCRIPTION || '';
        const venue = currentEvent.LOCATION || 'Local Venue';

        // Guess category
        let category: LocalEvent['category'] = 'COMMUNITY';
        const lowerTitle = (title + ' ' + description).toLowerCase();
        if (lowerTitle.includes('concert') || lowerTitle.includes('tour') || lowerTitle.includes('music')) {
          category = 'CONCERT';
        } else if (lowerTitle.includes('game') || lowerTitle.includes('vs') || lowerTitle.includes('match') || lowerTitle.includes('football') || lowerTitle.includes('basketball')) {
          category = 'SPORTS';
        } else if (lowerTitle.includes('festival') || lowerTitle.includes('fair') || lowerTitle.includes('expo')) {
          category = 'FESTIVAL';
        } else if (lowerTitle.includes('conference') || lowerTitle.includes('summit')) {
          category = 'CONFERENCE';
        }

        events.push({
          id: `ics-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          title,
          date: dateStr || '2026-08-31',
          category,
          venue,
          description,
          volumeMultiplier: 1.25,
          affectedShifts: ['Dinner'],
          isEnabled: true,
          isUserCustom: true,
        });
      }
    } else if (inEvent) {
      const splitIdx = line.indexOf(':');
      if (splitIdx > 0) {
        const key = line.substring(0, splitIdx).split(';')[0];
        const val = line.substring(splitIdx + 1);
        currentEvent[key] = val;
      }
    }
  }

  return events;
}

// Generate CSV export for shift schedule with Wage-Type & Fixed-Hours Breakdown
export function generateScheduleCSV(
  days: DayForecast[],
  assignments: ShiftAssignment[] = [],
  restaurant: RestaurantProfile,
  roster?: Employee[]
): string {
  const wageRates = restaurant.wageRates;
  const fixedHoursConfig = restaurant.fixedHoursConfig;
  const headers = [
    'Date',
    'Day',
    'Shift',
    'Role',
    'Assigned Employee',
    'Wage Type',
    'Hourly Rate ($)',
    'Shift Hours',
    'Hours Type',
    'Shift Labor Cost ($)',
    'Projected Shift Covers',
    'Projected Shift Sales ($)',
  ];

  const rows: string[][] = [headers];

  const allRoles: StaffRole[] = [
    'servers',
    'bartenders',
    'lineCooks',
    'prepCooks',
    'bussers',
    'dishwashers',
    'hosts',
    'managers',
  ];

  days.forEach((day) => {
    day.shifts.forEach((shift) => {
      const shiftAssignments = assignments.filter(
        (a) => a.date === day.date && a.shiftName === shift.name
      );

      allRoles.forEach((role) => {
        const neededCount = shift.recommendedStaff[role] || 0;
        const roleAssignments = shiftAssignments.filter((a) => a.role === role);
        const hourlyRate = (wageRates && wageRates[role]) ?? DEFAULT_WAGES[role] ?? 16.0;

        // Calculate role-specific shift hours including fixed prep/closing blocks
        let calculatedRoleHours = shift.durationHours;
        let hoursType = 'Variable Service';

        if (role === 'prepCooks') {
          const prepExtra = fixedHoursConfig?.prepCookFixedHours ?? 2.5;
          calculatedRoleHours = Number((shift.durationHours + prepExtra).toFixed(1));
          hoursType = `Fixed Pre-Opening Prep (+${prepExtra}h) + Service`;
        } else if (role === 'dishwashers') {
          const closeExtra = fixedHoursConfig?.closingDishwasherFixedHours ?? 1.5;
          calculatedRoleHours = Number((shift.durationHours + closeExtra).toFixed(1));
          hoursType = `Service + Fixed Post-Close Sanitation (+${closeExtra}h)`;
        }

        const roleWageType = isTippedRole(role, restaurant) ? 'TIPPED' : 'NON_TIPPED';
        const roleWageTypeLabel =
          roleWageType === 'TIPPED' ? 'Tipped Direct Wage' : 'Non-Tipped Flat Wage';

        const targetCostPerPerson = hourlyRate * calculatedRoleHours;
        const roleLabel = ROLE_DISPLAY_LABELS[role] || role;

        // 1. Output any explicitly assigned staff for this role
        roleAssignments.forEach((assign) => {
          // Employee lookup to ensure wage type and rate are a FIXED property of the employee
          const emp = roster?.find(
            (e) => e.id === assign.employeeId || e.name.toLowerCase() === assign.employeeName.toLowerCase()
          );

          let assignedWageType = roleWageTypeLabel;
          let rate = hourlyRate;

          if (emp) {
            const empWageType =
              emp.wageType || (isTippedRole(emp.primaryRole, restaurant) ? 'TIPPED' : 'NON_TIPPED');
            assignedWageType = empWageType === 'TIPPED' ? 'Tipped Direct Wage' : 'Non-Tipped Flat Wage';
            rate = emp.hourlyWage > 0 ? emp.hourlyWage : hourlyRate;
          } else if (assign.wageType) {
            assignedWageType =
              assign.wageType === 'TIPPED' ? 'Tipped Direct Wage' : 'Non-Tipped Flat Wage';
            rate = assign.hourlyWage > 0 ? assign.hourlyWage : hourlyRate;
          }

          // Exact shift hours for this role:
          // Prep cooks must always include their fixed pre-opening prep block (+2.5h -> 7.5h)
          // Dishwashers include their fixed closing sanitation block (+1.5h -> 6.5h)
          const hours = calculatedRoleHours;
          const cost = Number((rate * hours).toFixed(2));

          rows.push([
            day.date,
            day.dayOfWeek,
            shift.name,
            roleLabel,
            assign.employeeName,
            assignedWageType,
            rate.toFixed(2),
            hours.toString(),
            hoursType,
            cost.toFixed(2),
            shift.covers.toString(),
            shift.sales.toString(),
          ]);
        });

        // 2. Output remaining recommended slots as [Required - Unassigned] with exact rate & computed target labor cost
        const remainingSlots = Math.max(0, neededCount - roleAssignments.length);
        for (let i = 0; i < remainingSlots; i++) {
          rows.push([
            day.date,
            day.dayOfWeek,
            shift.name,
            roleLabel,
            '[Required - Unassigned]',
            roleWageTypeLabel,
            hourlyRate.toFixed(2),
            calculatedRoleHours.toString(),
            hoursType,
            targetCostPerPerson.toFixed(2),
            shift.covers.toString(),
            shift.sales.toString(),
          ]);
        }
      });
    });
  });

  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

/**
 * Serialize one CSV cell. Besides RFC-4180 quote-doubling, this neutralises
 * spreadsheet formula injection: Excel / Google Sheets evaluate a cell whose
 * value begins with = + - @ (or a tab / carriage return) as a formula even when
 * the value is quoted, so a staff member named `=HYPERLINK(...)` or
 * `@SUM(1+1)*cmd` could run when a manager opens the exported schedule. Prefixing
 * such values with a single quote makes the spreadsheet treat them as text.
 * None of the legitimate columns (dates, role names, non-negative rates / hours /
 * costs / covers) start with those characters, so this never mangles real data.
 */
function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}

// Generate printable text schedule / kitchen pinboard format
export function generateKitchenScheduleText(
  days: DayForecast[],
  assignments: ShiftAssignment[],
  restaurantName: string
): string {
  let output = `=================================================================\n`;
  output += `  ${restaurantName.toUpperCase()} - WEEKLY MASTER ROSTER & SHIFT SCHEDULE\n`;
  output += `  Target Week: Aug 31, 2026 - Sep 06, 2026\n`;
  output += `=================================================================\n\n`;

  days.forEach((day) => {
    output += `-----------------------------------------------------------------\n`;
    output += `📅 ${day.dayOfWeek.toUpperCase()} (${day.date}) | Forecast Covers: ${day.covers} | Est. Sales: $${day.projectedSales.toLocaleString()}\n`;
    if (day.events.length > 0) {
      output += `🎪 Local Events: ${day.events.map((e) => e.title).join(' | ')}\n`;
    }
    output += `☀️ Weather: ${day.weatherImpact}\n`;
    output += `-----------------------------------------------------------------\n`;

    day.shifts.forEach((shift) => {
      output += `\n  ⏱️  ${shift.name.toUpperCase()} (${shift.startTime} - ${shift.endTime}) [${shift.covers} covers | $${shift.sales.toLocaleString()}]\n`;
      const shiftAssignments = assignments.filter(
        (a) => a.date === day.date && a.shiftName === shift.name
      );

      if (shiftAssignments.length > 0) {
        output += `     Assigned Team:\n`;
        shiftAssignments.forEach((a) => {
          output += `       • [${a.role.toUpperCase()}] ${a.employeeName} (${a.hours} hrs)\n`;
        });
      } else {
        output += `     Recommended Headcount: `;
        const recList = Object.entries(shift.recommendedStaff)
          .filter(([_, count]) => count > 0)
          .map(([role, count]) => `${count} ${role}`)
          .join(', ');
        output += `${recList}\n`;
      }
    });
    output += `\n`;
  });

  output += `\n=================================================================\n`;
  output += `Generated by ShiftCast AI Operations Planner\n`;
  output += `=================================================================\n`;

  return output;
}
