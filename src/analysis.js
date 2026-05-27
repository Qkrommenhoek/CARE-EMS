/**
 * CARE-EMS — Analysis overlay with D3 v7 charts
 *
 * Sections:
 *  1. Public API       — initAnalysisTabs, invalidateAnalysisCharts
 *  2. Overlay          — openOverlay, closeOverlay, renderAllCharts
 *  3. Shared D3 helpers — tip, showTip, moveTip, hideTip, chartSection,
 *                         styleAxis, gridLines, yLabel, hourLabel,
 *                         activeTimestamps, zipMeanCallsInWindow, showEmptyChart
 *  4. Temporal charts  — renderTemporalCharts, renderHourOfDay,
 *                         renderWeekdayWeekend, renderDayOfWeek
 *  5. Spatial charts   — renderSpatialCharts, renderMonthlyTrend,
 *                         renderZipRanking, renderPopulationBubble,
 *                         renderNeighborComparison, drawNeighborBars
 */

import { state } from './state.js';
import { parseTimestamp, getPopulation, mean } from './utils.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const DARK_BLUE  = '#1e3a5f';
const LIGHT_BLUE = '#90c4e4';
const FILL_BLUE  = 'rgba(30, 58, 95, 0.13)';
const OBSERVED_GREEN = '#16a34a';
const FILL_GREEN = 'rgba(22, 163, 74, 0.13)';

const M = { top: 24, right: 24, bottom: 44, left: 58 }; // margins
const W = 820; // SVG width (fits 920px modal minus padding)

// ── Overlay state ─────────────────────────────────────────────────────────────

let chartsRendered = false;

// ── 1. Public API ─────────────────────────────────────────────────────────────

export function initAnalysisTabs() {
    // Sidebar buttons open the overlay
    document.querySelectorAll('.analysis-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.openAnalysis || btn.dataset.tab || 'temporal';
            openOverlay(tab);
        });
    });

    // Modal tab switching
    document.querySelectorAll('.analysis-modal-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('.analysis-modal-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.analysis-modal-pane').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`modal-pane-${tab}`).classList.add('active');
        });
    });

    document.getElementById('analysisClose').addEventListener('click', closeOverlay);
    document.getElementById('analysisOverlay').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeOverlay();
    });
}

// ── 2. Overlay ────────────────────────────────────────────────────────────────

function openOverlay(tab = 'temporal') {
    document.getElementById('analysisOverlay').classList.remove('hidden');

    // Activate the requested tab/pane
    document.querySelectorAll('.analysis-modal-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.analysis-modal-pane').forEach(p => p.classList.remove('active'));
    const tabBtn = document.querySelector(`.analysis-modal-tab[data-tab="${tab}"]`);
    if (tabBtn) tabBtn.classList.add('active');
    const pane = document.getElementById(`modal-pane-${tab}`);
    if (pane) pane.classList.add('active');

    // Render charts once data is ready
    if (!chartsRendered && state.dataLoaded) {
        renderAllCharts();
        chartsRendered = true;
    }
}

function closeOverlay() {
    document.getElementById('analysisOverlay').classList.add('hidden');
}

// ── Render orchestrator ───────────────────────────────────────────────────────

function renderAllCharts() {
    renderTemporalCharts();
    renderSpatialCharts();
}

// ── 3. Shared D3 helpers ──────────────────────────────────────────────────────

let _tip = null;

function tip() {
    if (!_tip) {
        _tip = document.createElement('div');
        _tip.className = 'd3-tooltip';
        document.body.appendChild(_tip);
    }
    return _tip;
}

function showTip(event, html) {
    const t = tip();
    t.innerHTML = html;
    t.style.opacity = '1';
    t.style.left = (event.clientX + 14) + 'px';
    t.style.top  = (event.clientY - 32) + 'px';
}

function moveTip(event) {
    tip().style.left = (event.clientX + 14) + 'px';
    tip().style.top  = (event.clientY - 32) + 'px';
}

function hideTip() { tip().style.opacity = '0'; }

// ── Shared helpers ────────────────────────────────────────────────────────────

function chartSection(container, title) {
    const sec = document.createElement('div');
    sec.className = 'd3-chart-section';
    const h3 = document.createElement('h3');
    h3.textContent = title;
    sec.appendChild(h3);
    container.appendChild(sec);
    return sec;
}

function styleAxis(sel) {
    sel.select('.domain').attr('stroke', '#e2e8f0');
    sel.selectAll('.tick line').attr('stroke', '#e2e8f0');
    sel.selectAll('.tick text').attr('fill', '#64748b').attr('font-size', '11');
}

function gridLines(g, axis, iW) {
    g.append('g')
        .call(axis.tickSize(-iW).tickFormat(''))
        .call(sg => {
            sg.select('.domain').remove();
            sg.selectAll('.tick line').attr('stroke', '#f1f5f9');
        });
}

