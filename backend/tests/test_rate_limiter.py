import math
import pytest
from backend.rate_limiter import (
    min_interval_mins, can_check, budget_summary,
    CHECK_BUDGET, CALLS_PER_SITE, LARGE_ORG_THRESHOLD,
)


def test_min_interval_100_sites():
    # 100 * 3 / 4000 * 60 = 4.5 -> ceil = 5
    assert min_interval_mins(100) == 5


def test_min_interval_1000_sites():
    # 1000 * 3 / 4000 * 60 = 45.0 -> 45
    assert min_interval_mins(1000) == 45


def test_min_interval_1500_sites():
    # 1500 * 3 / 4000 * 60 = 67.5 -> ceil = 68
    assert min_interval_mins(1500) == 68


def test_min_interval_zero_sites():
    assert min_interval_mins(0) == 1


def test_can_check_under_budget():
    # 3997 + 3 = 4000 <= 4000 — exactly at limit, allowed
    assert can_check(3997) is True


def test_can_check_over_budget():
    # 3998 + 3 = 4001 > 4000 — blocked
    assert can_check(3998) is False


def test_can_check_zero():
    assert can_check(0) is True


def test_budget_summary_safe():
    result = budget_summary(100, 15)
    # 100 sites * 3 calls * (60/15 cycles) = 1200 calls/hr
    assert result["calls_per_hour"] == 1200
    assert result["interval_safe"] is True
    assert result["recommend_webhooks"] is False


def test_budget_summary_unsafe():
    result = budget_summary(1000, 5)
    # 1000 * 3 * 12 = 36000 > 4000
    assert result["interval_safe"] is False


def test_budget_summary_recommends_webhooks():
    result = budget_summary(1500, 70)
    assert result["recommend_webhooks"] is True


def test_budget_summary_disabled_interval():
    result = budget_summary(500, 0)
    assert result["calls_per_hour"] == 0
    assert result["interval_safe"] is True


def test_budget_summary_min_interval():
    result = budget_summary(200, 10)
    # min = ceil(200*3/4000*60) = ceil(9) = 9
    assert result["min_interval_mins"] == 9
