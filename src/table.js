/**
 * CARE-EMS — ZIP zone table
 */

import { state } from './state.js';
import { getNeighborhood, statusLabel, statusClass } from './utils.js';
import { classifyDemand, rollingStats } from './classify.js';

export function buildTableRows() {
    const idx = state.activeIndices[state.forecastIndex];
    if (idx === undefined) return [];

    return state.zipList.map(zip => {
        const predicted = state.predictions[zip][idx];
        const relIndex = state.forecastIndex;
        const stats = rollingStats(zip, relIndex, 24);
        const status = classifyDemand(predicted, zip);
        return {
            zip,
            neighborhood: getNeighborhood(zip),
            predicted,
            delta: predicted - stats.avg,
            status,
            stats
        };
    });
}

function sortTableRows(rows) {
    const { key, asc } = state.tableSort;

    return [...rows].sort((a, b) => {
        let va = a[key];
        let vb = b[key];
        if (key === 'status') {
            const order = { HIGH: 3, MED: 2, NOR: 1 };
            va = order[a.status] ?? 0;
            vb = order[b.status] ?? 0;
        }
        if (typeof va === 'string') {
            return asc ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        return asc ? va - vb : vb - va;
    });
}

export function renderTable(rows, focusZip, onZipClick) {
    const tbody = document.getElementById('zipTableBody');
    const maxPred = Math.max(...rows.map(r => r.predicted), 1);

    tbody.innerHTML = rows.map(row => {
        const barWidth = Math.round((row.predicted / maxPred) * 100);
        const selected = row.zip === focusZip ? 'selected' : '';
        const deltaSign = row.delta >= 0 ? '+' : '';
        return `<tr data-zip="${row.zip}" class="${selected}">
            <td>${row.zip}</td>
            <td>${row.neighborhood}</td>
            <td>${Math.round(row.predicted)}</td>
            <td>${deltaSign}${row.delta.toFixed(1)}</td>
            <td><div class="demand-bar-wrap"><div class="demand-bar ${statusClass(row.status)}" style="width:${barWidth}%"></div></div></td>
            <td><span class="status-badge ${statusClass(row.status)}">${statusLabel(row.status)}</span></td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('tr').forEach(tr => {
        tr.addEventListener('click', () => onZipClick(tr.dataset.zip));
    });
}

export function updateTable(onZipClick) {
    const rows = sortTableRows(buildTableRows());
    renderTable(rows, state.focusZip, onZipClick);
}

export function initTableSort(onSort) {
    document.querySelectorAll('#zipTable th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const key = th.dataset.sort;
            if (state.tableSort.key === key) {
                state.tableSort.asc = !state.tableSort.asc;
            } else {
                state.tableSort.key = key;
                state.tableSort.asc = key === 'neighborhood' || key === 'zip';
            }
            onSort();
        });
    });
}
