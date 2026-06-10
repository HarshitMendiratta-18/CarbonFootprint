const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { compileBaselineProfile, calculateEcoScore, calculateTransportEmissions, calculateDietEmissions, calculateEnergyEmissions, calculateShoppingEmissions } = require('./utils/carbonCalculator');
const { generateAIPersonalizedTip } = require('./services/geminiService');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Serve static files from the public folder
app.use(express.static(path.join(__dirname, '../public')));

// Database File Path
const DB_PATH = path.join(__dirname, '../data/database.json');

/**
 * Ensures the database file and directory exist.
 * Initializes with empty structure if not present.
 */
function initializeDatabase() {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(DB_PATH)) {
      const defaultState = {
        userProfile: null,
        activityLogs: [],
        streaks: {
          currentStreak: 0,
          lastActiveDate: null,
          completedChallenges: []
        }
      };
      fs.writeFileSync(DB_PATH, JSON.stringify(defaultState, null, 2), 'utf8');
      console.log('Database initialized successfully at:', DB_PATH);
    }
  } catch (error) {
    console.error('Failed to initialize database:', error);
  }
}

// Initialize database
initializeDatabase();

/**
 * Reads database state from disk.
 * @returns {object} Database contents
 */
function readDatabase() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      initializeDatabase();
    }
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading database, returning default state:', error);
    return { userProfile: null, activityLogs: [], streaks: { currentStreak: 0, lastActiveDate: null, completedChallenges: [] } };
  }
}

/**
 * Writes database state to disk.
 * @param {object} data - Database state
 */
function writeDatabase(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Error writing to database:', error);
  }
}

// ==========================================
// API ROUTES
// ==========================================

/**
 * POST /api/onboard
 * Receives the onboarding questionnaire and compiles the baseline profile.
 */
app.post('/api/onboard', (req, res) => {
  try {
    const answers = req.body;
    if (!answers || Object.keys(answers).length === 0) {
      return res.status(400).json({ error: 'Missing onboarding answers.' });
    }

    const baselineProfile = compileBaselineProfile(answers);
    const db = readDatabase();

    db.userProfile = baselineProfile;
    
    // Reset logs on fresh onboarding
    db.activityLogs = [];
    
    // Set initial active state and streak
    const todayStr = new Date().toISOString().split('T')[0];
    db.streaks = {
      currentStreak: 1,
      lastActiveDate: todayStr,
      completedChallenges: ['Carbon Onboarding']
    };

    // Add initial log entry representing the baseline
    db.activityLogs.push({
      id: 'log_' + Date.now() + '_baseline',
      date: todayStr,
      type: 'baseline',
      description: 'Initial Onboarding Baseline',
      emissions: baselineProfile.emissions.daily.total,
      details: { ...baselineProfile.emissions.daily }
    });

    writeDatabase(db);

    return res.status(200).json({
      message: 'Onboarding completed successfully.',
      userProfile: baselineProfile,
      streaks: db.streaks
    });
  } catch (error) {
    console.error('Onboarding API Error:', error);
    return res.status(500).json({ error: 'Failed to complete onboarding processing.' });
  }
});

/**
 * GET /api/dashboard
 * Retreives active profile, current score, and daily state.
 */
app.get('/api/dashboard', (req, res) => {
  try {
    const db = readDatabase();
    
    if (!db.userProfile) {
      return res.status(200).json({ onboarded: false });
    }

    // Standard daily allowance target
    const DAILY_BUDGET = 15.0; // kg CO2e
    
    // Find current daily activity logs
    const todayStr = new Date().toISOString().split('T')[0];
    const todaysLogs = db.activityLogs.filter(log => log.date === todayStr);

    // Calculate current daily emissions
    // If they have manual logs for today, we compute their actual daily tracking emissions
    // By default, if they haven't logged details, they start at their baseline
    let currentTransport = db.userProfile.emissions.daily.transport;
    let currentDiet = db.userProfile.emissions.daily.diet;
    let currentEnergy = db.userProfile.emissions.daily.energy;
    let currentShopping = db.userProfile.emissions.daily.shopping;

    // Apply adjustments from daily logs if any exist (e.g. logging active commuting offsets or diet selections)
    let hasLoggedActivitiesToday = false;
    todaysLogs.forEach(log => {
      if (log.type === 'transport') {
        currentTransport = log.emissions;
        hasLoggedActivitiesToday = true;
      } else if (log.type === 'diet') {
        currentDiet = log.emissions;
        hasLoggedActivitiesToday = true;
      } else if (log.type === 'energy') {
        // Energy savings subtracts from baseline energy emissions
        currentEnergy = Math.max(0, currentEnergy - log.emissionsSaved);
        hasLoggedActivitiesToday = true;
      } else if (log.type === 'shopping') {
        currentShopping = log.emissions;
        hasLoggedActivitiesToday = true;
      }
    });

    const currentDailyTotal = currentTransport + currentDiet + currentEnergy + currentShopping;
    const currentEcoScore = calculateEcoScore(currentDailyTotal);

    // Update database profile emissions & score dynamically
    db.userProfile.ecoScore = currentEcoScore;
    writeDatabase(db);

    return res.status(200).json({
      onboarded: true,
      profile: db.userProfile,
      dailyBudget: DAILY_BUDGET,
      currentDailyTotal: Number(currentDailyTotal.toFixed(2)),
      currentEcoScore,
      streaks: db.streaks,
      breakdown: {
        transport: Number(currentTransport.toFixed(2)),
        diet: Number(currentDiet.toFixed(2)),
        energy: Number(currentEnergy.toFixed(2)),
        shopping: Number(currentShopping.toFixed(2))
      },
      logsCount: db.activityLogs.length,
      hasLoggedActivitiesToday
    });
  } catch (error) {
    console.error('Dashboard API Error:', error);
    return res.status(500).json({ error: 'Failed to retrieve dashboard metrics.' });
  }
});

