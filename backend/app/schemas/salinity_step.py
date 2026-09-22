from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class SalinityStepCreate(BaseModel):
    pond_id: int = Field(..., alias="pondId")
    step_no: int = Field(..., ge=1, alias="stepNo")
    target_salinity_ppt: float = Field(..., ge=0, alias="targetSalinityPpt")
    planned_at: datetime = Field(..., alias="plannedAt")

    model_config = ConfigDict(populate_by_name=True)


class SalinityStepComplete(BaseModel):
    # 允许显式传入完成时刻，缺省由服务端取当前 UTC 时间
    completed_at: Optional[datetime] = Field(None, alias="completedAt")

    model_config = ConfigDict(populate_by_name=True)


class SalinityStepOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    pond_id: int = Field(serialization_alias="pondId")
    step_no: int = Field(serialization_alias="stepNo")
    target_salinity_ppt: float = Field(serialization_alias="targetSalinityPpt")
    planned_at: datetime = Field(serialization_alias="plannedAt")
    completed_at: Optional[datetime] = Field(None, serialization_alias="completedAt")
