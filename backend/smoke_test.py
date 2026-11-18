"""Fast local API smoke test for the SIH26027 demo backend."""
from fastapi.testclient import TestClient
from main import app


def run():
    with TestClient(app) as client:
        for path in (
            "/api/health",
            "/api/trains",
            "/api/assets",
            "/api/sections",
            "/api/maintenance-requests",
            "/api/blocks",
            "/api/analytics/kpis",
        ):
            response = client.get(path)
            assert response.status_code == 200, f"{path}: {response.text}"
            print(f"PASS GET {path}")

        evaluation = client.post("/api/optimizer/evaluate", json={"request_id": "MR001"})
        assert evaluation.status_code == 200, evaluation.text
        recommended = evaluation.json()["recommended_slot"]
        assert recommended["start_time"] == "14:00", recommended
        print("PASS optimizer recommends 14:00–16:00 for sample MR001")

        login = client.post(
            "/api/auth/login",
            json={"username": "controller", "password": "irail2026"},
        )
        assert login.status_code == 200, login.text
        print("PASS demo controller login")

        reset = client.post("/api/demo/reset")
        assert reset.status_code == 200, reset.text
        print("PASS demo reset")

    print("All PS27 demo API smoke tests passed.")


if __name__ == "__main__":
    run()
