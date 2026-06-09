/**
 * CARE-EMS — demand classification and statistical helpers
 */

import { state } from './state.js';
import { mean, stdDev, parseTimestamp } from './utils.js';

const _percentileCache = {};

function groundTruthValuesForHour(zip, hour) {
    const series = state.groundTruths[zip] || [];
    if (hour === null || hour === undefined) {
        return series.filter(Number.isFinite);
    }

    const values = [];
    for (let i = 0; i < series.length; i++) {
        const val = series[i];
        if (!Number.isFinite(val)) continue;
        const ts = state.timestamps[i];
        const d = parseTimestamp(ts);
        if (d && d.getHours() === hour) values.push(val);
    }
    return values;
}

export function rollingStats(zip, endIndex, windowSize = 24) {
    if (endIndex < 0 || endIndex >= state.activeIndices.length) {
        return { avg: 0, std: 0, values: [] };
    }

    const start = Math.max(0, endIndex - windowSize + 1);
    const values = [];
    for (let r = start; r <= endIndex; r++) {
        const val = state.groundTruths[zip]?.[state.activeIndices[r]];
        if (Number.isFinite(val)) values.push(val);
    }
    return { avg: mean(values), std: stdDev(values), values };
}

export function computePercentiles(zip, hour = null) {
    const cacheKey = hour === null || hour === undefined ? zip : `${zip}_h${hour}`;
    if (_percentileCache[cacheKey]) return _percentileCache[cacheKey];

    const all = groundTruthValuesForHour(zip, hour);
    if (all.length < 2) return (_percentileCache[cacheKey] = { p60: Infinity, p85: Infinity });

    const sorted = [...all].sort((a, b) => a - b);
    _percentileCache[cacheKey] = {
        p60: sorted[Math.floor(sorted.length * 0.60)] ?? sorted.at(-1),
        p85: sorted[Math.floor(sorted.length * 0.85)] ?? sorted.at(-1)
    };
    return _percentileCache[cacheKey];
}

export function hourlyAvg(zip, hour) {
    const hourValues = groundTruthValuesForHour(zip, hour);
    if (hourValues.length >= 3) return mean(hourValues);

    const allValues = groundTruthValuesForHour(zip, null);
    return mean(allValues);
}

export function classifyDemand(predicted, zip, hour = null) {
    const { p60, p85 } = computePercentiles(zip, hour);
    if (predicted > p85) return 'HIGH';
    if (predicted > p60) return 'MED';
    return 'NOR';
}

export function clearPercentileCache() {
    for (const key in _percentileCache) delete _percentileCache[key];
}

export function statusColor(status) {
    return { NOR: '#14b8a6', MED: '#f97316', HIGH: '#dc2626' }[status] || '#94a3b8';
}
