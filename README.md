# EcoPulse: Personal Carbon Intelligence Platform MVP

**Live Vercel Link**: [https://ecopulse-xi.vercel.app](https://ecopulse-xi.vercel.app)

EcoPulse is a state-of-the-art personal carbon tracking and intelligence platform designed to bridge the gap between environmental awareness and daily behavioral actions. By automating calculations, analyzing lifestyle categories, and using Google Gemini 1.5 Flash AI coaching, EcoPulse turns abstract environmental impact data into clear, actionable daily targets.


This codebase contains the Phase 1 Minimum Viable Product (MVP) core, including:
1. **Interactive Onboarding Quiz** to establish user baseline footprints.
2. **Dynamic Live Carbon Calculator** utilizing scientific carbon coefficients.
3. **High-Fidelity Dashboard Interface** with an animated SVG EcoScore gauge, sector heatmap, quick activity logging console, and custom vector trends charts.
4. **Google Gemini AI Sustainability Coach Integration** using the official Google Gen AI SDK for 2-sentence actionable advice.

---

## 1. System Architecture

EcoPulse uses a single-page frontend application backed by a Node.js Express server. A local JSON database stores profiles and time-series activities.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Client Layer (Frontend)                       │
│        HTML5  •  Vanilla CSS (Glassmorphism)  •  Vanilla JS Client     │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
        Onboarding & Activity Logs            Metrics, History & AI Tip
                    │                                │
                    ▼                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          Backend Service (Express)                     │
│                        Node.js Web Server (server.js)                  │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
          Read/Write User States            Fetch Custom LLM Tip
                    │                                │
                    ▼                                ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────┐
│            Database Layer            │  │          AI Engine           │
│        Local DB (database.json)      │  │      Google Gemini 1.5 Flash │
└──────────────────────────────────────┘  └──────────────────────────────┘
```

---

## 2. Directory Layout

The project folder is organized into a modular design:

```
CarbonFootprint/
├── data/
│   └── database.json          # Persistent JSON store for user profiles, history, and streaks
├── public/
│   ├── css/
│   │   └── style.css          # Premium glassmorphic styles, custom charts, and fonts
│   ├── js/
│   │   └── app.js             # Client-side state manager, SVG charts, and API routing
│   └── index.html             # Dashboard UI structure & multi-step onboarding wizard
├── src/
│   ├── services/
│   │   └── geminiService.js   # Google Gemini 1.5 Flash integration & safety fallbacks
│   ├── utils/
│   │   └── carbonCalculator.js # Core carbon calculation equations & coefficients
│   └── server.js              # Express API server serving public static files and API routes
├── .env                       # Local environment configurations (GEMINI_API_KEY)
├── .env.example               # Configuration template
├── .gitignore                 # Excludes node_modules and secret credentials
├── package.json               # Node dependency definitions
└── README.md                  # System architecture and user guide (this file)
```

---

## 3. Core Carbon Equations & Coefficients

The application estimates carbon emissions in units of **kg of CO2 equivalents ($CO_2e$)**. All formulas are written in [carbonCalculator.js](src/utils/carbonCalculator.js):

### A. Transportation ($kg\ CO_2e / km$)
* **SUV / Truck (Gasoline)**: $0.25$
* **Sedan / Hatchback (Gasoline)**: $0.16$
* **Hybrid Vehicle**: $0.10$
* **Electric Vehicle (EV)**: $0.05$
* **Public Transit (Bus/Train)**: $0.06$
* **Active Transit (Walking/Bicycle)**: $0.00$

$$\text{Transport Emissions} = \text{Distance Traveled (km)} \times \text{Transit Mode Coefficient}$$

### B. Dietary Habits ($kg\ CO_2e / day$)
* **Heavy Meat** (frequent red meat): $7.20$
* **Average Meat** (poultry/fish/moderate mixed): $5.40$
* **Vegetarian** (no meat, eggs & dairy): $3.80$
* **Vegan** (100% plant-based): $2.90$

$$\text{Diet Emissions} = \text{Days} \times \text{Diet Type Coefficient}$$

### C. Household Energy ($kg\ CO_2e / day$ per occupant)
* **Electricity Grid Coefficient**: $0.38\ kg\ CO_2 / kWh$ (at a nominal rate of $\$0.15 / kWh$)
* **Natural Gas Coefficient**: $2.00\ kg\ CO_2 / \text{therm}$ (at a nominal rate of $\$1.20 / \text{therm}$)

$$\text{Occupant Electricity Share} = \left(\frac{\text{Monthly Bill}}{0.15} \times 0.38\right) \div \text{Household Size}$$

$$\text{Occupant Gas Share} = \left(\frac{\text{Monthly Bill}}{1.20} \times 2.00\right) \div \text{Household Size}$$

$$\text{Daily Shared Energy Emissions} = \frac{\text{Occupant Electricity Share} + \text{Occupant Gas Share}}{30\text{ days}}$$

### D. Shopping & Retail Consumption ($kg\ CO_2e / day$)
* **High Level** (frequent clothes, electronics, luxury): $300\ kg\ CO_2e / \text{month}$ ($10\ kg / \text{day}$)
* **Medium Level** (average consumption): $150\ kg\ CO_2e / \text{month}$ ($5\ kg / \text{day}$)
* **Low Level** (secondhand, repair, essentials): $50\ kg\ CO_2e / \text{month}$ ($1.67\ kg / \text{day}$)

$$\text{Shopping Emissions} = \text{Days} \times \text{Shopping Level Coefficient}$$

### E. EcoScore Mapping Algorithm (Credit Score 10 - 100)
To establish a score:
- If Daily Emissions $\le 10\ kg\ CO_2e$, the score is a perfect $100$.
- If Daily Emissions $\ge 50\ kg\ CO_2e$, the score is a minimum of $10$.
- For scores between $10$ and $50$, a linear scaling function maps daily carbon values to the $10\text{-}100$ range:

$$\text{EcoScore} = 100 - (\text{Daily Emissions} - 10) \times 2.25$$

---

## 4. API Endpoints

The server implements the following API endpoints:

| Endpoint | Method | Payload / Response | Description |
| :--- | :--- | :--- | :--- |
| `/api/onboard` | `POST` | **Payload:** Onboarding questionnaire values.<br>**Response:** Created profile summary, initial baseline score, and initial history node. | Sets up user profile, clears existing history, and logs initial state. |
| `/api/dashboard` | `GET` | **Response:** JSON with current daily logs sum, baseline allowances, streaks count, and badge unlock list. | Aggregates daily metrics and returns active dashboard states. |
| `/api/log-activity` | `POST` | **Payload:** `{ type: 'transport'\|'diet'\|'energy'\|'shopping', value: Number, detail: String }`. <br>**Response:** Details of created time-series item and updated streaks. | Appends a custom activity to history logs and calculates score updates. |
| `/api/coach` | `POST` | **Response:** `{ tip: String }` containing a personalized coach suggestion. | Calls Gemini 1.5 Flash or pulls fallback suggestion based on user's worst category. |
| `/api/history` | `GET` | **Response:** `{ history: Array }` containing 7 days of daily carbon sector logs. | Combines activity log history for vector SVG charts. |
| `/api/reset` | `POST` | **Response:** `{ message: String }`. | Deletes profiles and history databases for easy re-testing. |

---

## 5. Setup & Installation Instructions

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed (version 18 or above recommended).

### Step 1: Install Dependencies
Navigate to the root directory and install npm packages:
```bash
npm install
```

### Step 2: Environment Variables
Create a copy of `.env.example` named `.env` inside the root directory and define your Google Gemini API key:
```env
PORT=3000
GEMINI_API_KEY=AIzaSy...your_actual_key...
```

*Note: If `GEMINI_API_KEY` is not provided or is invalid, the backend will gracefully fallback to returning high-quality, pre-computed suggestions matching the user's worst emission sector, ensuring the app never crashes.*

### Step 3: Run the Application
Start the development server using the dev script:
```bash
npm run dev
```

Alternatively, run the production server:
```bash
npm start
```

### Step 4: Open in Web Browser
Open your browser and navigate to:
```
http://localhost:3000
```
You will be greeted by the multi-step Onboarding Quiz. Complete the survey to load the interactive dashboard metrics, charts, and recommendations.
