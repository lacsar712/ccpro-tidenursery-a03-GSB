from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.acclimation_step import AcclimationStep
from app.models.pond import Pond
from app.models.user import User
from app.models.water_sample import WaterSample
from app.schemas.acclimation_step import AcclimationStepCreate, AcclimationStepOut

router = APIRouter(prefix="/api/acclimation-steps", tags=["acclimation-steps"])

# 完成阶梯时，水质样采样时刻相对计划时刻允许的最大偏差
SAMPLE_WINDOW = timedelta(hours=2)
# 完成阶梯时，水质样盐度与目标盐度允许的最大绝对差（ppt）
SALINITY_TOLERANCE = 1.0


def _as_aware(dt: datetime) -> datetime:
    """无时区信息的时间按 UTC 处理，避免与带时区列比较报错。"""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


@router.get("", response_model=List[AcclimationStepOut])
def list_steps(
    pond_id: Optional[int] = Query(None, alias="pondId"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(AcclimationStep)
    if pond_id is not None:
        q = q.filter(AcclimationStep.pond_id == pond_id)
    return q.order_by(AcclimationStep.pond_id, AcclimationStep.step_order).all()


@router.post("", response_model=AcclimationStepOut, status_code=status.HTTP_201_CREATED)
def create_step(
    payload: AcclimationStepCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    pond = db.query(Pond).filter(Pond.id == payload.pond_id).first()
    if not pond:
        raise HTTPException(status_code=404, detail="塘口不存在")
    if pond.status != "quarantine":
        raise HTTPException(
            status_code=409, detail="仅隔离(quarantine)状态的塘口可创建盐度驯化阶梯"
        )

    exists = (
        db.query(AcclimationStep.id)
        .filter(
            AcclimationStep.pond_id == payload.pond_id,
            AcclimationStep.step_order == payload.step_order,
        )
        .first()
    )
    if exists:
        raise HTTPException(status_code=400, detail="同塘阶梯序号已存在")

    item = AcclimationStep(
        pond_id=payload.pond_id,
        step_order=payload.step_order,
        target_salinity_ppt=payload.target_salinity_ppt,
        planned_at=payload.planned_at,
    )
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="同塘阶梯序号已存在")
    db.refresh(item)
    return item


@router.post("/{step_id}/complete", response_model=AcclimationStepOut)
def complete_step(
    step_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    step = db.query(AcclimationStep).filter(AcclimationStep.id == step_id).first()
    if not step:
        raise HTTPException(status_code=404, detail="驯化阶梯不存在")
    if step.completed_at is not None:
        raise HTTPException(status_code=400, detail="该阶梯已完成")

    # 必须按序号从低到高依次完成
    blocked = (
        db.query(AcclimationStep.id)
        .filter(
            AcclimationStep.pond_id == step.pond_id,
            AcclimationStep.step_order < step.step_order,
            AcclimationStep.completed_at.is_(None),
        )
        .first()
    )
    if blocked:
        raise HTTPException(
            status_code=409, detail="存在序号更低且未完成的阶梯，请先完成更低序号阶梯"
        )

    # 计划时刻前后 2 小时内必须有盐度达标的水质样，阶梯不允许脱离水质样空转
    planned_at = _as_aware(step.planned_at)
    lower = planned_at - SAMPLE_WINDOW
    upper = planned_at + SAMPLE_WINDOW
    samples = (
        db.query(WaterSample)
        .filter(
            WaterSample.pond_id == step.pond_id,
            WaterSample.sampled_at >= lower,
            WaterSample.sampled_at <= upper,
        )
        .all()
    )
    valid = [
        s for s in samples if abs(s.salinity_ppt - step.target_salinity_ppt) <= SALINITY_TOLERANCE
    ]
    if not valid:
        raise HTTPException(
            status_code=400,
            detail=(
                f"计划时刻前后 2 小时内未找到盐度与目标盐度 "
                f"{step.target_salinity_ppt:g} ppt 相差不超过 1 的水质样，无法完成该阶梯"
            ),
        )

    step.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(step)
    return step
