# The Stationery — 后端部署备忘（Cloud Run + Secret Manager + Cloud Scheduler）

面向 `Backend/`（FastAPI）。前端另行部署到 Firebase Hosting。
下面命令用占位符，先设一次环境变量，其余可直接复制。

> **想给某个 GitHub 分支（如 `testing`）新建一个服务？** 直接看 **§A「GitHub 持续部署新建服务一键清单」**——它把创建服务、挂环境变量、初始化库、建三个 Scheduler job 串成一条可照抄的流程，并内联了本文档里所有踩过的坑。§1–§7 是各步骤的详细参考。

```bash
export PROJECT_ID="your-gcp-project"
export REGION="us-central1"
export SERVICE="stationery-api"
export REPO="stationery"                 # Artifact Registry 仓库名
gcloud config set project "$PROJECT_ID"
```

一次性启用所需 API：

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  cloudscheduler.googleapis.com
```

---

## A. GitHub 持续部署新建服务（如 `testing` 分支）—— 一键清单

场景：在 Cloud Run 新建一个服务，追踪 GitHub 某分支（如 `testing`），push 即自动构建部署。按顺序走完，服务会 healthy 且三个 job 就绪。全程约 5 步。

先设这次部署的参数（**每个服务/分支一套**）并在同一个 shell 里保持到结束：

```bash
export PROJECT_ID="stationary-503105"
export REGION="us-west2"                    # 必须 = 你在控制台创建服务时选的区域
export SERVICE="thestationery-testing"      # 新服务名（同区多服务时，用它给 job 名加前缀避免冲突）
gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com cloudscheduler.googleapis.com
# 生成一个内部任务 token；下面服务 env 和 Scheduler header 要用同一个值
export JOB_TOKEN="$(openssl rand -hex 32)"; echo "JOB_TOKEN=$JOB_TOKEN"
```

**1) 控制台创建服务（从源码持续部署）**
- Cloud Run → 部署容器 → 从源代码持续部署 → 选仓库 `JerryGgzm/TheStationery`、分支 `testing`。
- 构建配置：类型 **Dockerfile**，**构建目录 / Build context directory = `/Backend`**（关键！否则报 `lstat /workspace/Dockerfile: no such file`）。
- 勾选「允许未经身份验证的调用」（浏览器要直接调 `/api/v1/*`，JWT 在应用层校验）。
- 首次构建大概率「镜像构建成功但服务起不来 / 停在占位页」——因为还没挂环境变量，下一步补。

**2) 一次性挂环境变量（服务级，之后每次自动部署都继承）**
把 `<...>` 换成 testing 用的 Supabase 项目值。⚠️ `DATABASE_URL` **必须用连接池串**（见下方红字）：

```bash
gcloud run services update "$SERVICE" --region "$REGION" \
  --update-env-vars ^@@^ENV=production@@API_PREFIX=/api/v1@@CORS_ORIGINS=https://你的testing前端域名@@SUPABASE_URL=https://<testing-ref>.supabase.co@@OPENROUTER_MODEL=openai/gpt-4o-mini@@OPENROUTER_BASE_URL=https://openrouter.ai/api/v1@@OPENROUTER_API_KEY=sk-or-v1-...@@INTERNAL_JOB_TOKEN=$JOB_TOKEN@@DATABASE_URL=postgresql://postgres.<testing-ref>:<密码%40转义>@aws-0-<pooler区域>.pooler.supabase.com:6543/postgres
```

（`^@@^` 是自定义分隔符，避免 DATABASE_URL 里的 `@`/`,` 干扰解析；密码里的 `@` 写成 `%40`。）

> ⚠️ **DATABASE_URL 必须是 Supavisor 连接池串，不能用直连。** 直连 `db.<ref>.supabase.co:5432` 现在只有 IPv6，而 Cloud Run 默认只有 IPv4 出口 → 连不上 → 容器启动崩溃（IPv4 直连是 Supabase 付费项，不必买）。免费的连接池自带 IPv4：主机 `aws-0-<region>.pooler.supabase.com`、端口 `6543`（事务模式）、用户名 `postgres.<ref>`。串从 Supabase → **Settings → Database → Connection string → Transaction** 复制。
>
> `ENV` 要**恰好等于 `production`**（不是 `prod`），否则 `validate_production()` 的启动自检不生效。

改完会触发新修订版。验证：
```bash
SERVICE_URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
curl -s "$SERVICE_URL/health"   # 期望 {"status":"healthy",...,"database":"ok"}
```
若 502/占位页或 `degraded`：`gcloud run services logs read "$SERVICE" --region "$REGION" --limit 50` 看是不是 `DATABASE_URL is not configured` 或 asyncpg 连不上（多半 DATABASE_URL 没用连接池）。

**3) 初始化 testing 数据库**
把整份 `Backend/db/schema.sql` 贴进该 Supabase 项目 SQL Editor 跑一次（建表 + 结尾 Seed 段种入两个 AI 角色）。详见 §6。

**4) 建三个 Scheduler job（指向新服务、同区、名字带 `$SERVICE` 前缀避免与其它服务冲突）**

```bash
for spec in "deliver-messages:*/5 * * * *:120" "process-ai-replies:*/5 * * * *:300" "assign-ai-penpals:*/15 * * * *:120"; do
  name="${spec%%:*}"; rest="${spec#*:}"; cron="${rest%:*}"; deadline="${rest##*:}"
  gcloud scheduler jobs create http "${SERVICE}-${name}" \
    --location "$REGION" --schedule "$cron" \
    --uri "${SERVICE_URL}/internal/jobs/${name}" \
    --http-method POST --headers "X-Internal-Token=${JOB_TOKEN}" \
    --attempt-deadline "${deadline}s"