function yLabel(g, iH, text) {
    g.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -iH / 2)
        .attr('y', -46)
        .attr('text-anchor', 'middle')
        .attr('font-size', '11')
        .attr('fill', '#64748b')
        .text(text);
}

function hourLabel(h) {
    if (h === 0)  return '12am';
    if (h < 12)   return `${h}am`;
    if (h === 12) return '12pm';
    return `${h - 12}pm`;
}

/** Timestamps inside the active forecast window */
function activeTimestamps() {
    return state.activeIndices.map(i => ({ ts: state.timestamps[i], i }));
}

/** Mean predicted calls for a ZIP across the active window */
function zipMeanCallsInWindow(zip) {
    const vals = state.activeIndices
        .map(i => state.predictions[zip]?.[i])
        .filter(Number.isFinite);
    return vals.length ? mean(vals) : 0;
}

/** Mean ground-truth calls for a ZIP across the active window */
function zipMeanGTInWindow(zip) {
    const vals = state.activeIndices
        .map(i => state.groundTruths[zip]?.[i])
        .filter(Number.isFinite);
    return vals.length ? mean(vals) : 0;
}

function cityMeanForSeries(series, i) {
    const vals = state.zipList.map(z => series[z]?.[i]).filter(Number.isFinite);
    return vals.length ? mean(vals) : null;
}

function legendBarPredActual(g, iW, xOffset = null) {
    const x = xOffset ?? iW - 140;
    const leg = g.append('g').attr('transform', `translate(${x}, 4)`);
    leg.append('rect').attr('width', 12).attr('height', 12).attr('fill', DARK_BLUE).attr('rx', 2);
    leg.append('text').attr('x', 18).attr('y', 10).attr('font-size', '11').attr('fill', '#475569').text('Predicted');
    leg.append('rect').attr('y', 18).attr('width', 12).attr('height', 12).attr('fill', OBSERVED_GREEN).attr('rx', 2);
    leg.append('text').attr('x', 18).attr('y', 28).attr('font-size', '11').attr('fill', '#475569').text('Actual');
}

function legendLinePredActual(g, iW, xOffset = null) {
    const x = xOffset ?? iW - 150;
    const leg = g.append('g').attr('transform', `translate(${x}, 4)`);
    leg.append('line').attr('x2', 20).attr('y1', 8).attr('y2', 8).attr('stroke', DARK_BLUE).attr('stroke-width', 2);
    leg.append('text').attr('x', 26).attr('y', 12).attr('font-size', '11').attr('fill', '#475569').text('Predicted');
    leg.append('line').attr('x2', 20).attr('y1', 26).attr('y2', 26)
        .attr('stroke', OBSERVED_GREEN).attr('stroke-width', 2).attr('stroke-dasharray', '6,4');
    leg.append('text').attr('x', 26).attr('y', 30).attr('font-size', '11').attr('fill', '#475569').text('Actual');
}

function legendBubblePredActual(g, iW) {
    const leg = g.append('g').attr('transform', `translate(${iW - 140}, 4)`);
    leg.append('circle').attr('cx', 6).attr('cy', 6).attr('r', 5)
        .attr('fill', 'rgba(30, 58, 95, 0.42)').attr('stroke', DARK_BLUE);
    leg.append('text').attr('x', 18).attr('y', 10).attr('font-size', '11').attr('fill', '#475569').text('Predicted');
    leg.append('circle').attr('cx', 6).attr('cy', 24).attr('r', 5)
        .attr('fill', 'rgba(22, 163, 74, 0.42)').attr('stroke', OBSERVED_GREEN);
    leg.append('text').attr('x', 18).attr('y', 28).attr('font-size', '11').attr('fill', '#475569').text('Actual');
}

function showEmptyChart(sec, message = 'Not enough data in the selected window.') {
    sec.appendChild(Object.assign(document.createElement('p'), {
        className: 'd3-empty',
        textContent: message
    }));
}

export function invalidateAnalysisCharts() {
    chartsRendered = false;
    const overlay = document.getElementById('analysisOverlay');
    if (overlay && !overlay.classList.contains('hidden')) {
        renderAllCharts();
        chartsRendered = true;
    }
}

// ── 4. Temporal charts ────────────────────────────────────────────────────────

function renderTemporalCharts() {
    const pane = document.getElementById('modal-pane-temporal');
    pane.innerHTML = '';
    renderHourOfDay(pane);
    renderWeekdayWeekend(pane);
    renderDayOfWeek(pane);
}

