/**
 * EcoPulse Carbon Calculator Utility
 * 
 * This file contains standard scientific carbon emission coefficients
 * and functions to dynamically calculate personal carbon footprints.
 * All coefficients represent kg of CO2 equivalent (CO2e) per unit.
 */

// 1. Transportation coefficients (kg CO2e per km)
const TRANSPORT_COEFFICIENTS = {
  suv: 0.25,        // Gasoline-powered SUV
  sedan: 0.16,      // Gasoline-powered Sedan/Hatchback
  hybrid: 0.10,     // Hybrid vehicle (gas/electric)
  ev: 0.05,         // Electric Vehicle (based on average grid intensity)
  transit: 0.06,    // Public transit (bus/train average)
  active: 0.00      // Walking, running, cycling (zero emissions)
};

// 2. Diet coefficients (kg CO2e per day)
const DIET_COEFFICIENTS = {
  heavy_meat: 7.20,  // Frequent red meat/pork consumption
  average_meat: 5.40,// Moderate meat consumption (poultry/fish/mixed)
  vegetarian: 3.80,  // Dairy, eggs, no meat
  vegan: 2.90        // Plant-based diet
};

// 3. Home Energy constants (kg CO2e per unit)
const ENERGY_COEFFICIENTS = {
  electricity_kwh: 0.38, // Average grid carbon intensity in kg CO2/kWh
  natural_gas_therm: 2.00, // Natural gas carbon intensity in kg CO2/therm
  avg_electricity_rate: 0.15, // Approximate price per kWh ($)
  avg_gas_rate: 1.20         // Approximate price per therm ($)
};

// 4. Shopping/Consumption coefficients (kg CO2e per month baseline)
const SHOPPING_COEFFICIENTS = {
  high: 300.0,   // Frequent new electronics, clothing, fast fashion
  medium: 150.0, // Standard consumer purchasing behavior
  low: 50.0      // Minimalist, secondhand, circular shopping
};

/**
 * Calculates carbon footprint for transportation.
 * @param {string} mode - Mode of transit (suv, sedan, hybrid, ev, transit, active)
 * @param {number} distanceKm - Distance traveled in kilometers
 * @returns {number} Emissions in kg CO2e
 */
function calculateTransportEmissions(mode, distanceKm) {
  try {
    const activeMode = (mode || '').toLowerCase();
    const coefficient = TRANSPORT_COEFFICIENTS[activeMode] !== undefined 
      ? TRANSPORT_COEFFICIENTS[activeMode] 
      : TRANSPORT_COEFFICIENTS.sedan; // Fallback to sedan
    
    const distance = Math.max(0, Number(distanceKm) || 0);
    return Number((distance * coefficient).toFixed(2));
  } catch (error) {
    console.error('Error in calculateTransportEmissions:', error);
    return 0;
  }
}

/**
 * Calculates carbon footprint for diet.
 * @param {string} dietType - Type of diet (heavy_meat, average_meat, vegetarian, vegan)
 * @param {number} days - Number of days to calculate for
 * @returns {number} Emissions in kg CO2e
 */
function calculateDietEmissions(dietType, days = 1) {
  try {
    const activeDiet = (dietType || '').toLowerCase();
    const coefficient = DIET_COEFFICIENTS[activeDiet] !== undefined
      ? DIET_COEFFICIENTS[activeDiet]
      : DIET_COEFFICIENTS.average_meat; // Fallback to average meat
    
    const durationDays = Math.max(0, Number(days) || 0);
    return Number((durationDays * coefficient).toFixed(2));
  } catch (error) {
    console.error('Error in calculateDietEmissions:', error);
    return 0;
  }
}

/**
 * Calculates carbon footprint for home energy based on utility bills.
 * @param {number} electricityBill - Monthly electricity bill in USD
 * @param {number} heatingGasBill - Monthly gas/heating bill in USD
 * @param {number} householdSize - Number of occupants sharing the bills
 * @returns {object} Monthly emissions breakdown in kg CO2e (total, electricity, gas)
 */
function calculateEnergyEmissions(electricityBill, heatingGasBill, householdSize = 1) {
  try {
    const size = Math.max(1, Number(householdSize) || 1);
    const elecBill = Math.max(0, Number(electricityBill) || 0);
    const gasBill = Math.max(0, Number(heatingGasBill) || 0);

    // Estimate kWh from bill amount
    const estimatedKwh = elecBill / ENERGY_COEFFICIENTS.avg_electricity_rate;
    const electricityEmissions = (estimatedKwh * ENERGY_COEFFICIENTS.electricity_kwh) / size;

    // Estimate therms from bill amount
    const estimatedTherms = gasBill / ENERGY_COEFFICIENTS.avg_gas_rate;
    const gasEmissions = (estimatedTherms * ENERGY_COEFFICIENTS.natural_gas_therm) / size;

    return {
      electricity: Number(electricityEmissions.toFixed(2)),
      gas: Number(gasEmissions.toFixed(2)),
      total: Number((electricityEmissions + gasEmissions).toFixed(2))
    };
  } catch (error) {
    console.error('Error in calculateEnergyEmissions:', error);
    return { electricity: 0, gas: 0, total: 0 };
  }
}

/**
 * Calculates shopping and consumption carbon footprint.
 * @param {string} shoppingLevel - Level of shopping (high, medium, low)
 * @param {number} days - Number of days to calculate for
 * @returns {number} Emissions in kg CO2e
 */