done
```

**5) 验证**
```bash
for name in deliver-messages assign-ai-penpals process-ai-replies; do
  echo "== $name =="; curl -s -X POST "${SERVICE_URL}/internal/jobs/${name}" -H "X-Internal-Token: ${JOB_TOKEN}"; echo
done
```
预期分别返回 `{"delivered":..}` / `{"candidates":..,"assigned":..,"skipped_no_character":..}` / `{"claimed":..,"completed":..,..}`。`skipped_no_character>0` 说明第 3 步 seed 没跑成功。

> **测试期可临时把宽限期设 0** 让 AI 立刻介入无人回的公开信：`gcloud run services update "$SERVICE" --region "$REGION" --update-env-vars AI_UNANSWERED_GRACE_HOURS=0`；测完记得改回 `24`。各变量含义见 §4。
>
> 更强的安全性（把密钥从明文 env 移进 Secret Manager）见 §1；把 `--update-env-vars` 里的 `DATABASE_URL/OPENROUTER_API_KEY/INTERNAL_JOB_TOKEN` 改为 `--set-secrets` 即可。

---

## 1. Secret Manager：存放敏感变量

不要把密钥写进镜像或明文环境变量。三个敏感值进 Secret Manager，其余非敏感值用普通环境变量。

```bash
# 数据库连接串（Supavisor pooler，端口 6543，事务模式，用户名 postgres.<ref>）
# ⚠️ 必须用连接池，不要用直连 db.<ref>.supabase.co:5432（仅 IPv6，Cloud Run 连不上）。
printf 'postgresql://postgres.<ref>:<db-password>@aws-0-<region>.pooler.supabase.com:6543/postgres' \
  | gcloud secrets create DATABASE_URL --data-file=-

# OpenRouter API Key
printf 'sk-or-v1-...' | gcloud secrets create OPENROUTER_API_KEY --data-file=-

# 内部任务共享密钥（Scheduler → 受保护端点的 X-Internal-Token）
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create INTERNAL_JOB_TOKEN --data-file=-
```

> 更新某个 secret 的值：`printf '<new>' | gcloud secrets versions add DATABASE_URL --data-file=-`

给运行时服务账号读取权限（默认用 Compute 默认 SA；生产建议单独建 SA）：

```bash
export RUNTIME_SA="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')-compute@developer.gserviceaccount.com"

for S in DATABASE_URL OPENROUTER_API_KEY INTERNAL_JOB_TOKEN; do
  gcloud secrets add-iam-policy-binding "$S" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor"
