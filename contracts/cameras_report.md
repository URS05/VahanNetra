# Camera coordinate evidence

Source: OpenStreetMap Nominatim plus OSRM driving nearest and route. Access date 2026-10-09.

All cameras sit on drivable roads. Snap distance is distance from the OSM seed to the OSRM snapped point. Camera lat/lon in cameras.json is the snapped road point.

| camera_id | name | OSM seed | snap_m | snapped lat | snapped lon | road |
|---|---|---|---|---|---|---|
| CAM01 | Hitech City Junction | Cyber Towers Bus Stop 17.4507134, 78.3821189 | 15.03 | 17.450638 | 78.382001 | Cyber Towers - Madhapur Main Road |
| CAM02 | Madhapur | Madhapur suburb node 17.4408924, 78.3916304 | 7.65 | 17.44096 | 78.391643 | Cyber Towers - Madhapur Main Road |
| CAM03 | Kondapur | Kondapur suburb node 17.4587912, 78.3730556 | 0.85 | 17.458785 | 78.373051 | nearest drive |
| CAM04 | Gachibowli Junction | Gachibowli suburb 17.4436222, 78.3519638 was 34 m off; camera placed on the snapped road point | 0.00 | 17.443465 | 78.35224 | nearest drive |
| CAM05 | Financial District | Nanakramguda 17.4217796, 78.3379784 | 3.21 | 17.421804 | 78.337995 | Road No 2 |

Consecutive driving legs (OSRM, plausible 1 to 10 km):

| from | to | km | min |
|---|---|---|---|
| CAM01 | CAM02 | 2.85 | 3.6 |
| CAM02 | CAM03 | 4.42 | 6.1 |
| CAM03 | CAM04 | 5.75 | 8.7 |
| CAM04 | CAM05 | 3.24 | 5.4 |

Order is one corridor from HITEC City / Madhapur toward Gachibowli and Financial District. Headings are estimated from consecutive bearing. Lanes are estimated.

All-pairs geometries: contracts/osrm_cache.json
