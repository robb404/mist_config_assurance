import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

log = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()


def start():
    if not scheduler.running:
        scheduler.start()
        log.info("Scheduler started")


def stop():
    if scheduler.running:
        scheduler.shutdown(wait=False)


def upsert_org_job(org_id: str, interval_mins: int, drift_fn):
    """Add or replace drift job for an org. interval_mins=0 removes it."""
    job_id = f"drift_{org_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
    if interval_mins > 0:
        scheduler.add_job(
            drift_fn,
            trigger=IntervalTrigger(minutes=interval_mins),
            id=job_id,
            kwargs={"org_id": org_id},
            replace_existing=True,
            misfire_grace_time=60,
        )
        log.info("Scheduled drift for org=%s every %d mins", org_id, interval_mins)


def remove_org_job(org_id: str):
    job_id = f"drift_{org_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        log.info("Removed drift job for org=%s", org_id)
