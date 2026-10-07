const API = "http://localhost:8030";

const state = {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    unit: "all",
    data: null
};

const MONTHS = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
];

const money = n => `${Number(n || 0).toLocaleString("en-US",{maximumFractionDigits:2})} KD`;
const pct = n => `${Number(n || 0).toFixed(2)}%`;

function el(tag, cls="", html="") {
    const x = document.createElement(tag);
    if (cls) x.className = cls;
    if (html !== "") x.innerHTML = html;
    return x;
}

function css() {
    return `
    *{box-sizing:border-box}
    body{
        margin:0;
        font-family:Inter,Segoe UI,Arial,sans-serif;
        background:#f4f6f9;
        color:#172033;
    }
    button,select{font:inherit}
    .topbar{
        background:#111827;
        color:#fff;
        padding:18px 30px;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:20px;
        position:sticky;
        top:0;
        z-index:10;
        box-shadow:0 2px 10px rgba(0,0,0,.15);
    }
    .brand h1{margin:0;font-size:23px;font-weight:700}
    .brand p{margin:4px 0 0;color:#aeb7c7;font-size:12px}
    .live{
        display:flex;
        align-items:center;
        gap:8px;
        font-size:12px;
        color:#b9c2d0;
    }
    .dot{
        width:9px;height:9px;border-radius:50%;
        background:#22c55e;
        box-shadow:0 0 0 4px rgba(34,197,94,.12)
    }
    .dot.off{background:#ef4444;box-shadow:none}
    .container{max-width:1500px;margin:auto;padding:24px}
    .filters{
        background:#fff;
        border:1px solid #e3e7ee;
        border-radius:12px;
        padding:16px;
        display:flex;
        align-items:end;
        gap:14px;
        flex-wrap:wrap;
        margin-bottom:20px;
    }
    .filter{display:flex;flex-direction:column;gap:6px}
    .filter label{
        font-size:11px;
        text-transform:uppercase;
        letter-spacing:.06em;
        color:#697386;
        font-weight:700
    }
    select{
        min-width:150px;
        border:1px solid #d7dce5;
        background:#fff;
        border-radius:7px;
        padding:9px 12px;
        color:#172033;
        outline:none
    }
    .refresh{
        border:0;
        background:#2563eb;
        color:#fff;
        border-radius:7px;
        padding:10px 17px;
        cursor:pointer;
        font-weight:600
    }
    .refresh:hover{background:#1d4ed8}
    .status{
        margin-left:auto;
        font-size:12px;
        color:#697386
    }
    .grid{
        display:grid;
        grid-template-columns:repeat(4,1fr);
        gap:14px;
        margin-bottom:20px;
    }
    .card{
        background:#fff;
        border:1px solid #e3e7ee;
        border-radius:12px;
        padding:18px;
        box-shadow:0 1px 2px rgba(0,0,0,.03)
    }
    .kpi-label{
        color:#697386;
        font-size:11px;
        text-transform:uppercase;
        letter-spacing:.05em;
        font-weight:700
    }
    .kpi-value{
        font-size:25px;
        font-weight:750;
        margin-top:8px;
        color:#111827
    }
    .kpi-sub{
        margin-top:6px;
        font-size:12px;
        color:#7b8494
    }
    .section{
        background:#fff;
        border:1px solid #e3e7ee;
        border-radius:12px;
        margin-bottom:20px;
        overflow:hidden;
    }
    .section-head{
        padding:16px 18px;
        border-bottom:1px solid #edf0f4;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:15px
    }
    .section-title{
        font-size:15px;
        font-weight:750;
        color:#182235
    }
    .section-note{font-size:11px;color:#8a93a3}
    .section-body{padding:18px}
    .chart-wrap{
        width:100%;
        overflow:hidden
    }
    canvas{display:block;width:100%;height:300px}
    .units{
        display:grid;
        grid-template-columns:repeat(4,1fr);
        gap:14px;
    }
    .unit{
        border:1px solid #e3e7ee;
        border-radius:10px;
        padding:16px;
        background:#fff
    }
    .unit-name{
        font-weight:700;
        font-size:13px;
        min-height:36px
    }
    .unit-status{
        margin-top:7px;
        font-size:10px;
        text-transform:uppercase;
        color:#16a34a;
        font-weight:700
    }
    .unit-status.off{color:#d97706}
    .unit-sales{
        margin-top:14px;
        font-size:22px;
        font-weight:750
    }
    .bar{
        height:8px;
        background:#edf0f4;
        border-radius:20px;
        margin-top:13px;
        overflow:hidden
    }
    .bar span{
        display:block;
        height:100%;
        background:#2563eb;
        border-radius:20px
    }
    .unit-meta{
        display:flex;
        justify-content:space-between;
        margin-top:8px;
        font-size:11px;
        color:#697386
    }
    table{
        width:100%;
        border-collapse:collapse;
        font-size:12px
    }
    th{
        background:#f8fafc;
        color:#687285;
        font-size:10px;
        text-transform:uppercase;
        letter-spacing:.04em;
        text-align:right;
        padding:11px 10px;
        border-bottom:1px solid #e5e9ef
    }
    th:first-child,td:first-child{text-align:left}
    td{
        padding:11px 10px;
        border-bottom:1px solid #edf0f4;
        text-align:right
    }
    tr:last-child td{border-bottom:0}
    .good{color:#15803d;font-weight:700}
    .warn{color:#b45309;font-weight:700}
    .muted{color:#9aa3b1}
    .revenue{
        display:grid;
        grid-template-columns:repeat(5,1fr);
        gap:12px
    }
    .rev{
        border:1px solid #e4e8ee;
        border-radius:9px;
        padding:14px
    }
    .rev-name{font-size:11px;color:#697386;font-weight:700}
    .rev-value{font-size:19px;font-weight:750;margin-top:7px}
    .partial{
        background:#fff7ed;
        color:#9a3412;
        border:1px solid #fed7aa;
        padding:9px 12px;
        border-radius:7px;
        font-size:11px;
        margin-top:12px
    }
    .empty{
        padding:30px;
        text-align:center;
        color:#8a93a3;
        font-size:13px
    }
    .error{
        background:#fef2f2;
        color:#991b1b;
        border:1px solid #fecaca;
        padding:15px;
        border-radius:9px;
        margin-bottom:20px
    }
    @media(max-width:1100px){
        .grid{grid-template-columns:repeat(2,1fr)}
        .units{grid-template-columns:repeat(2,1fr)}
        .revenue{grid-template-columns:repeat(3,1fr)}
    }
    @media(max-width:700px){
        .container{padding:12px}
        .topbar{padding:15px}
        .grid,.units,.revenue{grid-template-columns:1fr}
        .status{width:100%;margin-left:0}
        canvas{height:240px}
    }
    `;
}

