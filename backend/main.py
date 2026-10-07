from datetime import date, datetime
from pathlib import Path
from io import BytesIO
import calendar
import sqlite3

import requests
from fastapi import FastAPI, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openpyxl import load_workbook


# ============================================================
# CONFIGURATION
# ============================================================

BASE_DIR = Path(__file__).resolve().parent.parent
_LEGACY_DB_PATH = Path(r"D:\CentralSalesDashboard\data\central.db")
DB_PATH = _LEGACY_DB_PATH if _LEGACY_DB_PATH.exists() else (BASE_DIR / "data" / "central.db")

REQUEST_TIMEOUT = 30

MONTH_NAMES = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
]

REQUIRED_COLUMNS = [
    "Year",
    "Sales Unit",
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
]


# ============================================================
# BRANCH API CONFIGURATION
# ============================================================

BRANCH_APIS = {
    "stretch_men": {
        "name": "Stretch Fitness Center - Men",
        "url": "https://stretch-api.ihcq8.com",
        "provider": "stretch",
        "source": "gym",
    },

    "stretch_ladies": {
        "name": "Stretch Fitness Center - Ladies",
        "url": "https://stretch-api.ihcq8.com",
        "provider": "stretch",
        "source": "hpw",
    },

    "the_gym_mishref": {
        "name": "The Gym Mishref",
        "url": "https://mishref-api.ihcq8.com",
        "provider": "mishref",
        "source": None,
    },

    "ihc_express": {
        "name": "IHC-Express",
        "url": "https://express-api.ihcq8.com",
        "provider": "express",
        "source": None,
    },
}


# ============================================================
# APP
# ============================================================

