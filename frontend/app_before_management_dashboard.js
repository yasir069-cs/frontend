const API = "http://localhost:8030";

const state = {
    year: 2026,
    month: new Date().getMonth() + 1,
    branches: [],
    targets: []
};

/* =========================================================
   HELPERS
========================================================= */

function money(value) {
    return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(Number(value || 0)) + " KD";
}

function number(value) {
    return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function percent(value) {
    return Number(value || 0).toFixed(1) + "%";
}

function monthName(month) {
    return new Date(2000, month - 1, 1)
        .toLocaleString("en-US", { month: "long" });
}

async function getJSON(url) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
    }

    return await response.json();
}

/* =========================================================
   TARGET HELPERS
========================================================= */

function targetFor(branchCode, month) {
    const row = state.targets.find(item =>
        (
            item.branch_code === branchCode ||
            item.code === branchCode
        ) &&
        Number(item.month) === Number(month)
    );

    return Number(row?.target || 0);
}

/* =========================================================
   BRANCH DATA NORMALIZATION
========================================================= */

function getMonthSales(branch) {
    const data = branch.data || {};

    return Number(
        data.sales ??
        data.month_sales ??
        data.actual ??
        0
    );
}

function getTodaySales(branch) {
    const data = branch.data || {};

    return Number(
        data.today ??
        data.today_sales ??
        0
    );
}

function getBranchTarget(branch) {
    return targetFor(branch.code, state.month);
}

/* =========================================================
   LOAD DATA
========================================================= */

async function loadDashboard() {

    showLoading();

    try {

        const [branchResponse, targetResponse] = await Promise.all([
            getJSON(`${API}/api/branches`),
            getJSON(`${API}/api/targets?year=${state.year}`)
        ]);

        state.branches = branchResponse.branches || [];

        if (Array.isArray(targetResponse)) {
            state.targets = targetResponse;
        } else {
            state.targets =
                targetResponse.targets ||
                targetResponse.data ||
                [];
        }

        renderDashboard();

    } catch (error) {

        console.error(error);

        document.getElementById("root").innerHTML = `
            <div class="error-page">
                <div class="error-icon">!</div>
                <h2>Dashboard Connection Error</h2>
                <p>Central Sales API could not be reached.</p>
                <code>${error.message}</code>
                <button onclick="loadDashboard()">Retry</button>
            </div>
        `;
    }
}

/* =========================================================
   MAIN RENDER
========================================================= */