// Chart 1 — EMS call volume by hour of day
function renderHourOfDay(container) {
    const sec = chartSection(container, 'EMS call volume by hour of day');

    const buckets = Array.from({ length: 24 }, () => []);
    const gtBuckets = Array.from({ length: 24 }, () => []);
    activeTimestamps().forEach(({ ts, i }) => {
        const d = parseTimestamp(ts);
        if (!d) return;
        const h = d.getHours();
        const pred = cityMeanForSeries(state.predictions, i);
        const gt = cityMeanForSeries(state.groundTruths, i);
        if (pred !== null) buckets[h].push(pred);
        if (gt !== null) gtBuckets[h].push(gt);
    });

    const data = buckets.map((b, hour) => ({
        hour,
        value: b.length ? mean(b) : 0,
        gt: gtBuckets[hour].length ? mean(gtBuckets[hour]) : 0
    }));

    const H = 230, iH = H - M.top - M.bottom, iW = W - M.left - M.right;
    const x = d3.scalePoint().domain(d3.range(24)).range([0, iW]).padding(0.5);
    const yMax = d3.max(data, d => Math.max(d.value, d.gt)) || 1;
    const y = d3.scaleLinear().domain([0, yMax * 1.15]).range([iH, 0]).nice();

    const svg = d3.select(sec).append('svg')
        .attr('viewBox', `0 0 ${W} ${H}`)
        .attr('preserveAspectRatio', 'xMidYMid meet');
    const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

    gridLines(g, d3.axisLeft(y).ticks(5), iW);

    const area = d3.area().x(d => x(d.hour)).y0(iH).y1(d => y(d.value)).curve(d3.curveCatmullRom);
    g.append('path').datum(data).attr('fill', FILL_BLUE).attr('d', area);

    const line = d3.line().x(d => x(d.hour)).y(d => y(d.value)).curve(d3.curveCatmullRom);
    g.append('path').datum(data).attr('fill', 'none').attr('stroke', DARK_BLUE).attr('stroke-width', 2).attr('d', line);

    const gtLine = d3.line().x(d => x(d.hour)).y(d => y(d.gt)).curve(d3.curveCatmullRom);
    g.append('path').datum(data).attr('fill', 'none').attr('stroke', OBSERVED_GREEN)
        .attr('stroke-width', 2).attr('stroke-dasharray', '6,4').attr('d', gtLine);

    g.selectAll('.dot-pred').data(data).join('circle').attr('class', 'dot-pred')
        .attr('cx', d => x(d.hour)).attr('cy', d => y(d.value))
        .attr('r', 3.5).attr('fill', DARK_BLUE)
        .on('mouseover', (ev, d) => showTip(ev, `${hourLabel(d.hour)}: ${d.value.toFixed(1)} calls (Predicted)`))
        .on('mousemove', moveTip).on('mouseleave', hideTip);

    g.selectAll('.dot-gt').data(data).join('circle').attr('class', 'dot-gt')
        .attr('cx', d => x(d.hour)).attr('cy', d => y(d.gt))
        .attr('r', 3.5).attr('fill', OBSERVED_GREEN)
        .on('mouseover', (ev, d) => showTip(ev, `${hourLabel(d.hour)}: ${d.gt.toFixed(1)} calls (Actual)`))
        .on('mousemove', moveTip).on('mouseleave', hideTip);

    g.append('g').attr('transform', `translate(0,${iH})`)
        .call(d3.axisBottom(x).tickFormat(h => [0, 6, 12, 18].includes(h) ? hourLabel(h) : ''))
        .call(styleAxis);
    g.append('g').call(d3.axisLeft(y).ticks(5)).call(styleAxis);
    yLabel(g, iH, 'avg calls');
    legendLinePredActual(g, iW);
}

