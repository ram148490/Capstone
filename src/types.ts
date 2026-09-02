export type StaffRole =
  | 'servers'
  | 'bartenders'
  | 'bussers'
  | 'hosts'
  | 'lineCooks'
  | 'prepCooks'
  | 'dishwashers'
  | 'managers';

export type WageType = 'TIPPED' | 'NON_TIPPED';

export interface FixedHoursConfig {
  prepCookFixedHours: number; // e.g., 2.5 hours pre-shift opening prep (does not scale down with covers)
  closingDishwasherFixedHours: number; // e.g., 1.5 hours post-shift deep cleanup/sanitation
  fixedPrepCookHeadcount: number; // e.g., 1 guaranteed prep cook
  fixedClosingDishwasherHeadcount: number; // e.g., 1 guaranteed closing dishwasher
}

export interface RoleWageConfig {
  servers: number;
  bartenders: number;
  bussers: number;
  hosts: number;
  lineCooks: number;
  prepCooks: number;
  dishwashers: number;
  managers: number;
}

export interface ProductivityStandard {
  coversPerServer: number; // e.g., 20 covers/server per shift
  coversPerBartender: number; // e.g., 45 covers/bartender
  coversPerLineCook: number; // e.g., 30 covers/cook
  coversPerBusser: number; // e.g., 40 covers/busser
  coversPerDishwasher: number; // e.g., 65 covers/dishwasher
  coversPerHost: number; // e.g., 60 covers/host
}

export interface OperatingShiftConfig {
  id: string;
  name: string;
  startTime: string; // e.g., "11:00 AM"
  endTime: string; // e.g., "04:00 PM"
  durationHours: number;
  daysActive: string[]; // ["Monday", "Tuesday", ...]
}

export type ServiceStyle =
  | 'FULL_SERVICE'
  | 'FAST_CASUAL'
  | 'COUNTER_SERVICE'
  | 'BISTRO'
  | 'PIZZERIA'
  | 'BAR_TAPROOM';

export interface RestaurantProfile {
  id: string;
  name: string;
  concept: string;
  conceptType?: 'FULL_SERVICE' | 'FAST_CASUAL' | 'BISTRO' | 'PIZZERIA';
  serviceStyle?: ServiceStyle;
  hasBar: boolean;
  hasHostStand: boolean;
  location: string;
  seatCount: number;
  patioSeats: number;
  hasPatio: boolean;
  averageCheckSize: number;
  targetLaborPercentage: number;
  shifts: OperatingShiftConfig[];
  wageRates: RoleWageConfig; // Direct employer cash wage paid for every role
  wageTypes?: Record<StaffRole, WageType>; // Distinguishes TIPPED sub-minimum direct cash wage vs NON_TIPPED standard hourly wage
  fixedHoursConfig?: FixedHoursConfig; // Non-scaling fixed prep and closing sanitizing time blocks
  productivity: ProductivityStandard;
  enabledRoles: StaffRole[];
  roleLabels?: Partial<Record<StaffRole, string>>;
}

export interface HistoricalSalesRecord {
  id: string;
  date: string; // YYYY-MM-DD
  dayOfWeek: string;
  shift: string; // "Lunch", "Dinner", "Brunch", "Late Night", "All Day"
  covers: number;
  sales: number;
  laborCost: number;
  laborHours: number;
  weather?: string;
  eventTag?: string;
  notes?: string;
  scheduledHeadcount?: number;
}

export type EventCategory =
  | 'SPORTS'
  | 'CONCERT'
  | 'FESTIVAL'
  | 'HOLIDAY'
  | 'COMMUNITY'
  | 'WEATHER'
  | 'CONFERENCE'
  | 'PRIVATE_PARTY';

export interface LocalEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  category: EventCategory;
  venue: string;
  estimatedAttendance?: string;
  volumeMultiplier: number; // e.g. 1.25 = +25%
  affectedShifts: string[]; // ["Lunch", "Dinner"]
  rushWindow?: string;
  description: string;
  staffingTip?: string;
  isUserCustom?: boolean;
  isEnabled: boolean;
}

export interface WeatherForecastDay {
  date: string;
  dayOfWeek: string;
  condition: 'Sunny' | 'Rain' | 'Cloudy' | 'Cold' | 'Hot' | 'Thunderstorm' | 'Snow';
  tempF: number;
  rainChance: number;
  patioOpen: boolean;
  volumeMultiplier: number;
  notes: string;
}

export interface HourlyDistributionPoint {
  hour: string; // e.g. "5:00 PM"
  expectedGuests: number;
  isPeak: boolean;
  recommendedFloorStaff: number;
  recommendedKitchenStaff: number;
}

