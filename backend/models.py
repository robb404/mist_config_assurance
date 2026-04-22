from typing import Literal

from pydantic import BaseModel, Field


class ConnectRequest(BaseModel):
    mist_token: str = Field(min_length=1, description="Mist API token — must be non-empty")
    cloud_endpoint: str = Field(min_length=1)
    mist_org_id: str | None = None  # optional — auto-detected from token if omitted


class OrgSettingsRequest(BaseModel):
    drift_interval_mins: int = 0
    auto_remediate: bool = False
    mode: Literal["polling", "webhook"] = "polling"


class StandardCreate(BaseModel):
    name: str = Field(min_length=1)
    description: str | None = None
    scope: Literal["wlan", "site", "org"]
    filter: list | None = None
    check_field: str = Field(min_length=1)
    check_condition: str = Field(min_length=1)
    check_value: object | None = None
    remediation_field: str = Field(min_length=1)
    remediation_value: object
    auto_remediate: bool | None = None
    enabled: bool = True


class StandardUpdate(StandardCreate):
    pass


class RunRequest(BaseModel):
    triggered_by: str = "manual"   # manual | scheduled


class AIConfigSave(BaseModel):
    provider: str           # anthropic | openai | ollama
    api_key: str | None = None  # new key — omit to keep existing
    model: str
    base_url: str | None = None  # ollama only


class ParseFilterRequest(BaseModel):
    text: str


class DigestSettingsRequest(BaseModel):
    frequency: Literal["daily", "weekly"] | None = None
    extra_recipients: list[str] = []