// Chart 2 — Weekday vs weekend hourly profile
function renderWeekdayWeekend(container) {
    const sec = chartSection(container, 'Weekday vs weekend — hourly demand profile');

    const wdBuckets = Array.from({ length: 24 }, () => []);
    const weBuckets = Array.from({ length: 24 }, () => []);
    const wdGTBuckets = Array.from({ length: 24 }, () => []);
    const weGTBuckets = Array.from({ length: 24 }, () => []);

    activeTimestamps().forEach(({ ts, i }) => {
        const d = parseTimestamp(ts);
        if (!d) return;
        const dow = d.getDay();
        const h = d.getHours();
        const isWeekend = dow === 0 || dow === 6;
        const pred = cityMeanForSeries(state.predictions, i);
        const gt = cityMeanForSeries(state.groundTruths, i);
        if (pred !== null) (isWeekend ? weBuckets : wdBuckets)[h].push(pred);
        if (gt !== null) (isWeekend ? weGTBuckets : wdGTBuckets)[h].push(gt);
    });

    const wdData = wdBuckets.map((b, h) => ({ hour: h, value: b.length ? mean(b) : 0 }));
    const weData = weBuckets.map((b, h) => ({ hour: h, value: b.length ? mean(b) : 0 }));
    const wdGTData = wdGTBuckets.map((b, h) => ({ hour: h, value: b.length ? mean(b) : 0 }));
    const weGTData = weGTBuckets.map((b, h) => ({ hour: h, value: b.length ? mean(b) : 0 }));

    const H = 230, iH = H - M.top - M.bottom, iW = W - M.left - M.right;
    const allVals = [...wdData, ...weData, ...wdGTData, ...weGTData].map(d => d.value);
    const x = d3.scalePoint().domain(d3.range(24)).range([0, iW]).padding(0.5);
    const y = d3.scaleLinear().domain([0, (d3.max(allVals) || 1) * 1.15]).range([iH, 0]).nice();

    const svg = d3.select(sec).append('svg')
        .attr('viewBox', `0 0 ${W} ${H}`)
        .attr('preserveAspectRatio', 'xMidYMid meet');
    const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

    gridLines(g, d3.axisLeft(y).ticks(5), iW);

    const lineFn = d3.line().x(d => x(d.hour)).y(d => y(d.value)).curve(d3.curveCatmullRom);

    g.append('path').datum(wdData)
        .attr('fill', 'none').attr('stroke', DARK_BLUE).attr('stroke-width', 2).attr('d', lineFn);
    g.append('path').datum(weData)
        .attr('fill', 'none').attr('stroke', LIGHT_BLUE).attr('stroke-width', 2)
        .attr('stroke-dasharray', '6,4').attr('d', lineFn);
    g.append('path').datum(wdGTData)
        .attr('fill', 'none').attr('stroke', OBSERVED_GREEN).attr('stroke-width', 2).attr('d', lineFn);
    g.append('path').datum(weGTData)
        .attr('fill', 'none').attr('stroke', OBSERVED_GREEN).attr('stroke-width', 2)
        .attr('stroke-dasharray', '6,4').attr('d', lineFn);

    g.selectAll('.dot-wd').data(wdData).join('circle').attr('class', 'dot-wd')
        .attr('cx', d => x(d.hour)).attr('cy', d => y(d.value)).attr('r', 3).attr('fill', DARK_BLUE)
        .on('mouseover', (ev, d) => showTip(ev, `Weekday ${hourLabel(d.hour)}: ${d.value.toFixed(1)} calls (Predicted)`))
        .on('mousemove', moveTip).on('mouseleave', hideTip);

    g.selectAll('.dot-we').data(weData).join('circle').attr('class', 'dot-we')
        .attr('cx', d => x(d.hour)).attr('cy', d => y(d.value)).attr('r', 3).attr('fill', LIGHT_BLUE)
        .on('mouseover', (ev, d) => showTip(ev, `Weekend ${hourLabel(d.hour)}: ${d.value.toFixed(1)} calls (Predicted)`))
        .on('mousemove', moveTip).on('mouseleave', hideTip);

    g.selectAll('.dot-wd-gt').data(wdGTData).join('circle').attr('class', 'dot-wd-gt')
        .attr('cx', d => x(d.hour)).attr('cy', d => y(d.value)).attr('r', 3).attr('fill', OBSERVED_GREEN)
        .on('mouseover', (ev, d) => showTip(ev, `Weekday ${hourLabel(d.hour)}: ${d.value.toFixed(1)} calls (Actual)`))
        .on('mousemove', moveTip).on('mouseleave', hideTip);

    g.selectAll('.dot-we-gt').data(weGTData).join('circle').attr('class', 'dot-we-gt')
        .attr('cx', d => x(d.hour)).attr('cy', d => y(d.value)).attr('r', 3).attr('fill', OBSERVED_GREEN)
        .attr('opacity', 0.65)
        .on('mouseover', (ev, d) => showTip(ev, `Weekend ${hourLabel(d.hour)}: ${d.value.toFixed(1)} calls (Actual)`))
        .on('mousemove', moveTip).on('mouseleave', hideTip);

    g.append('g').attr('transform', `translate(0,${iH})`)
        .call(d3.axisBottom(x).tickFormat(h => [0, 4, 8, 12, 16, 20].includes(h) ? String(h) : ''))
        .call(styleAxis);
    g.append('g').call(d3.axisLeft(y).ticks(5)).call(styleAxis);
    yLabel(g, iH, 'avg calls');

    const leg = g.append('g').attr('transform', `translate(${iW - 155}, 4)`);
    leg.append('line').attr('x2', 20).attr('y1', 8).attr('y2', 8).attr('stroke', DARK_BLUE).attr('stroke-width', 2);
    leg.append('text').attr('x', 26).attr('y', 12).attr('font-size', '11').attr('fill', '#475569').text('Weekday (pred)');
    leg.append('line').attr('x2', 20).attr('y1', 24).attr('y2', 24)
        .attr('stroke', LIGHT_BLUE).attr('stroke-width', 2).attr('stroke-dasharray', '6,4');
    leg.append('text').attr('x', 26).attr('y', 28).attr('font-size', '11').attr('fill', '#475569').text('Weekend (pred)');
    leg.append('line').attr('x2', 20).attr('y1', 40).attr('y2', 40).attr('stroke', OBSERVED_GREEN).attr('stroke-width', 2);
    leg.append('text').attr('x', 26).attr('y', 44).attr('font-size', '11').attr('fill', '#475569').text('Weekday (actual)');
    leg.append('line').attr('x2', 20).attr('y1', 56).attr('y2', 56)
        .attr('stroke', OBSERVED_GREEN).attr('stroke-width', 2).attr('stroke-dasharray', '6,4');
    leg.append('text').attr('x', 26).attr('y', 60).attr('font-size', '11').attr('fill', '#475569').text('Weekend (actual)');
}

