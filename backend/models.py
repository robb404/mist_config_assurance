from pydantic import BaseModel


class ConnectRequest(BaseModel):
    mist_token: str
    cloud_endpoint: str
    mist_org_id: str | None = None  # optional — auto-detected from token if omitted


class OrgSettingsRequest(BaseModel):
    drift_interval_mins: int = 0
    auto_remediate: bool = False


class StandardCreate(BaseModel):
    name: str
    description: str | None = None
    scope: str                   # wlan | site
    filter: list | None = None
    check_field: str
    check_condition: str
    check_value: object | None = None
    remediation_field: str
    remediation_value: object
    auto_remediate: bool | None = None
    enabled: bool = True


class StandardUpdate(StandardCreate):
    pass


class RunRequest(BaseModel):
    triggered_by: str = "manual"   # manual | scheduled


class AIConfigSave(BaseModel):
    provider: str           # anthropic | openai | ollama
    openai_auth_method: str | None = None  # key | oauth (openai only)
    api_key: str | None = None  # new key — omit to keep existing
    model: str
    base_url: str | None = None  # ollama only


class OAuthTokensRequest(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int         # seconds until expiry


class ParseFilterRequest(BaseModel):
    text: str
