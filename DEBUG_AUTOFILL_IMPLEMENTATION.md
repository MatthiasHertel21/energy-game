# Debug Mode & Auto-Fill Implementation

## Overview
Implemented two new features for testing and debugging:
1. **Debug Mode**: Admin-only feature to log complete calculation details to markdown files
2. **Auto-Fill Buttons**: Quick-fill prices and capacities for testing scenarios

## Changes Summary

### Backend Changes

#### 1. Debug Logger Module (`backend/app/debug_logger.py`)
- New module for generating structured markdown debug logs
- Creates files in `/debug/` directory with naming: `YYYYMMDD-scenarioX-playertypeX-roundX.md`
- Logs include:
  * Scenario configuration (market settings)
  * Player devices (type, capacity, CO2 rate)
  * Forecast submission (per-device, per-lot, sample hours)
  * Market clearing results (SMP, volume)
  * Device dispatch details (offered, dispatched, prices, acceptance ratio)
  * Financial KPIs (revenue, costs, profit)
  * CO2 emissions and balancing details

#### 2. Forecast Endpoint (`backend/app/player.py`)
- Added `debug` field to forecast API model
- Stores debug flag in Forecast.data when submitted
- Only processes debug requests (silently ignored if not admin)

#### 3. Scheduler Integration (`backend/app/scheduler.py`)
- Checks for debug_enabled flag after each round calculation
- Generates debug markdown file when flag is set
- Includes full scenario config, player inputs, and calculation results
- Error handling to prevent debug failures from breaking calculations

#### 4. Docker Configuration (`docker-compose.yml`)
- Added volume mount: `./debug:/app/debug`
- Created debug directory with write permissions

### Frontend Changes

#### 1. Player Component (`frontend/src/pages/Player.jsx`)
- Imported `useAuth` hook and `Checkbox`, `FormControlLabel` components
- Added state: `debugMode` (boolean) and `user` (from auth store)
- Updated `doSubmit` function to include `debug: true` in payload when enabled

#### 2. Auto-Fill Functions
**isConsumerDevice(device)**
- Detects consumer devices by checking `category === 'load'` or type includes 'load'

**fillPrices()**
- Producer prices: Lot A = 600+10*round, B = 800+10*round, C = 1000+10*round
- Consumer prices: Lot A = 1500-10*round, B = 1200-10*round, C = 1000-10*round
- Updates `deviceBids` state with calculated prices

**fillCapacity()**
- Formula: `capacity = round + 10*hour + 200*day`
- Lot A gets 100% of calculated value
- Lots B & C each get 10% of calculated value
- Updates both `deviceBids.amounts` and `deviceHours` (aggregate)

#### 3. Admin UI Section
- Visible only when `user.email === 'admin@fastbreak.one'` and `biddingEnabled === true`
- Displayed above the "Submit Current Round" button
- Contains:
  * "Admin Tools" label
  * "Fill Prices" button
  * "Fill Capacity" button
  * "Enable Debug Logging" checkbox
- Light gray background (`bgcolor: 'action.hover'`)

## Testing Instructions

### Debug Mode Test
1. Log in as `admin@fastbreak.one`
2. Start a scenario with bidding enabled
3. Check the "Enable Debug Logging" checkbox in admin tools section
4. Submit forecast
5. Check `/home/ga/energy-game/debug/` directory for generated markdown file
6. Verify file contains:
   - Session/Round/Player information
   - Device configurations
   - Forecast data (sample hours)
   - Market clearing results
   - Dispatch details
   - KPIs and financial results

### Auto-Fill Test
1. Log in as `admin@fastbreak.one`
2. Start a scenario with multi-bid (A/B/C lots)
3. Verify admin tools panel appears above submit button
4. Click "Fill Prices":
   - Verify prices are set in bid tables
   - Producer devices: A=610, B=810, C=1010 (for Round 1)
   - Consumer devices: A=1490, B=1190, C=990 (for Round 1)
5. Click "Fill Capacity":
   - Verify amounts filled for all 24 hours
   - Hour 0: approx 1 + 0 + 0 = 1
   - Hour 23: approx 1 + 230 + 0 = 231
   - Verify Lot A has 100%, Lots B&C have 10% each

## File Structure
```
energy-game/
├── backend/
│   └── app/
│       ├── debug_logger.py          (NEW)
│       ├── player.py                 (MODIFIED - debug field)
│       └── scheduler.py              (MODIFIED - debug integration)
├── frontend/
│   └── src/
│       └── pages/
│           └── Player.jsx            (MODIFIED - UI + functions)
├── debug/                            (NEW - debug logs directory)
└── docker-compose.yml                (MODIFIED - volume mount)
```

## Deployment Status
✅ Backend rebuilt and deployed (image: 90d9f090f987)
✅ Frontend rebuilt and deployed (image: 35486b5e4f50)
✅ Debug directory created with permissions
✅ All containers running successfully

## Usage Notes

### For Admins
- Debug mode checkbox only visible to `admin@fastbreak.one`
- Auto-fill buttons only visible when bidding is enabled
- Debug files accumulate - consider periodic cleanup of `/debug/` directory
- Each submission with debug enabled creates a new file (up to ~50KB per file)

### For Trainers/Players
- No visible changes unless logged in as admin
- All existing functionality unchanged
- Debug mode completely optional and non-intrusive

### Debug Log Format
- Human-readable markdown tables
- Sample hours shown (0-5) to keep file size manageable
- Complete KPIs and aggregated metrics included
- Suitable for troubleshooting calculation discrepancies
- Can be reviewed in any markdown viewer or text editor

## Security Considerations
- Debug mode restricted to `admin@fastbreak.one` email check
- Debug files stored server-side only (not exposed via web)
- Access to debug directory requires server file system access
- No sensitive data (passwords, tokens) logged

## Performance Impact
- Minimal: Debug logging only when explicitly enabled
- File generation happens after result storage (non-blocking)
- Error handling prevents debug failures from affecting gameplay
- No impact when debug mode is off

## Future Enhancements
- Add debug file download endpoint for admins
- Implement automatic cleanup of old debug logs
- Add debug visualization dashboard
- Export debug data to structured JSON format
