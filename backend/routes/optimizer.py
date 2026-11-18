from fastapi import APIRouter, HTTPException
from typing import List, Optional
from models import SlotEvaluationRequest, OptimizationResult
from ai_engine import run_block_optimization
from database import query_db

router = APIRouter(prefix="/api/optimizer", tags=["AI Block Planner"])

@router.post("/evaluate", response_model=OptimizationResult)
def evaluate_block_options(req: SlotEvaluationRequest):
    # If request_id provided, fetch request details
    if req.request_id:
        maint_req = query_db("SELECT * FROM maintenance_requests WHERE request_id = ?", (req.request_id,), one=True)
        if not maint_req:
            raise HTTPException(status_code=404, detail="Maintenance request not found")
        
        asset_id = maint_req["asset_id"]
        section_id = maint_req["section_id"]
        duration = float(maint_req["required_duration"])
        req_id = req.request_id
        date = maint_req["requested_date"]
    else:
        if not req.asset_id or not req.section_id:
            raise HTTPException(status_code=400, detail="Must provide either request_id or (asset_id and section_id)")
        asset_id = req.asset_id
        section_id = req.section_id
        duration = req.duration_hours or 2.0
        req_id = "CUSTOM_REQ"
        date = req.date or "2026-09-08"

    result = run_block_optimization(
        request_id=req_id,
        asset_id=asset_id,
        section_id=section_id,
        duration_hours=duration,
        requested_date=date
    )
    return result

@router.get("/auto-plan-pending")
def auto_plan_all_pending():
    """Batch-evaluates all pending maintenance requests and returns optimal block proposals."""
    pending = query_db("SELECT * FROM maintenance_requests WHERE status = 'Pending'")
    proposals = []
    for p in pending:
        opt = run_block_optimization(
            request_id=p["request_id"],
            asset_id=p["asset_id"],
            section_id=p["section_id"],
            duration_hours=float(p["required_duration"]),
            requested_date=p["requested_date"]
        )
        proposals.append(opt)
    return {
        "count": len(proposals),
        "proposals": proposals
    }


@router.get("/intelligent-plan/{request_id}")
def intelligent_plan(request_id: str):
    """Combines XGBoost task criticality with an OR-Tools CP-SAT feasible slot selector."""
    try:
        from criticality_model import score_request
        from cpsat_scheduler import optimize_request
        score = score_request(request_id)
        schedule = optimize_request(request_id)
        return {
            "request_id": request_id,
            "criticality": score,
            "schedule": schedule,
            "workflow": ["XGBoost predicts maintenance criticality", "CP-SAT selects a feasible maintenance window"],
            "disclaimer": "Prototype using synthetic training labels and demo timetable data. Human review is required; not for live railway operations."
        }
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"Optimization dependency missing: {exc}. Install backend requirements.")
