import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  RestaurantProfile,
  HistoricalSalesRecord,
  LocalEvent,
  WeatherForecastDay,
  Employee,
  ShiftAssignment,
  WhatIfScenario,
  ShiftAccuracyLog,
} from '../src/types';
import {
  RESTAURANT_PRESETS,
  SAMPLE_HISTORICAL_DATA,
  SAMPLE_LOCAL_EVENTS,
  SAMPLE_WEATHER_FORECAST,
  SAMPLE_STAFF_ROSTER,
  SAMPLE_ACCURACY_LOGS,
  getPresetHistoricalData,
  getPresetRoster,
  getPresetEvents,
  getPresetAccuracyLogs,
} from '../src/data/restaurantPresets';

const JWT_SECRET = process.env.JWT_SECRET || 'shiftcast-secure-jwt-secret-key-2026';
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'shiftcast_db.json');

export interface User {
  id: string;
  email: string;
  name: string;
  restaurantName: string;
  passwordHash: string;
  role: 'manager' | 'owner' | 'lead';
  createdAt: string;
}

export interface UserRestaurantData {
  profile: RestaurantProfile;
  historicalData: HistoricalSalesRecord[];
  localEvents: LocalEvent[];
  weatherForecast: WeatherForecastDay[];
  roster: Employee[];
  assignments: ShiftAssignment[];
  manualShiftOverrides: Record<string, number>;
  scenario: WhatIfScenario;
  accuracyLogs: ShiftAccuracyLog[];
  updatedAt: string;
}

export interface DatabaseSchema {
  users: User[];
  restaurantData: Record<string, UserRestaurantData>; // Keyed by userId or `${userId}_${restaurantId}`
}

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Helper to generate consistent scoped storage key
export function getRestaurantStorageKey(userId: string, restaurantId?: string): string {
  if (!restaurantId || restaurantId === 'default') {
    return userId;
  }
  return `${userId}__${restaurantId}`;
}

// Default initial state generator for a user based on selected restaurant profile preset
export function createInitialUserData(
  profileOverride?: Partial<RestaurantProfile>,
  profileId?: string
): UserRestaurantData {
  const targetId = profileId || profileOverride?.id || RESTAURANT_PRESETS[0].id;
  const basePreset = RESTAURANT_PRESETS.find((p) => p.id === targetId) || RESTAURANT_PRESETS[0];

  const profile: RestaurantProfile = {
    ...basePreset,
    ...profileOverride,
  };

  const defaultScenario: WhatIfScenario = {
    id: 'game-day-surge',
    name: 'Game Day Walk-in Surge (+25% Friday/Saturday)',
    description: 'Simulates higher than normal walk-in patio demand and beverage velocity.',
    eventMultiplierBonus: 0.15,
    checkSizeModifier: 1.05,
    walkInSurgeModifier: 1.1,
    isActive: false,
  };

  return {
    profile,
    historicalData: JSON.parse(JSON.stringify(getPresetHistoricalData(profile.id))),
    localEvents: JSON.parse(JSON.stringify(getPresetEvents(profile.id))),
    weatherForecast: JSON.parse(JSON.stringify(SAMPLE_WEATHER_FORECAST)),
    roster: JSON.parse(JSON.stringify(getPresetRoster(profile.id))),
    assignments: [],
    manualShiftOverrides: {},
    scenario: defaultScenario,
    accuracyLogs: JSON.parse(JSON.stringify(getPresetAccuracyLogs(profile.id))),
    updatedAt: new Date().toISOString(),
  };
}

// In-memory cache + file sync
let dbCache: DatabaseSchema | null = null;

