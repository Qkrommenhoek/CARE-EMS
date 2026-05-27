/**
 * CARE-EMS — pure utility functions (no DOM, no state mutations)
 */

import { state, POPULATION_BY_ZIP } from './state.js';

export function parseTimestamp(ts) {
    const m = ts.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})$/);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4]);
}

export function formatTimestamp(ts) {
    const d = parseTimestamp(ts);
    if (!d) return ts;
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${formatHourRange(ts)}`;
}

export function formatHourRange(ts) {
    const d = parseTimestamp(ts);
    if (!d) return ts;
    const h0 = String(d.getHours()).padStart(2, '0');
    const h1 = String((d.getHours() + 1) % 24).padStart(2, '0');
    return `${h0}:00\u2013${h1}:00`;
}

export function dateToInputValue(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function inputValueToDate(val) {
    const [y, m, d] = val.split('-').map(Number);
    return new Date(y, m - 1, d);
}

export function inputValuesToDate(dateStr, hourStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const hour = parseInt(hourStr, 10) || 0;
    return new Date(y, m - 1, d, hour, 0, 0, 0);
}

export function hourToOption(d) {
    return String(d.getHours()).padStart(2, '0');
}

export function formatDatetimeReadable(d) {
    if (!d) return '\u2014';
    const datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timePart = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${datePart}, ${timePart}`;
}

export function formatForecastWindow(ts) {
    const d = parseTimestamp(ts);
    if (!d) return ts;
    const datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const end = new Date(d);
    end.setHours(end.getHours() + 1);
    const timeFmt = { hour: 'numeric', minute: '2-digit', hour12: true };
    const t0 = d.toLocaleTimeString('en-US', timeFmt);
    const t1 = end.toLocaleTimeString('en-US', timeFmt);
    return `${datePart}, ${t0}\u2013${t1}`;
}

export function mean(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function stdDev(arr) {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

export function getPopulation(zip) {
    return POPULATION_BY_ZIP[zip] || (12000 + (parseInt(zip, 10) % 50) * 420);
}

export function getNeighborhood(zip) {
    return state.neighborhoods[zip] || 'NYC';
}

export function temporalContext(ts) {
    const d = parseTimestamp(ts);
    if (!d) return '\u2014';
    const hour = d.getHours();
    let window = 'Off-peak';
    if (hour >= 7 && hour <= 9) window = 'Morning peak window';
    else if (hour >= 11 && hour <= 14) window = 'Afternoon peak window';
    else if (hour >= 17 && hour <= 20) window = 'Evening peak window';
    else if (hour >= 22 || hour <= 5) window = 'Overnight low window';
    const type = (d.getDay() === 0 || d.getDay() === 6) ? 'Weekend' : 'Weekday';
    return `${type} \u00b7 ${window}`;
}

export function statusLabel(s) {
    return { HIGH: 'High', MED: 'Moderate', NOR: 'Normal', LOW: 'Low' }[s] || s;
}

export function statusClass(status) {
    return status.toLowerCase();
}