document.head.insertAdjacentHTML("beforeend", `<style>${css()}</style>`);

document.body.innerHTML = `
<header class="topbar">
    <div class="brand">
        <h1>Central Sales Dashboard</h1>
        <p>Management Sales Performance</p>
    </div>
    <div class="live">
        <span class="dot" id="liveDot"></span>
        <span id="liveText">Connecting...</span>
    </div>
</header>

<main class="container">

    <div class="filters">
        <div class="filter">
            <label>Year</label>
            <select id="year"></select>
        </div>

        <div class="filter">
            <label>Month</label>
            <select id="month"></select>
        </div>

        <div class="filter">
            <label>Sales Unit</label>
            <select id="unit">
                <option value="all">All Sales Units</option>
            </select>
        </div>

        <button class="refresh" id="refresh">Refresh</button>

        <div class="status" id="status">Loading...</div>
    </div>

    <div id="error"></div>

    <div class="grid" id="kpis"></div>

    <section class="section">
        <div class="section-head">
            <div class="section-title">Daily Sales Trend</div>
            <div class="section-note" id="dailyNote"></div>
        </div>
        <div class="section-body">
            <div class="chart-wrap">
                <canvas id="dailyChart"></canvas>
            </div>
        </div>
    </section>

    <section class="section">
        <div class="section-head">
            <div class="section-title">Monthly Sales vs Target</div>
            <div class="section-note">January–December selected year</div>
        </div>
        <div class="section-body">
            <div class="chart-wrap">
                <canvas id="monthlyChart"></canvas>
            </div>
        </div>
    </section>

    <section class="section">
        <div class="section-head">
            <div class="section-title">Sales Unit Performance</div>
            <div class="section-note" id="unitNote"></div>
        </div>
        <div class="section-body">
            <div class="units" id="units"></div>
        </div>
    </section>

    <section class="section">
        <div class="section-head">
            <div class="section-title">Revenue Source Breakdown</div>
            <div class="section-note" id="revenueNote"></div>
        </div>
        <div class="section-body">
            <div class="revenue" id="revenue"></div>
            <div id="partial"></div>
        </div>
    </section>

    <section class="section">
        <div class="section-head">
            <div class="section-title">2026 Monthly Performance</div>
            <div class="section-note">Actual vs target</div>
        </div>
        <div class="section-body" style="padding:0">
            <div style="overflow:auto">
                <table>
                    <thead>
                        <tr>
                            <th>Month</th>
                            <th>Actual</th>
                            <th>Target</th>
                            <th>Achievement</th>
                            <th>Remaining</th>
                        </tr>
                    </thead>
                    <tbody id="monthlyTable"></tbody>
                </table>
            </div>
        </div>
    </section>

</main>
`;

