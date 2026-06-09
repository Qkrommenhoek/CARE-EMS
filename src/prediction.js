/**
 * CARE-EMS — action-oriented prediction card
 */

import { state } from './state.js';
import {
    getNeighborhood, temporalContext, formatForecastWindow,
    getPopulation, statusLabel, statusClass, parseTimestamp
} from './utils.js';
import { classifyDemand, hourlyAvg } from './classify.js';

export function computePredictionViewModel(zip, forecastIndex) {
    const idx = state.activeIndices[forecastIndex];
    if (idx === undefined || !zip) return null;

    const ts = state.timestamps[idx];
    const predicted = state.predictions[zip][idx];
    const hour = parseTimestamp(ts)?.getHours() ?? null;
    const histAvg = hourlyAvg(zip, hour);
    const status = classifyDemand(predicted, zip, hour);

    const ratio = histAvg > 0 ? predicted / histAvg : 1;
    let vsAvg;
    if (ratio < 0.85) vsAvg = 'Below average';
    else if (ratio <= 1.15) vsAvg = 'Similar to average';
    else if (ratio <= 1.5) vsAvg = 'Above average';
    else vsAvg = 'Well above average';

    const neighbors = state.neighborMap[zip] || [];
    let nearbyConcern = 'None';
    for (const nzip of neighbors) {
        const npred = state.predictions[nzip]?.[idx];
        if (npred !== undefined) {
            const nstatus = classifyDemand(npred, nzip, hour);
            if (nstatus === 'HIGH' || nstatus === 'MED') {
                nearbyConcern = `ZIP ${nzip} has elevated demand`;
                break;
            }
        }
    }

    const hasNearbyConcern = nearbyConcern !== 'None';
    let action;
    if (status === 'HIGH') {
        action = 'Recommend immediate unit redeployment';
    } else if (status === 'MED') {
        action = 'Consider pre-positioning a unit';
    } else if (hasNearbyConcern) {
        action = 'Monitor neighboring zones';
    } else {
        action = 'No immediate redeployment needed';
    }

    return {
        zipLabel: `ZIP ${zip} \u2014 ${getNeighborhood(zip)}`,
        predictedCalls: Math.round(predicted),
        hourWindow: formatForecastWindow(ts),
        status,
        statusLabel: statusLabel(status),
        statusClass: statusClass(status),
        vsAvg,
        nearbyConcern,
        action,
        population: getPopulation(zip).toLocaleString(),
        riskLabel: statusLabel(status),
        riskClass: statusClass(status),
        neighbors: neighbors.join(', ') || '\u2014',
        rollingAvg: `${histAvg.toFixed(1)} calls/hr (hist. avg for this hour)`,
        temporalCtx: temporalContext(ts)
    };
}

export function renderPredictionCard(vm) {
    if (!vm) return;

    document.getElementById('predictionZip').textContent = vm.zipLabel;
    document.getElementById('predictionValue').textContent = vm.predictedCalls;
    document.getElementById('predictionHour').textContent = vm.hourWindow;

    const fcStatusEl = document.getElementById('fcStatus');
    fcStatusEl.textContent = vm.statusLabel;
    fcStatusEl.className = `forecast-value status-${vm.statusClass}`;

    document.getElementById('fcVsAvg').textContent = vm.vsAvg;
    document.getElementById('fcNearbyConcern').textContent = vm.nearbyConcern;
    document.getElementById('fcAction').textContent = vm.action;

    document.getElementById('ctxPopulation').textContent = vm.population;
    const riskEl = document.getElementById('ctxRiskTier');
    riskEl.textContent = vm.riskLabel;
    riskEl.className = `risk-badge ${vm.riskClass}`;

    document.getElementById('ctxNeighbors').textContent = vm.neighbors;
    document.getElementById('ctxRollingAvg').textContent = vm.rollingAvg;
    document.getElementById('ctxTemporal').textContent = vm.temporalCtx;
}

export function updatePredictionCard() {
    renderPredictionCard(computePredictionViewModel(state.focusZip, state.forecastIndex));
}