export interface ShiftForecast {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  covers: number;
  sales: number;
  recommendedStaff: Record<StaffRole, number>;
  gutFeelStaff: Record<StaffRole, number>;
  estimatedLaborCost: number;
  gutLaborCost: number;
  laborPercentage: number;
  gutLaborPercentage: number;
  costSavings: number; // positive = saved money by avoiding overstaffing
  understaffingRisk: 'NONE' | 'LOW' | 'MEDIUM' | 'CRITICAL';
  overstaffingRisk: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  shiftNotes: string;
  hourlyBreakdown: HourlyDistributionPoint[];
  tippedLaborCost?: number;
  nonTippedLaborCost?: number;
  fixedLaborCost?: number; // Cost of guaranteed fixed prep & closing sanitation blocks
  variableLaborCost?: number; // Cost of volume/cover-driven service staff
  fixedPrepHours?: number; // Pre-service prep hours applied
  fixedClosingHours?: number; // Post-service closing dish hours applied
  roleHours?: Partial<Record<StaffRole, number>>;
}

export interface DayForecast {
  date: string;
  dayOfWeek: string;
  covers: number;
  projectedSales: number;
  baselineCovers: number;
  eventsImpactMultiplier: number;
  weatherImpactMultiplier: number;
  weatherImpact: string;
  eventsImpact: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  riskReason: string;
  shifts: ShiftForecast[];
  dailyTotalLaborCost: number;
  dailyLaborPercentage: number;
  dailySavings: number;
  events: LocalEvent[];
  weather: WeatherForecastDay;
}

export interface WeeklyForecastSummary {
  startDate: string;
  endDate: string;
  totalProjectedCovers: number;
  totalProjectedSales: number;
  totalProjectedLaborCost: number;
  averageLaborPercentage: number;
  gutFeelLaborCost: number;
  totalEstimatedSavings: number;
  totalPreventedStockoutOrDelayRiskHours: number;
  executiveInsight: string;
  days: DayForecast[];
  operationalAdvice: {
    title: string;
    description: string;
    category: 'STAFFING' | 'PREP' | 'REVENUE_OPPORTUNITY' | 'RISK_MITIGATION';
  }[];
}

export interface Employee {
  id: string;
  restaurantId?: string;
  name: string;
  primaryRole: StaffRole;
  secondaryRoles: StaffRole[];
  wageType?: WageType; // TIPPED sub-minimum direct cash wage vs NON_TIPPED standard hourly wage
  hourlyWage: number; // Direct cash wage paid by employer
  tipEstimate?: number; // Optional estimated tips per hour for employee total comp visibility
  maxHoursPerWeek: number;
  assignedHoursThisWeek?: number;
  phone?: string;
  email?: string;
  availability: {
    [dayOfWeek: string]: ('ANY' | 'LUNCH' | 'DINNER' | 'OFF');
  };
}

export interface ShiftAssignment {
  id: string;
  date: string;
  shiftName: string;
  role: StaffRole;
  employeeId: string;
  employeeName: string;
  wageType?: WageType;
  hourlyWage: number;
  hours: number;
  fixedHours?: number; // Pre-service prep or post-close sanitizing hours included in this shift
  cost: number;
}

export interface WhatIfScenario {
  id: string;
  name: string;
  description: string;
  weatherMod?: 'Sunny' | 'Rain' | 'Cold' | 'Normal';
  eventMultiplierBonus: number; // e.g. +0.20 (+20%)
  checkSizeModifier: number; // e.g. 1.10 (+10% average ticket)
  walkInSurgeModifier: number; // e.g. 1.15
  isActive: boolean;
}

export interface ManagerBriefingData {
  managerFocus: string;
  prepPriorities: string[];
  fohDirectives: string[];
  bohDirectives: string[];
  rushWindows: string[];
  upsellFocus: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  restaurantName: string;
  role: 'manager' | 'owner' | 'lead';
  createdAt: string;
}

export interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface ShiftAccuracyLog {
  id: string;
  date: string; // YYYY-MM-DD
  dayOfWeek: string;
  shift: string; // "Lunch", "Dinner", "Brunch", "Late Night", "All Day"
  predictedCovers: number;
  actualCovers: number;
  predictedSales: number;
  actualSales: number;
  predictedLaborHours?: number;
  actualLaborHours?: number;
  varianceCovers: number; // actual - predicted
  varianceSales: number; // actual - predicted
  percentError: number; // |actual - predicted| / actual * 100
  accuracyPercentage: number; // 100 - percentError
  weatherObserved?: string;
  eventObserved?: string;
  notes?: string;
  loggedAt: string;
}

export interface WeeklyAccuracyMetric {
  weekKey: string; // e.g. "2026-W34"
  weekLabel: string; // e.g. "Aug 24 - Aug 30 (Last Week)"
  startDate: string;
  endDate: string;
  totalPredictedCovers: number;
  totalActualCovers: number;
  totalPredictedSales: number;
  totalActualSales: number;
  mape: number; // Mean Absolute Percentage Error (%)
  accuracyPercentage: number; // 100 - MAPE (%)
  totalVarianceCovers: number;
  totalVarianceSales: number;
  shiftCount: number;
  biasDirection: 'OVER' | 'UNDER' | 'BALANCED';
  biasPercentage: number; // (actual - predicted) / predicted * 100
  bestShift?: { day: string; shift: string; accuracyPercentage: number; covers: number };
  worstShift?: { day: string; shift: string; accuracyPercentage: number; error: number; reason?: string };
  shifts: ShiftAccuracyLog[];
}