function migrateAndSanitizeDb(db: DatabaseSchema): boolean {
  let hasChanges = false;
  if (!db || !db.restaurantData) return false;

  Object.values(db.restaurantData).forEach((resData) => {
    if (!resData) return;

    // Ensure fixedHoursConfig exists on profile
    if (!resData.profile?.fixedHoursConfig) {
      if (resData.profile) {
        resData.profile.fixedHoursConfig = {
          prepCookFixedHours: 2.5,
          closingDishwasherFixedHours: 1.5,
          fixedPrepCookHeadcount: 1,
          fixedClosingDishwasherHeadcount: 1,
        };
        hasChanges = true;
      }
    }

    // 1. Sanitize Roster
    if (Array.isArray(resData.roster)) {
      resData.roster.forEach((emp) => {
        if (emp.name === 'Elena Rostova' || emp.id === 'msk-emp-2') {
          if (emp.hourlyWage !== 10.0 || emp.wageType !== 'TIPPED') {
            emp.wageType = 'TIPPED';
            emp.hourlyWage = 10.0;
            emp.tipEstimate = 20.0;
            hasChanges = true;
          }
        } else if (emp.name === 'Jessica Taylor' || emp.id === 'msk-emp-9') {
          if (emp.hourlyWage !== 30.0 || emp.wageType !== 'NON_TIPPED') {
            emp.wageType = 'NON_TIPPED';
            emp.hourlyWage = 30.0;
            hasChanges = true;
          }
        } else {
          // General employee wageType check
          if (!emp.wageType) {
            const isTipped =
              (emp.primaryRole === 'servers' ||
                emp.primaryRole === 'bartenders' ||
                emp.primaryRole === 'bussers') &&
              resData.profile?.serviceStyle !== 'FAST_CASUAL';
            emp.wageType = isTipped ? 'TIPPED' : 'NON_TIPPED';
            hasChanges = true;
          }
          if (emp.wageType === 'TIPPED' && emp.hourlyWage > 15) {
            emp.hourlyWage =
              emp.primaryRole === 'bartenders'
                ? 11.5
                : emp.primaryRole === 'bussers'
                ? 12.0
                : 10.0;
            if (!emp.tipEstimate) emp.tipEstimate = 20.0;
            hasChanges = true;
          }
        }
      });
    }

    // 2. Sanitize Assignments
    if (Array.isArray(resData.assignments) && Array.isArray(resData.roster)) {
      const prepFixed = resData.profile?.fixedHoursConfig?.prepCookFixedHours ?? 2.5;
      const dishFixed = resData.profile?.fixedHoursConfig?.closingDishwasherFixedHours ?? 1.5;

      resData.assignments.forEach((assign) => {
        const emp = resData.roster.find(
          (e) => e.id === assign.employeeId || e.name.toLowerCase() === assign.employeeName.toLowerCase()
        );

        if (emp) {
          if (assign.wageType !== emp.wageType) {
            assign.wageType = emp.wageType;
            hasChanges = true;
          }
          if (assign.hourlyWage !== emp.hourlyWage) {
            assign.hourlyWage = emp.hourlyWage;
            hasChanges = true;
          }
        }

        if (assign.role === 'prepCooks') {
          // Standard shift duration is 5.0h, so 5.0 + 2.5 = 7.5h
          const expectedHours = 7.5;
          if (assign.hours !== expectedHours || assign.fixedHours !== prepFixed) {
            assign.hours = expectedHours;
            assign.fixedHours = prepFixed;
            hasChanges = true;
          }
        } else if (assign.role === 'dishwashers') {
          // Standard shift duration is 5.0h, so 5.0 + 1.5 = 6.5h
          const expectedHours = 6.5;
          if (assign.hours !== expectedHours || assign.fixedHours !== dishFixed) {
            assign.hours = expectedHours;
            assign.fixedHours = dishFixed;
            hasChanges = true;
          }
        }

        const expectedCost = Number((assign.hourlyWage * assign.hours).toFixed(2));
        if (assign.cost !== expectedCost) {
          assign.cost = expectedCost;
          hasChanges = true;
        }
      });
    }
  });

  return hasChanges;
}

export function loadDb(): DatabaseSchema {
  if (dbCache) {
    return dbCache;
  }

  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      dbCache = JSON.parse(raw);
      if (dbCache && Array.isArray(dbCache.users) && dbCache.restaurantData) {
        if (migrateAndSanitizeDb(dbCache)) {
          saveDb(dbCache);
        }
        return dbCache;
      }
    }
  } catch (err) {
    console.error('Error reading database file, initializing fresh store:', err);
  }

  // Seed default demo user
  const demoUserId = 'usr-demo-manager-1';
  const defaultSalt = bcrypt.genSaltSync(10);
  const demoPasswordHash = bcrypt.hashSync('manager123', defaultSalt);

  const initialDb: DatabaseSchema = {
    users: [
      {
        id: demoUserId,
        email: 'manager@rustictable.com',
        name: 'Alex Morgan (General Manager)',
        restaurantName: 'Market Street Kitchen & Grill',
        passwordHash: demoPasswordHash,
        role: 'manager',
        createdAt: new Date().toISOString(),
      },
    ],
    restaurantData: {
      [demoUserId]: createInitialUserData(),
    },
  };

  dbCache = initialDb;
  saveDb(initialDb);
  return dbCache;
}

export function saveDb(db: DatabaseSchema): void {
  try {
    dbCache = db;
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error('Error saving database to file:', err);
  }
}