function renderDashboard() {

    const onlineBranches =
        state.branches.filter(branch => branch.status === "online");

    const totalToday = onlineBranches.reduce(
        (sum, branch) => sum + getTodaySales(branch),
        0
    );

    const totalMonth = onlineBranches.reduce(
        (sum, branch) => sum + getMonthSales(branch),
        0
    );

    const totalTarget = onlineBranches.reduce(
        (sum, branch) => sum + getBranchTarget(branch),
        0
    );

    const achievement =
        totalTarget > 0
            ? (totalMonth / totalTarget) * 100
            : 0;

    const remaining =
        Math.max(totalTarget - totalMonth, 0);

    document.getElementById("root").innerHTML = `

        <div class="dashboard">

            <!-- HEADER -->

            <header class="header">

                <div class="brand">

                    <div class="brand-badge">
                        SF
                    </div>

                    <div>
                        <div class="eyebrow">
                            MANAGEMENT
                        </div>

                        <h1>
                            Central Sales Dashboard
                        </h1>

                        <p>
                            Live sales performance across all sales units
                        </p>
                    </div>

                </div>

                <div class="controls">

                    <select id="yearSelect">

                        <option value="2026"
                            ${state.year === 2026 ? "selected" : ""}>
                            2026
                        </option>

                        <option value="2027"
                            ${state.year === 2027 ? "selected" : ""}>
                            2027
                        </option>

                        <option value="2028"
                            ${state.year === 2028 ? "selected" : ""}>
                            2028
                        </option>

                    </select>

                    <select id="monthSelect">

                        ${Array.from(
                            { length: 12 },
                            (_, index) => {

                                const month = index + 1;

                                return `
                                    <option value="${month}"
                                        ${month === state.month
                                            ? "selected"
                                            : ""}>
                                        ${monthName(month)}
                                    </option>
                                `;
                            }
                        ).join("")}

                    </select>

                    <button id="refreshButton">
                        ? Refresh
                    </button>

                </div>

            </header>


            <!-- KPI CARDS -->

            <section class="kpi-grid">

                ${kpiCard(
                    "TODAY'S SALES",
                    money(totalToday),
                    "All connected sales units",
                    "today"
                )}

                ${kpiCard(
                    `${monthName(state.month).toUpperCase()} SALES`,
                    money(totalMonth),
                    "Month to date",
                    "sales"
                )}

                ${kpiCard(
                    "MONTHLY TARGET",
                    money(totalTarget),
                    `${monthName(state.month)} ${state.year}`,
                    "target"
                )}

                ${kpiCard(
                    "ACHIEVEMENT",
                    percent(achievement),
                    "Actual vs monthly target",
                    "achievement",
                    achievement
                )}

                ${kpiCard(
                    "REMAINING",
                    money(remaining),
                    "Required to reach target",
                    "remaining"
                )}

            </section>


            <!-- SALES UNIT PERFORMANCE -->

            <section class="section">

                <div class="section-header">

                    <div>
                        <h2>Sales Unit Performance</h2>

                        <p>
                            ${monthName(state.month)}
                            ${state.year}
                        </p>
                    </div>

                    <div class="live-indicator">
                        <span></span>
                        LIVE
                    </div>

                </div>

                <div class="branch-grid">

                    ${
                        state.branches.length
                            ? state.branches
                                .map(renderBranchCard)
                                .join("")
                            : `
                                <div class="empty">
                                    No sales units configured.
                                </div>
                            `
                    }

                </div>

            </section>


            <!-- PERFORMANCE -->

            <section class="two-column">

                <div class="panel">

                    <div class="panel-header">

                        <div>
                            <h2>Monthly Performance</h2>
                            <p>2026 target overview</p>
                        </div>

                    </div>

                    <div class="chart-area">

                        ${renderMonthlyChart()}

                    </div>

                </div>


                <div class="panel">

                    <div class="panel-header">

                        <div>
                            <h2>Unit Contribution</h2>
                            <p>Current month sales</p>
                        </div>

                    </div>

                    <div class="contribution">

                        ${renderContribution()}

                    </div>

                </div>

            </section>


            <!-- DAILY TREND + REVENUE -->

            <section class="two-column">

                <div class="panel">

                    <div class="panel-header">

                        <div>
                            <h2>Daily Sales Trend</h2>
                            <p>Current month activity</p>
                        </div>

                    </div>

                    <div class="trend-placeholder">

                        <div class="trend-number">
                            ${money(totalToday)}
                        </div>

                        <div>
                            Today's combined sales
                        </div>

                        <div class="mini-bars">

                            ${renderMiniBars()}

                        </div>

                    </div>

                </div>


                <div class="panel">

                    <div class="panel-header">

                        <div>
                            <h2>Revenue Sources</h2>
                            <p>Connected sales data</p>
                        </div>

                    </div>

                    <div class="revenue-list">

                        <div class="revenue-row">
                            <span>Membership / Receipt</span>
                            <strong>Live</strong>
                        </div>

                        <div class="revenue-row">
                            <span>Daily Sales</span>
                            <strong>Live</strong>
                        </div>

                        <div class="revenue-row">
                            <span>Lockers</span>
                            <strong>Live</strong>
                        </div>

                        <div class="revenue-row">
                            <span>PT / Personal Training</span>
                            <strong>Live</strong>
                        </div>

                        <div class="revenue-row">
                            <span>Protein</span>
                            <strong>Live</strong>
                        </div>

                    </div>

                </div>

            </section>


            <!-- MANAGEMENT TABLE -->

            <section class="panel">

                <div class="panel-header">

                    <div>
                        <h2>Management Summary</h2>

                        <p>
                            ${monthName(state.month)}
                            ${state.year}
                        </p>
                    </div>

                </div>

                <div class="table-container">

                    <table>

                        <thead>

                            <tr>
                                <th>Sales Unit</th>
                                <th>Status</th>
                                <th>Today</th>
                                <th>Actual</th>
                                <th>Target</th>
                                <th>Achievement</th>
                                <th>Remaining</th>
                            </tr>

                        </thead>

                        <tbody>

                            ${
                                state.branches
                                    .map(renderTableRow)
                                    .join("")
                            }

                        </tbody>

                    </table>

                </div>

            </section>


            <footer>

                Central Sales Dashboard
                <span>•</span>
                Last refreshed
                ${new Date().toLocaleTimeString()}

            </footer>

        </div>
    `;

    setupControls();
}


