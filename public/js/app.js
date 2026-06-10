/**
 * EcoPulse Frontend Application Controller
 * Handles Onboarding wizard, dynamic gauge rendering, activity logging,
 * custom SVG trend charts, and API integrations.
 */

const API_BASE = ''; // Root relative for unified deployment

// State management
let currentQuizStep = 1;
const totalQuizSteps = 5;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  setupSliderBubble();
  checkExistingSession();
});

// ==========================================
// 1. ONBOARDING & QUIZ WIZARD FLOW
// ==========================================

/**
 * Setup weekly distance slider bubble to show current value.
 */
function setupSliderBubble() {
  const slider = document.getElementById('distance-slider');
  const bubble = document.getElementById('distance-val');
  
  if (slider && bubble) {
    slider.addEventListener('input', (e) => {
      bubble.textContent = e.target.value;
    });
  }
}

/**
 * Go to next step in the wizard.
 */
function nextStep() {
  if (currentQuizStep < totalQuizSteps) {
    // Hide current step
    document.querySelector(`.quiz-step[data-step="${currentQuizStep}"]`).classList.remove('active');
    
    currentQuizStep++;
    
    // Show next step
    document.querySelector(`.quiz-step[data-step="${currentQuizStep}"]`).classList.add('active');
    
    // Update progress bar
    updateQuizProgress();
    
    // Enable back button
    document.getElementById('prev-btn').classList.remove('disabled');
    
    // Handle last step button changes
    if (currentQuizStep === totalQuizSteps) {
      document.getElementById('next-btn').classList.add('hide');
      document.getElementById('submit-btn').classList.remove('hide');
    }
  }
}

/**
 * Go to previous step in the wizard.
 */
function prevStep() {
  if (currentQuizStep > 1) {
    // Hide current step
    document.querySelector(`.quiz-step[data-step="${currentQuizStep}"]`).classList.remove('active');
    
    currentQuizStep--;
    
    // Show previous step
    document.querySelector(`.quiz-step[data-step="${currentQuizStep}"]`).classList.add('active');
    
    // Update progress bar
    updateQuizProgress();
    
    // Handle button display
    document.getElementById('next-btn').classList.remove('hide');
    document.getElementById('submit-btn').classList.add('hide');
    
    if (currentQuizStep === 1) {
      document.getElementById('prev-btn').classList.add('disabled');
    }
  }
}

/**
 * Updates the visual indicators of onboarding progress.
 */
function updateQuizProgress() {
  const percent = (currentQuizStep / totalQuizSteps) * 100;
  document.getElementById('quiz-progress').style.width = `${percent}%`;
  
  // Update step dots
  const dots = document.querySelectorAll('.step-dot');
  dots.forEach((dot, idx) => {
    if (idx < currentQuizStep) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });
}

// Stepper utility functions for numeric input incrementing
function stepUp(inputId) {
  const input = document.getElementById(inputId);
  if (input) {
    const val = Number(input.value) || 1;
    const max = Number(input.max) || 10;
    if (val < max) {
      input.value = val + 1;
    }
  }
}

function stepDown(inputId) {
  const input = document.getElementById(inputId);
  if (input) {
    const val = Number(input.value) || 1;
    const min = Number(input.min) || 1;
    if (val > min) {
      input.value = val - 1;
    }
  }
}

/**
 * Check if the user is already onboarded on startup.
 */
async function checkExistingSession() {
  try {
    const response = await fetch(`${API_BASE}/api/dashboard`);
    if (response.ok) {
      const data = await response.json();
      if (data.onboarded) {
        // Direct transition to dashboard screen
        showScreen('dashboard-screen');
        updateDashboardView(data);
        fetchHistoryAndRenderChart();
        // Load initial AI tip silently
        loadCoachingTipSilent();
      } else {
        showScreen('onboarding-screen');
      }
    }
  } catch (error) {
    console.error('Session check failed:', error);
    showScreen('onboarding-screen'); // fallback
  }
}

/**
 * Switches the active viewport screen.
 * @param {string} screenId - ID of screen container
 */
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(scr => {
    scr.classList.remove('active');
  });
  
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add('active');
  }
}

/**
 * Gathers quiz inputs and triggers the baseline calculation endpoint.
 */
