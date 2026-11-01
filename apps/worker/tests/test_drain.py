from datetime import datetime, timedelta, timezone

from worker.jobs import Worker


class QueueDb:
    """Jobs as (seconds from now until due); claim_jobs hands out the due ones."""

    def __init__(self, due_in: list[float]):
        self.due_in = due_in
        self.now = 0.0

    def rpc(self, fn, args):
        due = [d for d in self.due_in if d <= self.now]
        if not due:
            return []
        self.due_in.remove(due[0])
        return [{"id": "j", "kind": "noop", "attempts": 1}]

    def select(self, table, params):
        if not self.due_in:
            return []
        at = datetime.now(timezone.utc) + timedelta(seconds=min(self.due_in) - self.now)
        return [{"run_after": at.isoformat()}]


def worker(db: QueueDb) -> Worker:
    w = Worker.__new__(Worker)
    w.db = db
    w._run = lambda job: None
    return w


def test_drain_runs_due_jobs_and_stops_when_the_queue_is_empty():
    db = QueueDb([0, 0])
    assert worker(db).drain(sleep=lambda s: None) == 2


def test_drain_waits_for_a_retry_due_soon():
    db = QueueDb([0, 20])
    slept: list[float] = []

    def sleep(seconds):
        slept.append(seconds)
        db.now += seconds

    assert worker(db).drain(linger=300, poll=5, sleep=sleep) == 2
    assert sum(slept) == 20


def test_drain_leaves_a_far_off_retry_to_the_next_sweep():
    db = QueueDb([0, 3600])
    assert worker(db).drain(linger=300, sleep=lambda s: (_ for _ in ()).throw(AssertionError("slept"))) == 1
    assert db.due_in == [3600]