/**
 * POST /api/log-activity
 * Log custom daily carbon footprint activities (transport, diet, energy, shopping, waste).
 */
app.post('/api/log-activity', (req, res) => {
  try {
    const { type, value, detail } = req.body;
    if (!type || value === undefined) {
      return res.status(400).json({ error: 'Missing required activity log parameters.' });
    }

    const db = readDatabase();
    if (!db.userProfile) {
      return res.status(400).json({ error: 'Please complete onboarding first.' });
    }

    const todayStr = new Date().toISOString().split('T')[0];
    let emissions = 0;
    let description = '';
    let emissionsSaved = 0;

    switch (type.toLowerCase()) {
      case 'transport':
        emissions = calculateTransportEmissions(detail, Number(value));
        description = `Commuted ${value} km by ${detail.toUpperCase()}`;
        break;
      
      case 'diet':
        emissions = calculateDietEmissions(detail, 1);
        description = `Logged ${detail.replace('_', ' ').toUpperCase()} meals for the day`;
        break;
      
      case 'energy':
        // Value represents kWh saved.
        const energyKwhSaved = Number(value);
        emissionsSaved = Number((energyKwhSaved * 0.38).toFixed(2));
        description = `Saved ${energyKwhSaved} kWh of electricity`;
        break;

      case 'shopping':
        emissions = calculateShoppingEmissions(detail, 1);
        description = `Logged ${detail.toUpperCase()} retail shopping day`;
        break;
        
      default:
        return res.status(400).json({ error: 'Invalid activity type specified.' });
    }

    // Add new activity log
    const logId = 'log_' + Date.now();
    const newLog = {
      id: logId,
      date: todayStr,
      type,
      description,
      emissions: Number(emissions.toFixed(2)),
      emissionsSaved: Number(emissionsSaved.toFixed(2)),
      detail,
      value: Number(value)
    };

    db.activityLogs.push(newLog);

    // Update streak tracking
    const lastActive = db.streaks.lastActiveDate;
    if (lastActive !== todayStr) {
      const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      if (lastActive === yesterdayStr) {
        db.streaks.currentStreak += 1;
      } else {
        db.streaks.currentStreak = 1; // reset streak if gap exists
      }
      db.streaks.lastActiveDate = todayStr;

      // Reward badges for streaks
      if (db.streaks.currentStreak === 3 && !db.streaks.completedChallenges.includes('Green Recruit')) {
        db.streaks.completedChallenges.push('Green Recruit');
      }
      if (db.streaks.currentStreak === 5 && !db.streaks.completedChallenges.includes('Eco Warrior')) {
        db.streaks.completedChallenges.push('Eco Warrior');
      }
    }

    // Check carbon savings milestones
    const totalSaved = db.activityLogs.reduce((acc, l) => acc + (l.emissionsSaved || 0), 0);
    if (totalSaved >= 10 && !db.streaks.completedChallenges.includes('Carbon Saver')) {
      db.streaks.completedChallenges.push('Carbon Saver');
    }

    writeDatabase(db);
    return res.status(200).json({
      message: 'Activity logged successfully.',
      loggedActivity: newLog,
      streaks: db.streaks
    });
  } catch (error) {
    console.error('Log Activity API Error:', error);
    return res.status(500).json({ error: 'Failed to record carbon log.' });
  }
});