function calculateShoppingEmissions(shoppingLevel, days = 1) {
  try {
    const level = (shoppingLevel || '').toLowerCase();
    const monthlyBaseline = SHOPPING_COEFFICIENTS[level] !== undefined
      ? SHOPPING_COEFFICIENTS[level]
      : SHOPPING_COEFFICIENTS.medium; // Fallback to medium

    const dailyCoefficient = monthlyBaseline / 30.0;
    const durationDays = Math.max(0, Number(days) || 0);
    return Number((durationDays * dailyCoefficient).toFixed(2));
  } catch (error) {
    console.error('Error in calculateShoppingEmissions:', error);
    return 0;
  }
}

/**
 * Maps daily carbon footprint (kg CO2e) to a standardized credit-score-like EcoScore (10-100).
 * Target baseline: 15 kg CO2e/day is normal/average.
 * Excellent target: Under 10 kg CO2e/day (receives score ~100).
 * Poor rating: Above 50 kg CO2e/day (receives minimum score of 10).
 * @param {number} dailyEmissions - User's daily emissions in kg CO2e
 * @returns {number} EcoScore between 10 and 100
 */
function calculateEcoScore(dailyEmissions) {
  try {
    const daily = Math.max(0, Number(dailyEmissions) || 0);
    
    if (daily <= 10) {
      return 100;
    }
    if (daily >= 50) {
      return 10;
    }
    
    // Scale linearly between 10 kg (Score 100) and 50 kg (Score 10)
    // Formula: 100 - (daily - 10) * (90 / 40)
    const score = 100 - (daily - 10) * 2.25;
    return Math.round(score);
  } catch (error) {
    console.error('Error in calculateEcoScore:', error);
    return 50; // Fallback average score
  }
}

/**
 * Processes the multi-step onboarding survey answers to compile a baseline carbon profile.
 * @param {object} answers - Onboarding survey questionnaire responses
 * @returns {object} Full baseline report with yearly/daily emissions and EcoScore
 */
function compileBaselineProfile(answers) {
  try {
    const rawAnswers = answers || {};
    
    // 1. Calculate Transport (weekly commute to daily/yearly)
    const weeklyTransitDistance = Number(rawAnswers.commuteDistance) || 0;
    const transitMode = rawAnswers.commuteMode || 'sedan';
    const dailyTransportEmissions = calculateTransportEmissions(transitMode, weeklyTransitDistance) / 7;

    // 2. Calculate Diet (daily baseline)
    const dietType = rawAnswers.diet || 'average_meat';
    const dailyDietEmissions = calculateDietEmissions(dietType, 1);

    // 3. Calculate Home Energy (monthly bills to daily/yearly shared emissions)
    const elecBill = Number(rawAnswers.electricityBill) || 0;
    const gasBill = Number(rawAnswers.heatingGas) || 0;
    const householdSize = Number(rawAnswers.householdSize) || 1;
    const energyEmissions = calculateEnergyEmissions(elecBill, gasBill, householdSize);
    const dailyEnergyEmissions = energyEmissions.total / 30;

    // 4. Calculate Shopping (monthly to daily)
    const shoppingLevel = rawAnswers.shopping || 'medium';
    const dailyShoppingEmissions = calculateShoppingEmissions(shoppingLevel, 1);

    // 5. Aggregate Daily Emissions
    const dailyTotal = dailyTransportEmissions + dailyDietEmissions + dailyEnergyEmissions + dailyShoppingEmissions;
    const yearlyTotal = dailyTotal * 365;

    // 6. Calculate Score
    const score = calculateEcoScore(dailyTotal);

    return {
      ecoScore: score,
      emissions: {
        daily: {
          transport: Number(dailyTransportEmissions.toFixed(2)),
          diet: Number(dailyDietEmissions.toFixed(2)),
          energy: Number(dailyEnergyEmissions.toFixed(2)),
          shopping: Number(dailyShoppingEmissions.toFixed(2)),
          total: Number(dailyTotal.toFixed(2))
        },
        yearly: {
          transport: Number((dailyTransportEmissions * 365).toFixed(2)),
          diet: Number((dailyDietEmissions * 365).toFixed(2)),
          energy: Number((dailyEnergyEmissions * 365).toFixed(2)),
          shopping: Number((dailyShoppingEmissions * 365).toFixed(2)),
          total: Number(yearlyTotal.toFixed(2))
        }
      },
      inputs: {
        commuteMode: transitMode,
        commuteDistanceWeekly: weeklyTransitDistance,
        diet: dietType,
        electricityBillMonthly: elecBill,
        heatingGasBillMonthly: gasBill,
        householdSize: householdSize,
        shopping: shoppingLevel
      }
    };
  } catch (error) {
    console.error('Error in compileBaselineProfile:', error);
    // Fallback baseline report
    return {
      ecoScore: 50,
      emissions: {
        daily: { transport: 4, diet: 5.4, energy: 3, shopping: 5, total: 17.4 },
        yearly: { transport: 1460, diet: 1971, energy: 1095, shopping: 1825, total: 6351 }
      },
      inputs: {}
    };
  }
}

module.exports = {
  TRANSPORT_COEFFICIENTS,
  DIET_COEFFICIENTS,
  ENERGY_COEFFICIENTS,
  SHOPPING_COEFFICIENTS,
  calculateTransportEmissions,
  calculateDietEmissions,
  calculateEnergyEmissions,
  calculateShoppingEmissions,
  calculateEcoScore,
  compileBaselineProfile
};