async function submitOnboarding() {
  try {
    const form = document.getElementById('onboarding-form');
    const formData = new FormData(form);
    
    // Structure payload
    const payload = {
      commuteMode: formData.get('commuteMode'),
      commuteDistance: Number(formData.get('commuteDistance')) || 0,
      diet: formData.get('diet'),
      electricityBill: Number(formData.get('electricityBill')) || 0,
      heatingGas: Number(formData.get('heatingGas')) || 0,
      householdSize: Number(document.getElementById('householdSize').value) || 1,
      shopping: formData.get('shopping')
    };

    const response = await fetch(`${API_BASE}/api/onboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error('Onboarding calculation failed.');
    }

    const data = await response.json();
    showNotification('Baseline Profile Generated!');
    
    // Switch to dashboard
    showScreen('dashboard-screen');
    
    // Trigger full metrics reload
    await refreshDashboardMetrics();
    await fetchHistoryAndRenderChart();
    await fetchAICoachTip();
    
  } catch (error) {
    console.error('Submit onboarding error:', error);
    showNotification('Error compiling baseline profile. Please try again.', true);
  }
}

// ==========================================
// 2. DASHBOARD UPDATE METHODS
// ==========================================

/**
 * Performs a fresh fetch of the dashboard stats and refreshes view elements.
 */
async function refreshDashboardMetrics() {
  try {
    const response = await fetch(`${API_BASE}/api/dashboard`);
    if (response.ok) {
      const data = await response.json();
      updateDashboardView(data);
    }
  } catch (error) {
    console.error('Refresh dashboard metrics failed:', error);
  }
}

/**
 * Updates UI nodes with dashboard data object details.
 * @param {object} data - Dashboard API payload
 */
function updateDashboardView(data) {
  if (!data || !data.profile) return;
  
  const score = data.currentEcoScore || 50;
  const dailyTotal = data.currentDailyTotal || 0;
  const streaks = data.streaks || { currentStreak: 0, completedChallenges: [] };
  const breakdown = data.breakdown || {};
  
  // 1. Update Score Elements
  document.getElementById('dashboard-score').textContent = score;
  document.getElementById('dashboard-emissions').textContent = dailyTotal.toFixed(2);
  
  // Circle progress math (r=80, circum=2*pi*80 = 502.6)
  const circleRadius = 80;
  const circumference = 2 * Math.PI * circleRadius;
  const progressPercent = score / 100;
  const offset = circumference * (1 - progressPercent);
  
  const fillBar = document.getElementById('gauge-bar');
  if (fillBar) {
    fillBar.style.strokeDasharray = `${circumference}`;
    fillBar.style.strokeDashoffset = `${offset}`;
    
    // Dynamic color coding of gauge bar based on score
    if (score >= 70) {
      fillBar.style.stroke = 'var(--neon-green)';
      fillBar.style.filter = 'drop-shadow(0 0 6px var(--neon-green))';
    } else if (score >= 40) {
      fillBar.style.stroke = 'var(--vibrant-teal)';
      fillBar.style.filter = 'drop-shadow(0 0 6px var(--vibrant-teal))';
    } else {
      fillBar.style.stroke = 'var(--soft-coral)';
      fillBar.style.filter = 'drop-shadow(0 0 6px var(--soft-coral))';
    }
  }

  // 2. Daily Budget status indicator
  const budgetStatus = document.getElementById('budget-status');
  if (budgetStatus) {
    if (dailyTotal <= data.dailyBudget) {
      budgetStatus.className = 'status-indicator low';
      budgetStatus.innerHTML = '<i class="fa-solid fa-circle-check"></i> On-Track';
    } else {
      budgetStatus.className = 'status-indicator high';
      budgetStatus.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Over Budget';
    }
  }

  // 3. Update Streaks count
  document.getElementById('streak-count').textContent = streaks.currentStreak || 0;

  // 4. Update Badges
  const badgeIds = {
    'Carbon Onboarding': 'badge-baseline',
    'Green Recruit': 'badge-streak-3',
    'Eco Warrior': 'badge-streak-5',
    'Carbon Saver': 'badge-saving'
  };

  // Reset lock status
  Object.values(badgeIds).forEach(id => {
    document.getElementById(id).classList.add('locked');
  });

  // Unlock earned challenges
  if (streaks.completedChallenges && Array.isArray(streaks.completedChallenges)) {
    streaks.completedChallenges.forEach(badgeName => {
      const elId = badgeIds[badgeName];
      if (elId) {
        document.getElementById(elId).classList.remove('locked');
      }
    });
  }

  // 5. Update Sector breakdown values and progressive bars
  const maxCategoryEmissions = 15; // standard cap reference for 100% width index
  const categoriesList = ['transport', 'diet', 'energy', 'shopping'];
  
  categoriesList.forEach(cat => {
    const val = breakdown[cat] || 0;
    document.getElementById(`heat-val-${cat}`).textContent = val.toFixed(2);
    
    // Scale progress bars relative to reference allowance limits
    const barWidthPercent = Math.min(100, (val / maxCategoryEmissions) * 100);
    document.getElementById(`heat-bar-${cat}`).style.width = `${barWidthPercent}%`;
  });
}

// ==========================================
// 3. QUICK LOGGER TAB INTERACTIONS
// ==========================================

/**
 * Handle tabs switching inside activity logger console.
 * @param {string} activeTabId - ID of tab container
 */
function switchLogTab(activeTabId) {
  // Reset tab buttons active states
  const buttons = document.querySelectorAll('.logger-tabs .tab-btn');
  buttons.forEach(btn => {
    if (btn.getAttribute('data-tab') === activeTabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Switch display grids
  const contentPanels = document.querySelectorAll('.logger-tab-content');
  contentPanels.forEach(panel => {
    if (panel.id === activeTabId) {
      panel.classList.add('active');
    } else {
      panel.classList.remove('active');
    }
  });
}

/**
 * Form submissions dispatcher to backend activities logger API.
 * @param {Event} event - form submit event
 * @param {string} type - category logs identifier
 */
async function submitActivity(event, type) {
  event.preventDefault();
  try {
    let value, detail;

    if (type === 'transport') {
      detail = document.getElementById('log-transit-mode').value;
      value = document.getElementById('log-transit-km').value;
    } else if (type === 'diet') {
      detail = document.getElementById('log-diet-profile').value;
      value = 1; // single day entry
    } else if (type === 'energy') {
      detail = 'electricity';
      value = document.getElementById('log-energy-saved').value;
    } else if (type === 'shopping') {
      detail = document.getElementById('log-shopping-level').value;
      value = 1; // single day entry
    }

    const payload = { type, value: Number(value), detail };

    const response = await fetch(`${API_BASE}/api/log-activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error('Failed to record activity log.');
    }

    const resData = await response.json();
    showNotification(resData.message || 'Activity Logged successfully!');

    // Reset numeric inputs
    if (type === 'transport') {
      document.getElementById('log-transit-km').value = '15';
    } else if (type === 'energy') {
      document.getElementById('log-energy-saved').value = '5';
    }

    // Refresh calculations, historical graph, and check badge changes
    await refreshDashboardMetrics();
    await fetchHistoryAndRenderChart();
    
  } catch (error) {
    console.error('Log activity error:', error);
    showNotification('Error recording carbon log.', true);
  }
}

