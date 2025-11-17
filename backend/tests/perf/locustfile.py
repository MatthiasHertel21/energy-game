from locust import HttpUser, task, between
import random


class EMSGUser(HttpUser):
    wait_time = between(1, 3)
    token = None

    def on_start(self):
        # Login once per user
        resp = self.client.post("/api/auth/login", json={"email": "admin@example.com", "password": "admin123"})
        if resp.status_code == 200:
            data = resp.json()
            self.token = data.get("access_token")

    @task(3)
    def health(self):
        self.client.get("/api/health")

    @task(2)
    def preview_mcp(self):
        cfg = {
            "general": {"horizon_hours": 24, "forecast_horizon_hours": 48, "round_span_hours": 6, "rounds": 4},
            "market": {"base_price": 1000, "base_volume_mwh": 20000, "price_floor": -500, "price_cap": 5000},
            "grid": {"zones": 2, "atc": [[0,5000],[5000,0]]},
            "events": [],
            "devices": []
        }
        self.client.post("/api/engine/preview", json={"config": cfg})

    @task(1)
    def preview_hourly(self):
        cfg = {
            "general": {"horizon_hours": 24, "forecast_horizon_hours": 48, "round_span_hours": 6, "rounds": 4},
            "market": {"base_price": 1000, "base_volume_mwh": 20000, "price_floor": -500, "price_cap": 5000},
            "grid": {"zones": 2, "atc": [[0,5000],[5000,0]]},
            "environment": {"seed": f"test{random.randint(1,1000)}"},
            "events": [],
            "devices": []
        }
        self.client.post("/api/engine/preview/hourly", json={"config": cfg, "hours": 24})

    @task(1)
    def catalog_browse(self):
        self.client.get("/api/catalog/campaigns", headers={"Authorization": f"Bearer {self.token}"} if self.token else {})

    @task(1)
    def player_progress(self):
        if self.token:
            self.client.get("/api/player/progress", headers={"Authorization": f"Bearer {self.token}"})