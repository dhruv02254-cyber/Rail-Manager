"""Train the RailManager maintenance criticality model on clearly labelled synthetic data.

The generated labels are heuristic teaching labels, NOT Indian Railways expert labels.
Replace them with reviewed historical outcomes before any operational use.
"""
from pathlib import Path
import json
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from xgboost import XGBRegressor

ROOT = Path(__file__).resolve().parent
ARTIFACTS = ROOT / "ml_artifacts"
DATA = ROOT / "data"
ARTIFACTS.mkdir(exist_ok=True)
DATA.mkdir(exist_ok=True)
FEATURES = [
    "severity", "overdue_days", "asset_criticality", "safety_risk",
    "train_traffic_impact", "asset_health_deficit", "request_priority",
    "duration_hours", "passenger_train_count", "freight_train_count",
    "is_safety_related", "is_operationally_degraded"
]


def make_synthetic_dataset(n=6000, seed=26027):
    rng = np.random.default_rng(seed)
    df = pd.DataFrame({
        "severity": rng.integers(1, 6, n),
        "overdue_days": rng.integers(0, 181, n),
        "asset_criticality": rng.integers(1, 6, n),
        "safety_risk": rng.integers(1, 6, n),
        "train_traffic_impact": rng.uniform(0, 1, n),
        "asset_health_deficit": rng.uniform(0, 1, n),
        "request_priority": rng.integers(1, 4, n),
        "duration_hours": rng.uniform(0.5, 8, n),
        "passenger_train_count": rng.integers(0, 25, n),
        "freight_train_count": rng.integers(0, 15, n),
        "is_safety_related": rng.integers(0, 2, n),
        "is_operationally_degraded": rng.integers(0, 2, n),
    })
    # Synthetic target policy: weighted risk/urgency formula plus modest noise.
    # This makes a working prototype dataset; it is not learned railway ground truth.
    raw = (
        0.19 * (df.severity - 1) / 4
        + 0.12 * np.log1p(df.overdue_days) / np.log(181)
        + 0.17 * (df.asset_criticality - 1) / 4
        + 0.18 * (df.safety_risk - 1) / 4
        + 0.12 * df.train_traffic_impact
        + 0.08 * df.asset_health_deficit
        + 0.05 * (df.request_priority - 1) / 2
        + 0.04 * df.is_safety_related
        + 0.03 * df.is_operationally_degraded
        + 0.02 * np.minimum(df.passenger_train_count / 24, 1)
        + 0.01 * np.minimum(df.freight_train_count / 14, 1)
    )
    df["criticality_score"] = np.clip(raw * 100 + rng.normal(0, 2.0, n), 0, 100).round(2)
    return df


def main():
    df = make_synthetic_dataset()
    csv_path = DATA / "synthetic_criticality_training_data.csv"
    df.to_csv(csv_path, index=False)
    X_train, X_test, y_train, y_test = train_test_split(
        df[FEATURES], df["criticality_score"], test_size=0.2, random_state=42
    )
    model = XGBRegressor(
        n_estimators=350, max_depth=5, learning_rate=0.045,
        subsample=0.9, colsample_bytree=0.9, objective="reg:squarederror",
        reg_lambda=2.0, random_state=42, n_jobs=4
    )
    model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)
    pred = model.predict(X_test)
    metrics = {
        "model": "XGBRegressor",
        "training_rows": int(len(X_train)),
        "test_rows": int(len(X_test)),
        "features": FEATURES,
        "mae": round(float(mean_absolute_error(y_test, pred)), 3),
        "rmse": round(float(np.sqrt(mean_squared_error(y_test, pred))), 3),
        "r2": round(float(r2_score(y_test, pred)), 4),
        "data_type": "SYNTHETIC",
        "label_method": "Heuristic weighted risk policy with random noise; not expert-labelled railway data",
        "warning": "Prototype only. Validate/retrain with reviewed railway maintenance records before operational use."
    }
    model.save_model(ARTIFACTS / "criticality_xgboost.json")
    (ARTIFACTS / "training_metrics.json").write_text(json.dumps(metrics, indent=2))
    (ARTIFACTS / "feature_columns.json").write_text(json.dumps(FEATURES, indent=2))
    print(json.dumps(metrics, indent=2))

if __name__ == "__main__":
    main()