// Chart 3 — EMS call volume by day of week
function renderDayOfWeek(container) {
    const sec = chartSection(container, 'EMS call volume by day of week');

    const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const DOW_IDX = [6, 0, 1, 2, 3, 4, 5];
    const SERIES = ['pred', 'gt'];

    const buckets = Array.from({ length: 7 }, () => []);
    const gtBuckets = Array.from({ length: 7 }, () => []);
    activeTimestamps().forEach(({ ts, i }) => {
        const d = parseTimestamp(ts);
        if (!d) return;
        const idx = DOW_IDX[d.getDay()];
        const predVals = state.zipList.map(z => state.predictions[z]?.[i]).filter(Number.isFinite);
        const gtVals = state.zipList.map(z => state.groundTruths[z]?.[i]).filter(Number.isFinite);
        if (predVals.length) buckets[idx].push(predVals.reduce((a, b) => a + b, 0));
        if (gtVals.length) gtBuckets[idx].push(gtVals.reduce((a, b) => a + b, 0));
    });

    const data = DAYS.map((day, i) => ({
        day,
        value: buckets[i].length ? mean(buckets[i]) : 0,
        gt: gtBuckets[i].length ? mean(gtBuckets[i]) : 0,
        weekend: i >= 5
    }));

    if (!data.some(d => d.value > 0 || d.gt > 0)) {
        showEmptyChart(sec);
        return;
    }

    const H = 230, iH = H - M.top - M.bottom, iW = W - M.left - M.right;
    const x0 = d3.scaleBand().domain(DAYS).range([0, iW]).padding(0.3);
    const x1 = d3.scaleBand().domain(SERIES).range([0, x0.bandwidth()]).padding(0.15);
    const yMax = d3.max(data, d => Math.max(d.value, d.gt)) || 1;
    const y = d3.scaleLinear().domain([0, yMax * 1.15]).range([iH, 0]).nice();

    const svg = d3.select(sec).append('svg')
        .attr('viewBox', `0 0 ${W} ${H}`)
        .attr('preserveAspectRatio', 'xMidYMid meet');
    const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

    gridLines(g, d3.axisLeft(y).ticks(5), iW);

    const dayGroups = g.selectAll('.day-group').data(data).join('g')
        .attr('class', 'day-group')
        .attr('transform', d => `translate(${x0(d.day)},0)`);

    dayGroups.selectAll('rect').data(d => [
        { key: 'pred', val: d.value, day: d.day },
        { key: 'gt', val: d.gt, day: d.day }
    ]).join('rect')
        .attr('x', s => x1(s.key))
        .attr('y', s => y(s.val))
        .attr('width', x1.bandwidth())
        .attr('height', s => iH - y(s.val))
        .attr('fill', s => s.key === 'pred' ? DARK_BLUE : OBSERVED_GREEN)
        .attr('rx', 3)
        .on('mouseover', (ev, s) => showTip(ev,
            `${s.day}: ${s.val.toFixed(1)} avg calls (${s.key === 'pred' ? 'Predicted' : 'Actual'})`))
        .on('mousemove', moveTip).on('mouseleave', hideTip);

    g.append('g').attr('transform', `translate(0,${iH})`).call(d3.axisBottom(x0)).call(styleAxis);
    g.append('g').call(d3.axisLeft(y).ticks(5)).call(styleAxis);
    yLabel(g, iH, 'avg daily calls');
    legendBarPredActual(g, iW);
}

// ── 5. Spatial charts ─────────────────────────────────────────────────────────

function renderSpatialCharts() {
    const pane = document.getElementById('modal-pane-spatial');
    pane.innerHTML = '';
    renderMonthlyTrend(pane);
    renderZipRanking(pane);
    renderPopulationBubble(pane);
    renderNeighborComparison(pane);
}

