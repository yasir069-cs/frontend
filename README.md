# Central Sales Dashboard

Centralized sales analytics and performance tracking dashboard for multiple fitness branches.

## Overview

The Central Sales Dashboard consolidates sales metrics across multiple branches:
- **Stretch Fitness Center - Men**
- **Stretch Fitness Center - Ladies**
- **The Gym Mishref**
- **IHC-Express**

It provides monthly/annual target tracking, branch-wise performance comparisons, and executive overview charts.

## Project Structure

```
CentralSalesDashboard/
├── backend/
│   └── main.py          # FastAPI backend service
├── frontend/
│   ├── index.html       # Single page application entrypoint
│   ├── app.js           # Vanilla JS dashboard interface
│   └── package.json     # Frontend dev server scripts
├── data/
│   ├── central.db       # SQLite local database
│   └── targets/         # Annual targets spreadsheet templates
└── .gitignore           # Ignored files (venv, pycache, etc.)
```

## Getting Started

### Backend Setup
1. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   # Windows:
   .\venv\Scripts\activate
   # macOS/Linux:
   source venv/bin/activate
   ```
2. Install dependencies:
   ```bash
   pip install fastapi uvicorn requests openpyxl pydantic
   ```
3. Run the backend server:
   ```bash
   cd backend
   uvicorn main:app --reload --port 8030
   ```

### Frontend Setup
1. Serve the frontend:
   ```bash
   cd frontend
   python -m http.server 8060
   ```
2. Open `http://localhost:8060` in your web browser.
