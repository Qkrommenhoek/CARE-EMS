/**
 * CARE-EMS — network loading and CSV parsing
 */

import { state, DATA_PATHS } from './state.js';
import { wktToGeoJSON, geometryCentroid, computeNeighborMap } from './geo.js';
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

export async function loadAllData() {
    showLoading('Loading EMS data...');

    try {
        const [predResult, truthResult, geometries, neighborhoods] = await Promise.all([
            loadTimeseriesCsv(DATA_PATHS.predictions)
                .catch(e => { throw new Error(`Could not load predictions.csv — ${e.message}`); }),
            loadTimeseriesCsv(DATA_PATHS.groundTruths)
                .catch(e => { throw new Error(`Could not load ground_truths.csv — ${e.message}`); }),
            loadZipCoordinates()
                .catch(e => { throw new Error(`Could not load ZIP_Coordinates.csv — ${e.message}`); }),
            loadNeighborhoods()
                .catch(e => { throw new Error(`Could not load zip_neighborhoods.json — ${e.message}`); })
        ]);

        state.timestamps = predResult.timestamps;
        state.predictions = predResult.data;
        state.groundTruths = truthResult.data;
        state.geometries = geometries;
        state.neighborhoods = neighborhoods;
        state.zipList = Object.keys(predResult.data).sort();

        clearPercentileCache();

        state.zipList.forEach(zip => {
            if (geometries[zip]) {
                state.centroids[zip] = geometryCentroid(geometries[zip]);
            }
        });

        computeNeighborMap();
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
