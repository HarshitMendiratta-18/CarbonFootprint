const {
  TRANSPORT_COEFFICIENTS,
  DIET_COEFFICIENTS,
  calculateTransportEmissions,
  calculateDietEmissions,
  calculateEnergyEmissions,
  calculateShoppingEmissions,
  calculateEcoScore,
  compileBaselineProfile
} = require('../src/utils/carbonCalculator');

describe('EcoPulse Carbon Calculator Tests', () => {

  // 1. Transportation Calculations
  describe('calculateTransportEmissions', () => {
    test('calculates correct emissions for sedan mode', () => {
      const distance = 100;
      const expected = Number((distance * TRANSPORT_COEFFICIENTS.sedan).toFixed(2));
      expect(calculateTransportEmissions('sedan', distance)).toBe(expected);
    });

    test('calculates correct emissions for SUV mode', () => {
      const distance = 50;
      const expected = Number((distance * TRANSPORT_COEFFICIENTS.suv).toFixed(2));
      expect(calculateTransportEmissions('suv', distance)).toBe(expected);
    });

    test('calculates correct emissions for EV mode', () => {
      const distance = 200;
      const expected = Number((distance * TRANSPORT_COEFFICIENTS.ev).toFixed(2));
      expect(calculateTransportEmissions('ev', distance)).toBe(expected);
    });

    test('returns 0 for active transit', () => {
      expect(calculateTransportEmissions('active', 300)).toBe(0);
    });

    test('gracefully handles missing or invalid mode parameters with sedan fallback', () => {
      const distance = 100;
      const expected = Number((distance * TRANSPORT_COEFFICIENTS.sedan).toFixed(2));
      expect(calculateTransportEmissions(null, distance)).toBe(expected);
      expect(calculateTransportEmissions('spaceship', distance)).toBe(expected);
    });

    test('handles negative distance parameters as zero emissions', () => {
      expect(calculateTransportEmissions('sedan', -50)).toBe(0);
    });

    test('handles non-numeric distance parameters as zero emissions', () => {
      expect(calculateTransportEmissions('sedan', 'abc')).toBe(0);
    });
  });

  // 2. Dietary Calculations
  describe('calculateDietEmissions', () => {
    test('calculates correct emissions for vegan diet', () => {
      const days = 7;
      const expected = Number((days * DIET_COEFFICIENTS.vegan).toFixed(2));
      expect(calculateDietEmissions('vegan', days)).toBe(expected);
    });

    test('calculates correct emissions for heavy meat diet', () => {
      const days = 10;
      const expected = Number((days * DIET_COEFFICIENTS.heavy_meat).toFixed(2));
      expect(calculateDietEmissions('heavy_meat', days)).toBe(expected);
    });

    test('gracefully handles missing or invalid diet with moderate meat fallback', () => {
      const expected = Number((1 * DIET_COEFFICIENTS.average_meat).toFixed(2));
      expect(calculateDietEmissions(null, 1)).toBe(expected);
      expect(calculateDietEmissions('junkfood', 1)).toBe(expected);
    });

    test('handles negative duration parameters as zero emissions', () => {
      expect(calculateDietEmissions('vegan', -5)).toBe(0);
    });
  });

  // 3. Home Energy Calculations
  describe('calculateEnergyEmissions', () => {
    test('divides emissions correctly by household size', () => {
      // Inputs: $150 elec, $120 gas, 3 occupants
      // Elec: 150 / 0.15 = 1000 kWh -> 1000 * 0.38 = 380 kg CO2. Divided by 3 = 126.67
      // Gas: 120 / 1.2 = 100 therms -> 100 * 2.0 = 200 kg CO2. Divided by 3 = 66.67
      // Expected total: 126.67 + 66.67 = 193.34
      const result = calculateEnergyEmissions(150, 120, 3);
      expect(result.electricity).toBeCloseTo(126.67, 1);
      expect(result.gas).toBeCloseTo(66.67, 1);
      expect(result.total).toBeCloseTo(193.34, 1);
    });

    test('handles single occupant household correctly', () => {
      const result = calculateEnergyEmissions(150, 120, 1);
      expect(result.electricity).toBe(380);
      expect(result.gas).toBe(200);
      expect(result.total).toBe(580);
    });

    test('handles missing or negative parameters gracefully', () => {
      const result = calculateEnergyEmissions(-10, null, -2);
      expect(result.electricity).toBe(0);
      expect(result.gas).toBe(0);
      expect(result.total).toBe(0);
    });
  });

  // 4. Shopping Calculations
  describe('calculateShoppingEmissions', () => {
    test('calculates correct daily value for high consumer profile', () => {
      // High baseline = 300 / 30 = 10 kg/day. 5 days = 50 kg CO2
      expect(calculateShoppingEmissions('high', 5)).toBe(50.0);
    });

    test('calculates correct daily value for low consumer profile', () => {
      // Low baseline = 50 / 30 = 1.667 kg/day. 3 days = 5.0 kg CO2
      expect(calculateShoppingEmissions('low', 3)).toBe(5.0);
    });

    test('gracefully handles missing parameters with medium fallback', () => {
      // Medium baseline = 150 / 30 = 5 kg/day. 2 days = 10 kg CO2
      expect(calculateShoppingEmissions(null, 2)).toBe(10.0);
    });
  });

  // 5. EcoScore Calculation
  describe('calculateEcoScore', () => {
    test('caps score at 100 for daily emissions of 10kg or lower', () => {
      expect(calculateEcoScore(5)).toBe(100);
      expect(calculateEcoScore(10)).toBe(100);
    });

    test('caps score at 10 for daily emissions of 50kg or higher', () => {
      expect(calculateEcoScore(50)).toBe(10);
      expect(calculateEcoScore(65)).toBe(10);
    });

    test('scales score linearly between 10kg and 50kg emissions', () => {
      // Formula: 100 - (daily - 10) * 2.25
      // For 30kg emissions: 100 - (30 - 10) * 2.25 = 100 - 45 = 55
      expect(calculateEcoScore(30)).toBe(55);
      
      // For 15kg emissions: 100 - 5 * 2.25 = 100 - 11.25 = 88.75 -> round to 89
      expect(calculateEcoScore(15)).toBe(89);
    });

    test('handles negative emissions values as perfect score of 100', () => {
      expect(calculateEcoScore(-15)).toBe(100);
    });
  });

  // 6. Onboarding Baseline Compilation
  describe('compileBaselineProfile', () => {
    test('creates full structured baseline object for standard answers', () => {
      const answers = {
        commuteMode: 'hybrid',
        commuteDistance: 140, // 140 km/week
        diet: 'vegetarian',
        electricityBill: 120, // $120/mo -> 120/0.15 = 800kWh -> 800*0.38 = 304kg CO2. Divided by 2 size = 152kg/mo
        heatingGas: 60, // $60/mo -> 60/1.2 = 50 therms -> 50*2 = 100kg CO2. Divided by 2 size = 50kg/mo
        householdSize: 2,
        shopping: 'medium'
      };

      const result = compileBaselineProfile(answers);
      
      expect(result).toHaveProperty('ecoScore');
      expect(result).toHaveProperty('emissions');
      expect(result.emissions).toHaveProperty('daily');
      expect(result.emissions).toHaveProperty('yearly');
      expect(result).toHaveProperty('inputs');

      // Verify transport: 140 km/week -> 140 * 0.10 coeff = 14 kg CO2/week. Divided by 7 days = 2.0 kg/day
      expect(result.emissions.daily.transport).toBe(2.0);

      // Verify diet: vegetarian = 3.8 kg/day
      expect(result.emissions.daily.diet).toBe(3.8);

      // Verify energy: (152 + 50) = 202 kg/mo -> 202 / 30 = 6.73 kg/day
      expect(result.emissions.daily.energy).toBeCloseTo(6.73, 1);

      // Verify shopping: medium = 150 / 30 = 5.0 kg/day
      expect(result.emissions.daily.shopping).toBe(5.0);

      // Verify daily total: 2.0 + 3.8 + 6.73 + 5.0 = 17.53 kg/day
      expect(result.emissions.daily.total).toBeCloseTo(17.53, 1);

      // Verify EcoScore: 100 - (17.53 - 10) * 2.25 = 100 - 16.94 = 83.06 -> 83
      expect(result.ecoScore).toBe(83);
    });

    test('handles empty or missing answers gracefully with fallback profile', () => {
      const result = compileBaselineProfile(null);
      expect(result.ecoScore).toBeDefined();
      expect(result.emissions.daily.total).toBeDefined();
    });
  });

});
