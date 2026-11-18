"""OR-Tools CP-SAT candidate-window selector with train/block exclusion constraints."""
from ortools.sat.python import cp_model
from database import query_db
from ai_engine import time_to_minutes, minutes_to_time


def optimize_request(request_id: str, step_minutes: int = 15, safety_buffer_min: int = 5):
    req = query_db("SELECT * FROM maintenance_requests WHERE request_id = ?", (request_id,), one=True)
    if not req:
        raise ValueError(f"Maintenance request {request_id} not found")
    section_id = req["section_id"]
    duration = max(1, int(round(float(req["required_duration"]) * 60)))
    trains = query_db("SELECT * FROM trains WHERE section_id = ?", (section_id,))
    blocks = query_db("SELECT * FROM blocks WHERE section_id = ? AND status IN ('Planned','Active')", (section_id,))

    busy = []
    def add_daily_interval(start, end, kind, record):
        # Split an interval crossing midnight into the two parts of the 24h horizon.
        if start < 0 and end <= 1440:
            busy.append((0, end, kind, record))
        elif end <= 1440:
            busy.append((max(0, start), end, kind, record))
        else:
            busy.append((max(0, start), 1440, kind, record))
            busy.append((0, min(1440, end - 1440), kind, record))

    for t in trains:
        a, b = time_to_minutes(t["arrival_time"]), time_to_minutes(t["departure_time"])
        if b < a:
            b += 1440
        add_daily_interval(a - safety_buffer_min, b + safety_buffer_min, "TRAIN", t)
    for block in blocks:
        a, z = time_to_minutes(block["start_time"]), time_to_minutes(block["end_time"])
        if z < a:
            z += 1440
        add_daily_interval(a - safety_buffer_min, z + safety_buffer_min, "BLOCK", block)

    candidates = []
    for start in range(0, 1440 - duration + 1, step_minutes):
        end = start + duration
        clashes = [x for x in busy if max(start, x[0]) < min(end, x[1])]
        if clashes:
            continue
        # Lower objective is better: prefer daylight, but retain all feasible windows.
        daylight_penalty = 0 if 8 * 60 <= start < 18 * 60 else 180
        near_peak_penalty = 60 if 7 * 60 <= start < 10 * 60 or 17 * 60 <= start < 20 * 60 else 0
        candidates.append({"start": start, "end": end, "cost": daylight_penalty + near_peak_penalty})

    if not candidates:
        return {"status": "INFEASIBLE", "request_id": request_id, "section_id": section_id,
                "message": "No candidate window satisfies the current train timetable, existing blocks and safety buffer.",
                "candidate_count": 0, "recommended_slot": None}

    model = cp_model.CpModel()
    choices = [model.NewBoolVar(f"start_{c['start']}") for c in candidates]
    model.Add(sum(choices) == 1)
    model.Minimize(sum(c["cost"] * choices[i] for i, c in enumerate(candidates)))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 5.0
    solver.parameters.num_search_workers = 1
    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {"status": "INFEASIBLE", "request_id": request_id, "section_id": section_id,
                "message": "CP-SAT could not find a feasible maintenance window.", "candidate_count": len(candidates), "recommended_slot": None}
    selected = next(candidates[i] for i, v in enumerate(choices) if solver.Value(v))
    return {
        "status": "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE",
        "solver": "OR-Tools CP-SAT",
        "request_id": request_id,
        "section_id": section_id,
        "candidate_count": len(candidates),
        "objective_value": solver.ObjectiveValue(),
        "constraints": ["No overlap with train occupancy plus safety buffer", "No overlap with existing planned/active blocks", "Required maintenance duration must fit within 24-hour horizon"],
        "recommended_slot": {"start_time": minutes_to_time(selected["start"]), "end_time": minutes_to_time(selected["end"]), "duration_minutes": duration},
        "data_note": "Feasibility is based on the demo timetable and the constraints encoded here; it is not railway-authority safety certification."
    }
