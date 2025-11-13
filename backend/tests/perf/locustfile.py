from locust import HttpUser, task, between


class EMSGUser(HttpUser):
    wait_time = between(1, 3)

    @task(2)
    def health(self):
        self.client.get("/api/health")

    @task(1)
    def preview(self):
        cfg = {
            "general": {"horizon_hours": 24, "forecast_horizon_hours": 48, "round_span_hours": 6, "rounds": 4},
            "market": {"base_price": 1000, "base_volume_mwh": 20000, "price_floor": -500, "price_cap": 5000},
            "grid": {"zones": 2, "atc": [[0,5000],[5000,0]]},
            "events": []
        }
        self.client.post("/api/engine/preview", json={"config": cfg})