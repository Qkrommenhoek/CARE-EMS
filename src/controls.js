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

// The forecast model needs 24h of observed history before the start hour,
// and the 24h forecast must overlap ground truth to be displayed.
const FORECAST_HISTORY_HOURS = 24;
const FORECAST_HORIZON_HOURS = 24;

function forecastBounds() {
    const ts = state.timestamps;
    return {
        min: parseTimestamp(ts[FORECAST_HISTORY_HOURS]),
        max: parseTimestamp(ts[ts.length - FORECAST_HORIZON_HOURS])
    };
}

/** Clamp the date input to the forecastable range and disable out-of-range hours on boundary dates. */
export function syncForecastControls() {
    const dateEl = document.getElementById('forecastDate');
    const hourEl = document.getElementById('forecastHour');
    const { min, max } = forecastBounds();
    const minDate = dateToInputValue(min);
    const maxDate = dateToInputValue(max);

    if (!dateEl.value || dateEl.value < minDate) dateEl.value = minDate;
    else if (dateEl.value > maxDate) dateEl.value = maxDate;

    const minHour = dateEl.value === minDate ? min.getHours() : 0;
    const maxHour = dateEl.value === maxDate ? max.getHours() : 23;
    Array.from(hourEl.options).forEach(opt => {
        const h = parseInt(opt.value, 10);
        opt.disabled = h < minHour || h > maxHour;
    });

    const hour = parseInt(hourEl.value, 10);
    const clamped = Math.min(Math.max(Number.isNaN(hour) ? minHour : hour, minHour), maxHour);
    hourEl.value = String(clamped).padStart(2, '0');
}

export function setDefaultDateRange() {
    const fcTimestamps = state.forecastTimestamps;
    const lastFcTs = parseTimestamp(fcTimestamps[fcTimestamps.length - 1]);
    const { min, max } = forecastBounds();

    const dateEl = document.getElementById('forecastDate');
    dateEl.min = dateToInputValue(min);
    dateEl.max = dateToInputValue(max);
    dateEl.value = dateToInputValue(lastFcTs);
    document.getElementById('forecastHour').value = hourToOption(lastFcTs);
    syncForecastControls();
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