const yearEl = document.getElementById("year");
const monthEl = document.getElementById("month");
const unitEl = document.getElementById("unit");

for(let y=2026;y<=2030;y++){
    const o=document.createElement("option");
    o.value=y;
    o.textContent=y;
    yearEl.appendChild(o);
}

yearEl.value=state.year;

MONTHS.forEach((m,i)=>{
    const o=document.createElement("option");
    o.value=i+1;
    o.textContent=m;
    monthEl.appendChild(o);
});

monthEl.value=state.month;

yearEl.onchange=()=>{
    state.year=Number(yearEl.value);
    load();
};

monthEl.onchange=()=>{
    state.month=Number(monthEl.value);
    load();
};

unitEl.onchange=()=>{
    state.unit=unitEl.value;
    render();
};

document.getElementById("refresh").onclick=load;

async function load(){
    const status=document.getElementById("status");
    const error=document.getElementById("error");

    status.textContent="Loading...";
    error.innerHTML="";

    try{
        const r=await fetch(
            `${API}/api/dashboard?year=${state.year}&month=${state.month}`,
            {cache:"no-store"}
        );

        if(!r.ok) throw new Error(`API returned ${r.status}`);

        state.data=await r.json();

        document.getElementById("liveDot").classList.remove("off");
        document.getElementById("liveText").textContent="API Online";

        status.textContent=`Updated ${new Date().toLocaleTimeString()}`;

        updateUnits();
        render();

    }catch(e){
        document.getElementById("liveDot").classList.add("off");
        document.getElementById("liveText").textContent="API Offline";
        status.textContent="Connection failed";
        error.innerHTML=`<div class="error"><b>Unable to load dashboard.</b><br>${e.message}</div>`;
    }
}

function updateUnits(){
    const units=state.data?.sales_units||[];
    const current=unitEl.value;

    while(unitEl.options.length>1) unitEl.remove(1);

    units.forEach(u=>{
        const o=document.createElement("option");
        o.value=u.code;
        o.textContent=u.name;
        unitEl.appendChild(o);
    });

    if([...unitEl.options].some(o=>o.value===current))
        unitEl.value=current;
    else
        unitEl.value="all";
}

function filteredUnits(){
    const units=state.data?.sales_units||[];
    if(state.unit==="all") return units;
    return units.filter(x=>x.code===state.unit);
}

function render(){
    if(!state.data)return;

    renderKpis();
    renderDaily();
    renderMonthly();
    renderUnits();
    renderRevenue();
    renderTable();
}

function renderKpis(){
    const d=state.data;
    const units=filteredUnits();

    let sales=0,target=0,transactions=0;

    units.forEach(u=>{
        sales+=Number(u.sales||0);
        target+=Number(u.target||0);
        transactions+=Number(u.transactions||0);
    });

    if(state.unit==="all"){
        sales=Number(d.kpis.sales||0);
        target=Number(d.kpis.target||0);
        transactions=Number(d.kpis.transactions||0);
    }

    const achievement=target? sales/target*100:0;
    const remaining=Math.max(target-sales,0);
    const daysRemaining=Number(d.kpis.days_remaining||0);
    const required=daysRemaining>0?remaining/daysRemaining:0;
    const avg=transactions?sales/transactions:0;

    const cards=[
        ["Today's Sales",money(d.today?.sales),`${d.today?.transactions||0} transactions`],
        ["Selected Month Sales",money(sales),MONTHS[state.month-1]+" "+state.year],
        ["Monthly Target",money(target),state.unit==="all"?"All configured units":"Selected unit"],
        ["Achievement",pct(achievement),achievement>=100?"Target reached":"Current progress"],
        ["Remaining Target",money(remaining),remaining>0?"Balance to target":"Target reached"],
        ["Required Daily Sales",money(required),daysRemaining>0?`${daysRemaining} days remaining`:"Month complete"],
        ["Transactions",transactions.toLocaleString(), "Selected month"],
        ["Average Transaction",money(avg),"Sales ÷ transactions"]
    ];

    document.getElementById("kpis").innerHTML=cards.map(x=>`
        <div class="card">
            <div class="kpi-label">${x[0]}</div>
            <div class="kpi-value">${x[1]}</div>
            <div class="kpi-sub">${x[2]}</div>
        </div>
    `).join("");
}