// Chart 4 — Monthly call volume trend
function renderMonthlyTrend(container) {
    const sec = chartSection(container, 'Monthly call volume trend');

    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthDays = {};
    const gtMonthDays = {};
    activeTimestamps().forEach(({ ts, i }) => {
        const d = parseTimestamp(ts);
        if (!d) return;
        const m = d.getMonth();
        const key = `${d.getFullYear()}-${m}-${d.getDate()}`;
        const predTotal = state.zipList.reduce((s, z) => {
            const v = state.predictions[z]?.[i];
            return s + (Number.isFinite(v) ? v : 0);
        }, 0);
        const gtTotal = state.zipList.reduce((s, z) => {
            const v = state.groundTruths[z]?.[i];
            return s + (Number.isFinite(v) ? v : 0);
        }, 0);
        if (!monthDays[m]) monthDays[m] = {};
        if (!gtMonthDays[m]) gtMonthDays[m] = {};
        monthDays[m][key] = (monthDays[m][key] || 0) + predTotal;
        gtMonthDays[m][key] = (gtMonthDays[m][key] || 0) + gtTotal;
    });

    const data = MONTHS.map((name, m) => {
        const days = monthDays[m];
        const gtDays = gtMonthDays[m];
        return {
            month: name,
            value: days ? mean(Object.values(days)) : 0,
            gt: gtDays ? mean(Object.values(gtDays)) : 0
        };
    });

    if (!data.some(d => d.value > 0 || d.gt > 0)) {
        showEmptyChart(sec);
        return;
    }

    const H = 230, iH = H - M.top - M.bottom, iW = W - M.left - M.right;
    const x = d3.scalePoint().domain(MONTHS).range([0, iW]).padding(0.5);
    const yMax = d3.max(data, d => Math.max(d.value, d.gt)) || 1;
    const y = d3.scaleLinear().domain([0, yMax * 1.15]).range([iH, 0]).nice();

    const svg = d3.select(sec).append('svg')
        .attr('viewBox', `0 0 ${W} ${H}`)
        .attr('preserveAspectRatio', 'xMidYMid meet');
    const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

    gridLines(g, d3.axisLeft(y).ticks(5), iW);

    const area = d3.area().x(d => x(d.month)).y0(iH).y1(d => y(d.value)).curve(d3.curveCatmullRom);
    g.append('path').datum(data).attr('fill', FILL_BLUE).attr('d', area);

    const line = d3.line().x(d => x(d.month)).y(d => y(d.value)).curve(d3.curveCatmullRom);
    g.append('path').datum(data).attr('fill', 'none').attr('stroke', DARK_BLUE).attr('stroke-width', 2).attr('d', line);

    const gtLine = d3.line().x(d => x(d.month)).y(d => y(d.gt)).curve(d3.curveCatmullRom);
    g.append('path').datum(data).attr('fill', 'none').attr('stroke', OBSERVED_GREEN)
        .attr('stroke-width', 2).attr('stroke-dasharray', '6,4').attr('d', gtLine);

    g.selectAll('.dot-pred').data(data).join('circle').attr('class', 'dot-pred')
        .attr('cx', d => x(d.month)).attr('cy', d => y(d.value)).attr('r', 3.5).attr('fill', DARK_BLUE)
        .on('mouseover', (ev, d) => showTip(ev, `${d.month}: ${d.value.toFixed(1)} avg calls/day (Predicted)`))
        .on('mousemove', moveTip).on('mouseleave', hideTip);

    g.selectAll('.dot-gt').data(data).join('circle').attr('class', 'dot-gt')
        .attr('cx', d => x(d.month)).attr('cy', d => y(d.gt)).attr('r', 3.5).attr('fill', OBSERVED_GREEN)
        .on('mouseover', (ev, d) => showTip(ev, `${d.month}: ${d.gt.toFixed(1)} avg calls/day (Actual)`))
        .on('mousemove', moveTip).on('mouseleave', hideTip);

    g.append('g').attr('transform', `translate(0,${iH})`).call(d3.axisBottom(x)).call(styleAxis);
    g.append('g').call(d3.axisLeft(y).ticks(5)).call(styleAxis);
    yLabel(g, iH, 'avg calls/day');
    legendLinePredActual(g, iW);
}