/* =========================================================
   KPI CARD
========================================================= */

function kpiCard(
    label,
    value,
    note,
    type,
    achievement = 0
) {

    const progress =
        type === "achievement"
            ? `
                <div class="kpi-progress">
                    <span style="width:${Math.min(
                        Math.max(achievement, 0),
                        100
                    )}%"></span>
                </div>
              `
            : "";

    return `
        <div class="kpi-card">

            <div class="kpi-label">
                ${label}
            </div>

            <div class="kpi-value">
                ${value}
            </div>

            <div class="kpi-note">
                ${note}
            </div>

            ${progress}

        </div>
    `;
}


/* =========================================================
   BRANCH CARD
========================================================= */

function renderBranchCard(branch) {

    const actual = getMonthSales(branch);
    const today = getTodaySales(branch);
    const target = getBranchTarget(branch);

    const achievement =
        target > 0
            ? actual / target * 100
            : 0;

    const remaining =
        Math.max(target - actual, 0);

    const online =
        branch.status === "online";

    return `
        <div class="branch-card">

            <div class="branch-card-header">

                <div>

                    <div class="branch-name">
                        ${branch.name}
                    </div>

                    <div class="branch-status ${online
                        ? "online"
                        : "offline"}">

                        <span></span>

                        ${online
                            ? "Online"
                            : "Offline"}

                    </div>

                </div>

                <div class="branch-main-value">
                    ${money(actual)}
                </div>

            </div>


            ${
                online
                    ? `
                        <div class="branch-stats">

                            <div>
                                <span>Today</span>
                                <strong>${money(today)}</strong>
                            </div>

                            <div>
                                <span>Target</span>
                                <strong>${money(target)}</strong>
                            </div>

                            <div>
                                <span>Achievement</span>
                                <strong>${percent(achievement)}</strong>
                            </div>

                        </div>

                        <div class="branch-progress">

                            <span style="width:${Math.min(
                                Math.max(achievement, 0),
                                100
                            )}%"></span>

                        </div>

                        <div class="branch-remaining">
                            Remaining ${money(remaining)}
                        </div>
                    `
                    : `
                        <div class="offline-message">
                            ${branch.error || "Sales API unavailable"}
                        </div>
                    `
            }

        </div>
    `;
}


/* =========================================================
   CONTRIBUTION
========================================================= */

function renderContribution() {

    const total = state.branches.reduce(
        (sum, branch) =>
            sum + getMonthSales(branch),
        0
    );

    if (!total) {
        return `
            <div class="empty">
                No sales data available.
            </div>
        `;
    }

    return state.branches
        .map(branch => {

            const value = getMonthSales(branch);

            const share =
                total > 0
                    ? value / total * 100
                    : 0;

            return `
                <div class="contribution-item">

                    <div class="contribution-header">

                        <span>
                            ${branch.name}
                        </span>

                        <strong>
                            ${money(value)}
                        </strong>

                    </div>

                    <div class="contribution-bar">

                        <span style="width:${share}%"></span>

                    </div>

                    <small>
                        ${share.toFixed(1)}%
                        of current month sales
                    </small>

                </div>
            `;

        })
        .join("");
}


/* =========================================================
   MONTHLY CHART
========================================================= */

