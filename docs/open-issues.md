# Open Issues

Date: 2025-11-13

---

## Issue #1 – Player Forecast Submit Failed

**Status:** ✅ RESOLVED (2025-11-13)  
**Severity:** High (blocks core player functionality)  
**Reported:** 2025-11-13  

**Description:**  
Player cannot submit forecasts for the current round. When clicking "Submit Current Round" button in Player interface, the action fails with error message "Submit Failed".

**Steps to Reproduce:**
1. Login as player
2. Join or start a session
3. Navigate to Player page
4. Enter forecast values for current round
5. Click "Submit Current Round"
6. Error: "Submit Failed"

**Expected Behavior:**  
Forecast should be submitted successfully, player should receive confirmation message.

**Root Cause:**  
`Session` model in `backend/app/models.py` was missing the `scenario` relationship definition. The code in `player.py` tried to access `session.scenario` but the relationship was not defined, causing `AttributeError: 'Session' object has no attribute 'scenario'`.

**Solution:**  
Added `scenario` relationship to `Session` model:
```python
scenario = db.relationship("Scenario", backref="sessions", lazy="joined")
```

**Fixed in:**
- `backend/app/models.py` – Added scenario relationship to Session model
- Backend restarted to apply changes

**Verification:**
- Backend logs show no more AttributeError
- Forecast submission endpoint `/api/player/forecast` now accessible
