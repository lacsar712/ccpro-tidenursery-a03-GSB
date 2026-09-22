# TideNursery-01 · 潮汐育苗台账

海水育苗场「塘口水质采样与投喂事件」台账种子项目（非库存 / 电商 / 医院）。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 后端 | Python 3.11 · FastAPI · SQLAlchemy 2 · Pydantic v2 · python-jose · passlib(bcrypt) · uvicorn |
| 前端 | React 18 · Vite · TypeScript · React Router v6 |
| 数据库 | PostgreSQL 15 |
| 部署 | docker-compose · 前端 Nginx 反代 `/api` |

## 端口与账号

| 服务 | 端口 |
| --- | --- |
| 前端 | **3400** |
| 后端 API | **8400** |
| PostgreSQL | **5434** |

| 用户名 | 密码 | 角色 |
| --- | --- | --- |
| `admin` | `123456` | 场长 |
| `technician` | `123456` | 水质技术员 |

## 一键启动

```bash
cd TideNursery-01
docker compose up --build
```

启动后访问：

- 前端：http://localhost:3400
- 后端健康检查：http://localhost:8400/api/health
- API 文档：http://localhost:8400/docs

后端 entrypoint 流程：等待数据库就绪 → `create_all` 建表 → seed 初始数据 → 启动 uvicorn。

## 功能模块

1. **Auth**：JWT 登录（OAuth2 Password），`/api/auth/login`、`/api/auth/me`
2. **Hatchery 育苗场**：`name`、`seawaterSource`、`notes`
3. **Pond 育苗塘**：`hatcheryId`、`pondCode`、`species`、`volumeM3`、`status(stocked|dry|quarantine)`；同场 `pondCode` 唯一
4. **WaterSample 水质样**：`pondId`、`sampledAt`、`tempC`、`salinityPpt`、`doMgL`、`ph`、`notes`；`doMgL > 0` 且 `ph ∈ [6,9]`，否则返回 **400**
5. **FeedEvent 投喂**：`pondId`、`fedAt`、`feedType`、`amountKg`、`operatorName`
6. **SalinityStep 盐度驯化阶梯**（挂隔离塘口，逐步改盐并以水质样校验）：
   - 字段：`pondId` 所属塘口、`stepNo` 阶梯序号（从 1 起，同塘唯一）、`targetSalinityPpt` 目标盐度、`plannedAt` 计划时刻、`completedAt` 完成时刻（可空）
   - **建阶梯**：仅 `quarantine` 隔离状态塘口可建；在养 `stocked` 与干塘 `dry` 返回 **409**
   - **完成阶梯** `POST /api/salinity-steps/{id}/complete`：写入完成时刻；要求该塘在**计划时刻前后 2 小时内**存在一条水质样，且其 `salinityPpt` 与目标盐度**绝对差不超过 1**，否则返回 **400**（中文错误，提示先补登达标水质样）
   - **顺序约束**：存在未完成的更低序号阶梯时，禁止完成更高序号，返回 **409**
   - **放养** `POST /api/ponds/{id}/stock`：全部阶梯完成后可把塘口状态改为 `stocked`；无阶梯或仍有未完成阶梯返回 **409**
7. **Dashboard**：塘总数、quarantine 数、近 24h 采样数、近 7 日投喂总量 kg

> 驯化阶梯不是与水质样脱钩的空计划表：每完成一阶都必须由计划时刻 ±2h 内盐度达标（误差 ≤1 ppt）的水质样佐证。种子数据中 A-02 隔离塘预置两阶：第 1 阶（30 ppt）已完成，第 2 阶（25 ppt）待完成——在「水质样」页为 A-02 补登一条计划时刻附近、盐度约 25 ppt 的水样后即可完成第 2 阶并放养。

## 前端页面

Login · Dashboard · Hatcheries · Ponds · WaterSamples · FeedEvents · SalinityAcclimation（盐度驯化）

## 本地开发（可选）

```bash
# 数据库（或用 compose 只起 db）
docker compose up -d db

# 后端
cd backend
pip install -r requirements.txt
set DATABASE_URL=postgresql+psycopg2://tidenursery:tidenursery@localhost:5434/tidenursery
python -c "from app.database import Base, engine; from app import models; Base.metadata.create_all(bind=engine)"
python -c "from app.seed import seed; seed()"
uvicorn app.main:app --reload --port 8400

# 前端
cd frontend
npm install
npm run dev
```

## 目录结构

```
TideNursery-01/
├── docker-compose.yml
├── README.md
├── .gitignore
├── backend/
│   ├── Dockerfile
│   ├── entrypoint.sh
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── database.py
│       ├── auth.py
│       ├── seed.py
│       ├── models/
│       ├── schemas/
│       └── routers/
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── pages/
        ├── components/
        └── api/
```