// User Operations
export async function registerUser(params: {
  email: string;
  password: string;
  name: string;
  restaurantName: string;
  concept?: string;
  location?: string;
}): Promise<{ user: Omit<User, 'passwordHash'>; token: string }> {
  const db = loadDb();
  const normalizedEmail = params.email.trim().toLowerCase();

  const existing = db.users.find((u) => u.email.toLowerCase() === normalizedEmail);
  if (existing) {
    throw new Error('An account with this email address already exists.');
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(params.password, salt);
  const newUserId = `usr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  const newUser: User = {
    id: newUserId,
    email: normalizedEmail,
    name: params.name.trim() || 'Restaurant Manager',
    restaurantName: params.restaurantName.trim() || 'My Restaurant',
    passwordHash,
    role: 'manager',
    createdAt: new Date().toISOString(),
  };

  db.users.push(newUser);

  // Initialize restaurant data for this user
  db.restaurantData[newUserId] = createInitialUserData({
    name: newUser.restaurantName,
    concept: params.concept || 'Contemporary Bistro & Bar',
    location: params.location || 'Downtown Metro',
  });

  saveDb(db);

  const token = jwt.sign(
    { userId: newUser.id, email: newUser.email, name: newUser.name },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

  const { passwordHash: _, ...userWithoutPassword } = newUser;
  return { user: userWithoutPassword, token };
}

export async function loginUser(
  email: string,
  password: string
): Promise<{ user: Omit<User, 'passwordHash'>; token: string }> {
  const db = loadDb();
  const normalizedEmail = email.trim().toLowerCase();

  const user = db.users.find((u) => u.email.toLowerCase() === normalizedEmail);
  if (!user) {
    throw new Error('Invalid email or password. Please check your credentials.');
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw new Error('Invalid email or password. Please check your credentials.');
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

  // Ensure user has restaurant data
  if (!db.restaurantData[user.id]) {
    db.restaurantData[user.id] = createInitialUserData({
      name: user.restaurantName,
    });
    saveDb(db);
  }

  const { passwordHash: _, ...userWithoutPassword } = user;
  return { user: userWithoutPassword, token };
}

export function getUserById(userId: string): Omit<User, 'passwordHash'> | null {
  const db = loadDb();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  const { passwordHash: _, ...safeUser } = user;
  return safeUser;
}

export function verifyJwtToken(token: string): { userId: string; email: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
    return decoded;
  } catch (err) {
    return null;
  }
}

// Data retrieval & updates (scoped by userId and optional restaurantId)
export function getUserRestaurantData(userId: string, restaurantId?: string): UserRestaurantData {
  const db = loadDb();
  
  // If specific restaurantId requested, lookup by scoped key
  if (restaurantId) {
    const scopedKey = getRestaurantStorageKey(userId, restaurantId);
    if (!db.restaurantData[scopedKey]) {
      // Seed preset or initial data for this specific restaurant
      db.restaurantData[scopedKey] = createInitialUserData(undefined, restaurantId);
      saveDb(db);
    }
    return db.restaurantData[scopedKey];
  }

  // Otherwise, return active restaurant data for user
  if (!db.restaurantData[userId]) {
    db.restaurantData[userId] = createInitialUserData();
    saveDb(db);
  }
  // Ensure backward compatibility if accuracyLogs is missing in older db file
  if (!Array.isArray(db.restaurantData[userId].accuracyLogs)) {
    db.restaurantData[userId].accuracyLogs = JSON.parse(JSON.stringify(SAMPLE_ACCURACY_LOGS));
    saveDb(db);
  }
  return db.restaurantData[userId];
}

export function saveUserRestaurantData(
  userId: string,
  partialData: Partial<UserRestaurantData>,
  restaurantId?: string
): UserRestaurantData {
  const db = loadDb();
  const current = getUserRestaurantData(userId, restaurantId);

  const updated: UserRestaurantData = {
    ...current,
    ...partialData,
    updatedAt: new Date().toISOString(),
  };

  // If partialData has a profile with an ID, we can also sync to the scoped key
  const activeRestaurantId = restaurantId || updated.profile?.id;
  const storageKey = getRestaurantStorageKey(userId, activeRestaurantId);

  // Update both the scoped key and active user pointer
  db.restaurantData[storageKey] = updated;
  db.restaurantData[userId] = updated;
  migrateAndSanitizeDb(db);
  saveDb(db);
  return db.restaurantData[userId];
}

export function addPosRecords(
  userId: string,
  records: HistoricalSalesRecord[],
  restaurantId?: string
): HistoricalSalesRecord[] {
  const db = loadDb();
  const current = getUserRestaurantData(userId, restaurantId);
  const existingIds = new Set(current.historicalData.map((r) => r.id));

  // Prepend new records that don't already exist or replace
  const cleanRecords = records.map((r) => ({
    ...r,
    id: r.id || `pos-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
  }));

  const updatedRecords = [
    ...cleanRecords,
    ...current.historicalData.filter((r) => !cleanRecords.some((nr) => nr.id === r.id)),
  ];

  current.historicalData = updatedRecords;
  current.updatedAt = new Date().toISOString();
  
  const storageKey = getRestaurantStorageKey(userId, restaurantId || current.profile?.id);
  db.restaurantData[storageKey] = current;
  db.restaurantData[userId] = current;
  saveDb(db);
  return updatedRecords;
}