function setupCanvas(id){
    const c=document.getElementById(id);
    const ratio=window.devicePixelRatio||1;
    const width=c.clientWidth||900;
    const height=c.clientHeight||300;
    c.width=width*ratio;
    c.height=height*ratio;
    const ctx=c.getContext("2d");
    ctx.scale(ratio,ratio);
    return {c,ctx,w:width,h:height};
}

function drawAxes(ctx,w,h,p){
    ctx.strokeStyle="#e6eaf0";
    ctx.lineWidth=1;

    for(let i=0;i<5;i++){
        const y=p.t+(h-p.t-p.b)*(i/4);
        ctx.beginPath();
        ctx.moveTo(p.l,y);
        ctx.lineTo(w-p.r,y);
        ctx.stroke();
    }
}

function renderDaily(){
    const canvas=setupCanvas("dailyChart");
    const {ctx,w,h}=canvas;
    const rows=state.data.daily||[];

    const units=filteredUnits();

    let vals=rows.map(r=>{
        if(state.unit==="all")
            return Number(r.combined||0);

        const key=state.unit;
        const v=r[key];
        return v==null?null:Number(v||0);
    });

    const available=rows.length && vals.some(v=>v!==null);

    document.getElementById("dailyNote").textContent =
        available
        ? `${MONTHS[state.month-1]} ${state.year}`
        : "Daily data unavailable for selected unit";

    if(!available){
        ctx.fillStyle="#8a93a3";
        ctx.font="14px Segoe UI";
        ctx.textAlign="center";
        ctx.fillText("Daily data unavailable",w/2,h/2);
        return;
    }

    const p={l:55,r:20,t:20,b:42};
    drawAxes(ctx,w,h,p);

    const numeric=vals.filter(v=>v!==null);
    const max=Math.max(...numeric,1);

    ctx.strokeStyle="#2563eb";
    ctx.lineWidth=2.5;
    ctx.beginPath();

    vals.forEach((v,i)=>{
        if(v===null)return;
        const x=p.l+(w-p.l-p.r)*(i/Math.max(vals.length-1,1));
        const y=h-p.b-(v/max)*(h-p.t-p.b);
        if(i===0||vals[i-1]===null)ctx.moveTo(x,y);
        else ctx.lineTo(x,y);
    });

    ctx.stroke();

    vals.forEach((v,i)=>{
        if(v===null)return;
        const x=p.l+(w-p.l-p.r)*(i/Math.max(vals.length-1,1));
        const y=h-p.b-(v/max)*(h-p.t-p.b);

        ctx.fillStyle="#2563eb";
        ctx.beginPath();
        ctx.arc(x,y,3,0,Math.PI*2);
        ctx.fill();

        if(i===0||i===vals.length-1||i%5===0){
            ctx.fillStyle="#6b7280";
            ctx.font="10px Segoe UI";
            ctx.textAlign="center";
            ctx.fillText(String(i+1),x,h-18);
        }
    });
}

