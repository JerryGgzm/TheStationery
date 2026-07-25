# The Stationery — 后端部署备忘（Cloud Run + Secret Manager + Cloud Scheduler）

面向 `Backend/`（FastAPI）。前端另行部署到 Firebase Hosting。
下面命令用占位符，先设一次环境变量，其余可直接复制。

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

## 1. Secret Manager：存放敏感变量

不要把密钥写进镜像或明文环境变量。三个敏感值进 Secret Manager，其余非敏感值用普通环境变量。

```bash
# 数据库连接串（Supavisor pooler，6543，事务模式）
printf 'postgresql://postgres.<ref>:<db-password>@aws-1-<region>.pooler.supabase.com:6543/postgres' \
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

两个内部端点（挂在根路径，非 `/api/v1`）：

| 端点 | 作用 | 建议频率 |
|---|---|---|
| `POST /internal/jobs/deliver-messages` | 到点 `scheduled` 消息 → `delivered` | 每 5 分钟 |
| `POST /internal/jobs/process-ai-replies` | 抽取到期 `ai_response_jobs` → 生成 AI 回复 | 每 5 分钟 |

调用方需带 `X-Internal-Token: <INTERNAL_JOB_TOKEN>`。让 Scheduler 从 Secret Manager 读同一个值：

```bash
export JOB_TOKEN="$(gcloud secrets versions access latest --secret=INTERNAL_JOB_TOKEN)"

# 消息投递
gcloud scheduler jobs create http deliver-messages \
  --location "$REGION" \
  --schedule "*/5 * * * *" \
  --uri "${SERVICE_URL}/internal/jobs/deliver-messages" \
  --http-method POST \
  --headers "X-Internal-Token=${JOB_TOKEN}" \
  --attempt-deadline 120s

# AI 回复
gcloud scheduler jobs create http process-ai-replies \
  --location "$REGION" \
  --schedule "*/5 * * * *" \
  --uri "${SERVICE_URL}/internal/jobs/process-ai-replies" \
  --http-method POST \
  --headers "X-Internal-Token=${JOB_TOKEN}" \
  --attempt-deadline 300s
```

手动触发一次验证：

```bash
gcloud scheduler jobs run deliver-messages --location "$REGION"
# 或直接 curl
curl -s -X POST "${SERVICE_URL}/internal/jobs/deliver-messages" \
  -H "X-Internal-Token: ${JOB_TOKEN}"        # {"delivered": N}
```

> 轮换 token：先 `gcloud secrets versions add INTERNAL_JOB_TOKEN --data-file=-`，重新部署 Cloud Run 使其读取新版本，再 `gcloud scheduler jobs update http ...` 更新两个 job 的 header。

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

`config.py::Settings.validate_production()` 会在生产启动时校验 `DATABASE_URL` / `SUPABASE_URL` / `INTERNAL_JOB_TOKEN` 均已设置。

---

## 5. 更新发布流程（后续每次）

```bash
export IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:$(git rev-parse --short HEAD)"
gcloud builds submit Backend --tag "$IMAGE"
gcloud run deploy "$SERVICE" --image "$IMAGE" --region "$REGION"
```

数据库变更：把 `Backend/db/schema.sql` / 后续编号 migration 贴进 Supabase SQL Editor（先测试库 `Stationary_Test`，验证后再上 `Stationary`）。
