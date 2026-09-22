from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.pond import Pond
from app.models.salinity_step import SalinityStep
from app.models.user import User
from app.models.water_sample import WaterSample
from app.schemas.salinity_step import (
    SalinityStepComplete,
    SalinityStepCreate,
    SalinityStepOut,
)

router = APIRouter(prefix="/api/salinity-steps", tags=["salinity-steps"])

# 完成阶梯时允许水质样与计划时刻的最大偏差
SAMPLE_WINDOW = timedelta(hours=2)
# 水质样盐度与目标盐度允许的最大绝对差（ppt）
SALINITY_TOLERANCE = 1.0


def _ensure_utc(dt: datetime) -> datetime:
    """无时区信息的时间按 UTC 处理，保证与 timestamptz 列可比较。"""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


@router.get("", response_model=List[SalinityStepOut])
def list_steps(
    pond_id: Optional[int] = Query(None, alias="pondId"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(SalinityStep)
    if pond_id is not None:
        q = q.filter(SalinityStep.pond_id == pond_id)
    return q.order_by(SalinityStep.pond_id, SalinityStep.step_no).all()


@router.post("", response_model=SalinityStepOut, status_code=status.HTTP_201_CREATED)
def create_step(
    payload: SalinityStepCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    pond = db.query(Pond).filter(Pond.id == payload.pond_id).first()
    if not pond:
        raise HTTPException(status_code=400, detail="塘口不存在")
    # 仅隔离状态塘口可建阶梯；在养与干塘一律 409
    if pond.status != "quarantine":
        raise HTTPException(
            status_code=409,
            detail="仅隔离状态(quarantine)塘口可创建盐度驯化阶梯，在养与干塘塘口禁止创建",
        )
    item = SalinityStep(
        pond_id=payload.pond_id,
        step_no=payload.step_no,
        target_salinity_ppt=payload.target_salinity_ppt,
        planned_at=_ensure_utc(payload.planned_at),
    )
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="同塘阶梯序号已存在")
    db.refresh(item)
    return item


@router.post("/{step_id}/complete", response_model=SalinityStepOut)
def complete_step(
    step_id: int,
    payload: Optional[SalinityStepComplete] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    step = db.query(SalinityStep).filter(SalinityStep.id == step_id).first()
    if not step:
        raise HTTPException(status_code=404, detail="盐度驯化阶梯不存在")
    if step.completed_at is not None:
        raise HTTPException(status_code=400, detail="该阶梯已完成，请勿重复完成")

    # 更低序号阶梯必须全部完成
    blocked = (
        db.query(SalinityStep)
        .filter(
            SalinityStep.pond_id == step.pond_id,
            SalinityStep.step_no < step.step_no,
            SalinityStep.completed_at.is_(None),
        )
        .order_by(SalinityStep.step_no)
        .first()
    )
    if blocked:
        raise HTTPException(
            status_code=409,
            detail=f"存在更低序号且未完成的阶梯，请先完成第 {blocked.step_no} 阶",
        )

    # 校验：计划时刻前后 2 小时内须有盐度达标（绝对差 <= 1）的水质样
    planned_at = _ensure_utc(step.planned_at)
    matched_sample = (
        db.query(WaterSample)
        .filter(
            WaterSample.pond_id == step.pond_id,
            WaterSample.sampled_at >= planned_at - SAMPLE_WINDOW,
            WaterSample.sampled_at <= planned_at + SAMPLE_WINDOW,
            func.abs(WaterSample.salinity_ppt - step.target_salinity_ppt)
            <= SALINITY_TOLERANCE,
        )
        .first()
    )
    if not matched_sample:
        raise HTTPException(
            status_code=400,
            detail=(
                f"计划时刻前后2小时内未找到盐度与目标盐度 {step.target_salinity_ppt} ppt "
                "相差不超过 1 的水质样，无法完成该阶梯；请先补登达标水质样"
            ),
        )

    completed_at = (
        _ensure_utc(payload.completed_at)
        if payload and payload.completed_at is not None
        else datetime.now(timezone.utc)
    )
    step.completed_at = completed_at
    db.commit()
    db.refresh(step)
    return step