app = FastAPI(
    title="Central Sales Dashboard API",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# DATABASE
# ============================================================

def get_db():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    return db


def initialize_database():

    DB_PATH.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    db = get_db()

    db.execute(
        """
        CREATE TABLE IF NOT EXISTS branches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1
        )
        """
    )

    db.execute(
        """
        CREATE TABLE IF NOT EXISTS monthly_targets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            year INTEGER NOT NULL,
            branch_id INTEGER NOT NULL,
            month INTEGER NOT NULL,
            target REAL NOT NULL DEFAULT 0,
            UNIQUE(year, branch_id, month),
            FOREIGN KEY(branch_id)
                REFERENCES branches(id)
        )
        """
    )

    db.commit()
    db.close()


initialize_database()


# ============================================================
# MODELS
# ============================================================

class BranchCreate(BaseModel):
    code: str
    name: str


class TargetCreate(BaseModel):
    year: int
    branch_id: int
    month: int
    target: float


# ============================================================
# GENERAL HELPERS
# ============================================================

def validate_year(year: int):

    if year < 2000 or year > 2100:
        raise HTTPException(
            status_code=400,
            detail="Invalid year",
        )


def validate_month(month: int):

    if month < 1 or month > 12:
        raise HTTPException(
            status_code=400,
            detail="Month must be between 1 and 12",
        )


def month_key(year: int, month: int):
    return f"{year:04d}-{month:02d}"


def safe_float(value):
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def safe_int(value):
    try:
        return int(value or 0)
    except Exception:
        return 0


def normalize_sales_unit(name):

    if name is None:
        return ""

    value = str(name).strip().lower()

    value = value.replace(" ", "")
    value = value.replace("_", "")
    value = value.replace("-", "")

    return value


def api_get(url, params=None):

    response = requests.get(
        url,
        params=params,
        timeout=REQUEST_TIMEOUT,
    )

    response.raise_for_status()

    return response.json()


# ============================================================
# TARGET ALIASES
# ============================================================

EXCEL_ALIASES = {
    normalize_sales_unit(
        "Stretch Fitness Center-Men"
    ): "stretch_men",

    normalize_sales_unit(
        "Stretch Fitness Center-Women"
    ): "stretch_ladies",

    normalize_sales_unit(
        "Stretch Fitness Center-Ladies"
    ): "stretch_ladies",

    normalize_sales_unit(
        "The Gym Mishref"
    ): "the_gym_mishref",

    normalize_sales_unit(
        "IHC- Jahra"
    ): "ihc_jahra",

    normalize_sales_unit(
        "IHC-Jahra"
    ): "ihc_jahra",

    normalize_sales_unit(
        "IHC-Express"
    ): "ihc_express",
}


# ============================================================
# BRANCH DATABASE HELPERS
# ============================================================

def get_active_branches():

    db = get_db()

    rows = db.execute(
        """
        SELECT
            id,
            code,
            name,
            active
        FROM branches
        WHERE active = 1
        ORDER BY id
        """
    ).fetchall()

    db.close()

    return rows


def get_branch_by_code(code):

    db = get_db()

    row = db.execute(
        """
        SELECT
            id,
            code,
            name,
            active
        FROM branches
        WHERE code = ?
        """,
        (code,),
    ).fetchone()

    db.close()

    return row


# ============================================================
# TARGET HELPERS
# ============================================================

def get_target_map(year: int):

    db = get_db()

    rows = db.execute(
        """
        SELECT
            mt.branch_id,
            b.code AS branch_code,
            b.name AS branch_name,
            mt.month,
            mt.target
        FROM monthly_targets mt
        INNER JOIN branches b
            ON b.id = mt.branch_id
        WHERE mt.year = ?
        ORDER BY mt.branch_id, mt.month
        """,
        (year,),
    ).fetchall()

    db.close()

    result = {}

    for row in rows:

        code = row["branch_code"]

        if code not in result:
            result[code] = {}

        result[code][int(row["month"])] = safe_float(
            row["target"]
        )

    return result


def get_branch_target(
    target_map,
    branch_code,
    month,
):

    return safe_float(
        target_map
        .get(branch_code, {})
        .get(month, 0)
    )


# ============================================================
# STRETCH NORMALIZATION
# ============================================================

def fetch_stretch_dashboard(
    year,
    month,
):

    data = api_get(
        BRANCH_APIS["stretch_men"]["url"]
        + "/api/dashboard",
        {
            "year": year,
            "month": month,
        },
    )

    return data


def fetch_stretch_revenue(
    year,
    month,
):

    return api_get(
        BRANCH_APIS["stretch_men"]["url"]
        + "/api/revenue",
        {
            "year": year,
            "month": month,
        },
    )


# ============================================================
# MISHREF / EXPRESS NORMALIZATION
# ============================================================

def fetch_legacy_year(
    branch_code,
    year,
):

    api = BRANCH_APIS[branch_code]

    try:

        data = api_get(
            api["url"]
            + f"/api/sales/year/{year}"
        )

        return {
            "available": True,
            "data": data,
            "error": None,
        }

    except Exception as exc:

        return {
            "available": False,
            "data": None,
            "error": str(exc),
        }


def fetch_legacy_summary(branch_code):

    api = BRANCH_APIS[branch_code]

    try:

        data = api_get(
            api["url"]
            + "/api/sales/summary"
        )

        return {
            "available": True,
            "data": data,
            "error": None,
        }

    except Exception as exc:

        return {
            "available": False,
            "data": None,
            "error": str(exc),
        }


def fetch_legacy_revenue(
    branch_code,
):

    api = BRANCH_APIS[branch_code]

    try:

        data = api_get(
            api["url"]
            + "/api/sales/revenue"
        )

        return {
            "available": True,
            "data": data,
            "error": None,
        }

    except Exception as exc:

        return {
            "available": False,
            "data": None,
            "error": str(exc),
        }


# ============================================================
# HISTORICAL DAILY DATA - MISHREF / EXPRESS
# ============================================================

def fetch_legacy_daily(
    branch_code,
    year,
    month,
):
    api = BRANCH_APIS[branch_code]

    try:
        data = api_get(
            api["url"] + "/api/sales/daily",
            {
                "year": year,
                "month": month,
            },
        )

        return {
            "available": True,
            "data": data,
            "error": None,
        }

    except Exception as exc:

        return {
            "available": False,
            "data": None,
            "error": str(exc),
        }


# ============================================================
# NORMALIZED SALES UNIT
# ============================================================

def empty_sales_unit(
    code,
    name,
    target=0,
):

    return {
        "code": code,
        "name": name,
        "status": "unavailable",

        "sales": 0.0,
        "transactions": 0,

        "target": round(target, 2),
        "achievement": 0.0,
        "remaining": round(target, 2),

        "average_transaction": 0.0,

        "data_available": False,
        "daily_available": False,
        "revenue_available": False,

        "error": None,
    }


def calculate_unit_kpis(
    sales,
    transactions,
    target,
):

    sales = safe_float(sales)
    transactions = safe_int(transactions)
    target = safe_float(target)

    achievement = (
        (sales / target) * 100
        if target > 0
        else 0.0
    )

    remaining = max(
        target - sales,
        0.0,
    )

    average_transaction = (
        sales / transactions
        if transactions > 0
        else 0.0
    )

    return {
        "sales": round(sales, 2),
        "transactions": transactions,
        "target": round(target, 2),
        "achievement": round(
            achievement,
            2,
        ),
        "remaining": round(
            remaining,
            2,
        ),
        "average_transaction": round(
            average_transaction,
            2,
        ),
    }


# ============================================================
# BUILD STRETCH UNITS
# ============================================================

def build_stretch_units(
    dashboard,
    target_map,
    month,
):

    result = []

    sales_units = dashboard.get(
        "sales_units",
        {},
    )

    for code, source in [
        ("stretch_men", "men"),
        ("stretch_ladies", "women"),
    ]:

        branch = BRANCH_APIS[code]

        source_data = sales_units.get(
            source,
            {},
        )

        target = get_branch_target(
            target_map,
            code,
            month,
        )

        kpis = calculate_unit_kpis(
            source_data.get("sales", 0),
            source_data.get(
                "transactions",
                0,
            ),
            target,
        )

        result.append(
            {
                "code": code,
                "name": branch["name"],
                "status": "online",

                **kpis,

                "data_available": True,
                "daily_available": True,
                "revenue_available": True,

                "error": None,
            }
        )

    return result


# ============================================================
# BUILD LEGACY UNITS
# ============================================================

def build_legacy_unit(
    branch_code,
    year,
    month,
    target_map,
):

    branch = BRANCH_APIS[branch_code]

    target = get_branch_target(
        target_map,
        branch_code,
        month,
    )

    result = empty_sales_unit(
        branch_code,
        branch["name"],
        target,
    )

    year_result = fetch_legacy_year(
        branch_code,
        year,
    )

    if not year_result["available"]:

        result["status"] = "offline"
        result["error"] = year_result["error"]

        return result

    data = year_result["data"]

    rows = data.get("months", []) if isinstance(data, dict) and "months" in data else (data.get("data", []) if isinstance(data, dict) and isinstance(data.get("data"), list) else (data if isinstance(data, list) else []))

    selected_key = month_key(
        year,
        month,
    )

    selected = next(
        (
            row
            for row in rows
            if row.get("month") == selected_key
        ),
        None,
    )

    if selected is None:

        selected = {
            "month": selected_key,
            "sales": 0,
            "transactions": 0,
        }

    sales = safe_float(
        selected.get("sales", 0)
    )

    transactions = safe_int(
        selected.get("transactions", selected.get("receipts", 0))
    )

    kpis = calculate_unit_kpis(
        sales,
        transactions,
        target,
    )

    result.update(
        {
            "status": "online",

            **kpis,

            "data_available": True,

            # The legacy APIs currently do not expose
            # arbitrary historical daily data.
            "daily_available": False,

            # Historical revenue is also not guaranteed
            # by their current API contract.
            "revenue_available": False,

            "error": None,
        }
    )

    return result


# ============================================================
# BUILD DAILY DATA
# ============================================================

def build_daily_data(
    year,
    month,
    stretch_dashboard,
    branch_units,
):

    # Start with every day of the selected month.
    days_in_month = calendar.monthrange(year, month)[1]

    day_map = {}

    for day in range(1, days_in_month + 1):

        key = f"{year:04d}-{month:02d}-{day:02d}"

        day_map[key] = {
            "date": key,
            "stretch_men": 0.0,
            "stretch_ladies": 0.0,
            "the_gym_mishref": 0.0,
            "ihc_express": 0.0,
            "combined": 0.0,
            "available_units": [],
        }

    # Stretch historical daily data.
    stretch_daily = stretch_dashboard.get("daily", [])

    for row in stretch_daily:

        key = row.get("date")

        if key not in day_map:
            continue

        day_map[key]["stretch_men"] = safe_float(
            row.get("gym", 0)
        )

        day_map[key]["stretch_ladies"] = safe_float(
            row.get("hpw", 0)
        )

        day_map[key]["available_units"].extend(
            ["stretch_men", "stretch_ladies"]
        )

    # Mishref and Express now support the same historical daily contract.
    for code in [
        "the_gym_mishref",
        "ihc_express",
    ]:

        result = fetch_legacy_daily(
            code,
            year,
            month,
        )

        if not result["available"]:
            continue

        payload = result["data"]

        if isinstance(payload, dict):
            rows = payload.get("data", [])

            if not isinstance(rows, list):
                rows = payload.get("days", [])

            if not isinstance(rows, list):
                rows = payload.get("daily", [])

        elif isinstance(payload, list):
            rows = payload

        else:
            rows = []

        for row in rows:

            key = row.get("date")

            if key not in day_map:
                continue

            day_map[key][code] = safe_float(
                row.get("sales", row.get("total", 0))
            )

            day_map[key]["available_units"].append(code)

    result = []

    for key in sorted(day_map):

        row = day_map[key]

        row["available_units"] = list(
            dict.fromkeys(row["available_units"])
        )

        row["combined"] = round(
            sum(
                safe_float(row.get(code, 0))
                for code in [
                    "stretch_men",
                    "stretch_ladies",
                    "the_gym_mishref",
                    "ihc_express",
                ]
                if code in row["available_units"]
            ),
            2,
        )

        result.append(row)

    return result


# ============================================================
# BUILD MONTHLY DATA
# ============================================================

def build_monthly_data(
    year,
    target_map,
    stretch_dashboard,
    branch_units,
):

    months = []

    stretch_monthly = stretch_dashboard.get(
        "monthly",
        [],
    )

    stretch_map = {
        row.get("month"): row
        for row in stretch_monthly
    }

    legacy_maps = {}

    for code in [
        "the_gym_mishref",
        "ihc_express",
    ]:

        result = fetch_legacy_year(
            code,
            year,
        )

        if result["available"]:

            legacy_maps[code] = {
                row.get("month"): row
                for row in (result["data"].get("months", []) if isinstance(result["data"], dict) and "months" in result["data"] else (result["data"].get("data", []) if isinstance(result["data"], dict) and isinstance(result["data"].get("data"), list) else (result["data"] if isinstance(result["data"], list) else [])))
            }

        else:

            legacy_maps[code] = {}

    for month in range(1, 13):

        key = month_key(
            year,
            month,
        )

        stretch = stretch_map.get(
            key,
            {},
        )

        row = {
            "month": key,

            "stretch_men": safe_float(
                stretch.get("gym", 0)
            ),

            "stretch_ladies": safe_float(
                stretch.get("hpw", 0)
            ),

            "the_gym_mishref": safe_float(
                legacy_maps[
                    "the_gym_mishref"
                ].get(
                    key,
                    {},
                ).get("sales", 0)
            ),

            "ihc_express": safe_float(
                legacy_maps[
                    "ihc_express"
                ].get(
                    key,
                    {},
                ).get("sales", 0)
            ),
        }

        row["combined"] = round(
            sum(
                safe_float(
                    row.get(code)
                )
                for code in [
                    "stretch_men",
                    "stretch_ladies",
                    "the_gym_mishref",
                    "ihc_express",
                ]
            ),
            2,
        )

        row["target"] = round(
            sum(
                get_branch_target(
                    target_map,
                    code,
                    month,
                )
                for code in [
                    "stretch_men",
                    "stretch_ladies",
                    "the_gym_mishref",
                    "ihc_express",
                ]
            ),
            2,
        )

        months.append(row)

    return months


# ============================================================
# REVENUE BREAKDOWN
# ============================================================

def build_revenue(
    year,
    month,
    stretch_revenue,
):

    sources = {}

    # Stretch is currently the only branch pair
    # with the new historical revenue contract.
    combined = (
        stretch_revenue
        .get("combined", {})
        .get("sources", {})
    )

    for source, value in combined.items():

        sources[source] = round(
            safe_float(value),
            2,
        )

    return {
        "year": year,
        "month": month,

        "sources": sources,

        "total": round(
            sum(sources.values()),
            2,
        ),

        "available_units": [
            "stretch_men",
            "stretch_ladies",
        ],

        "partial": True,
    }


# ============================================================
# ROOT
# ============================================================

@app.get("/")
def root():

    return {
        "status": "online",
        "service": "Central Sales Dashboard API",
        "version": "2.0.0",
    }


# ============================================================
# HEALTH
# ============================================================

@app.get("/api/health")
def health():

    return {
        "status": "online",
        "service": "Central Sales Dashboard API",
        "version": "2.0.0",
    }


# ============================================================
# BRANCH LIST
# ============================================================

@app.get("/api/branches")
def get_branches():

    result = []

    db = get_db()

    branches = db.execute(
        """
        SELECT
            id,
            code,
            name,
            active
        FROM branches
        ORDER BY id
        """
    ).fetchall()

    db.close()

    for branch in branches:

        code = branch["code"]

        item = {
            "id": branch["id"],
            "code": code,
            "name": branch["name"],
            "active": bool(
                branch["active"]
            ),
            "status": "unknown",
        }

        api = BRANCH_APIS.get(code)

        if not api:

            item["status"] = "not_configured"

            result.append(item)

            continue

        try:

            if api["provider"] == "stretch":

                response = api_get(
                    api["url"]
                    + "/api/health"
                )

                item["status"] = (
                    "online"
                    if response.get("status")
                    == "online"
                    else "error"
                )

            else:

                response = api_get(
                    api["url"]
                    + "/api/health"
                )

                item["status"] = (
                    "online"
                    if response.get("status")
                    == "online"
                    else "error"
                )

            item["data"] = {
                "provider": api["provider"],
            }

        except Exception as exc:

            item["status"] = "offline"
            item["error"] = str(exc)

        result.append(item)

    return {
        "branches": result,
    }


# ============================================================
# CENTRAL DASHBOARD
# ============================================================

@app.get("/api/dashboard")
def dashboard(
    year: int = Query(...),
    month: int = Query(...),
):

    validate_year(year)
    validate_month(month)

    targets = get_target_map(year)

    # --------------------------------------------------------
    # Stretch
    # --------------------------------------------------------

    try:

        stretch_dashboard = fetch_stretch_dashboard(
            year,
            month,
        )

        stretch_revenue = fetch_stretch_revenue(
            year,
            month,
        )

    except Exception as exc:

        raise HTTPException(
            status_code=502,
            detail={
                "message": "Stretch API unavailable",
                "error": str(exc),
            },
        )

    # --------------------------------------------------------
    # Sales units
    # --------------------------------------------------------

    branch_units = build_stretch_units(
        stretch_dashboard,
        targets,
        month,
    )

    for code in [
        "the_gym_mishref",
        "ihc_express",
    ]:

        branch_units.append(
            build_legacy_unit(
                code,
                year,
                month,
                targets,
            )
        )

    # --------------------------------------------------------
    # Totals
    # --------------------------------------------------------

    total_sales = round(
        sum(
            unit["sales"]
            for unit in branch_units
            if unit["data_available"]
        ),
        2,
    )

    total_transactions = sum(
        unit["transactions"]
        for unit in branch_units
        if unit["data_available"]
    )

    total_target = round(
        sum(
            unit["target"]
            for unit in branch_units
        ),
        2,
    )

    achievement = (
        (total_sales / total_target) * 100
        if total_target > 0
        else 0.0
    )

    remaining = max(
        total_target - total_sales,
        0.0,
    )

    # --------------------------------------------------------
    # Date / run-rate
    # --------------------------------------------------------

    today = date.today()

    if (
        year == today.year
        and month == today.month
    ):

        days_elapsed = today.day

        days_in_month = calendar.monthrange(
            year,
            month,
        )[1]

        days_remaining = max(
            days_in_month - today.day,
            0,
        )

        required_daily = (
            remaining / days_remaining
            if days_remaining > 0
            else 0.0
        )

    else:

        days_in_month = calendar.monthrange(
            year,
            month,
        )[1]

        days_elapsed = days_in_month
        days_remaining = 0
        required_daily = 0.0

    average_transaction = (
        total_sales / total_transactions
        if total_transactions > 0
        else 0.0
    )

    # --------------------------------------------------------
    # Daily
    # --------------------------------------------------------

    daily = build_daily_data(
        year,
        month,
        stretch_dashboard,
        branch_units,
    )

    # --------------------------------------------------------
    # Monthly
    # --------------------------------------------------------

    monthly = build_monthly_data(
        year,
        targets,
        stretch_dashboard,
        branch_units,
    )

    # --------------------------------------------------------
    # Revenue
    # --------------------------------------------------------

    revenue = build_revenue(
        year,
        month,
        stretch_revenue,
    )

    return {
        "year": year,
        "month": month,
        "month_key": month_key(
            year,
            month,
        ),

        "today": {
            "date": today.isoformat(),

            "sales": (
                stretch_dashboard
                .get("today", {})
                .get("sales", 0)
                if year == today.year
                and month == today.month
                else 0
            ),

            "transactions": (
                stretch_dashboard
                .get("today", {})
                .get("transactions", 0)
                if year == today.year
                and month == today.month
                else 0
            ),
        },

        "kpis": {
            "sales": total_sales,
            "target": total_target,
            "achievement": round(
                achievement,
                2,
            ),
            "remaining": round(
                remaining,
                2,
            ),
            "required_daily": round(
                required_daily,
                2,
            ),
            "transactions": total_transactions,
            "average_transaction": round(
                average_transaction,
                2,
            ),
            "days_elapsed": days_elapsed,
            "days_remaining": days_remaining,
        },

        "sales_units": branch_units,

        "daily": daily,

        "monthly": monthly,

        "revenue": revenue,
    }


# ============================================================
# TARGETS
# ============================================================

@app.get("/api/targets")
def get_targets(
    year: int,
    branch_id: int | None = None,
):

    validate_year(year)

    db = get_db()

    query = """
        SELECT
            mt.id,
            mt.year,
            mt.branch_id,
            b.code AS branch_code,
            b.name AS branch_name,
            mt.month,
            mt.target
        FROM monthly_targets mt
        INNER JOIN branches b
            ON b.id = mt.branch_id
        WHERE mt.year = ?
    """

    params = [year]

    if branch_id is not None:

        query += """
            AND mt.branch_id = ?
        """

        params.append(branch_id)

    query += """
        ORDER BY
            mt.branch_id,
            mt.month
    """

    rows = db.execute(
        query,
        params,
    ).fetchall()

    db.close()

    return {
        "year": year,
        "targets": [
            dict(row)
            for row in rows
        ],
    }


# ============================================================
# CREATE / UPDATE TARGET
# ============================================================

@app.post("/api/targets")
def create_or_update_target(
    target: TargetCreate,
):

    validate_year(target.year)
    validate_month(target.month)

    if target.target < 0:

        raise HTTPException(
            status_code=400,
            detail="Target cannot be negative",
        )

    db = get_db()

    branch = db.execute(
        """
        SELECT
            id,
            code,
            name
        FROM branches
        WHERE id = ?
        """,
        (
            target.branch_id,
        ),
    ).fetchone()

    if not branch:

        db.close()

        raise HTTPException(
            status_code=404,
            detail="Branch not found",
        )

    db.execute(
        """
        INSERT INTO monthly_targets
        (
            year,
            branch_id,
            month,
            target
        )
        VALUES (?, ?, ?, ?)

        ON CONFLICT(year, branch_id, month)
        DO UPDATE SET
            target = excluded.target
        """,
        (
            target.year,
            target.branch_id,
            target.month,
            target.target,
        ),
    )

    db.commit()

    row = db.execute(
        """
        SELECT
            mt.id,
            mt.year,
            mt.branch_id,
            b.code AS branch_code,
            b.name AS branch_name,
            mt.month,
            mt.target
        FROM monthly_targets mt
        INNER JOIN branches b
            ON b.id = mt.branch_id
        WHERE mt.year = ?
          AND mt.branch_id = ?
          AND mt.month = ?
        """,
        (
            target.year,
            target.branch_id,
            target.month,
        ),
    ).fetchone()

    db.close()

    return {
        "status": "saved",
        "target": dict(row),
    }


# ============================================================
# YEAR TARGET VIEW
# ============================================================

@app.get("/api/targets/year")
def get_year_targets(year: int):

    validate_year(year)

    db = get_db()

    branches = db.execute(
        """
        SELECT
            id,
            code,
            name
        FROM branches
        WHERE active = 1
        ORDER BY id
        """
    ).fetchall()

    result = []

    for branch in branches:

        targets = db.execute(
            """
            SELECT
                month,
                target
            FROM monthly_targets
            WHERE year = ?
              AND branch_id = ?
            ORDER BY month
            """,
            (
                year,
                branch["id"],
            ),
        ).fetchall()

        monthly = {
            str(row["month"]): safe_float(
                row["target"]
            )
            for row in targets
        }

        result.append(
            {
                "branch_id": branch["id"],
                "branch_code": branch["code"],
                "branch_name": branch["name"],
                "targets": monthly,
            }
        )

    db.close()

    return {
        "year": year,
        "branches": result,
    }


# ============================================================
# CREATE BRANCH
# ============================================================

@app.post("/api/branches")
def create_branch(
    branch: BranchCreate,
):

    code = branch.code.strip().lower()
    name = branch.name.strip()

    if not code or not name:

        raise HTTPException(
            status_code=400,
            detail="Branch code and name are required",
        )

    db = get_db()

    try:

        cursor = db.execute(
            """
            INSERT INTO branches
            (
                code,
                name
            )
            VALUES (?, ?)
            """,
            (
                code,
                name,
            ),
        )

        db.commit()

        return {
            "status": "created",
            "id": cursor.lastrowid,
            "code": code,
            "name": name,
        }

    except sqlite3.IntegrityError:

        raise HTTPException(
            status_code=409,
            detail="Branch code already exists",
        )

    finally:

        db.close()


# ============================================================
# STRETCH COMPATIBILITY
# ============================================================

@app.get("/api/branches/stretch/summary")
def stretch_summary():

    return api_get(
        BRANCH_APIS["stretch_men"]["url"]
        + "/api/sales/summary"
    )


@app.get("/api/branches/stretch/championship")
def stretch_championship():

    return api_get(
        BRANCH_APIS["stretch_men"]["url"]
        + "/api/sales/championship"
    )


@app.get("/api/branches/stretch/revenue")
def stretch_revenue_compatibility():

    return api_get(
        BRANCH_APIS["stretch_men"]["url"]
        + "/api/sales/revenue"
    )


# ============================================================
# EXCEL VALIDATION
# ============================================================

@app.post("/api/targets/upload/validate")
async def validate_target_excel(
    file: UploadFile = File(...),
):

    if not file.filename:

        raise HTTPException(
            status_code=400,
            detail="No file selected",
        )

    if not file.filename.lower().endswith(
        ".xlsx"
    ):

        raise HTTPException(
            status_code=400,
            detail="Only .xlsx Excel files are supported",
        )

    try:

        file_bytes = await file.read()

        workbook = load_workbook(
            filename=BytesIO(file_bytes),
            data_only=True,
        )

    except Exception as exc:

        raise HTTPException(
            status_code=400,
            detail=(
                "Unable to read Excel file: "
                + str(exc)
            ),
        )

    if "Target Plan" in workbook.sheetnames:

        worksheet = workbook["Target Plan"]

    else:

        worksheet = workbook.active

    header_values = None
    header_row_number = None

    for row_number, row in enumerate(
        worksheet.iter_rows(
            values_only=True
        ),
        start=1,
    ):

        values = [
            str(value).strip()
            if value is not None
            else ""
            for value in row
        ]

        if (
            "Year" in values
            and "Sales Unit" in values
        ):

            header_values = values
            header_row_number = row_number

            break

    if not header_values:

        raise HTTPException(
            status_code=400,
            detail=(
                "Excel header not found. "
                "Expected Year, Sales Unit "
                "and Jan-Dec columns."
            ),
        )

    missing_columns = [
        column
        for column in REQUIRED_COLUMNS
        if column not in header_values
    ]

    if missing_columns:

        raise HTTPException(
            status_code=400,
            detail={
                "message": (
                    "Required columns are missing"
                ),
                "missing_columns": missing_columns,
            },
        )

    column_indexes = {
        column: header_values.index(column)
        for column in REQUIRED_COLUMNS
    }

    db = get_db()

    branches = db.execute(
        """
        SELECT
            id,
            code,
            name
        FROM branches
        WHERE active = 1
        ORDER BY id
        """
    ).fetchall()

    db.close()

    branch_lookup = {}

    for branch in branches:

        branch_lookup[
            normalize_sales_unit(
                branch["name"]
            )
        ] = {
            "id": branch["id"],
            "code": branch["code"],
            "name": branch["name"],
        }

    for normalized_name, branch_code in (
        EXCEL_ALIASES.items()
    ):

        branch = next(
            (
                item
                for item in branches
                if item["code"]
                == branch_code
            ),
            None,
        )

        if branch:

            branch_lookup[
                normalized_name
            ] = {
                "id": branch["id"],
                "code": branch["code"],
                "name": branch["name"],
            }

    records = []
    errors = []
    seen_sales_units = set()
    detected_years = set()

    for excel_row_number, row in enumerate(
        worksheet.iter_rows(
            min_row=header_row_number + 1,
            values_only=True,
        ),
        start=header_row_number + 1,
    ):

        if all(
            value is None
            or str(value).strip() == ""
            for value in row
        ):

            continue

        year_value = row[
            column_indexes["Year"]
        ]

        if year_value is None:

            errors.append(
                {
                    "row": excel_row_number,
                    "field": "Year",
                    "message": "Year is required",
                }
            )

            continue

        try:

            year = int(year_value)

        except Exception:

            errors.append(
                {
                    "row": excel_row_number,
                    "field": "Year",
                    "message": "Year must be numeric",
                }
            )

            continue

        if year < 2000:

            errors.append(
                {
                    "row": excel_row_number,
                    "field": "Year",
                    "message": "Invalid year",
                }
            )

            continue

        detected_years.add(year)

        sales_unit_value = row[
            column_indexes["Sales Unit"]
        ]

        if sales_unit_value is None:

            errors.append(
                {
                    "row": excel_row_number,
                    "field": "Sales Unit",
                    "message": (
                        "Sales Unit is required"
                    ),
                }
            )

            continue

        sales_unit = str(
            sales_unit_value
        ).strip()

        normalized = normalize_sales_unit(
            sales_unit
        )

        branch = branch_lookup.get(
            normalized
        )

        if not branch:

            errors.append(
                {
                    "row": excel_row_number,
                    "field": "Sales Unit",
                    "value": sales_unit,
                    "message": (
                        "Sales Unit is not configured "
                        "in the Central Dashboard"
                    ),
                }
            )

            continue

        branch_id = branch["id"]

        if branch_id in seen_sales_units:

            errors.append(
                {
                    "row": excel_row_number,
                    "field": "Sales Unit",
                    "value": sales_unit,
                    "message": (
                        "Duplicate Sales Unit"
                    ),
                }
            )

            continue

        seen_sales_units.add(branch_id)

        monthly_targets = {}
        row_has_error = False

        for month_number, month_name in enumerate(
            MONTH_NAMES,
            start=1,
        ):

            value = row[
                column_indexes[month_name]
            ]

            if (
                value is None
                or str(value).strip() == ""
            ):

                errors.append(
                    {
                        "row": excel_row_number,
                        "field": month_name,
                        "message": (
                            "Monthly target is required"
                        ),
                    }
                )

                row_has_error = True

                continue

            try:

                target_value = float(value)

            except Exception:

                errors.append(
                    {
                        "row": excel_row_number,
                        "field": month_name,
                        "value": value,
                        "message": (
                            "Target must be numeric"
                        ),
                    }
                )

                row_has_error = True

                continue

            if target_value < 0:

                errors.append(
                    {
                        "row": excel_row_number,
                        "field": month_name,
                        "value": target_value,
                        "message": (
                            "Target cannot be negative"
                        ),
                    }
                )

                row_has_error = True

                continue

            monthly_targets[
                str(month_number)
            ] = target_value

        if not row_has_error:

            records.append(
                {
                    "excel_row": (
                        excel_row_number
                    ),
                    "year": year,
                    "sales_unit": sales_unit,
                    "branch_id": branch_id,
                    "branch_code": branch["code"],
                    "branch_name": branch["name"],
                    "targets": monthly_targets,
                    "annual_target": sum(
                        monthly_targets.values()
                    ),
                }
            )

    if len(detected_years) > 1:

        errors.append(
            {
                "field": "Year",
                "message": (
                    "One annual target file must "
                    "contain one year only."
                ),
                "years_found": sorted(
                    detected_years
                ),
            }
        )

    if not records and not errors:

        errors.append(
            {
                "message": (
                    "No target records were found"
                ),
            }
        )

    return {
        "status": (
            "valid"
            if not errors
            else "validation_error"
        ),
        "filename": file.filename,
        "sheet": worksheet.title,
        "year": (
            next(iter(detected_years))
            if len(detected_years) == 1
            else None
        ),
        "record_count": len(records),
        "error_count": len(errors),
        "errors": errors,
        "preview": records,
    }