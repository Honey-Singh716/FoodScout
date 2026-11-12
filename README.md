# FoodScout — SerpApi-powered restaurant discovery

FoodScout is a React + Vite frontend with browser geolocation, Leaflet/OpenStreetMap, restaurant cards, nearby discovery, area search, place-type filtering and radius filtering. A FastAPI backend calls SerpApi so the private SerpApi key never reaches the browser.

## Requirements

- Node.js 18+ and npm
- Python 3.10+
- A SerpApi account and API key

## 1. Configure the backend key

Open a terminal in the project root:

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment:

Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
```

Windows CMD:

```cmd
.venv\Scripts\activate.bat
```

macOS/Linux:

```bash
source .venv/bin/activate
```

Install Python dependencies:

```bash
pip install -r requirements.txt
```

Copy `backend/.env.example` to `backend/.env` and paste your own key:

```env
SERPAPI_API_KEY=your_actual_key_here
FRONTEND_ORIGIN=http://localhost:5173
```

Do not paste the key into React, a `VITE_` variable, GitHub, or this chat. The backend `.env` is ignored by Git.

## 2. Start FastAPI

From the `backend` directory, with the virtual environment active:

```bash
uvicorn app.main:app --reload --port 8000
```

Verify these URLs:

- Health: http://localhost:8000/api/v1/health
- Interactive API docs: http://localhost:8000/docs

Health should return `"key_configured": true` once the key is correctly loaded.

## 3. Start the frontend

Open a second terminal at the project root (not inside `backend`):

```bash
npm install
cp .env.example .env
npm run dev
```

On Windows, create `.env` by copying `.env.example` in File Explorer if `cp` is unavailable. Open the Vite URL, usually http://localhost:5173.

Allow location access to search around your current position. If permission is denied, the app uses an illustrative Jodhpur fallback. You can also use the area search field, e.g. `Sardarpura, Jodhpur` or `Jaipur`.

## API endpoints

- `GET /api/v1/health`
- `GET /api/v1/restaurants/nearby?lat=26.28&lng=73.02&radius_km=3&type=restaurant`
- `GET /api/v1/restaurants/search?q=Sardarpura%2C%20Jodhpur&type=restaurant`

Supported types: `restaurant`, `cafe`, `bakery`, `meal_takeaway`, `all`.

## Important behavior and limitations

- Nearby discovery uses SerpApi's Google Maps search with `ll` coordinates. SerpApi documents that `ll` biases the search; it does **not** guarantee all results are inside the requested radius. FoodScout applies a Haversine distance filter to returned coordinates, but cannot show restaurants the provider did not return.
- SerpApi area search returns business results, not a geocoded city/area centroid. For an area search, the current UI uses the first returned restaurant coordinate as the map/radius anchor. This is an approximation, not a true area center. A future improvement is a dedicated geocoding provider or explicit map-click center selection.
- The radius filter only filters the results returned by SerpApi. It does not guarantee exhaustive coverage.
- SerpApi plan limits and billing are separate from Google Maps Platform. Check your SerpApi dashboard before repeated tests.
- Restaurant details, hours, ratings and images can be missing or stale. Verify provider terms before production use, especially for storage, attribution and commercial display.
- The map itself uses Leaflet + OpenStreetMap tiles; SerpApi supplies search results, not the interactive map renderer.
- No database is used in this phase. Results stay in frontend memory.

## Troubleshooting

- `key_configured: false`: check `backend/.env` spelling and restart Uvicorn.
- `SerpApi key missing`: same as above.
- CORS error: keep the Vite origin at `http://localhost:5173` or update `FRONTEND_ORIGIN` and restart the backend.
- No restaurants: try a broader type or area, and inspect the FastAPI terminal for provider errors.
- Browser location unavailable: allow location permission or search an area manually.
