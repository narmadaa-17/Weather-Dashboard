/* ==========================================================
   Skyline Weather Dashboard
   - Uses the Open-Meteo REST APIs (no API key required):
     1. Geocoding API  -> turns a city name into lat/lon
     2. Forecast API   -> returns current weather for that lat/lon
   - Demonstrates: fetch + async/await, try/catch error handling,
     parsing nested JSON, and search-by-city UI updates.
   ========================================================== */

// ---------- DOM references ----------
const searchForm   = document.getElementById('searchForm');
const cityInput    = document.getElementById('cityInput');
const searchBtn    = document.getElementById('searchBtn');
const statusLine   = document.getElementById('statusLine');
const dashboard    = document.getElementById('dashboard');

const placeName      = document.getElementById('placeName');
const placeMeta      = document.getElementById('placeMeta');
const conditionIcon  = document.getElementById('conditionIcon');
const conditionText  = document.getElementById('conditionText');
const tempValue      = document.getElementById('tempValue');
const feelsLike      = document.getElementById('feelsLike');
const humidityValue  = document.getElementById('humidityValue');
const windValue      = document.getElementById('windValue');
const windDirValue   = document.getElementById('windDirValue');
const pressureValue  = document.getElementById('pressureValue');
const cloudValue     = document.getElementById('cloudValue');
const timeValue      = document.getElementById('timeValue');

const recentPanel = document.getElementById('recentPanel');
const recentList  = document.getElementById('recentList');

// ---------- API endpoints ----------
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

// ---------- In-memory state (no localStorage needed) ----------
let recentSearches = [];

// ---------- WMO weather code lookup table ----------
// Open-Meteo returns a numeric weather_code; this table turns it
// into a human-readable label and a simple icon.
const WEATHER_CODES = {
  0:  { label: 'Clear sky',            icon: '☀️' },
  1:  { label: 'Mainly clear',         icon: '🌤️' },
  2:  { label: 'Partly cloudy',        icon: '⛅' },
  3:  { label: 'Overcast',             icon: '☁️' },
  45: { label: 'Fog',                  icon: '🌫️' },
  48: { label: 'Depositing rime fog',  icon: '🌫️' },
  51: { label: 'Light drizzle',        icon: '🌦️' },
  53: { label: 'Moderate drizzle',     icon: '🌦️' },
  55: { label: 'Dense drizzle',        icon: '🌧️' },
  56: { label: 'Light freezing drizzle', icon: '🌧️' },
  57: { label: 'Dense freezing drizzle', icon: '🌧️' },
  61: { label: 'Slight rain',          icon: '🌧️' },
  63: { label: 'Moderate rain',        icon: '🌧️' },
  65: { label: 'Heavy rain',           icon: '🌧️' },
  66: { label: 'Light freezing rain',  icon: '🌧️' },
  67: { label: 'Heavy freezing rain',  icon: '🌧️' },
  71: { label: 'Slight snow fall',     icon: '🌨️' },
  73: { label: 'Moderate snow fall',   icon: '🌨️' },
  75: { label: 'Heavy snow fall',      icon: '❄️' },
  77: { label: 'Snow grains',          icon: '❄️' },
  80: { label: 'Slight rain showers',  icon: '🌦️' },
  81: { label: 'Moderate rain showers', icon: '🌦️' },
  82: { label: 'Violent rain showers', icon: '⛈️' },
  85: { label: 'Slight snow showers',  icon: '🌨️' },
  86: { label: 'Heavy snow showers',   icon: '🌨️' },
  95: { label: 'Thunderstorm',         icon: '⛈️' },
  96: { label: 'Thunderstorm, slight hail', icon: '⛈️' },
  99: { label: 'Thunderstorm, heavy hail',  icon: '⛈️' },
};

function describeWeatherCode(code) {
  return WEATHER_CODES[code] || { label: 'Unknown conditions', icon: '❔' };
}

// Converts a wind direction in degrees to a compass label.
function degreesToCompass(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(deg / 45) % 8;
  return dirs[index];
}

// ---------- Status helper ----------
function setStatus(message, type = '') {
  statusLine.textContent = message;
  statusLine.className = 'status-line' + (type ? ' ' + type : '');
}

