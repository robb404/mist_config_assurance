from pydantic import BaseModel


class ConnectRequest(BaseModel):
    mist_token: str
    cloud_endpoint: str


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
