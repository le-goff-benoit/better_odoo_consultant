from backend.api.routes.queries import SearchRequest, _fetch_records_paginated


class FakeQueryOdoo:
    def __init__(self, total):
        self.total = total
        self.calls = []

    def search_count(self, model, domain=None):
        return self.total

    def search_read(self, model, domain=None, fields=None, limit=80, offset=0, order=""):
        self.calls.append({"limit": limit, "offset": offset})
        end = min(offset + limit, self.total)
        return [{"id": idx} for idx in range(offset, end)]


async def test_fetch_records_paginated_reads_all_records_in_1000_batches():
    fake = FakeQueryOdoo(total=2500)
    req = SearchRequest(profile_id=1, model="res.partner", domain=[])

    records, meta = await _fetch_records_paginated(fake, req)

    assert meta["total_count"] == 2500
    assert len(records) == 2500
    assert meta["pages_fetched"] == 5
    assert not meta["truncated"]
    assert fake.calls == [
        {"limit": 500, "offset": 0},
        {"limit": 500, "offset": 500},
        {"limit": 500, "offset": 1000},
        {"limit": 500, "offset": 1500},
        {"limit": 500, "offset": 2000},
    ]
