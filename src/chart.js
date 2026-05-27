/**
 * CARE-EMS — demand chart (D3) with interpretation and observed/forecast separator
 */

import { state } from './state.js';
import { classifyDemand, rollingStats } from './classify.js';
import { mean } from './utils.js';

const OBSERVED_COLOR = '#16a34a';
const FORECAST_COLOR = '#f97316';
const M = { top: 28, right: 16, bottom: 36, left: 48 };
const CHART_H = 220;

let resizeObserver = null;
let resizeTimer = null;

// ── Tooltip (reuses .d3-tooltip from ems.css) ───────────────────────────────

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
    t.style.top = (event.clientY - 32) + 'px';
}

function moveTip(event) {
    tip().style.left = (event.clientX + 14) + 'px';
    tip().style.top = (event.clientY - 32) + 'px';
}

function hideTip() {
    tip().style.opacity = '0';
}

// ── D3 helpers ──────────────────────────────────────────────────────────────

function styleAxis(sel) {
    sel.select('.domain').attr('stroke', '#e2e8f0');
    sel.selectAll('.tick line').attr('stroke', '#e2e8f0');
    sel.selectAll('.tick text').attr('fill', '#64748b').attr('font-size', '10');
}

function yLabel(g, iH, text) {
    g.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -iH / 2)
        .attr('y', -38)
        .attr('text-anchor', 'middle')
        .attr('font-size', '11')
        .attr('fill', '#64748b')
        .text(text);
}

function xTickFormat(label, index, labels) {
    if (label === 'fcst') return 'fcst';
    const match = label.match(/^-(\d+)h$/);
    if (!match) return label;
    const hours = parseInt(match[1], 10);
    if (hours % 4 === 0) return label;
    return '';
}

function ensureResizeObserver() {
    const wrap = document.querySelector('.chart-wrap');
    if (!wrap || resizeObserver) return;

    resizeObserver = new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (state.dataLoaded && state.forecastIndex >= 0) {
                updateChart();
            }
        }, 150);
    });
    resizeObserver.observe(wrap);
}

function renderLegend(container) {
    const legend = container.append('div').attr('class', 'demand-chart-legend');
    legend.append('span').attr('class', 'legend-item observed')
        .html('<span class="legend-swatch-line"></span> Observed');
    legend.append('span').attr('class', 'legend-item forecast')
        .html('<span class="legend-swatch-dot"></span> Forecast');
}

