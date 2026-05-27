/**
 * CARE-EMS — demand classification and statistical helpers
 */

import { state } from './state.js';
import { mean, stdDev } from './utils.js';

const _percentileCache = {};

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

export function computePercentiles(zip) {
    if (_percentileCache[zip]) return _percentileCache[zip];

    const all = (state.groundTruths[zip] || []).filter(Number.isFinite);
    if (all.length < 2) return (_percentileCache[zip] = { p60: Infinity, p85: Infinity });

    const sorted = [...all].sort((a, b) => a - b);
    _percentileCache[zip] = {
        p60: sorted[Math.floor(sorted.length * 0.60)] ?? sorted.at(-1),
        p85: sorted[Math.floor(sorted.length * 0.85)] ?? sorted.at(-1)
    };
    return _percentileCache[zip];
}

export function classifyDemand(predicted, zip) {
    const { p60, p85 } = computePercentiles(zip);
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