function renderMonthlyChart() {

    const months = Array.from(
        { length: 12 },
        (_, index) => index + 1
    );

    const values = months.map(month => {

        /*
         * Current API gives us live branch data.
         * For the selected month, calculate current actual.
         * Other months show target structure until historical
         * aggregate data is connected to the central endpoint.
         */

        if (month === state.month) {

            return state.branches.reduce(
                (sum, branch) =>
                    sum + getMonthSales(branch),
                0
            );

        }

        return 0;
    });

    const targets = months.map(month => {

        return state.branches.reduce(
            (sum, branch) =>
                sum + targetFor(branch.code, month),
            0
        );
    });

    const max =
        Math.max(
            ...targets,
            ...values,
            1
        );

    return `
        <div class="monthly-chart">

            <div class="chart-legend">

                <span>
                    <i class="actual-dot"></i>
                    Actual
                </span>

                <span>
                    <i class="target-dot"></i>
                    Target
                </span>

            </div>

            <div class="bars">

                ${months.map((month, index) => {

                    const actualHeight =
                        values[index] / max * 100;

                    const targetHeight =
                        targets[index] / max * 100;

                    return `
                        <div class="month-column">

                            <div class="bar-values">

                                <div
                                    class="actual-bar"
                                    style="height:${actualHeight}%"
                                    title="Actual: ${money(values[index])}">
                                </div>

                                <div
                                    class="target-bar"
                                    style="height:${targetHeight}%"
                                    title="Target: ${money(targets[index])}">
                                </div>

                            </div>

                            <span>
                                ${monthName(month).substring(0, 3)}
                            </span>

                        </div>
                    `;

                }).join("")}

            </div>

        </div>
    `;
}


/* =========================================================
   MINI TREND
========================================================= */

function renderMiniBars() {

    const values =
        state.branches.map(branch =>
            getTodaySales(branch)
        );

    const max =
        Math.max(...values, 1);

    return values.map(value => {

        const height =
            Math.max(
                8,
                value / max * 100
            );

        return `
            <div
                class="mini-bar"
                style="height:${height}%"
                title="${money(value)}">
            </div>
        `;

    }).join("");
}


/* =========================================================
   TABLE
========================================================= */

function renderTableRow(branch) {

    const actual = getMonthSales(branch);
    const today = getTodaySales(branch);
    const target = getBranchTarget(branch);

    const achievement =
        target > 0
            ? actual / target * 100
            : 0;

    const remaining =
        Math.max(target - actual, 0);

    const online =
        branch.status === "online";

    return `
        <tr>

            <td>
                <div class="unit-name">

                    <span class="status-dot ${online
                        ? "online"
                        : "offline"}"></span>

                    ${branch.name}

                </div>
            </td>

            <td>

                <span class="table-status ${online
                    ? "online"
                    : "offline"}">

                    ${online
                        ? "Online"
                        : "Offline"}

                </span>

            </td>

            <td>
                ${money(today)}
            </td>

            <td>
                ${money(actual)}
            </td>

            <td>
                ${money(target)}
            </td>

            <td>
                <strong>
                    ${percent(achievement)}
                </strong>
            </td>

            <td>
                ${money(remaining)}
            </td>

        </tr>
    `;
}


/* =========================================================
   CONTROLS
========================================================= */

function setupControls() {

    const year =
        document.getElementById("yearSelect");

    const month =
        document.getElementById("monthSelect");

    const refresh =
        document.getElementById("refreshButton");

    if (year) {

        year.onchange = function () {

            state.year =
                Number(this.value);

            loadDashboard();
        };
    }

    if (month) {

        month.onchange = function () {

            state.month =
                Number(this.value);

            loadDashboard();
        };
    }

    if (refresh) {

        refresh.onclick =
            loadDashboard;
    }
}


/* =========================================================
   LOADING
========================================================= */

function showLoading() {

    const root =
        document.getElementById("root");

    if (!root.innerHTML.trim()) {

        root.innerHTML = `
            <div class="loading-page">

                <div class="loading-spinner"></div>

                <h2>
                    Central Sales Dashboard
                </h2>

                <p>
                    Loading live sales data...
                </p>

            </div>
        `;
    }
}


/* =========================================================
   GLOBAL STYLES
========================================================= */

const style =
document.createElement("style");

