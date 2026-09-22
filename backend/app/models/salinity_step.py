from datetime import datetime
from typing import List, Optional

from sqlalchemy import String, Integer, Float, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SalinityStep(Base):
    __tablename__ = "salinity_steps"
    __table_args__ = (
        UniqueConstraint("pond_id", "step_no", name="uq_pond_salinity_step_no"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    pond_id: Mapped[int] = mapped_column(ForeignKey("ponds.id"), nullable=False, index=True)
    step_no: Mapped[int] = mapped_column(Integer, nullable=False)
    target_salinity_ppt: Mapped[float] = mapped_column(Float, nullable=False)
    planned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    pond: Mapped["Pond"] = relationship("Pond", back_populates="salinity_steps")
