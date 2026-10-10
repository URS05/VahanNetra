CONFUSABLE = {
    ("0", "O"),
    ("O", "0"),
    ("1", "I"),
    ("I", "1"),
    ("8", "B"),
    ("B", "8"),
    ("5", "S"),
    ("S", "5"),
    ("2", "Z"),
    ("Z", "2"),
}


def normalize_plate(text: str) -> str:
    return "".join(ch for ch in text.upper() if ch.isalnum())


def sub_cost(a: str, b: str) -> float:
    if a == b:
        return 0.0
    if (a, b) in CONFUSABLE:
        return 0.35
    return 1.0


def weighted_edit_distance(a: str, b: str) -> float:
    a = normalize_plate(a)
    b = normalize_plate(b)
    n, m = len(a), len(b)
    dp = [[0.0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        dp[i][0] = float(i)
    for j in range(1, m + 1):
        dp[0][j] = float(j)
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            dp[i][j] = min(
                dp[i - 1][j] + 1.0,
                dp[i][j - 1] + 1.0,
                dp[i - 1][j - 1] + sub_cost(a[i - 1], b[j - 1]),
            )
    return dp[n][m]


def match_type(query: str, plate: str, confident_max: float) -> str | None:
    q = normalize_plate(query)
    p = normalize_plate(plate)
    if q == p:
        return "exact"
    cost = weighted_edit_distance(q, p)
    if cost <= confident_max:
        return "possible"
    return None
