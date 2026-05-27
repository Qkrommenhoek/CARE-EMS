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
    select.innerHTML = '<option value="all">ZIP: all</option>';
    state.zipList.forEach(zip => {
        const opt = document.createElement('option');
        opt.value = zip;
        opt.textContent = `ZIP ${zip} \u2014 ${getNeighborhood(zip)}`;
        select.appendChild(opt);
    });
}

export function populateHourSelects() {
    ['startHour', 'endHour'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = '';
        for (let h = 0; h < 24; h++) {
            const hh = String(h).padStart(2, '0');
            const opt = document.createElement('option');
            opt.value = hh;
            opt.textContent = `${hh}:00`;
            sel.appendChild(opt);
        }
    });
}

export function setDefaultDateRange() {
    const firstTs = parseTimestamp(state.timestamps[0]);
    const lastTs = parseTimestamp(state.timestamps[state.timestamps.length - 1]);

    const endDate = new Date(lastTs);
    const startDate = new Date(endDate);
    startDate.setHours(startDate.getHours() - 23);

    if (startDate < firstTs) startDate.setTime(firstTs.getTime());

    document.getElementById('startDate').min = dateToInputValue(firstTs);
    document.getElementById('startDate').max = dateToInputValue(lastTs);
    document.getElementById('endDate').min = dateToInputValue(firstTs);
    document.getElementById('endDate').max = dateToInputValue(lastTs);
    document.getElementById('startDate').value = dateToInputValue(startDate);
    document.getElementById('endDate').value = dateToInputValue(endDate);
    document.getElementById('startHour').value = hourToOption(startDate);
    document.getElementById('endHour').value = hourToOption(endDate);
}

export function resolveActiveIndices() {
    const startVal = document.getElementById('startDate').value;
    const endVal = document.getElementById('endDate').value;
    const startHourVal = document.getElementById('startHour').value;
    const endHourVal = document.getElementById('endHour').value;
    const startDate = inputValuesToDate(startVal, startHourVal);
    const endDate = inputValuesToDate(endVal, endHourVal);
    endDate.setMinutes(59, 59, 999);

    state.activeIndices = state.timestamps
        .map((ts, idx) => ({ ts, idx }))
        .filter(({ ts }) => {
            const d = parseTimestamp(ts);
            return d >= startDate && d <= endDate;
        })
        .map(({ idx }) => idx);

    state.forecastIndex = state.activeIndices.length - 1;
}

export function getFocusZip() {
    if (state.selectedZip !== 'all') return state.selectedZip;

    const idx = state.activeIndices[state.forecastIndex];
    if (idx === undefined) return state.zipList[0];

    return state.zipList.reduce((best, zip) =>
        state.predictions[zip][idx] > state.predictions[best][idx] ? zip : best
    , state.zipList[0]);
}