// Chart 5 — EMS demand ranked by ZIP (horizontal bar)
function renderZipRanking(container) {
    const sec = chartSection(container, 'EMS demand ranked by ZIP');

    const SERIES = ['pred', 'gt'];
    const sorted = state.zipList
        .map(zip => ({
            zip,
            value: zipMeanCallsInWindow(zip),
            gt: zipMeanGTInWindow(zip)
        }))
        .sort((a, b) => b.value - a.value);

    const rowH = 32;
    const iW = W - M.left - M.right;
    const iH = sorted.length * rowH;
    const H = iH + M.top + M.bottom;

    const xMax = d3.max(sorted, d => Math.max(d.value, d.gt)) || 1;
    const x = d3.scaleLinear().domain([0, xMax * 1.15]).range([0, iW]).nice();
    const y0 = d3.scaleBand().domain(sorted.map(d => d.zip)).range([0, iH]).padding(0.2);
    const y1 = d3.scaleBand().domain(SERIES).range([0, y0.bandwidth()]).padding(0.15);

    const svg = d3.select(sec).append('svg')
        .attr('viewBox', `0 0 ${W} ${H}`)
        .attr('preserveAspectRatio', 'xMidYMid meet');
    const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

    g.append('g').attr('transform', `translate(0,${iH})`)
        .call(d3.axisBottom(x).ticks(6).tickSize(-iH).tickFormat(''))
        .call(sg => { sg.select('.domain').remove(); sg.selectAll('.tick line').attr('stroke', '#f1f5f9'); });

    const zipGroups = g.selectAll('.zip-group').data(sorted).join('g')
        .attr('class', 'zip-group')
        .attr('transform', d => `translate(0,${y0(d.zip)})`);

    zipGroups.selectAll('rect').data(d => [
        { key: 'pred', val: d.value, zip: d.zip },
        { key: 'gt', val: d.gt, zip: d.zip }
    ]).join('rect')
        .attr('x', 0)
        .attr('y', s => y1(s.key))
        .attr('width', s => x(s.val))
        .attr('height', y1.bandwidth())
        .attr('fill', s => s.key === 'pred' ? DARK_BLUE : OBSERVED_GREEN)
        .attr('rx', 3)
        .on('mouseover', (ev, s) => showTip(ev,
            `ZIP ${s.zip}: ${s.val.toFixed(1)} avg calls (${s.key === 'pred' ? 'Predicted' : 'Actual'})`))
        .on('mousemove', moveTip).on('mouseleave', hideTip);

    g.append('g').attr('transform', `translate(0,${iH})`).call(d3.axisBottom(x).ticks(6)).call(styleAxis);
    g.append('g').call(d3.axisLeft(y0)).call(styleAxis);

    g.append('text').attr('x', iW / 2).attr('y', iH + 38)
        .attr('text-anchor', 'middle').attr('font-size', '11').attr('fill', '#64748b').text('avg calls');
    legendBarPredActual(g, iW);
}

// Chart 6 — Population vs avg daily calls (bubble)
function renderPopulationBubble(container) {
    const sec = chartSection(container, 'Population vs avg daily calls');

    const bubbles = state.zipList.map(zip => {
        const pop = getPopulation(zip);
        const avgCalls = zipMeanCallsInWindow(zip);
        const avgGT = zipMeanGTInWindow(zip);
        const sens = Math.min(Math.max(avgCalls, avgGT) / (pop / 1000), 5);
        return { zip, pop, avgCalls, avgGT, sens };
    }).filter(d => d.pop > 0);

    const H = 280, iH = H - M.top - M.bottom, iW = W - M.left - M.right;
    const x = d3.scaleLinear().domain([0, (d3.max(bubbles, d => d.pop / 1000) || 1) * 1.15]).range([0, iW]).nice();
    const yMax = d3.max(bubbles, d => Math.max(d.avgCalls, d.avgGT)) || 1;
    const y = d3.scaleLinear().domain([0, yMax * 1.15]).range([iH, 0]).nice();
    const r = d3.scaleSqrt().domain([0, 5]).range([4, 22]);

    const svg = d3.select(sec).append('svg')
        .attr('viewBox', `0 0 ${W} ${H}`)
        .attr('preserveAspectRatio', 'xMidYMid meet');
    const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

    gridLines(g, d3.axisLeft(y).ticks(5), iW);

    g.selectAll('.bubble-pred').data(bubbles).join('circle').attr('class', 'bubble-pred')
        .attr('cx', d => x(d.pop / 1000)).attr('cy', d => y(d.avgCalls))
        .attr('r', d => r(d.sens))
        .attr('fill', 'rgba(30, 58, 95, 0.42)')
        .attr('stroke', DARK_BLUE).attr('stroke-width', 1)
        .on('mouseover', (ev, d) => showTip(ev,
            `ZIP ${d.zip} · Pop: ${(d.pop / 1000).toFixed(1)}k<br>Predicted: ${d.avgCalls.toFixed(1)} calls/day<br>Actual: ${d.avgGT.toFixed(1)} calls/day`))
        .on('mousemove', moveTip).on('mouseleave', hideTip);

    g.selectAll('.bubble-gt').data(bubbles).join('circle').attr('class', 'bubble-gt')
        .attr('cx', d => x(d.pop / 1000)).attr('cy', d => y(d.avgGT))
        .attr('r', d => r(d.sens))
        .attr('fill', 'rgba(22, 163, 74, 0.42)')
        .attr('stroke', OBSERVED_GREEN).attr('stroke-width', 1)
        .on('mouseover', (ev, d) => showTip(ev,
            `ZIP ${d.zip} · Pop: ${(d.pop / 1000).toFixed(1)}k<br>Predicted: ${d.avgCalls.toFixed(1)} calls/day<br>Actual: ${d.avgGT.toFixed(1)} calls/day`))
        .on('mousemove', moveTip).on('mouseleave', hideTip);

    g.selectAll('.blabel').data(bubbles).join('text').attr('class', 'blabel')
        .attr('x', d => x(d.pop / 1000))
        .attr('y', d => Math.min(y(d.avgCalls), y(d.avgGT)) - r(d.sens) - 4)
        .attr('text-anchor', 'middle').attr('font-size', '9').attr('fill', '#64748b')
        .text(d => d.zip);

    g.append('g').attr('transform', `translate(0,${iH})`).call(d3.axisBottom(x).ticks(6)).call(styleAxis);
    g.append('g').call(d3.axisLeft(y).ticks(5)).call(styleAxis);

    g.append('text').attr('x', iW / 2).attr('y', iH + 38)
        .attr('text-anchor', 'middle').attr('font-size', '11').attr('fill', '#64748b').text('population (thousands)');
    yLabel(g, iH, 'avg daily calls');
    legendBubblePredActual(g, iW);
}