// ---------- Step 1: geocode the city name ----------
// Fetches candidate locations for a given city name.
// Throws a descriptive Error if nothing is found or the request fails.
async function geocodeCity(cityName) {
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`;

  let response;
  try {
    response = await fetch(url);
  } catch (networkErr) {
    // fetch() only rejects on genuine network failure (offline, DNS, CORS block, etc.)
    throw new Error('Could not reach the geocoding service. Check your internet connection.');
  }

  if (!response.ok) {
    throw new Error(`Geocoding request failed (status ${response.status}).`);
  }

  const data = await response.json(); // parse nested JSON body

  // Open-Meteo returns { results: [ {...}, {...} ] } or no "results" key at all
  if (!data.results || data.results.length === 0) {
    throw new Error(`No city found matching "${cityName}". Check the spelling and try again.`);
  }

  const place = data.results[0];
  return {
    name: place.name,
    country: place.country,
    admin1: place.admin1, // state/region, may be undefined
    latitude: place.latitude,
    longitude: place.longitude,
    timezone: place.timezone,
  };
}

// ---------- Step 2: fetch current weather for coordinates ----------
async function fetchCurrentWeather(latitude, longitude, timezone) {
  const params = new URLSearchParams({
    latitude,
    longitude,
    timezone: timezone || 'auto',
    current: [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'wind_speed_10m',
      'wind_direction_10m',
      'weather_code',
      'pressure_msl',
      'cloud_cover',
      'is_day',
    ].join(','),
  });

  const url = `${FORECAST_URL}?${params.toString()}`;

  let response;
  try {
    response = await fetch(url);
  } catch (networkErr) {
    throw new Error('Could not reach the weather service. Check your internet connection.');
  }

  if (!response.ok) {
    throw new Error(`Weather request failed (status ${response.status}).`);
  }

  const data = await response.json();

  // Defensive check: make sure the "current" object we expect is present
  if (!data.current) {
    throw new Error('Weather data was returned in an unexpected format.');
  }

  return data.current; // nested object: { temperature_2m, relative_humidity_2m, ... }
}

// ---------- Rendering ----------
function renderWeather(place, current) {
  const { label, icon } = describeWeatherCode(current.weather_code);

  placeName.textContent = place.name;
  placeMeta.textContent = [place.admin1, place.country].filter(Boolean).join(', ');

  conditionIcon.textContent = icon;
  conditionText.textContent = label;

  tempValue.textContent = Math.round(current.temperature_2m);
  feelsLike.textContent = Math.round(current.apparent_temperature);

  humidityValue.innerHTML = `${Math.round(current.relative_humidity_2m)}<small>%</small>`;
  windValue.innerHTML = `${Math.round(current.wind_speed_10m)}<small>km/h</small>`;
  windDirValue.textContent = degreesToCompass(current.wind_direction_10m);
  pressureValue.innerHTML = `${Math.round(current.pressure_msl)}<small>hPa</small>`;
  cloudValue.innerHTML = `${Math.round(current.cloud_cover)}<small>%</small>`;

  const time = new Date(current.time);
  timeValue.textContent = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  dashboard.hidden = false;
}

// ---------- Recent searches ----------
function addRecentSearch(cityLabel) {
  recentSearches = recentSearches.filter((c) => c.toLowerCase() !== cityLabel.toLowerCase());
  recentSearches.unshift(cityLabel);
  recentSearches = recentSearches.slice(0, 6);
  renderRecentSearches();
}

function renderRecentSearches() {
  if (recentSearches.length === 0) {
    recentPanel.hidden = true;
    return;
  }
  recentPanel.hidden = false;
  recentList.innerHTML = '';
  recentSearches.forEach((city) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'recent-chip';
    chip.textContent = city;
    chip.addEventListener('click', () => runSearch(city));
    recentList.appendChild(chip);
  });
}

// ---------- Main search flow ----------
async function runSearch(cityName) {
  const trimmed = cityName.trim();
  if (!trimmed) {
    setStatus('Type a city name to search.', 'error');
    return;
  }

  searchBtn.disabled = true;
  setStatus(`Searching for "${trimmed}"…`, 'loading');
  dashboard.hidden = true;

  try {
    const place = await geocodeCity(trimmed);
    const current = await fetchCurrentWeather(place.latitude, place.longitude, place.timezone);

    renderWeather(place, current);
    addRecentSearch(place.name);
    setStatus(`Showing live weather for ${place.name}.`);
  } catch (err) {
    // Any failure from either fetch step lands here.
    setStatus(err.message || 'Something went wrong. Please try again.', 'error');
  } finally {
    searchBtn.disabled = false;
  }
}

// ---------- Event wiring ----------
searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  runSearch(cityInput.value);
});

// ---------- Initial load: show a default city so the dashboard isn't empty ----------
window.addEventListener('DOMContentLoaded', () => {
  cityInput.value = 'Chennai';
  runSearch('Chennai');
});
