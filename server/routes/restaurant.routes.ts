import { Router } from 'express';
import {
  getUserById,
  getUserRestaurantData,
  saveUserRestaurantData,
  addPosRecords,
  deletePosRecord,
  addShiftAccuracyLogs,
  deleteShiftAccuracyLog,
  resetUserToDemoData,
  switchUserProfilePreset,
} from '../db';
import {
  authMiddleware,
  AuthenticatedRequest,
  DEMO_USER_ID,
} from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

const uid = (req: AuthenticatedRequest) => req.userId || DEMO_USER_ID;

// GET /api/restaurant/data — load all saved data for the current user
router.get('/data', (req: AuthenticatedRequest, res) => {
  try {
    const userId = uid(req);
    const restaurantId = (req.query.restaurantId as string) || undefined;
    return res.json({
      success: true,
      user: getUserById(userId),
      data: getUserRestaurantData(userId, restaurantId),
    });
  } catch (error: any) {
    console.error('Error fetching restaurant data:', error);
    return res
      .status(500)
      .json({ success: false, error: 'Failed to retrieve restaurant data.' });
  }
});

// POST /api/restaurant/profile — update profile & settings
router.post('/profile', (req: AuthenticatedRequest, res) => {
  try {
    const userId = uid(req);
    const { profile, isPresetSwitch } = req.body;

    if (!profile) {
      return res.status(400).json({ success: false, error: 'Profile data missing.' });
    }

    if (isPresetSwitch && profile.id) {
      const updatedData = switchUserProfilePreset(userId, profile.id);
      return res.json({
        success: true,
        profile: updatedData.profile,
        fullData: updatedData,
      });
    }

    const updated = saveUserRestaurantData(userId, { profile }, profile.id);
    return res.json({ success: true, profile: updated.profile });
  } catch (error: any) {
    console.error('Error saving profile:', error);
    return res.status(500).json({ success: false, error: 'Failed to save profile.' });
  }
});

// POST /api/restaurant/switch-preset — swap concept preset (reloads scoped data)
router.post('/switch-preset', (req: AuthenticatedRequest, res) => {
  try {
    const { presetId } = req.body;
    if (!presetId) {
      return res.status(400).json({ success: false, error: 'Preset ID is required.' });
    }
    const updatedData = switchUserProfilePreset(uid(req), presetId);
    return res.json({ success: true, data: updatedData });
  } catch (error: any) {
    console.error('Error switching preset:', error);
    return res
      .status(500)
      .json({ success: false, error: 'Failed to switch restaurant concept preset.' });
  }
});

// POST /api/restaurant/pos/records — save or append POS historical records
router.post('/pos/records', (req: AuthenticatedRequest, res) => {
  try {
    const userId = uid(req);
    const { records, replaceAll } = req.body;

    if (!Array.isArray(records)) {
      return res.status(400).json({ success: false, error: 'Records must be an array.' });
    }

    const historicalData = replaceAll
      ? saveUserRestaurantData(userId, { historicalData: records }).historicalData
      : addPosRecords(userId, records);

    return res.json({ success: true, historicalData });
  } catch (error: any) {
    console.error('Error saving POS records:', error);
    return res
      .status(500)
      .json({ success: false, error: 'Failed to save POS records.' });
  }
});

// DELETE /api/restaurant/pos/records/:id
router.delete('/pos/records/:id', (req: AuthenticatedRequest, res) => {
  try {
    const historicalData = deletePosRecord(uid(req), req.params.id);
    return res.json({ success: true, historicalData });
  } catch (error: any) {
    console.error('Error deleting POS record:', error);
    return res
      .status(500)
      .json({ success: false, error: 'Failed to delete POS record.' });
  }
});

// POST /api/restaurant/events — save the Local Events Radar list
router.post('/events', (req: AuthenticatedRequest, res) => {
  try {
    const { events } = req.body;
    if (!Array.isArray(events)) {
      return res.status(400).json({ success: false, error: 'Events must be an array.' });
    }
    const updated = saveUserRestaurantData(uid(req), { localEvents: events });
    return res.json({ success: true, localEvents: updated.localEvents });
  } catch (error: any) {
    console.error('Error saving events:', error);
    return res.status(500).json({ success: false, error: 'Failed to save events.' });
  }
});

