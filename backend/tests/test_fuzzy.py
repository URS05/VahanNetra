from fuzzy import match_type, weighted_edit_distance


def test_exact():
    assert match_type("TS09AB1234", "TS09AB1234", 1.2) == "exact"


def test_confusable_possible():
    assert match_type("TS09AB1234", "TS09ABI234", 1.2) == "possible"


def test_confusable_cost_lower_than_random():
    cheap = weighted_edit_distance("TS09AB1234", "TS09ABI234")
    costly = weighted_edit_distance("TS09AB1234", "TS09AB9234")
    assert cheap < costly