// ==========================================
// 4. GEMINI AI COACH CLIENT SERVICES
// ==========================================

/**
 * Triggers the AI Coach tips generation spinner and displays output tips.
 */
async function fetchAICoachTip() {
  const btn = document.getElementById('refresh-coach-btn');
  const loader = document.getElementById('coach-loader');
  const textContainer = document.getElementById('coach-text');
  
  try {
    // Show spinner & disable actions
    if (btn) btn.disabled = true;
    if (loader) loader.classList.remove('hide');
    if (textContainer) textContainer.classList.add('hide');

    const response = await fetch(`${API_BASE}/api/coach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error('AI Coach service error.');
    }

    const data = await response.json();
    
    // Display coach advice content
    if (textContainer) {
      textContainer.innerHTML = `"${data.tip}"`;
    }
  } catch (error) {
    console.error('AI Coach request failed:', error);
    if (textContainer) {
      textContainer.innerHTML = `"I'm having trouble analyzing the grid currently. Try cycling to commute or washing laundry in cold water to save 1.5kg of CO2 today."`;
    }
  } finally {
    // Hide spinner
    if (btn) btn.disabled = false;
    if (loader) loader.classList.add('hide');
    if (textContainer) textContainer.classList.remove('hide');
  }
}

/**
 * Loads the coaching tip silently without blocking the loader visual for instant view.
 */
async function loadCoachingTipSilent() {
  try {
    const response = await fetch(`${API_BASE}/api/coach`, { method: 'POST' });
    if (response.ok) {
      const data = await response.json();
      const textContainer = document.getElementById('coach-text');
      if (textContainer) {
        textContainer.innerHTML = `"${data.tip}"`;
      }
    }
  } catch (err) {
    console.warn('Silent coach tip load failed, using default onboarding state.');
  }
}

// ==========================================
// 5. VECTOR HISTORICAL TREND CHART RENDERING
// ==========================================

/**
 * Fetches historical aggregated logs and draws the SVG elements dynamically.
 */
async function fetchHistoryAndRenderChart() {
  try {
    const response = await fetch(`${API_BASE}/api/history`);
    if (!response.ok) return;

    const { history } = await response.json();
    if (!history || history.length === 0) return;

    const chartBarsGroup = document.getElementById('chart-bars');
    const chartLabelsGroup = document.getElementById('chart-labels');
    const baselineLine = document.getElementById('chart-baseline-line');

    if (!chartBarsGroup || !chartLabelsGroup) return;

    // Reset chart container elements
    chartBarsGroup.innerHTML = '';
    chartLabelsGroup.innerHTML = '';

    // Chart boundary specifications
    const chartWidth = 700; // between X=50 and X=750
    const chartHeight = 180; // between Y=20 and Y=200
    const yBaseline = 200;   // bottom axis line
    const xStart = 50;
    
    // Find maximum emission values to scale chart proportionally
    const maxVal = Math.max(
      20, // minimum scale reference
      ...history.map(d => d.total),
      ...history.map(d => d.baseline)
    ) * 1.1; // add 10% breathing room at top

    // Render baseline line coordinate height
    const baselineDailyVal = history[0]?.baseline || 15.0;
    const yBaselineHeight = yBaseline - ((baselineDailyVal / maxVal) * chartHeight);
    if (baselineLine) {
      baselineLine.setAttribute('y1', yBaselineHeight);
      baselineLine.setAttribute('y2', yBaselineHeight);
    }

    // Determine grid step width per day column
    const stepX = chartWidth / (history.length - 1 || 1);

    // Track line points coordinates path
    let pathPoints = [];

    history.forEach((day, index) => {
      const cx = xStart + (index * stepX);
      const cy = yBaseline - ((day.total / maxVal) * chartHeight);

      // Save point for line paths
      pathPoints.push(`${cx},${cy}`);

      // 1. Draw Sector Breakdown stacked columns underneath points
      const tValHeight = (day.transport / maxVal) * chartHeight;
      const dValHeight = (day.diet / maxVal) * chartHeight;
      const eValHeight = (day.energy / maxVal) * chartHeight;
      const sValHeight = (day.shopping / maxVal) * chartHeight;

      const colWidth = 28;
      const colX = cx - (colWidth / 2);

      // Stack helper
      let currentStackY = yBaseline;

      // Transport sub-rect (teal)
      if (tValHeight > 0) {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', colX);
        rect.setAttribute('y', currentStackY - tValHeight);
        rect.setAttribute('width', colWidth);
        rect.setAttribute('height', tValHeight);
        rect.setAttribute('fill', 'var(--vibrant-teal)');
        rect.setAttribute('opacity', '0.45');
        rect.setAttribute('rx', '2');
        rect.innerHTML = `<title>Transit: ${day.transport.toFixed(2)} kg</title>`;
        chartBarsGroup.appendChild(rect);
        currentStackY -= tValHeight;
      }

      // Diet sub-rect (green)
      if (dValHeight > 0) {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', colX);
        rect.setAttribute('y', currentStackY - dValHeight);
        rect.setAttribute('width', colWidth);
        rect.setAttribute('height', dValHeight);
        rect.setAttribute('fill', 'var(--neon-green)');
        rect.setAttribute('opacity', '0.45');
        rect.setAttribute('rx', '2');
        rect.innerHTML = `<title>Food: ${day.diet.toFixed(2)} kg</title>`;
        chartBarsGroup.appendChild(rect);
        currentStackY -= dValHeight;
      }

      // Energy sub-rect (purple)
      if (eValHeight > 0) {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', colX);
        rect.setAttribute('y', currentStackY - eValHeight);
        rect.setAttribute('width', colWidth);
        rect.setAttribute('height', eValHeight);
        rect.setAttribute('fill', '#8b5cf6');
        rect.setAttribute('opacity', '0.45');
        rect.setAttribute('rx', '2');
        rect.innerHTML = `<title>Energy: ${day.energy.toFixed(2)} kg</title>`;
        chartBarsGroup.appendChild(rect);
        currentStackY -= eValHeight;
      }

      // Shopping sub-rect (coral)
      if (sValHeight > 0) {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', colX);
        rect.setAttribute('y', currentStackY - sValHeight);
        rect.setAttribute('width', colWidth);
        rect.setAttribute('height', sValHeight);
        rect.setAttribute('fill', 'var(--soft-coral)');
        rect.setAttribute('opacity', '0.45');
        rect.setAttribute('rx', '2');
        rect.innerHTML = `<title>Shopping: ${day.shopping.toFixed(2)} kg</title>`;
        chartBarsGroup.appendChild(rect);
      }

      // 2. Draw Daily text Date Label
      const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      txt.setAttribute('x', cx);
      txt.setAttribute('y', yBaseline + 20);
      txt.setAttribute('class', 'chart-label-text');
      txt.textContent = day.date;
      chartLabelsGroup.appendChild(txt);
    });

    // 3. Draw connecting line chart path
    if (pathPoints.length > 1) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      line.setAttribute('d', `M ${pathPoints.join(' L ')}`);
      line.setAttribute('class', 'chart-line-path');
      chartBarsGroup.appendChild(line);
    }

    // 4. Draw node points markers
    history.forEach((day, index) => {
      const cx = xStart + (index * stepX);
      const cy = yBaseline - ((day.total / maxVal) * chartHeight);

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', cx);
      circle.setAttribute('cy', cy);
      circle.setAttribute('r', '5');
      circle.setAttribute('class', 'chart-point');
      circle.innerHTML = `<title>Total Carbon: ${day.total.toFixed(2)} kg CO2</title>`;
      chartBarsGroup.appendChild(circle);
    });

  } catch (error) {
    console.error('Render dynamic charts error:', error);
  }
}

// ==========================================
// 6. UTILITY FUNCTIONS & RESETS
// ==========================================

/**
 * Triggers a global database wipe, resetting all session state back to quiz onboarding screen.
 */
async function resetApp() {
  const confirmWipe = confirm('Are you sure you want to delete your baseline profile and reset your daily footprint history logs?');
  if (confirmWipe) {
    try {
      const response = await fetch(`${API_BASE}/api/reset`, { method: 'POST' });
      if (response.ok) {
        showNotification('Session reset successfully.');
        
        // Reset local variables
        currentQuizStep = 1;
        document.getElementById('onboarding-form').reset();
        
        // Reset wizard screens
        document.querySelectorAll('.quiz-step').forEach(step => {
          step.classList.remove('active');
        });
        document.querySelector('.quiz-step[data-step="1"]').classList.add('active');
        
        // Setup initial wizard styling
        updateQuizProgress();
        document.getElementById('prev-btn').classList.add('disabled');
        document.getElementById('next-btn').classList.remove('hide');
        document.getElementById('submit-btn').classList.add('hide');
        
        // Re-route to screen
        showScreen('onboarding-screen');
      }
    } catch (error) {
      console.error('Failed to reset app:', error);
    }
  }
}

/**
 * Display notification alert overlay.
 * @param {string} msg - content message
 * @param {boolean} isError - if true, shows a warning visual
 */
function showNotification(msg, isError = false) {
  const banner = document.getElementById('notification');
  const messageNode = document.getElementById('notification-message');
  
  if (banner && messageNode) {
    messageNode.textContent = msg;
    
    if (isError) {
      banner.style.borderColor = 'var(--soft-coral)';
      banner.style.boxShadow = '0 5px 25px rgba(248, 113, 113, 0.2)';
      banner.querySelector('i').className = 'fa-solid fa-triangle-exclamation';
      banner.querySelector('i').style.color = 'var(--soft-coral)';
    } else {
      banner.style.borderColor = 'var(--neon-green)';
      banner.style.boxShadow = '0 5px 25px rgba(16, 185, 129, 0.2)';
      banner.querySelector('i').className = 'fa-solid fa-bell';
      banner.querySelector('i').style.color = 'var(--neon-green)';
    }
    
    banner.classList.add('active');
    
    setTimeout(() => {
      banner.classList.remove('active');
    }, 3500);
  }
}
