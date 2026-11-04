/**
 * CARE-EMS — network loading and CSV parsing
 */

import { state, DATA_PATHS } from './state.js';
import { wktToGeoJSON, geometryCentroid } from './geo.js';
import { clearPercentileCache } from './classify.js';
import {
    showLoading,
    hideLoading,
    populateZipSelect,
    populateHourSelects,
    setDefaultDateRange
} from './controls.js';

function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}

async function loadTimeseriesCsv(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    const text = await response.text();
    const lines = text.trim().split('\n');
    const headers = parseCsvLine(lines[0]);
    const timestamps = headers.slice(1);
    const data = {};

    for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i]);
        const zip = values[0];
        data[zip] = values.slice(1).map(v => parseFloat(v) || 0);
    }

    return { timestamps, data };
}

// API datetimes are "YYYY-MM-DDTHH:MM"; the rest of the app keys hours as "YYYYMMDD_HH".
function apiDatetimeToTimestamp(datetime) {
    const [date, time] = datetime.split('T');
    return `${date.replace(/-/g, '')}_${time.slice(0, 2)}`;
}

function timestampToApiDatetime(ts) {
    return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(9, 11)}:00`;
}

async function fetchForecastApi(startTs) {
    const url = `${DATA_PATHS.forecastApi}?start=${encodeURIComponent(timestampToApiDatetime(startTs))}`;
    const response = await fetch(url);
    if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || `HTTP ${response.status}`);
    }
    return response.json();
}

/** Fetch the 24h forecast starting at `startTs` ("YYYYMMDD_HH") and make it the active forecast. */
export async function loadForecast(startTs) {
    const forecastJson = await fetchForecastApi(startTs);
    const predResult = alignForecast(forecastJson, state.timestamps);
    state.predictions = predResult.data;
    state.forecastTimestamps = predResult.forecastTimestamps;
}

/**
 * Align API forecast hours to the ground-truth timeline, rounding to whole calls.
 * Hours outside the API response are NaN.
 */
function alignForecast({ zips, hours }, timestamps) {
    const zipKeys = zips.map(String);
    const indexByTs = new Map(timestamps.map((ts, i) => [ts, i]));
    const data = {};
    zipKeys.forEach(zip => {
        data[zip] = new Array(timestamps.length).fill(NaN);
    });

    const forecastTimestamps = [];
    hours.forEach(({ datetime, predicted }) => {
        const ts = apiDatetimeToTimestamp(datetime);
        const idx = indexByTs.get(ts);
        if (idx === undefined) return;
        forecastTimestamps.push(ts);
        zipKeys.forEach((zip, z) => {
            data[zip][idx] = Math.round(predicted[z] ?? 0);
        });
    });

    if (!forecastTimestamps.length) {
        throw new Error('Forecast API hours do not overlap ground truth data');
    }

    return { data, forecastTimestamps };
}

/**
 * Full-history predictions from predictions.csv, aligned to the ground-truth timeline.
 * Only the analysis overlay reads `state.csvPredictions`; call after loadAllData().
 */
export async function loadCsvPredictions() {
    const { timestamps, data } = await loadTimeseriesCsv(DATA_PATHS.predictionsCsv);
    const indexByTs = new Map(timestamps.map((ts, i) => [ts, i]));
    const aligned = {};
    Object.entries(data).forEach(([zip, values]) => {
        aligned[zip] = state.timestamps.map(ts => {
            const i = indexByTs.get(ts);
            return i === undefined ? NaN : values[i];
        });
    });
    state.csvPredictions = aligned;
}

async function loadZipCoordinates() {
    const response = await fetch(DATA_PATHS.zipCoordinates);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    const text = await response.text();
    const lines = text.trim().split('\n');
    const geometries = {};

    for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i]);
        const zip = values[0];
        const wkt = values[1];
        geometries[zip] = wktToGeoJSON(wkt);
    }

    return geometries;
}

async function loadNeighborhoods() {
    const response = await fetch(DATA_PATHS.neighborhoods);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
}

async function loadZipNeighbors() {
    const response = await fetch(DATA_PATHS.zipNeighbors);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
}

export async function loadAllData() {
    showLoading('Loading EMS data...');

    try {
        const [forecastJson, truthResult, geometries, neighborhoods, zipNeighbors] = await Promise.all([
            fetchForecastApi(DATA_PATHS.initialForecastStart)
                .catch(e => { throw new Error(`Could not load forecast API — ${e.message}`); }),
            loadTimeseriesCsv(DATA_PATHS.groundTruths)
                .catch(e => { throw new Error(`Could not load ground_truths.csv — ${e.message}`); }),
            loadZipCoordinates()
                .catch(e => { throw new Error(`Could not load ZIP_Coordinates.csv — ${e.message}`); }),
            loadNeighborhoods()
                .catch(e => { throw new Error(`Could not load zip_neighborhoods.json — ${e.message}`); }),
            loadZipNeighbors()
                .catch(e => { throw new Error(`Could not load zip_neighbors.json — ${e.message}`); })
        ]);

        const predResult = alignForecast(forecastJson, truthResult.timestamps);

        state.timestamps = truthResult.timestamps;
        state.forecastTimestamps = predResult.forecastTimestamps;
        state.predictions = predResult.data;
        state.groundTruths = truthResult.data;
        state.geometries = geometries;
        state.neighborhoods = neighborhoods;
        state.neighborMap = zipNeighbors;
        state.zipList = Object.keys(predResult.data).sort();

        clearPercentileCache();

        state.zipList.forEach(zip => {
            if (geometries[zip]) {
                state.centroids[zip] = geometryCentroid(geometries[zip]);
            }
        });

        populateZipSelect();
        populateHourSelects();
        setDefaultDateRange();
        state.dataLoaded = true;
        document.getElementById('runForecast').disabled = false;
    } catch (err) {
        console.error(err);
        document.getElementById('loadingText').textContent = err.message || 'Failed to load data. Check console.';
        return false;
    }

    hideLoading();
    return true;
}