// POST /api/restaurant/roster — save the staff roster
router.post('/roster', (req: AuthenticatedRequest, res) => {
  try {
    const { roster } = req.body;
    if (!Array.isArray(roster)) {
      return res.status(400).json({ success: false, error: 'Roster must be an array.' });
    }
    const updated = saveUserRestaurantData(uid(req), { roster });
    return res.json({ success: true, roster: updated.roster });
  } catch (error: any) {
    console.error('Error saving roster:', error);
    return res.status(500).json({ success: false, error: 'Failed to save roster.' });
  }
});

// POST /api/restaurant/assignments — save shift schedule assignments
router.post('/assignments', (req: AuthenticatedRequest, res) => {
  try {
    const { assignments } = req.body;
    if (!Array.isArray(assignments)) {
      return res
        .status(400)
        .json({ success: false, error: 'Assignments must be an array.' });
    }
    const updated = saveUserRestaurantData(uid(req), { assignments });
    return res.json({ success: true, assignments: updated.assignments });
  } catch (error: any) {
    console.error('Error saving assignments:', error);
    return res
      .status(500)
      .json({ success: false, error: 'Failed to save shift assignments.' });
  }
});

// POST /api/restaurant/overrides — save manual shift headcount overrides
router.post('/overrides', (req: AuthenticatedRequest, res) => {
  try {
    const { overrides } = req.body;
    const updated = saveUserRestaurantData(uid(req), {
      manualShiftOverrides: overrides || {},
    });
    return res.json({
      success: true,
      manualShiftOverrides: updated.manualShiftOverrides,
    });
  } catch (error: any) {
    console.error('Error saving shift overrides:', error);
    return res
      .status(500)
      .json({ success: false, error: 'Failed to save shift adjustments.' });
  }
});

// POST /api/restaurant/scenario — save the what-if scenario state
router.post('/scenario', (req: AuthenticatedRequest, res) => {
  try {
    const { scenario } = req.body;
    const updated = saveUserRestaurantData(uid(req), { scenario });
    return res.json({ success: true, scenario: updated.scenario });
  } catch (error: any) {
    console.error('Error saving scenario:', error);
    return res.status(500).json({ success: false, error: 'Failed to save scenario.' });
  }
});

// GET /api/restaurant/accuracy/logs
router.get('/accuracy/logs', (req: AuthenticatedRequest, res) => {
  try {
    const data = getUserRestaurantData(uid(req));
    return res.json({ success: true, accuracyLogs: data.accuracyLogs || [] });
  } catch (error: any) {
    console.error('Error fetching accuracy logs:', error);
    return res
      .status(500)
      .json({ success: false, error: 'Failed to retrieve accuracy logs.' });
  }
});

// POST /api/restaurant/accuracy/logs — save or batch-save shift actual logs
router.post('/accuracy/logs', (req: AuthenticatedRequest, res) => {
  try {
    const userId = uid(req);
    const { logs, replaceAll } = req.body;

    if (!Array.isArray(logs)) {
      return res.status(400).json({ success: false, error: 'Logs must be an array.' });
    }

    const accuracyLogs = replaceAll
      ? saveUserRestaurantData(userId, { accuracyLogs: logs }).accuracyLogs
      : addShiftAccuracyLogs(userId, logs);

    return res.json({
      success: true,
      message: `Saved ${logs.length} shift actual log(s) to database.`,
      accuracyLogs,
    });
  } catch (error: any) {
    console.error('Error saving accuracy logs:', error);
    return res
      .status(500)
      .json({ success: false, error: 'Failed to save accuracy logs.' });
  }
});

// DELETE /api/restaurant/accuracy/logs/:id
router.delete('/accuracy/logs/:id', (req: AuthenticatedRequest, res) => {
  try {
    const accuracyLogs = deleteShiftAccuracyLog(uid(req), req.params.id);
    return res.json({ success: true, accuracyLogs });
  } catch (error: any) {
    console.error('Error deleting accuracy log:', error);
    return res
      .status(500)
      .json({ success: false, error: 'Failed to delete accuracy log.' });
  }
});

// POST /api/restaurant/reset-defaults — restore the account to demo data
router.post('/reset-defaults', (req: AuthenticatedRequest, res) => {
  try {
    const resetData = resetUserToDemoData(uid(req));
    return res.json({
      success: true,
      message: 'Account reset to initial restaurant configuration.',
      data: resetData,
    });
  } catch (error: any) {
    console.error('Error resetting defaults:', error);
    return res.status(500).json({ success: false, error: 'Failed to reset defaults.' });
  }
});

export default router;
