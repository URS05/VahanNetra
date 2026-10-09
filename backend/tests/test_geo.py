from datetime import datetime, timedelta

from geo import haversine_km, speed_kmh
from routing import _simulate_coords


def test_haversine_hyderabad_cameras_not_zero():
    km = haversine_km(17.4435, 78.3772, 17.4172, 78.3426)
    assert 2 < km < 12


def test_impossible_travel():
    t0 = datetime(2026, 10, 9, 12, 0, 0)
    t1 = t0 + timedelta(seconds=30)
    km = haversine_km(17.4435, 78.3772, 17.4172, 78.3426)
    spd = speed_kmh(km, t0, t1)
    assert spd is not None and spd > 120


def test_simulate_route_has_curve():
    coords = _simulate_coords(17.44, 78.37, 17.42, 78.34)
    assert len(coords) == 9
    assert coords[0][1] == 17.44
    mids = [c[0] for c in coords[1:-1]]
    straight = [78.37 + (78.34 - 78.37) * (i / 8) for i in range(1, 8)]
    assert mids != [round(x, 6) for x in straight]
