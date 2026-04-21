import logging
from typing import Literal

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
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


def upsert_org_job(org_id: str, interval_mins: int, drift_fn, mode: Literal["polling", "webhook"] = "polling"):
    """
    Register or update the drift job for an org.

    polling mode: fires drift_fn every interval_mins minutes (0 = remove).
    webhook mode: removes polling job, schedules a daily safety-net scan at 02:00 UTC.

    In both cases the previous job of the other type is removed to avoid duplicates.
    """
    polling_job_id = f"drift_{org_id}"
    daily_job_id   = f"daily_scan_{org_id}"

    # Remove both existing jobs before re-adding the correct one
    for jid in (polling_job_id, daily_job_id):
        if scheduler.get_job(jid):
            scheduler.remove_job(jid)

    if mode == "webhook":
        scheduler.add_job(
            drift_fn,
            trigger=CronTrigger(hour=2, minute=0),
            id=daily_job_id,
            kwargs={"org_id": org_id},
            replace_existing=True,
            misfire_grace_time=600,
            max_instances=1,
        )
        log.info("Webhook mode: daily scan registered for org=%s at 02:00 UTC", org_id)

    elif interval_mins > 0:
        # Grace scales with interval — at long intervals, a dropped cycle is costly.
        grace = max(60, interval_mins * 6)
        scheduler.add_job(
            drift_fn,
            trigger=IntervalTrigger(minutes=interval_mins),
            id=polling_job_id,
            kwargs={"org_id": org_id},
            replace_existing=True,
            misfire_grace_time=grace,
            max_instances=1,
        )
        log.info("Polling mode: drift scheduled for org=%s every %d mins", org_id, interval_mins)

    else:
        log.info("Drift disabled for org=%s", org_id)


def remove_org_job(org_id: str):
    for jid in (f"drift_{org_id}", f"daily_scan_{org_id}"):
        if scheduler.get_job(jid):
            scheduler.remove_job(jid)
            log.info("Removed job %s", jid)
