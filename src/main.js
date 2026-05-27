/**
 * CARE-EMS — entry point, render orchestration, and event wiring
 */

import { state } from './state.js';
import { loadAllData } from './data.js';
import { resolveActiveIndices, getFocusZip } from './controls.js';
import { updateCitywideStatus } from './header.js';
import { updatePredictionCard } from './prediction.js';
import { initMap, updateMap } from './map.js';
import { updateTable, initTableSort } from './table.js';
import { updateChart } from './chart.js';
import { initAnalysisTabs, invalidateAnalysisCharts } from './analysis.js';
import { parseTimestamp, formatDatetimeReadable } from './utils.js';

// --- ZIP selection ---

function selectZip(zip) {
    state.selectedZip = zip;
    state.focusZip = zip;
    document.getElementById('zipSelect').value = zip;
    document.getElementById('mapBadge').textContent = `ZIP: ${zip}`;
    renderDashboard();
}

// --- Main render ---

function updateWindowSummary() {
    const startIdx = state.activeIndices[0];
    const endIdx = state.activeIndices[state.forecastIndex];
    const el = document.getElementById('windowSummary');
    if (!el || startIdx === undefined || endIdx === undefined) return;

    const s = parseTimestamp(state.timestamps[startIdx]);
    const e = parseTimestamp(state.timestamps[endIdx]);
    el.textContent = `Window: ${formatDatetimeReadable(s)} \u2192 ${formatDatetimeReadable(e)}`;
}

function renderDashboard() {
    if (!state.dataLoaded || state.forecastIndex < 0) return;

    state.focusZip = state.selectedZip === 'all' ? getFocusZip() : state.selectedZip;

    document.getElementById('mapBadge').textContent =
        state.selectedZip === 'all' ? 'ZIP: all' : `ZIP: ${state.selectedZip}`;

    updateWindowSummary();
    updateCitywideStatus();
    updatePredictionCard();
    updateMap(selectZip);
    updateTable(selectZip);
    updateChart();
    invalidateAnalysisCharts();
}

// --- Forecast run ---

function runForecast() {
    if (!state.dataLoaded) return;

    state.selectedZip = document.getElementById('zipSelect').value;
    resolveActiveIndices();

    if (!state.activeIndices.length) {
        alert('No data in selected date range. Please adjust dates.');
        return;
    }

    state.focusZip = state.selectedZip === 'all' ? null : state.selectedZip;
    renderDashboard();
}

// --- Event wiring ---

function initEventListeners() {
    document.getElementById('runForecast').addEventListener('click', runForecast);

    document.getElementById('zipSelect').addEventListener('change', (e) => {
        selectZip(e.target.value);
    });
}

// --- Bootstrap ---

document.addEventListener('DOMContentLoaded', async () => {
    initEventListeners();
    initAnalysisTabs();
    initTableSort(() => updateTable(selectZip));
    initMap();
    const ok = await loadAllData();
    if (ok) runForecast();
});
