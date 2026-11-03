"""Shared settings contract. No browser or local config required to validate it."""


def parse_admin_codes(payload):
    if not isinstance(payload, dict):
        raise ValueError("管理画面設定がオブジェクトではありません")
    # An explicitly empty current setting must not resurrect stale legacy codes.
    if "adCodes" in payload:
        codes = payload["adCodes"]
    elif "clarityTargetUrls" in payload:
        codes = payload["clarityTargetUrls"]
    else:
        code = payload.get("clarityTargetUrl")
        codes = [code] if code else []
    if not isinstance(codes, list) or any(not isinstance(code, str) for code in codes):
        raise ValueError("管理画面の広告コード設定が不正です")
    result = list(dict.fromkeys(code.strip() for code in codes if code.strip()))
    if not result:
        raise ValueError("管理画面の広告コードが空です。収集を中止します")
    return result


def list_storage_names(post, endpoint, headers, prefix, limit=1000):
    """Paginate fully; an outage must never look like missing exports."""
    names = set()
    offset = 0
    while True:
        response = post(endpoint, headers=headers,
                        json={"prefix": prefix, "limit": limit, "offset": offset,
                              "sortBy": {"column": "name", "order": "asc"}},
                        timeout=30)
        response.raise_for_status()
        items = response.json()
        if not isinstance(items, list):
            raise ValueError("Storageの一覧応答が不正です")
        names.update(item["name"] for item in items
                     if isinstance(item, dict) and isinstance(item.get("name"), str))
        if len(items) < limit:
            return names
        offset += limit
