"""Format check and vote rules. No images, no network."""

from run_images import format_valid, heading_to_direction, normalize_plate, vote


def test_normalize():
    assert normalize_plate("ap 10 ar 0658") == "AP10AR0658"
    assert normalize_plate("ts09eg6531") == "TS09EG6531"


def test_format():
    assert format_valid("TS09EG6531")
    assert format_valid("AP10AR0658")
    assert format_valid("HR38V6965")
    assert not format_valid("CAR")
    assert not format_valid("AP21AX36")


def test_vote_prefers_valid_and_does_not_invent():
    plate, conf, valid = vote(
        [
            {"text": "CAR", "conf": 0.99, "area": 100},
            {"text": "TS09EG6531", "conf": 0.62, "area": 8000},
        ]
    )
    assert plate == "TS09EG6531"
    assert valid is True
    assert conf == 0.62
    empty, low, ok = vote([{"text": "", "conf": 0.0, "area": 1}])
    assert empty == ""
    assert ok is False
    assert low == 0.05


def test_heading():
    assert heading_to_direction(135) == "SE"
    assert heading_to_direction(180) == "S"
    assert heading_to_direction(270) == "W"
    assert heading_to_direction(225) == "SW"


def test_vote_prefers_plate_over_word():
    # A confident sign word must lose to a lower-confidence plate-like read.
    plate, conf, valid = vote(
        [
            {"text": "ENTRY", "conf": 0.99, "area": 5000},
            {"text": "HR3870965", "conf": 0.87, "area": 5000},
        ]
    )
    assert plate == "HR3870965"
    assert valid is False
    assert conf == 0.87


def test_vote_prefers_full_valid_plate_on_tie():
    plate, _conf, valid = vote(
        [
            {"text": "SO9EG653", "conf": 0.9926, "area": 1000},
            {"text": "TS09EG6531", "conf": 0.9887, "area": 1000},
        ]
    )
    assert plate == "TS09EG6531"
    assert valid is True


if __name__ == "__main__":
    test_normalize()
    test_format()
    test_vote_prefers_valid_and_does_not_invent()
    test_heading()
    test_vote_prefers_plate_over_word()
    test_vote_prefers_full_valid_plate_on_tie()
    print("ok")
