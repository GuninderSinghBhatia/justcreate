from worker.db import IN_CHUNK, PAGE, Supabase, SupabaseError, _storage, in_list, owned_path

UID = "0f8fad5b-d9cb-469f-a165-70867728950e"
OTHER = "7c9e6679-7425-40de-944b-e07fc1f90ae7"


def test_owned_path_accepts_only_the_users_own_plain_files():
    assert owned_path(f"{UID}/abc.png", UID) == f"{UID}/abc.png"
    assert owned_path(f"{OTHER}/abc.png", UID) is None
    assert owned_path(f"{UID}/../{OTHER}/abc.png", UID) is None
    assert owned_path("../../rest/v1/jobs?select=*", UID) is None
    assert owned_path(None, UID) is None


def test_storage_paths_are_validated_before_they_reach_a_url():
    assert _storage(f"{UID}/thumb-1.webp") == f"{UID}/thumb-1.webp"
    for bad in ["../../rest/v1/jobs", f"{UID}/a?x=1", f"{UID}/a/../b"]:
        try:
            _storage(bad)
        except SupabaseError:
            continue
        raise AssertionError(bad)


class FakeDb(Supabase):
    def __init__(self, rows: int):
        self.calls: list[dict] = []
        self.rows = rows

    def _get(self, table, params):
        self.calls.append(params)
        offset = int(params.get("offset", 0))
        return [{"n": i} for i in range(offset, min(self.rows, offset + int(params.get("limit", self.rows))))]


def test_long_in_lists_are_split_across_requests():
    db = FakeDb(rows=1)
    ids = [f"id{i}" for i in range(IN_CHUNK * 2 + 5)]
    db.select("embeddings", {"reference_id": in_list(ids), "select": "reference_id"})
    sent = [c["reference_id"] for c in db.calls]
    assert len(sent) == 3 and all(len(s[4:-1].split(",")) <= IN_CHUNK for s in sent)


def test_results_past_one_page_are_fetched_page_by_page():
    db = FakeDb(rows=PAGE + 10)
    assert len(db.select("board_items", {"board_id": "eq.x", "select": "reference_id"})) == PAGE + 10
    assert len(db.calls) == 2
