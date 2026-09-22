from datetime import datetime
from typing import Optional

from sqlalchemy import Integer, Float, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AcclimationStep(Base):
    __tablename__ = "acclimation_steps"
    __table_args__ = (
        UniqueConstraint("pond_id", "step_order", name="uq_pond_step_order"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    pond_id: Mapped[int] = mapped_column(ForeignKey("ponds.id"), nullable=False, index=True)
    step_order: Mapped[int] = mapped_column(Integer, nullable=False)
    target_salinity_ppt: Mapped[float] = mapped_column(Float, nullable=False)
    planned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    pond: Mapped["Pond"] = relationship("Pond", back_populates="acclimation_steps")