done
```

---

## 2. 构建镜像并部署到 Cloud Run

```bash
# Artifact Registry 仓库（首次）
gcloud artifacts repositories create "$REPO" \
  --repository-format=docker --location="$REGION" || true

export IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:$(git rev-parse --short HEAD)"

# 从 Backend/ 目录构建（含 Dockerfile）
gcloud builds submit Backend --tag "$IMAGE"

# 部署：敏感值走 --set-secrets，非敏感值走 --set-env-vars
gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --cpu 1 --memory 512Mi \
  --min-instances 0 --max-instances 10 \
  --concurrency 40 \
  --service-account "$RUNTIME_SA" \
  --set-env-vars "ENV=production,API_PREFIX=/api/v1,SUPABASE_URL=https://<ref>.supabase.co,OPENROUTER_MODEL=openai/gpt-4o-mini,OPENROUTER_BASE_URL=https://openrouter.ai/api/v1,CORS_ORIGINS=https://your-frontend-domain" \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,OPENROUTER_API_KEY=OPENROUTER_API_KEY:latest,INTERNAL_JOB_TOKEN=INTERNAL_JOB_TOKEN:latest"

export SERVICE_URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
echo "$SERVICE_URL"
```

冒烟：

```bash
curl -s "$SERVICE_URL/health"        # {"status":"ok",...}
```

> `--allow-unauthenticated` 是因为浏览器要直接调 `/api/v1/*`（JWT 在应用层校验）。
> `/internal/jobs/*` 不靠 Cloud Run IAM 隔离，而是靠 `X-Internal-Token`（见下）。若想更严，可给内部任务单独部署一个 `--no-allow-unauthenticated` 的服务并用 OIDC。

---

## 3. Cloud Scheduler：触发内部后台任务

三个内部端点（挂在根路径，非 `/api/v1`）：

| 端点 | 作用 | 建议频率 |
|---|---|---|
| `POST /internal/jobs/deliver-messages` | 到点 `scheduled` 消息 → `delivered` | 每 5 分钟 |
| `POST /internal/jobs/process-ai-replies` | 抽取到期 `ai_response_jobs` → 生成 AI 回复 | 每 5 分钟 |
| `POST /internal/jobs/assign-ai-penpals` | 「公开信无人回 → 派 AI」：扫描超过宽限期仍无人回的公开信，入队 AI 回复 job | 每 15 分钟 / 每小时 |

> **前置**：`assign-ai-penpals` 需要至少一个 active AI 角色 + active prompt。首次部署后在数据库跑一次 seed：`PYTHONPATH=. python scripts/seed_ai_characters.py`（或把等价 SQL 贴进 Supabase）。宽限期/回信延迟由 `AI_UNANSWERED_GRACE_HOURS` / `AI_REPLY_MIN_DELAY_MINUTES` / `AI_REPLY_MAX_DELAY_MINUTES` 控制（见 §4）。

> **Scheduler job 必须和服务同区**（`--location` 用你服务所在的 `$REGION`）。若用 GitHub 持续部署，你不会执行 §2 的 `gcloud run deploy`，所以要先把 `SERVICE_URL` 查出来（下面第一行）。

调用方需带 `X-Internal-Token: <INTERNAL_JOB_TOKEN>`。先取服务 URL 和 token（token 从 Secret Manager 读，与服务运行时用的是同一个值）：

```bash
# 若 SERVICE_URL 尚未导出（如走 GitHub CD），先查出来：
export SERVICE_URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
export JOB_TOKEN="$(gcloud secrets versions access latest --secret=INTERNAL_JOB_TOKEN)"

# 消息投递
gcloud scheduler jobs create http deliver-messages \
  --location "$REGION" \
  --schedule "*/5 * * * *" \
  --uri "${SERVICE_URL}/internal/jobs/deliver-messages" \
  --http-method POST \
  --headers "X-Internal-Token=${JOB_TOKEN}" \
  --attempt-deadline 120s

# AI 回复（消费队列）
gcloud scheduler jobs create http process-ai-replies \
  --location "$REGION" \
  --schedule "*/5 * * * *" \
  --uri "${SERVICE_URL}/internal/jobs/process-ai-replies" \
  --http-method POST \
  --headers "X-Internal-Token=${JOB_TOKEN}" \
  --attempt-deadline 300s

