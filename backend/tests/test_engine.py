from app.engine import clear_market


def test_clear_market_basic():
    # supply increases with price
    supply = [(900, 10), (950, 10), (1000, 10)]
    # demand decreases with price
    demand = [(1100, 10), (1050, 10), (1000, 10)]
    price, vol = clear_market(supply, demand)
    assert -500 <= price <= 5000
    assert vol >= 0