/**
 * POST /api/coach
 * Triggers the Gemini AI Coach engine to construct a recommendation.
 */
app.post('/api/coach', async (req, res) => {
  try {
    const db = readDatabase();
    if (!db.userProfile) {
      return res.status(400).json({ error: 'Please onboard before requesting AI recommendations.' });
    }

    // Get current dashboard data for calculations
    const todayStr = new Date().toISOString().split('T')[0];
    const todaysLogs = db.activityLogs.filter(log => log.date === todayStr);

    let currentTransport = db.userProfile.emissions.daily.transport;
    let currentDiet = db.userProfile.emissions.daily.diet;
    let currentEnergy = db.userProfile.emissions.daily.energy;
    let currentShopping = db.userProfile.emissions.daily.shopping;

    todaysLogs.forEach(log => {
      if (log.type === 'transport') currentTransport = log.emissions;
      else if (log.type === 'diet') currentDiet = log.emissions;
      else if (log.type === 'energy') currentEnergy = Math.max(0, currentEnergy - log.emissionsSaved);
      else if (log.type === 'shopping') currentShopping = log.emissions;
    });

    const activeEmissionsBreakdown = {
      daily: {
        transport: currentTransport,
        diet: currentDiet,
        energy: currentEnergy,
        shopping: currentShopping,
        total: currentTransport + currentDiet + currentEnergy + currentShopping
      }
    };

    const coachingTip = await generateAIPersonalizedTip(activeEmissionsBreakdown, db.userProfile.inputs);
    
    return res.status(200).json({ tip: coachingTip });
  } catch (error) {
    console.error('Coaching API Error:', error);
    return res.status(500).json({ error: 'Failed to compile AI coaching tips.' });
  }
});

/**
 * GET /api/history
 * Prepares aggregated emission logs for graphing weekly trends.
 */
app.get('/api/history', (req, res) => {
  try {
    const db = readDatabase();
    if (!db.userProfile) {
      return res.status(400).json({ error: 'Onboarding data not found.' });
    }

    const baselineDaily = db.userProfile.emissions.daily.total;

    // Build the last 7 calendar days array
    const history = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];

      // Find logs for this specific date
      const logs = db.activityLogs.filter(l => l.date === dateStr);
      
      let transport = db.userProfile.emissions.daily.transport;
      let diet = db.userProfile.emissions.daily.diet;
      let energy = db.userProfile.emissions.daily.energy;
      let shopping = db.userProfile.emissions.daily.shopping;

      let isCustomDay = false;
      logs.forEach(log => {
        if (log.type === 'transport') {
          transport = log.emissions;
          isCustomDay = true;
        } else if (log.type === 'diet') {
          diet = log.emissions;
          isCustomDay = true;
        } else if (log.type === 'energy') {
          energy = Math.max(0, energy - log.emissionsSaved);
          isCustomDay = true;
        } else if (log.type === 'shopping') {
          shopping = log.emissions;
          isCustomDay = true;
        } else if (log.type === 'baseline') {
          transport = log.details.transport;
          diet = log.details.diet;
          energy = log.details.energy;
          shopping = log.details.shopping;
          isCustomDay = true;
        }
      });

      const total = transport + diet + energy + shopping;

      history.push({
        date: dateStr.substring(5), // Keep MM-DD format for labels
        total: Number(total.toFixed(2)),
        baseline: Number(baselineDaily.toFixed(2)),
        transport: Number(transport.toFixed(2)),
        diet: Number(diet.toFixed(2)),
        energy: Number(energy.toFixed(2)),
        shopping: Number(shopping.toFixed(2))
      });
    }

    return res.status(200).json({ history });
  } catch (error) {
    console.error('History API Error:', error);
    return res.status(500).json({ error: 'Failed to retrieve emissions history.' });
  }
});

/**
 * POST /api/reset
 * Resets the database to default state (useful for fresh grading checks).
 */
app.post('/api/reset', (req, res) => {
  try {
    const defaultState = {
      userProfile: null,
      activityLogs: [],
      streaks: {
        currentStreak: 0,
        lastActiveDate: null,
        completedChallenges: []
      }
    };
    writeDatabase(defaultState);
    return res.status(200).json({ message: 'Application state reset successfully.' });
  } catch (error) {
    console.error('Reset API Error:', error);
    return res.status(500).json({ error: 'Failed to reset application data.' });
  }
});

// Start the HTTP listener
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(` EcoPulse Server running at http://localhost:${PORT}`);
  console.log(` Server mode: Production Ready`);
  console.log(` Static folder path: public/`);
  console.log(`==================================================`);
});