# 派 AI 笔友（生产者：给无人回的公开信入队）
gcloud scheduler jobs create http assign-ai-penpals \
  --location "$REGION" \
  --schedule "*/15 * * * *" \
  --uri "${SERVICE_URL}/internal/jobs/assign-ai-penpals" \
  --http-method POST \
  --headers "X-Internal-Token=${JOB_TOKEN}" \
  --attempt-deadline 120s
```

手动触发一次验证（三个都跑一遍）：

```bash
for J in deliver-messages process-ai-replies assign-ai-penpals; do
  echo "== $J =="; gcloud scheduler jobs run "$J" --location "$REGION"
done

# 或直接 curl 看返回体
curl -s -X POST "${SERVICE_URL}/internal/jobs/deliver-messages"  -H "X-Internal-Token: ${JOB_TOKEN}"   # {"delivered":N}
curl -s -X POST "${SERVICE_URL}/internal/jobs/assign-ai-penpals" -H "X-Internal-Token: ${JOB_TOKEN}"   # {"candidates":..,"assigned":..,"skipped_no_character":..}
curl -s -X POST "${SERVICE_URL}/internal/jobs/process-ai-replies" -H "X-Internal-Token: ${JOB_TOKEN}"  # {"claimed":..,"completed":..,"failed":..,"blocked":..}
```

> `assign-ai-penpals` 返回 `{"skipped_no_character": N}` 就是 prod 库还没 seed AI 角色 —— 跑一遍 `Backend/db/schema.sql` 的 Seed 段或 `Backend/db/seed_ai_characters.sql`（见 §6）。

**已生效的一个真实示例**（供对照）：`PROJECT_ID=stationary-503105`、`REGION=us-west2`、`SERVICE=thestationery`，`DATABASE_URL` 用 `aws-0-ca-central-1.pooler.supabase.com:6543`。同区多个服务时，给 job 名加服务前缀（如 `thestationery-testing-deliver-messages`）避免重名。

> 轮换 token：先 `gcloud secrets versions add INTERNAL_JOB_TOKEN --data-file=-`，重新部署 Cloud Run 使其读取新版本，再对三个 job 各跑一次 `gcloud scheduler jobs update http <job> --location "$REGION" --update-headers "X-Internal-Token=<new>"` 更新 header。

### （可选，更安全）改用 OIDC 而非明文 header
把内部端点单独部署为一个 `--no-allow-unauthenticated` 服务，Scheduler 用 `--oidc-service-account-email` 调用；这样即使 token 泄露也无法直连。当前实现两者都支持（应用层始终校验 `X-Internal-Token`）。

---

## 4. 环境变量清单速查

| 变量 | 来源 | 说明 |
|---|---|---|
| `ENV` | env-var | `production` |
| `API_PREFIX` | env-var | `/api/v1` |
| `CORS_ORIGINS` | env-var | 前端域名，逗号分隔，勿用 `*` |
| `SUPABASE_URL` | env-var | JWKS 验签 + 头像公链，非数据库 |
| `OPENROUTER_MODEL` / `OPENROUTER_BASE_URL` | env-var | LLM 配置 |
| `DATABASE_URL` | **secret** | Supavisor pooler 连接串（含密码） |
| `OPENROUTER_API_KEY` | **secret** | LLM key |
| `INTERNAL_JOB_TOKEN` | **secret** | 内部任务鉴权，Scheduler header 用同值 |
| `AI_UNANSWERED_GRACE_HOURS` | env-var（可选，默认 24） | 公开信等多久无人回才派 AI |
| `AI_REPLY_MIN_DELAY_MINUTES` / `AI_REPLY_MAX_DELAY_MINUTES` | env-var（可选，默认 5 / 60） | AI 回信的人性化延迟区间 |
| `AI_ASSIGN_BATCH_LIMIT` | env-var（可选，默认 50） | 每次 producer 运行最多派单数 |

`config.py::Settings.validate_production()` 会在生产启动时校验 `DATABASE_URL` / `SUPABASE_URL` / `INTERNAL_JOB_TOKEN` 均已设置。

---

## 5. 更新发布流程（后续每次）

```bash
export IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:$(git rev-parse --short HEAD)"
gcloud builds submit Backend --tag "$IMAGE"
gcloud run deploy "$SERVICE" --image "$IMAGE" --region "$REGION"
```

数据库变更：把 `Backend/db/schema.sql` / 后续编号 migration 贴进 Supabase SQL Editor（先测试库 `Stationary_Test`，验证后再上 `Stationary`）。

---

## 6. 数据库初始化 & AI 角色 seed

- **全新库一次建好**：把整份 `Backend/db/schema.sql` 贴进目标 Supabase 项目的 SQL Editor 执行一次。它含表/枚举/索引/触发器/RLS/avatars bucket，**结尾的 Seed 段还会种入两个 AI 笔友**（夜常客 / 旅人 + 各自 active prompt），跑完即可用。
- **已存在的库补 AI 角色**：单独跑 `Backend/db/seed_ai_characters.sql`（幂等，可反复执行，不会重复插入）。也可用脚本：`cd Backend && PYTHONPATH=. python scripts/seed_ai_characters.py`（读 `.env` 的 `DATABASE_URL`；给别的库跑就临时用 `DATABASE_URL=... python …` 覆盖）。
- 三处 seed 内容保持同步：`schema.sql` 结尾段、`db/seed_ai_characters.sql`、`scripts/seed_ai_characters.py`。
- 没 seed 时 `assign-ai-penpals` 会返回 `{"skipped_no_character": N}`，属正常提示。

---

## 7. 持续部署（GitHub）与常见启动问题

**GitHub 持续部署的构建目录**：仓库根目录没有 Dockerfile（在 `Backend/Dockerfile`，且用 `COPY . .`，构建上下文必须是 `Backend/`）。所以在 Cloud Run「持续部署 / Continuous Deployment」设置里，要把 **构建目录 / Build context directory 设为 `/Backend`**（Dockerfile 名保持 `Dockerfile`）。否则构建报 `lstat /workspace/Dockerfile: no such file or directory`。

**持续部署不携带环境变量 / Secret**：GitHub CD 只做「构建镜像 + 部署」，不会设置 env/secret。环境变量与 Secret 是**服务级**配置，设一次后每次 CD 新修订版本都会继承。用下面命令（或控制台「修改并部署新修订版本 → 变量与密文」）挂上：

```bash
gcloud run services update "$SERVICE" --region "$REGION" \
  --set-env-vars "ENV=production,API_PREFIX=/api/v1,SUPABASE_URL=https://<ref>.supabase.co,OPENROUTER_MODEL=openai/gpt-4o-mini,OPENROUTER_BASE_URL=https://openrouter.ai/api/v1,CORS_ORIGINS=https://你的前端域名" \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,OPENROUTER_API_KEY=OPENROUTER_API_KEY:latest,INTERNAL_JOB_TOKEN=INTERNAL_JOB_TOKEN:latest"
```

**启动探针失败 `Default STARTUP TCP probe failed ... on port 8080`**：构建成功但容器起不来，几乎都是启动即崩。应用在 `lifespan` 里要建数据库连接池，`DATABASE_URL` 缺失/连不通就会抛异常退出：
- 最常见：上面 env/secret 没设 → `DATABASE_URL` 为空。按上一条挂上即可。
- `DATABASE_URL` 一定要用 **Supavisor pooler（端口 6543，事务模式，主机 `aws-0-<region>.pooler.supabase.com`）**，不要用 `db.<ref>.supabase.co:5432` 直连——直连仅 IPv6，Cloud Run 默认只有 IPv4 出口，连不上就启动崩溃。
- `ENV` 要恰好等于 `production`（不是 `prod`），否则生产启动自检 `validate_production()` 不生效。
- 排查：`gcloud run services logs read "$SERVICE" --region "$REGION" --limit 50`，找 `DATABASE_URL is not configured` 或 asyncpg 连接错误。
- 起来后 `curl "$SERVICE_URL/health"`：`{"status":"healthy",...,"database":"ok"}` 才算通；返回 `degraded`/503 = 能启动但连不上库（多半 `DATABASE_URL` 填错）。
