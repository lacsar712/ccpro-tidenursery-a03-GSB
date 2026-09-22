from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class AcclimationStepCreate(BaseModel):
    pond_id: int = Field(..., alias="pondId")
    step_order: int = Field(..., ge=1, alias="stepOrder")
    target_salinity_ppt: float = Field(..., ge=0, alias="targetSalinityPpt")
    planned_at: datetime = Field(..., alias="plannedAt")

    model_config = ConfigDict(populate_by_name=True)


class AcclimationStepOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    pond_id: int = Field(serialization_alias="pondId")
    step_order: int = Field(serialization_alias="stepOrder")
    target_salinity_ppt: float = Field(serialization_alias="targetSalinityPpt")
    planned_at: datetime = Field(serialization_alias="plannedAt")
    completed_at: Optional[datetime] = Field(None, serialization_alias="completedAt")
