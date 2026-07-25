# The Stationery — 后端搭建进度 / 端点清单

配套：`Backend/`（FastAPI）、`Docs/frontend_backend_integration.md`（对接契约）、`Backend/db/schema.sql`、`Docs/deployment.md`（部署备忘）。

架构分层：**api → service → repository → database**（asyncpg 直连 Supabase Postgres，postgres 角色绕过 RLS）。鉴权：**JWKS / ES256** 校验 Supabase JWT（`core/security.py` 从 `SUPABASE_URL` 的 JWKS 端点取公钥，无需任何 key/secret）。LLM：OpenRouter（默认 `openai/gpt-4o-mini`）。

---

## ✅ 已实现（全部端点）

### 基础设施
`config`、asyncpg 连接池（`max_size=5`，`statement_cache_size=0` 兼容 Supavisor）、`create_app()` 工厂、统一错误信封、CORS、限流（slowapi）、Dockerfile、`.env` / `.env.example`。

### 用户 / Profile
| 端点 | 说明 |
|---|---|
| `GET /health`、`GET /` | 健康检查 / 根 |
| `GET /api/v1/me` | 当前用户 profile（含 `avatar_url`） |
| `GET /api/v1/me/username-available?u=` | 用户名唯一性/格式校验 |
| `PATCH /api/v1/me/profile` | 创建（注册引导）或更新 profile |

### 信件墙 / 写信 / 投递
| 端点 | 说明 |
|---|---|
| `GET /api/v1/board` | 信件墙投递（复用活跃 batch 或原子建新 batch，定向信优先、排除自己/被屏蔽） |
| `POST /api/v1/letters` | 建草稿（公开 / 定向 `recipient_username`） |
| `GET /api/v1/letters/mine` | 我的信 / 草稿箱（可选 `?status=`） |
| `POST /api/v1/letters/{id}/publish` | 发布（**真实安全审核** + AI 摘要 + 入池），违规 422 `content_rejected` |
| `PATCH /api/v1/letters/{id}` | 改草稿（可改正文 / 主题 / 收件人） |
| `POST /api/v1/letters/{id}/close`、`DELETE /api/v1/letters/{id}` | 关闭 / 软删除 |
| `POST /api/v1/deliveries/{id}/open` | 打开某信，写 `opened_at`，返回全文 |
| `POST /api/v1/deliveries/{id}/reply` | 回信：首次建 conversation + 写 message + `replied_at` |
| `POST /api/v1/deliveries/{id}/skip`、`/hide` | 跳过 / 隐藏（写 `skipped_at` / `hidden_at`） |

### 会话 / 书柜（Correspondence）
| 端点 | 说明 |
|---|---|
| `GET /api/v1/mailbox` | 按对象聚合的会话 bundle（对方 human/ai、消息数、`tie` 派生） |
| `GET /api/v1/conversations/{id}` | 会话全文（root_letter + messages，`sender` = user/correspondent） |
| `POST /api/v1/conversations/{id}/messages` | 会话内追加回复；对方是 AI 时入队 `ai_response_jobs` |
| `POST /api/v1/conversations/{id}/close` | 关闭会话 |

### 安全 / 治理
| 端点 | 说明 |
|---|---|
| `ai_service.is_content_safe` | OpenRouter 分类器（SAFE/UNSAFE）；未配置 OpenRouter 时 fail-open |
| `POST /api/v1/users/{id}/block`、`DELETE …/block` | 屏蔽 / 解除 |
| `POST /api/v1/reports` | 举报（target_type / reason 白名单校验） |
| 限流 | `create_letter` / `reply` / `messages` = 30/h，`publish` = 20/h，429 走统一信封 |

### AI 角色与后台任务（内部端点，`X-Internal-Token` 保护，挂在根路径）
| 端点 | 说明 |
|---|---|
| `GET /api/v1/ai-characters` | 活跃 AI 角色列表 |
| `POST /internal/jobs/deliver-messages` | 到点 `scheduled` → `delivered` |
| `POST /internal/jobs/process-ai-replies` | 抽取到期 `ai_response_jobs`（`for update skip locked`）→ 调 OpenRouter 生成 → 安全审核 → 写 `messages` → 标记完成 |

---

## ⚠️ 说明 / 已知边界（非阻塞，产品/运营层后续补）

- **AI 回复入队来源**：两条入队路径均已接通。①“用户在 AI 会话里发消息”→ `conversation_service.post_message`；②“公开信无人回 → 派 AI 角色”→ `POST /internal/jobs/assign-ai-penpals`（`ai_jobs_service.assign_unanswered_letters`）：扫描发布超过 `AI_UNANSWERED_GRACE_HOURS` 仍无会话的公开信，随机选 active 角色入队（幂等）。角色/提示词用 `scripts/seed_ai_characters.py` 播种（夜常客 / 旅人）。选角规则 MVP 为随机，后续可用 `topic_preferences` 升级。
- **限流存储**：slowapi 用进程内存，Cloud Run 多实例下是“每实例”限额。要全局严格限额需接 Redis（`storage_uri`）。
- **注册 / Auth 衔接**：前端 `signUp` 成功后调用 `PATCH /me/profile` 完成 username/display_name 引导（后端已支持“无则创建”）。
- **头像直传**：由前端直传 Storage `avatars` bucket，后端只存/回显 `avatar_path`（已支持）。
- **测试**：`Backend/scripts/e2e_smoke.py` 为服务层端到端冒烟脚本（需 `.env` 里填好 `DATABASE_URL` 真实密码后运行）；尚无常驻 `tests/` 套件。

---

## 端到端验证结论

- `create_app().openapi()` 列出全部 **24** 条路由，导入无误。
- 所有关键 SQL（投递候选、mailbox 聚合、`claim_due`、`deliver_due`、`list_by_author`、AI 角色/提示词列查）已针对测试库真实 schema 校验通过（字段名、`public.letter_status` / `public.letter_audience` 枚举转型、`for update skip locked` 均无误）。
- 服务层完整闭环（写→发布→信墙→打开→回信→mailbox→会话）待 `.env` 填入数据库密码后用冒烟脚本实跑。