// Chart 7 — Neighboring ZIP demand comparison
function renderNeighborComparison(container) {
    const sec = chartSection(container, 'Neighboring ZIP demand comparison');

    // Chart area + ZIP selector pill buttons
    const chartDiv = document.createElement('div');
    sec.appendChild(chartDiv);

    const selectorDiv = document.createElement('div');
    selectorDiv.className = 'zip-selector';

    let focalZip = state.zipList[0] || '';

    state.zipList.forEach(zip => {
        const btn = document.createElement('button');
        btn.className = 'zip-selector-btn' + (zip === focalZip ? ' active' : '');
        btn.textContent = zip;
        btn.addEventListener('click', () => {
            focalZip = zip;
            selectorDiv.querySelectorAll('.zip-selector-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            drawNeighborBars(chartDiv, focalZip);
        });
        selectorDiv.appendChild(btn);
    });

    sec.appendChild(selectorDiv);
    drawNeighborBars(chartDiv, focalZip);
}

function drawNeighborBars(container, focalZip) {
    container.innerHTML = '';

    const neighbors = (state.neighborMap[focalZip] || []).slice(0, 3);
    const zips = [focalZip, ...neighbors];
    const SERIES = ['pred', 'gt'];

    const data = zips.map(zip => ({
        zip,
        value: zipMeanCallsInWindow(zip),
        gt: zipMeanGTInWindow(zip),
        focal: zip === focalZip
    }));

    const H = 220, iH = H - M.top - M.bottom, iW = W - M.left - M.right;
    const x0 = d3.scaleBand().domain(data.map(d => d.zip)).range([0, iW]).padding(0.3);
    const x1 = d3.scaleBand().domain(SERIES).range([0, x0.bandwidth()]).padding(0.15);
    const yMax = d3.max(data, d => Math.max(d.value, d.gt)) || 1;
    const y = d3.scaleLinear().domain([0, yMax * 1.2]).range([iH, 0]).nice();

    const svg = d3.select(container).append('svg')
        .attr('viewBox', `0 0 ${W} ${H}`)
        .attr('preserveAspectRatio', 'xMidYMid meet');
    const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

    gridLines(g, d3.axisLeft(y).ticks(5), iW);

    const zipGroups = g.selectAll('.zip-group').data(data).join('g')
        .attr('class', 'zip-group')
        .attr('transform', d => `translate(${x0(d.zip)},0)`);

    zipGroups.selectAll('rect').data(d => [
        { key: 'pred', val: d.value, zip: d.zip, focal: d.focal },
        { key: 'gt', val: d.gt, zip: d.zip, focal: d.focal }
    ]).join('rect')
        .attr('x', s => x1(s.key))
        .attr('y', s => y(s.val))
        .attr('width', x1.bandwidth())
        .attr('height', s => iH - y(s.val))
        .attr('fill', s => s.key === 'pred' ? DARK_BLUE : OBSERVED_GREEN)
        .attr('rx', 3)
        .on('mouseover', (ev, s) => showTip(ev,
            `ZIP ${s.zip}: ${s.val.toFixed(1)} avg calls (${s.key === 'pred' ? 'Predicted' : 'Actual'})${s.focal ? ' — selected' : ''}`))
        .on('mousemove', moveTip).on('mouseleave', hideTip);

    g.append('g').attr('transform', `translate(0,${iH})`).call(d3.axisBottom(x0)).call(styleAxis);
    g.append('g').call(d3.axisLeft(y).ticks(5)).call(styleAxis);
    yLabel(g, iH, 'avg daily calls');
    legendBarPredActual(g, iW);
}