function renderMonthly(){
    const canvas=setupCanvas("monthlyChart");
    const {ctx,w,h}=canvas;
    const rows=state.data.monthly||[];

    const actual=rows.map(r=>{
        if(state.unit==="all")return Number(r.combined||0);
        return Number(r[state.unit]||0);
    });

    const target=rows.map(r=>{
        if(state.unit==="all")return Number(r.target||0);

        const u=(state.data.sales_units||[]).find(x=>x.code===state.unit);
        return u && Number(r.month.split("-")[1])===state.month
            ? Number(u.target||0)
            : 0;
    });

    const max=Math.max(...actual,...target,1);
    const p={l:48,r:20,t:25,b:45};
    drawAxes(ctx,w,h,p);

    const chartW=w-p.l-p.r;
    const chartH=h-p.t-p.b;
    const step=chartW/12;

    rows.forEach((r,i)=>{
        const x=p.l+step*i+step/2;
        const aw=(step*.30);
        const ah=(actual[i]/max)*chartH;

        ctx.fillStyle="#2563eb";
        ctx.fillRect(x-aw/2,h-p.b-ah,aw,ah);

        const th=(target[i]/max)*chartH;
        ctx.fillStyle="#cbd5e1";
        ctx.fillRect(x+aw/2+3,h-p.b-th,aw,th);

        ctx.fillStyle="#697386";
        ctx.font="9px Segoe UI";
        ctx.textAlign="center";
        ctx.fillText(MONTHS[i].slice(0,3),x,h-20);
    });

    ctx.fillStyle="#2563eb";
    ctx.fillRect(w-170,15,10,10);
    ctx.fillStyle="#697386";
    ctx.font="10px Segoe UI";
    ctx.textAlign="left";
    ctx.fillText("Actual",w-154,24);

    ctx.fillStyle="#cbd5e1";
    ctx.fillRect(w-95,15,10,10);
    ctx.fillStyle="#697386";
    ctx.fillText("Target",w-79,24);
}

function renderUnits(){
    const units=filteredUnits();

    document.getElementById("unitNote").textContent=
        `${units.length} sales unit${units.length===1?"":"s"}`;

    document.getElementById("units").innerHTML=units.map(u=>{
        const a=Number(u.achievement||0);
        const width=Math.min(a,100);

        return `
        <div class="unit">
            <div class="unit-name">${u.name}</div>
            <div class="unit-status ${u.status!=="online"?"off":""}">
                ${u.status||"unknown"}
            </div>
            <div class="unit-sales">${money(u.sales)}</div>
            <div class="bar"><span style="width:${width}%"></span></div>
            <div class="unit-meta">
                <span>Target ${money(u.target)}</span>
                <span>${pct(a)}</span>
            </div>
            <div class="unit-meta">
                <span>${u.transactions||0} transactions</span>
                <span>Avg ${money(u.average_transaction)}</span>
            </div>
        </div>`;
    }).join("");
}

function renderRevenue(){
    const r=state.data.revenue;

    if(!r){
        document.getElementById("revenue").innerHTML=
            `<div class="empty">Revenue-source data unavailable.</div>`;
        return;
    }

    document.getElementById("revenueNote").textContent=
        `${MONTHS[state.month-1]} ${state.year}`;

    const sources=r.sources||{};

    document.getElementById("revenue").innerHTML=
        Object.entries(sources).map(([k,v])=>`
            <div class="rev">
                <div class="rev-name">${k}</div>
                <div class="rev-value">${money(v)}</div>
            </div>
        `).join("");

    document.getElementById("partial").innerHTML=
        r.partial
        ? `<div class="partial">Revenue-source breakdown is currently partial. It includes only sales units that provide source-level data.</div>`
        : "";
}

function renderTable(){
    const rows=state.data.monthly||[];

    document.getElementById("monthlyTable").innerHTML=rows.map((r,i)=>{
        let actual,target;

        if(state.unit==="all"){
            actual=Number(r.combined||0);
            target=Number(r.target||0);
        }else{
            actual=Number(r[state.unit]||0);

            const u=(state.data.sales_units||[]).find(
                x=>x.code===state.unit
            );

            target=
                u && i+1===state.month
                ? Number(u.target||0)
                : 0;
        }

        const achievement=target?actual/target*100:0;
        const remaining=Math.max(target-actual,0);

        return `
        <tr>
            <td>${MONTHS[i]}</td>
            <td>${money(actual)}</td>
            <td>${target?money(target):'<span class="muted">—</span>'}</td>
            <td class="${achievement>=100?'good':achievement>50?'warn':''}">
                ${target?pct(achievement):'<span class="muted">—</span>'}
            </td>
            <td>${target?money(remaining):'<span class="muted">—</span>'}</td>
        </tr>`;
    }).join("");
}

window.addEventListener("resize",()=>{
    if(state.data)render();
});

load();

setInterval(load,60000);