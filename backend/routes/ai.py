from fastapi import APIRouter, HTTPException
from criticality_model import model_status, score_request
from cpsat_scheduler import optimize_request

router = APIRouter(prefix="/api/ai", tags=["AI Planning"])


@router.get("/model-status")
def get_model_status():
    return model_status()


@router.get("/criticality/{request_id}")
def get_criticality(request_id: str):
    try:
        return score_request(request_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.post("/intelligent-plan/{request_id}")
def get_intelligent_plan(request_id: str):
    """Run the demo XGBoost urgency estimate and CP-SAT block scheduler."""
    try:
        criticality = score_request(request_id)
        schedule = optimize_request(request_id)
        return {
            "request_id": request_id,
            "criticality": criticality,
            "schedule": schedule,
            "status": schedule.get("status", "UNKNOWN"),
            "message": "Intelligent maintenance planning completed.",
        }
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