function renderDemandChart(container, labels, observed, forecast) {
    const wrap = document.querySelector('.chart-wrap');
    const W = Math.max(320, (wrap?.clientWidth ?? 600) - 32);
    const H = CHART_H;
    const iW = W - M.left - M.right;
    const iH = H - M.top - M.bottom;

    const points = labels.map((label, i) => ({
        label,
        observed: observed[i],
        forecast: forecast[i]
    }));
    const obsPoints = points.filter(p => Number.isFinite(p.observed));
    const fcPoint = points.find(p => Number.isFinite(p.forecast));

    const maxY = d3.max([
        ...obsPoints.map(p => p.observed),
        fcPoint?.forecast
    ].filter(Number.isFinite)) || 1;

    const x = d3.scalePoint().domain(labels).range([0, iW]).padding(0.35);
    const y = d3.scaleLinear().domain([0, maxY * 1.1]).range([iH, 0]).nice();

    const root = d3.select(container);
    root.html('');
    renderLegend(root);

    const svg = root.append('svg')
        .attr('viewBox', `0 0 ${W} ${H}`)
        .attr('width', '100%')
        .attr('preserveAspectRatio', 'xMidYMid meet');

    const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

    g.append('g')
        .call(d3.axisLeft(y).ticks(5).tickSize(-iW).tickFormat(''))
        .call(sg => {
            sg.select('.domain').remove();
            sg.selectAll('.tick line').attr('stroke', '#f1f5f9');
        });

    if (obsPoints.length >= 2) {
        const line = d3.line()
            .x(d => x(d.label))
            .y(d => y(d.observed))
            .curve(d3.curveCatmullRom);
        g.append('path')
            .datum(obsPoints)
            .attr('fill', 'none')
            .attr('stroke', OBSERVED_COLOR)
            .attr('stroke-width', 2)
            .attr('d', line);
    }

    const bindTip = (selection, htmlFn) => {
        selection
            .on('mouseover', (ev, d) => showTip(ev, htmlFn(d)))
            .on('mousemove', moveTip)
            .on('mouseleave', hideTip);
    };

    g.selectAll('.obs-dot')
        .data(obsPoints)
        .join('circle')
        .attr('class', 'obs-dot')
        .attr('cx', d => x(d.label))
        .attr('cy', d => y(d.observed))
        .attr('r', 2)
        .attr('fill', OBSERVED_COLOR);

    g.selectAll('.obs-hit')
        .data(obsPoints)
        .join('circle')
        .attr('class', 'obs-hit')
        .attr('cx', d => x(d.label))
        .attr('cy', d => y(d.observed))
        .attr('r', 8)
        .attr('fill', 'transparent')
        .attr('pointer-events', 'all')
        .call(bindTip, d => `${d.label}: ${d.observed.toFixed(1)} calls (Observed)`);

    if (fcPoint) {
        g.append('circle')
            .attr('class', 'fc-dot')
            .attr('cx', x(fcPoint.label))
            .attr('cy', y(fcPoint.forecast))
            .attr('r', 6)
            .attr('fill', FORECAST_COLOR);

        g.append('circle')
            .attr('class', 'fc-hit')
            .attr('cx', x(fcPoint.label))
            .attr('cy', y(fcPoint.forecast))
            .attr('r', 10)
            .attr('fill', 'transparent')
            .attr('pointer-events', 'all')
            .call(bindTip, d => `fcst: ${d.forecast.toFixed(1)} calls (Forecast)`);
    }

    if (labels.length >= 2) {
        const lastObs = labels[labels.length - 2];
        const fcst = labels[labels.length - 1];
        const sepX = (x(lastObs) + x(fcst)) / 2;
        g.append('line')
            .attr('x1', sepX)
            .attr('x2', sepX)
            .attr('y1', 0)
            .attr('y2', iH)
            .attr('stroke', 'rgba(100, 116, 139, 0.5)')
            .attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '4,4');
    }

    g.append('g')
        .attr('transform', `translate(0,${iH})`)
        .call(d3.axisBottom(x).tickFormat((d, i) => xTickFormat(d, i, labels)))
        .call(styleAxis);

    g.append('g').call(d3.axisLeft(y).ticks(5)).call(styleAxis);
    yLabel(g, iH, 'Calls');
}

export function updateChart() {
    const zip = state.focusZip;
    const endRel = state.forecastIndex;
    if (endRel < 0 || !zip) return;

    const labels = [];
    const observed = [];
    const forecast = [];

    const historyStart = Math.max(0, endRel - 23);
    for (let r = historyStart; r <= endRel; r++) {
        const dataIdx = state.activeIndices[r];
        labels.push(r === endRel ? 'fcst' : `-${endRel - r}h`);
        observed.push(state.groundTruths[zip][dataIdx]);
        forecast.push(null);
    }

    const fcIdx = state.activeIndices[endRel];
    const fcVal = state.predictions[zip][fcIdx];
    forecast[forecast.length - 1] = fcVal;

    const status = classifyDemand(fcVal, zip);
    const finiteObs = observed.filter(v => v !== null && Number.isFinite(v));
    const last6 = finiteObs.slice(-6);
    const recentAvg = mean(last6);
    const overallAvg = rollingStats(zip, endRel, 24).avg;

    let recentPhrase;
    if (recentAvg < overallAvg * 0.85) recentPhrase = 'Recent demand is low.';
    else if (recentAvg > overallAvg * 1.15) recentPhrase = 'Recent demand is elevated.';
    else recentPhrase = 'Recent demand is typical.';

    const forecastPhrases = {
        NOR: 'Forecast remains normal for the next hour.',
        MED: 'Forecast shows moderate demand for the next hour.',
        HIGH: 'Forecast indicates high demand \u2014 consider redeployment.'
    };
    const forecastPhrase = forecastPhrases[status] || '';

    const interpretEl = document.getElementById('chartInterpretation');
    if (interpretEl) {
        interpretEl.textContent = `${recentPhrase} ${forecastPhrase}`;
    }

    const container = document.getElementById('demandChart');
    if (!container) return;

    renderDemandChart(container, labels, observed, forecast);
    ensureResizeObserver();
}
