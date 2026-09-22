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
6. **Dashboard**：塘总数、quarantine 数、近 24h 采样数、近 7 日投喂总量 kg
7. **AcclimationStep 盐度驯化阶梯**：隔离塘专用，见下方规则

### 盐度驯化阶梯规则

- 字段：`pondId` 所属塘口、`stepOrder` 阶梯序号（从 1 起）、`targetSalinityPpt` 目标盐度、`plannedAt` 计划时刻、`completedAt` 完成时刻（可空）；同一塘口内 `stepOrder` 唯一（数据库唯一约束 `uq_pond_step_order`）。
- **建阶梯限定隔离塘**：仅 `status=quarantine` 的塘口可创建；`stocked`（在养）或 `dry`（干塘）返回 **409**。
- **按序完成**：存在序号更低且 `completedAt` 为空的阶梯时，禁止完成更高序号阶梯，返回 **409**。
- **完成必须由水质样背书**：完成某阶时，要求该塘在 `plannedAt` 前后 **2 小时**内存在一条水质样，且其 `salinityPpt` 与目标盐度绝对差 **≤ 1**，否则返回 **400**（中文错误）。校验通过才写入 `completedAt`——阶梯不允许与水质样脱钩空转。
- **放养**：全部阶梯完成后，调用 `POST /api/ponds/{id}/stock` 放养，塘口状态改为 `stocked`；仍有未完成阶梯（或没有阶梯）时返回 **409**。

接口一览：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/acclimation-steps?pondId=` | 阶梯列表（可按塘过滤，按序号升序） |
| POST | `/api/acclimation-steps` | 建阶梯（仅隔离塘，序号同塘唯一） |
| POST | `/api/acclimation-steps/{id}/complete` | 完成阶梯（顺序 + ±2h 水质样盐度校验） |
| POST | `/api/ponds/{id}/stock` | 全部完成后放养，塘口转 stocked |

## 前端页面

Login · Dashboard · Hatcheries · Ponds · WaterSamples · FeedEvents · Acclimation（侧栏「盐度驯化」）

种子数据中隔离塘 A-02 带有两条阶梯：第 1 阶（30 ppt）已由计划时刻附近盐度 30 的水质样确认完成，第 2 阶（25 ppt）`completedAt` 为空，待登记达标水质样后完成、再放养。

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