export function deletePosRecord(userId: string, recordId: string, restaurantId?: string): HistoricalSalesRecord[] {
  const db = loadDb();
  const current = getUserRestaurantData(userId, restaurantId);
  current.historicalData = current.historicalData.filter((r) => r.id !== recordId);
  current.updatedAt = new Date().toISOString();
  
  const storageKey = getRestaurantStorageKey(userId, restaurantId || current.profile?.id);
  db.restaurantData[storageKey] = current;
  db.restaurantData[userId] = current;
  saveDb(db);
  return current.historicalData;
}

// Accuracy Logs Management
export function addShiftAccuracyLogs(
  userId: string,
  logs: ShiftAccuracyLog[],
  restaurantId?: string
): ShiftAccuracyLog[] {
  const db = loadDb();
  const current = getUserRestaurantData(userId, restaurantId);
  
  const cleanLogs = logs.map((l) => ({
    ...l,
    id: l.id || `acc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
  }));

  // Upsert logs matching on date and shift
  const existing = current.accuracyLogs || [];
  const updatedLogs = [
    ...cleanLogs,
    ...existing.filter((el) => !cleanLogs.some((nl) => (nl.id === el.id) || (nl.date === el.date && nl.shift === el.shift))),
  ];

  current.accuracyLogs = updatedLogs;
  current.updatedAt = new Date().toISOString();
  
  const storageKey = getRestaurantStorageKey(userId, restaurantId || current.profile?.id);
  db.restaurantData[storageKey] = current;
  db.restaurantData[userId] = current;
  saveDb(db);
  return updatedLogs;
}

export function deleteShiftAccuracyLog(userId: string, logId: string, restaurantId?: string): ShiftAccuracyLog[] {
  const db = loadDb();
  const current = getUserRestaurantData(userId, restaurantId);
  current.accuracyLogs = (current.accuracyLogs || []).filter((l) => l.id !== logId);
  current.updatedAt = new Date().toISOString();
  
  const storageKey = getRestaurantStorageKey(userId, restaurantId || current.profile?.id);
  db.restaurantData[storageKey] = current;
  db.restaurantData[userId] = current;
  saveDb(db);
  return current.accuracyLogs;
}

export function resetUserToDemoData(userId: string): UserRestaurantData {
  const db = loadDb();
  const user = db.users.find((u) => u.id === userId);
  const initial = createInitialUserData(user ? { name: user.restaurantName } : undefined);

  // Clear every restaurant-scoped key for this user, not just the active-user pointer.
  // Otherwise a previously-visited restaurant's stale (pre-reset) data is still sitting under
  // its scoped key (`${userId}__${restaurantId}`), and simply switching to it and back silently
  // resurrects everything the reset just wiped.
  const scopedPrefix = `${userId}__`;
  Object.keys(db.restaurantData).forEach((key) => {
    if (key.startsWith(scopedPrefix)) {
      delete db.restaurantData[key];
    }
  });

  db.restaurantData[userId] = initial;
  db.restaurantData[getRestaurantStorageKey(userId, initial.profile.id)] = initial;
  saveDb(db);
  return initial;
}

export function switchUserProfilePreset(userId: string, presetId: string): UserRestaurantData {
  const db = loadDb();
  const scopedKey = getRestaurantStorageKey(userId, presetId);
  
  // If we already have stored modifications for this preset, load it; otherwise initialize fresh
  let restaurantData = db.restaurantData[scopedKey];
  if (!restaurantData) {
    const preset = RESTAURANT_PRESETS.find((p) => p.id === presetId) || RESTAURANT_PRESETS[0];
    restaurantData = createInitialUserData(preset, preset.id);
    db.restaurantData[scopedKey] = restaurantData;
  }
  
  // Set current active restaurant data
  db.restaurantData[userId] = restaurantData;
  saveDb(db);
  return restaurantData;
}