style.textContent = `

* {
    box-sizing: border-box;
}

html,
body {
    margin: 0;
    padding: 0;
    min-height: 100%;
}

body {

    font-family:
        Inter,
        "Segoe UI",
        Arial,
        sans-serif;

    background: #f5f6f8;

    color: #111827;
}

button,
select {
    font-family: inherit;
}

.dashboard {

    max-width: 1600px;

    margin: auto;

    padding:
        28px
        32px
        40px;
}


/* HEADER */

.header {

    display: flex;

    justify-content: space-between;

    align-items: flex-end;

    gap: 25px;

    margin-bottom: 28px;
}

.brand {

    display: flex;

    align-items: center;

    gap: 15px;
}

.brand-badge {

    width: 48px;

    height: 48px;

    border-radius: 12px;

    background: #111827;

    color: white;

    display: flex;

    align-items: center;

    justify-content: center;

    font-weight: 800;

    font-size: 14px;
}

.eyebrow {

    font-size: 10px;

    letter-spacing: 2px;

    font-weight: 800;

    color: #6b7280;

    margin-bottom: 4px;
}

h1 {

    margin: 0;

    font-size: 28px;

    letter-spacing: -0.7px;
}

.header p {

    margin: 5px 0 0;

    color: #6b7280;

    font-size: 13px;
}

.controls {

    display: flex;

    gap: 8px;

    align-items: center;
}

.controls select,
.controls button {

    height: 40px;

    padding:
        0 13px;

    border-radius: 8px;

    border:
        1px solid #d9dde3;

    background: white;

    font-size: 13px;

    cursor: pointer;
}

.controls button {

    background: #111827;

    color: white;

    border-color: #111827;

    font-weight: 600;
}


/* KPI */

.kpi-grid {

    display: grid;

    grid-template-columns:
        repeat(5, 1fr);

    gap: 14px;

    margin-bottom: 30px;
}

.kpi-card {

    background: white;

    border:
        1px solid #e5e7eb;

    border-radius: 12px;

    padding: 19px;

    box-shadow:
        0 1px 2px
        rgba(0,0,0,.03);
}

.kpi-label {

    color: #6b7280;

    font-size: 10px;

    font-weight: 800;

    letter-spacing: .5px;
}

.kpi-value {

    margin-top: 9px;

    font-size: 25px;

    font-weight: 800;

    letter-spacing: -.5px;
}

.kpi-note {

    margin-top: 6px;

    font-size: 11px;

    color: #9ca3af;
}

.kpi-progress {

    height: 5px;

    background: #edf0f2;

    border-radius: 20px;

    overflow: hidden;

    margin-top: 11px;
}

.kpi-progress span {

    display: block;

    height: 100%;

    background: #111827;

    border-radius: 20px;
}


/* SECTIONS */

.section {

    margin-bottom: 25px;
}

.section-header {

    display: flex;

    justify-content: space-between;

    align-items: center;

    margin-bottom: 13px;
}

.section-header h2,
.panel h2 {

    margin: 0;

    font-size: 17px;

    font-weight: 750;
}

.section-header p,
.panel-header p {

    margin:
        4px
        0
        0;

    color: #9ca3af;

    font-size: 12px;
}

.live-indicator {

    display: flex;

    align-items: center;

    gap: 6px;

    color: #15803d;

    font-size: 10px;

    font-weight: 800;
}

.live-indicator span {

    width: 7px;

    height: 7px;

    border-radius: 50%;

    background: #22c55e;
}


/* BRANCHES */

.branch-grid {

    display: grid;

    grid-template-columns:
        repeat(4, 1fr);

    gap: 14px;
}

.branch-card {

    background: white;

    border:
        1px solid #e5e7eb;

    border-radius: 12px;

    padding: 18px;

    min-height: 180px;

    box-shadow:
        0 1px 2px
        rgba(0,0,0,.03);
}

.branch-card-header {

    display: flex;

    justify-content: space-between;

    gap: 12px;
}

.branch-name {

    font-size: 13px;

    font-weight: 750;

    line-height: 1.35;
}

.branch-main-value {

    font-size: 17px;

    font-weight: 800;

    white-space: nowrap;
}

.branch-status {

    display: flex;

    align-items: center;

    gap: 5px;

    margin-top: 7px;

    font-size: 10px;

    font-weight: 700;
}

.branch-status span {

    width: 7px;

    height: 7px;

    border-radius: 50%;
}

.branch-status.online {

    color: #15803d;
}

.branch-status.online span {

    background: #22c55e;
}

.branch-status.offline {

    color: #b91c1c;
}

.branch-status.offline span {

    background: #ef4444;
}

.branch-stats {

    display: grid;

    grid-template-columns:
        repeat(3, 1fr);

    gap: 8px;

    margin-top: 23px;
}

.branch-stats span {

    display: block;

    color: #9ca3af;

    font-size: 9px;

    margin-bottom: 4px;
}

.branch-stats strong {

    font-size: 11px;
}

.branch-progress {

    height: 6px;

    margin-top: 14px;

    background: #edf0f2;

    border-radius: 20px;

    overflow: hidden;
}

.branch-progress span {

    display: block;

    height: 100%;

    background: #111827;
}

.branch-remaining {

    margin-top: 8px;

    font-size: 10px;

    color: #9ca3af;
}

.offline-message {

    margin-top: 25px;

    padding: 10px;

    background: #fef2f2;

    color: #991b1b;

    border-radius: 7px;

    font-size: 11px;
}


/* PANELS */

.two-column {

    display: grid;

    grid-template-columns:
        2fr 1fr;

    gap: 14px;

    margin-bottom: 14px;
}

.panel {

    background: white;

    border:
        1px solid #e5e7eb;

    border-radius: 12px;

    padding: 20px;

    box-shadow:
        0 1px 2px
        rgba(0,0,0,.03);
}

.panel-header {

    margin-bottom: 20px;
}


/* MONTHLY CHART */

.chart-area {

    height: 290px;
}

.monthly-chart {

    height: 100%;

    display: flex;

    flex-direction: column;
}

.chart-legend {

    display: flex;

    justify-content: flex-end;

    gap: 18px;

    font-size: 10px;

    color: #6b7280;

    margin-bottom: 10px;
}

.chart-legend span {

    display: flex;

    align-items: center;

    gap: 5px;
}

.actual-dot,
.target-dot {

    width: 8px;

    height: 8px;

    display: inline-block;
}

.actual-dot {

    background: #111827;
}

.target-dot {

    background: #d1d5db;
}

.bars {

    flex: 1;

    display: grid;

    grid-template-columns:
        repeat(12, 1fr);

    gap: 7px;

    align-items: end;

    border-bottom:
        1px solid #e5e7eb;

    padding:
        10px
        5px
        0;
}

.month-column {

    height: 100%;

    display: flex;

    flex-direction: column;

    justify-content: flex-end;

    align-items: center;

    gap: 7px;
}

.bar-values {

    flex: 1;

    width: 100%;

    max-width: 34px;

    display: flex;

    align-items: flex-end;

    justify-content: center;

    gap: 3px;
}

.actual-bar {

    width: 45%;

    min-height: 0;

    background: #111827;

    border-radius:
        3px
        3px
        0
        0;
}

.target-bar {

    width: 45%;

    min-height: 0;

    background: #d1d5db;

    border-radius:
        3px
        3px
        0
        0;
}

.month-column > span {

    font-size: 9px;

    color: #9ca3af;

    padding-bottom: 8px;
}


/* CONTRIBUTION */

.contribution-item {

    margin-bottom: 19px;
}

.contribution-header {

    display: flex;

    justify-content: space-between;

    gap: 10px;

    font-size: 11px;

    margin-bottom: 7px;
}

.contribution-header strong {

    font-size: 11px;
}

.contribution-bar {

    height: 7px;

    background: #edf0f2;

    border-radius: 10px;

    overflow: hidden;
}

.contribution-bar span {

    display: block;

    height: 100%;

    background: #111827;
}

.contribution-item small {

    display: block;

    margin-top: 5px;

    font-size: 9px;

    color: #9ca3af;
}


/* TREND */

.trend-placeholder {

    min-height: 230px;

    display: flex;

    flex-direction: column;

    align-items: center;

    justify-content: center;

    color: #9ca3af;

    font-size: 12px;
}

.trend-number {

    color: #111827;

    font-size: 31px;

    font-weight: 800;

    margin-bottom: 5px;
}

.mini-bars {

    height: 70px;

    width: 80%;

    display: flex;

    align-items: flex-end;

    justify-content: center;

    gap: 12px;

    margin-top: 25px;
}

.mini-bar {

    width: 18px;

    min-height: 6px;

    background: #111827;

    border-radius:
        3px
        3px
        0
        0;
}


/* REVENUE */

.revenue-list {

    padding-top: 2px;
}

.revenue-row {

    display: flex;

    justify-content: space-between;

    padding:
        15px
        0;

    border-bottom:
        1px solid #f0f1f2;

    font-size: 12px;
}

.revenue-row strong {

    color: #15803d;

    font-size: 10px;
}


/* TABLE */

.table-container {

    width: 100%;

    overflow-x: auto;
}

table {

    width: 100%;

    min-width: 800px;

    border-collapse: collapse;
}

th {

    text-align: left;

    padding:
        11px
        8px;

    color: #6b7280;

    font-size: 9px;

    text-transform: uppercase;

    letter-spacing: .5px;

    border-bottom:
        1px solid #e5e7eb;
}

td {

    padding:
        14px
        8px;

    border-bottom:
        1px solid #f0f1f2;

    font-size: 11px;
}

.unit-name {

    display: flex;

    align-items: center;

    gap: 7px;

    font-weight: 650;
}

.status-dot {

    width: 7px;

    height: 7px;

    border-radius: 50%;
}

.status-dot.online {

    background: #22c55e;
}

.status-dot.offline {

    background: #ef4444;
}

.table-status {

    font-size: 9px;

    font-weight: 700;
}

.table-status.online {

    color: #15803d;
}

.table-status.offline {

    color: #b91c1c;
}


/* EMPTY */

.empty {

    padding: 30px;

    color: #9ca3af;

    text-align: center;

    font-size: 12px;
}


/* LOADING */

.loading-page {

    min-height: 100vh;

    display: flex;

    flex-direction: column;

    align-items: center;

    justify-content: center;

    color: #6b7280;
}

.loading-page h2 {

    color: #111827;

    margin:
        18px
        0
        4px;
}

.loading-page p {

    margin: 0;

    font-size: 13px;
}

.loading-spinner {

    width: 35px;

    height: 35px;

    border:
        3px
        solid #e5e7eb;

    border-top-color:
        #111827;

    border-radius: 50%;

    animation:
        spin .8s linear infinite;
}

@keyframes spin {

    to {
        transform: rotate(360deg);
    }

}


/* ERROR */

.error-page {

    max-width: 500px;

    margin:
        100px
        auto;

    background: white;

    border:
        1px solid #e5e7eb;

    border-radius: 12px;

    padding: 40px;

    text-align: center;
}

.error-icon {

    width: 42px;

    height: 42px;

    margin: auto;

    border-radius: 50%;

    background: #fee2e2;

    color: #b91c1c;

    display: flex;

    align-items: center;

    justify-content: center;

    font-weight: 800;
}

.error-page h2 {

    margin-bottom: 5px;
}

.error-page p {

    color: #6b7280;

    font-size: 13px;
}

.error-page code {

    display: block;

    margin:
        15px
        0;

    color: #991b1b;

    font-size: 11px;

    word-break: break-word;
}

.error-page button {

    padding:
        9px
        16px;

    border: 0;

    border-radius: 7px;

    background: #111827;

    color: white;

    cursor: pointer;
}


/* FOOTER */

footer {

    text-align: center;

    color: #9ca3af;

    font-size: 10px;

    padding:
        25px
        0
        5px;
}

footer span {

    padding:
        0
        5px;
}


/* RESPONSIVE */

@media (max-width: 1200px) {

    .kpi-grid {

        grid-template-columns:
            repeat(3, 1fr);
    }

    .branch-grid {

        grid-template-columns:
            repeat(2, 1fr);
    }
}

@media (max-width: 850px) {

    .header {

        align-items: flex-start;

        flex-direction: column;
    }

    .two-column {

        grid-template-columns: 1fr;
    }

    .kpi-grid {

        grid-template-columns:
            repeat(2, 1fr);
    }
}

@media (max-width: 550px) {

    .dashboard {

        padding: 15px;
    }

    .kpi-grid,
    .branch-grid {

        grid-template-columns: 1fr;
    }

    h1 {

        font-size: 23px;
    }

    .controls {

        width: 100%;

        flex-wrap: wrap;
    }

    .controls select,
    .controls button {

        flex: 1;
    }
}

`;

document.head.appendChild(style);


/* =========================================================
   START
========================================================= */

loadDashboard();


/* Refresh every 60 seconds */

setInterval(
    loadDashboard,
    60000
);