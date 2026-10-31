/**
 * CARE-EMS — form controls, loading overlay, and active-index resolution
 */

import { state } from './state.js';
import {
    parseTimestamp,
    dateToInputValue,
    inputValuesToDate,
    hourToOption,
    getNeighborhood
} from './utils.js';

export function showLoading(text) {
    const el = document.getElementById('loading');
    document.getElementById('loadingText').textContent = text || 'Loading...';
    el.classList.remove('hidden');
}

export function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
}

export function populateZipSelect() {
    const select = document.getElementById('zipSelect');
    select.innerHTML = '';
    state.zipList.forEach(zip => {
        const opt = document.createElement('option');
        opt.value = zip;
        opt.textContent = `ZIP ${zip} \u2014 ${getNeighborhood(zip)}`;
        select.appendChild(opt);
    });
}

export function populateHourSelects() {
    const sel = document.getElementById('forecastHour');
    if (!sel) return;
    sel.innerHTML = '';
    for (let h = 0; h < 24; h++) {
        const hh = String(h).padStart(2, '0');
        const opt = document.createElement('option');
        opt.value = hh;
        opt.textContent = `${hh}:00`;
        sel.appendChild(opt);
    }
}

export function setDefaultDateRange() {
    const fcTimestamps = state.forecastTimestamps;
    const lastFcTs = parseTimestamp(fcTimestamps[fcTimestamps.length - 1]);
    const firstTs = parseTimestamp(state.timestamps[0]);
    const lastTs = parseTimestamp(state.timestamps[state.timestamps.length - 1]);

    document.getElementById('forecastDate').min = dateToInputValue(firstTs);
    document.getElementById('forecastDate').max = dateToInputValue(lastTs);
    document.getElementById('forecastDate').value = dateToInputValue(lastFcTs);
    document.getElementById('forecastHour').value = hourToOption(lastFcTs);
}

export function resolveActiveIndices() {
    const endVal = document.getElementById('forecastDate').value;
    const endHourVal = document.getElementById('forecastHour').value;
    const endDate = inputValuesToDate(endVal, endHourVal);
    endDate.setMinutes(59, 59, 999);

    const startDate = new Date(endDate);
    startDate.setHours(startDate.getHours() - 24);
    startDate.setMinutes(0, 0, 0);

    state.activeIndices = state.timestamps
        .map((ts, idx) => ({ ts, idx }))
        .filter(({ ts }) => {
            const d = parseTimestamp(ts);
            return d >= startDate && d <= endDate;
        })
        .map(({ idx }) => idx);

    state.forecastIndex = state.activeIndices.length - 1;
}

