"""XGBoost inference for maintenance-task criticality scoring."""
from pathlib import Path
import json
import numpy as np
from xgboost import XGBRegressor
from database import query_db

ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "ml_artifacts" / "criticality_xgboost.json"
METRICS_PATH = ROOT / "ml_artifacts" / "training_metrics.json"
FEATURES = json.loads((ROOT / "ml_artifacts" / "feature_columns.json").read_text()) if (ROOT / "ml_artifacts" / "feature_columns.json").exists() else []
_model = None


def model_status():
    return {
        "trained": MODEL_PATH.exists(),
        "model_file": MODEL_PATH.name if MODEL_PATH.exists() else None,
        "metrics": json.loads(METRICS_PATH.read_text()) if METRICS_PATH.exists() else None,
    }


def _get_model():
    global _model
    if not MODEL_PATH.exists():
        raise RuntimeError("XGBoost model not trained. Run: python train_xgboost.py")
    if _model is None:
        _model = XGBRegressor()
        _model.load_model(MODEL_PATH)
    return _model


def build_features(request_id: str, section_train_stats=None):
    req = query_db("SELECT * FROM maintenance_requests WHERE request_id = ?", (request_id,), one=True)
    if not req:
        raise ValueError(f"Maintenance request {request_id} not found")
    asset = query_db("SELECT * FROM assets WHERE asset_id = ?", (req["asset_id"],), one=True) or {}
    trains = query_db("SELECT * FROM trains WHERE section_id = ?", (req["section_id"],))
    passenger = sum(1 for t in trains if "Freight" not in str(t.get("train_type", "")))
    freight = len(trains) - passenger
    # Synthetic/demo data may not contain formal defect severity; derive a transparent proxy.
    condition = str(asset.get("condition", "Good")).lower()
    severity = 5 if "critical" in condition else 4 if "repair" in condition else 3 if "inspection" in condition else 1
    priority = {"Low": 1, "Medium": 2, "High": 3}.get(str(req.get("priority", "Medium")), 2)
    health = float(asset.get("health_index", 100) or 100)
    status = str(asset.get("status", "Operational")).lower()
    traffic = min(1.0, (passenger * 1.0 + freight * 0.45) / 20.0)
    try:
        import datetime
        requested = datetime.date.fromisoformat(str(req.get("requested_date", "2026-01-01")))
        overdue = max(0, (datetime.date.today() - requested).days)
    except Exception:
        overdue = 0
    vals = {
        "severity": severity,
        "overdue_days": min(overdue, 180),
        "asset_criticality": 5 if str(asset.get("priority", "Medium")) == "High" else 3 if str(asset.get("priority")) == "Medium" else 1,
        "safety_risk": 5 if str(asset.get("asset_type", "")) in ("Signal", "Point / Switch", "Bridge", "Interlocking") else 3,
        "train_traffic_impact": traffic,
        "asset_health_deficit": max(0.0, min(1.0, (100.0 - health) / 100.0)),
        "request_priority": priority,
        "duration_hours": float(req.get("required_duration", 2.0)),
        "passenger_train_count": passenger,
        "freight_train_count": freight,
        "is_safety_related": int(str(asset.get("asset_type", "")) in ("Signal", "Point / Switch", "Bridge", "Interlocking")),
        "is_operationally_degraded": int("maintenance required" in status or "under maintenance" in status),
    }
    return req, asset, vals


def score_request(request_id: str):
    req, asset, features = build_features(request_id)
    import pandas as pd
    X = pd.DataFrame([[features[c] for c in FEATURES]], columns=FEATURES)
    score = float(np.clip(_get_model().predict(X)[0], 0, 100))
    return {
        "request_id": request_id,
        "criticality_score": round(score, 1),
        "priority_band": "CRITICAL" if score >= 80 else "HIGH" if score >= 60 else "MEDIUM" if score >= 40 else "LOW",
        "features_used": features,
        "explanation": [
            f"Asset condition proxy: {asset.get('condition', 'unknown')}",
            f"Asset health index: {asset.get('health_index', 'unknown')}/100",
            f"Section train count: {features['passenger_train_count'] + features['freight_train_count']}",
            f"Request priority: {req.get('priority', 'unknown')}"
        ],
        "data_warning": "Model trained on synthetic heuristic labels; this score is a demo estimate, not an official railway safety assessment."
    }
