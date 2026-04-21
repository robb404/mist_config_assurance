-- Add for_site to remediation_action so we know whether a WLAN lives at site or org level.
-- NULL means not yet determined (e.g. non-wlan scope standards).
ALTER TABLE remediation_action ADD COLUMN IF NOT EXISTS for_site boolean;
