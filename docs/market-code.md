# SAWEM Market Code Simulation Logic (Rev 2.1)

Below is a detailed technical extraction of the bidding, allocation, and pricing rules from the **SAWEM Market Code Rev 2.1**, structured for use in a simulation game or logic engine.

## 1. Bidding Rules (Data Submission)

### 1.1 Generation Units (Producers)

Producers must submit a **Price-Quantity Curve** consisting of specific technical and financial increments.

* **Submission Deadline:** Gate closure is 10:00 AM on Day D-1.
* **Capacity Parameters:**
  * **Mingen (Minimum Stable Generation):** The lowest MW level the unit can reliably maintain.
  * **MCR (Maximum Continuous Rating):** The maximum MW capacity.

* **Price Increments (Step-wise Linear):**
  * **Increment 0 (Start-up/Base):** Price for energy from 0 to Mingen. (Can be negative/zero).
  * **Increment 1:** From Mingen to Elbow Point 1.
  * **Increment 2:** From Elbow Point 1 to Elbow Point 2.
  * **Increment 3:** From Elbow Point 2 to MCR.

* **Monotonicity Rule:** Prices must be non-decreasing.
* **Emergency Level (EL1):** Optional bid for capacity above MCR (e.g., spinning reserve or peaking), usually priced significantly higher.

### 1.2 Demand Side Units (Consumers)

Consumers submit "Demand-Side Bids" expressing willingness to pay or reduction costs.

* **Base Load:** Declared expected consumption.
* **Reduction Increments:** Similar to producers, but representing the cost to *reduce* consumption.
* **Logic:** The "Buy" curve is downward sloping (willingness to pay decreases as volume increases).

---

## 2. Market Clearing & Allocation Algorithm

The Market Operator (MO) executes two distinct scheduling runs for each 30-minute Trading Period.

### 2.1 The Unconstrained Schedule (Commercial Merit Order)

This determines the **System Marginal Price (SMP)** and commercial commitments.

* **Objective Function:** Minimize total cost across all bids to meet the **System Load Forecast**.
* **Merit Order:** Bids are ranked from lowest to highest price.
* **Tie-Breaking Rule:** If two bids have the identical price, the allocation is done **pro rata** based on the available volume of the tied increments.
* **Technical Constraints:** The algorithm respects Ramp Rates (MW/min) and Mingen. A unit cannot be "skipped" if its Mingen is required for system stability, even if it is more expensive than a partially cleared unit.

### 2.2 The Constrained Schedule (Grid Reality)

This run incorporates **Transmission Constraints** (line limits, voltage stability).

* **Re-dispatch:** If the Unconstrained Schedule violates grid limits, the System Operator (SO) "dispatches down" some units and "dispatches up" others.
* **Compensation:** Units moved away from their commercial schedule due to grid constraints are eligible for **Constraint Payments** (Cost of Lost Opportunity).

---

## 3. Pricing Mechanisms

### 3.1 System Marginal Price (SMP)

* **Definition:** The price of the highest-priced **flexible** increment required to meet the load in the Unconstrained Schedule.
* **Inflexible Units:** A unit is "inflexible" (and cannot set the SMP) if:
  1. It is running at its technical minimum (Mingen).
  2. It is constrained by its Ramp Rate.
  3. It is a "Must-Run" unit for system security.

* **Price Cap:** The SMP cannot exceed the **Market Price Cap** (defined in Annexure 5).

### 3.2 Intra-Day Price (IDP)

* If the system conditions change after D-1, the Intra-Day market opens.
* **Calculation:** The IDP is the volume-weighted average of all accepted bids in the Intra-Day session, capped at **SMP ± 5%** to prevent extreme volatility.

---

## 4. Balancing & Imbalance Settlement

The most critical part for a simulation is how to penalize players who deviate from their schedule.

### 4.1 Imbalance Prices

Two prices are calculated ex-post for every 30-minute period:

1. **Balancing Price (Buying) - BPB:**
   * The cost for the market to "buy" energy to cover a shortfall.
   * Logic: Weighted average of the most expensive increments in the "Sold Stack" used to balance the system.
   * **Rule:** BPB ≥ SMP.

2. **Balancing Price (Selling) - BPS:**
   * The price paid to units that produced too much (the market "sells" it back).
   * Logic: Weighted average of the cheapest increments in the "Bought Stack".
   * **Rule:** BPS ≤ SMP.

### 4.2 Settlement Logic (Payment Flow)

* **Energy Delivered = Contracted:** Paid at **SMP**.
* **Over-delivery (Against Instruction):**
  * The surplus is paid at **BPS** (usually lower than SMP).
* **Under-delivery (Against Instruction):**
  * The shortfall must be "bought" by the participant at **BPB** (usually higher than SMP).
* **On-Instruction (Re-dispatch):**
  * If the SO told you to increase: Paid at **Dispatch-Up Price**.
  * If the SO told you to decrease: Paid at **Dispatch-Down Price**.

---

## 5. Summary Table for Simulation Parameters

| Variable | Rule / Formula |
| --- | --- |
| **Bid Sequence** | P₀, P₁, P₂, P₃ (at Mingen, EP1, EP2, MCR) |
| **Monotonicity** | Pᵢ ≤ Pᵢ₊₁ (for Producers) |
| **Clearing** | Lowest Cost Merit Order (Unconstrained) |
| **Tie-Break** | Pro-rata Volume Split |
| **SMP** | Marginal Flexible Bid |
| **Penalty** | Difference between SMP and BPB/BPS |
| **Gate Closure** | 10:00 AM (Simulation Tick Start) |
