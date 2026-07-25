# The Stationery — 前后端对接文档 (MVP)

本文件根据**当前前端已实现的功能** + `stationary_prd.docx` 设计前后端对接：每个前端交互点调用哪个后端 API、请求/响应形状、鉴权、Storage、以及数据库审核结论。

配套文件：`Backend/db/schema.sql`（可直接粘进 Supabase SQL Editor 建库）。

> 语言切换（中/EN）暂缓，等前端文案 finalize 后再做，不影响本对接设计。

---

## 1. 架构与硬约束

```
浏览器 (Next.js, Firebase Hosting)
  ├─ Supabase JS SDK  ──►  Supabase Auth      （仅用于登录态 / JWT）
  ├─ Supabase JS SDK  ──►  Supabase Storage    （仅 avatars bucket，客户端直传）
  └─ fetch (Bearer JWT) ─►  Cloud Run 后端 (FastAPI)  ──►  Supabase Postgres
                                                        （service-role 凭证，绕过 RLS）
                          Cloud Run 后端  ──►  Gemini / LLM API（服务端）
Cloud Scheduler ──►  Cloud Run /internal/jobs/*（受保护内部端点）
```

**PRD §22 铁律**：
- 前端**不直接读写任何业务表**；所有业务数据只经 Cloud Run 后端。
- Supabase 前端 SDK 只用于 **Auth 会话**（外加 avatars Storage 直传，见 §7）。
- 所有业务表启用 RLS 且**不建宽松 policy**（默认拒绝 anon/authenticated）。后端用 service-role/受限凭证访问。

---

## 2. 鉴权流程

1. 注册/登录用 Supabase Auth（`supabase.auth.signUp` / `signInWithPassword`），在前端拿到 `access_token` (JWT)。
2. 之后所有 Cloud Run 请求带 `Authorization: Bearer <access_token>`。
3. 后端用 Supabase JWKS（ES256）公钥校验 token，取 `sub`(=`auth.users.id`) 作为当前用户；再查 `profiles` 得到业务身份。
4. 改密码用 `supabase.auth.updateUser({ password })`（属于 Auth 操作，允许走前端 SDK）。

### 2.1 前端实现结构（已落地）

| 文件 | 职责 |
|---|---|
| `lib/supabase.ts` | 惰性创建浏览器 Supabase 客户端（`persistSession` + `autoRefreshToken`），读 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`。 |
| `lib/api.ts` | `apiFetch()` 自动取当前 session 的 `access_token` 加到 `Authorization`；统一解析后端错误信封为 `ApiError{status,code,message}`；封装 `getMe` / `patchProfile` / `checkUsername`，以及信件/草稿相关 `listMyLetters` / `updateLetter` / `deleteLetter` / `saveDraft` / `postLetter`。 |
| `lib/auth.ts` | `register()` / `login()` / `logout()` / `resendConfirmation()` / `changePassword()`；用户名规则 `USERNAME_RE` + `normalizeHandle`（与后端 `profiles.username` 一致）。 |
| `components/BookshopApp.tsx` | 入口状态机（intro→opening→inside）。**挂载时先 `auth.getSession()` 做会话恢复**：已有会话直接进店（跳过登录窗与开门动画），检查完成前不显示登录窗；无会话才落到 `LoginWindow`。 |
| `components/LoginWindow.tsx` | 注册模式新增 **USERNAME** 字段（`@handle`，前端做格式校验 + 免登录即时查重）；提交走 `register`/`login`，带 loading 与错误/提示信息，成功后 `onEnter()`。需邮箱确认时展示「**Resend confirmation email**」链接调用 `resendConfirmation`。 |
| `components/ProfilePanel.tsx` | 资料 chip + 设置弹窗；底部新增 **Sign out** 按钮（`logout()` 后 `reload()`，因无会话自动回登录页）。 |

### 2.2 注册流程（signUp → PATCH /me/profile）

```
register(email, password, username):
  1. supabase.auth.signUp({ email, password })
  2a. 若返回 session（项目关闭了邮箱确认）：
        → PATCH /api/v1/me/profile { username, display_name }   // 引导创建 profile
        → onEnter() 进书店
  2b. 若无 session（项目开启了邮箱确认，本测试项目即此情况）：
        → 把 username 暂存 localStorage(stationery_pending_username)
        → 提示「去邮箱确认后再登录」，切到登录页
```

```
login(email, password):
  1. supabase.auth.signInWithPassword({ email, password })
  2. ensureProfile(): GET /api/v1/me
       - 200 → 已有 profile，直接进店
       - 404 profile_not_found → 若 localStorage 有 pending username，则
         PATCH /me/profile 完成首次引导；否则报错提示需先注册用户名
```

> **邮箱确认已开启（当前测试项目）**：`signUp` 不会立即返回 session，所以 profile 在「用户确认邮箱后首次登录」时用暂存的 username 引导创建。若想让 MVP 注册即进店，可在 Supabase → Authentication → Providers/Email 关闭「Confirm email」，届时 2a 分支生效。
>
> **重发确认邮件**：需确认时 `LoginWindow` 记住该邮箱并在提示语下展示「Resend confirmation email」，点击调用 `resendConfirmation(email)`（`auth.resend({ type:'signup' })`）。
>
> **注意（Supabase 邮箱校验）**：Supabase 会拒绝 `@example.com` 等无效域名（返回 "Email address is invalid"），前端手动注册测试需用真实域名；后端测试脚本走直接写库绕过 GoTrue，不受影响。

### 2.3 会话恢复 / 退出登录（已落地）

- **会话恢复（自动登录）**：`supabase-js` 已把 session 持久化在 localStorage 并自动续期；`BookshopApp` 挂载时读取它，有会话则直接进店，无会话才显示登录窗。刷新页面即免登录。
- **退出登录**：`ProfilePanel` 的 **Sign out** → `logout()`（`auth.signOut()`）→ `reload()`；重新挂载时无会话 → 回登录窗。

> **验证结论**：已用真实 Supabase 签名 token 跑通后端链路 —— JWKS/ES256 验签通过、`GET /me`(404→200)、`PATCH /me/profile` 引导创建成功、`username-available` 唯一性正确；并在浏览器端 E2E 验证了登录→刷新免登、Sign out→回登录页、注册后出现重发链接。

---

## 3. API 通用约定

- Base：`https://<cloud-run-host>/api/v1`
- 内容类型：`application/json`；文本字段服务端做 HTML 转义 / 纯文本渲染（PRD §23）。
- 鉴权：除公开健康检查外一律需要 `Authorization: Bearer <jwt>`。
- 错误形状（统一）：
  ```json
  { "error": { "code": "letter_not_found", "message": "…", "details": {} } }
  ```
- 常见状态码：400 校验失败 / 401 未登录 / 403 无权限或被 block / 404 不存在 / 409 冲突（如用户名占用）/ 422 安全分类拒绝 / 429 限流。
- 限流（PRD §23.2）：发信、回信、注册等按用户每小时限次，超限返回 429。

---

## 4. 前端界面 → API 映射总览

| 前端位置（组件 / 动作） | 方法 & 端点 | 说明 |
|---|---|---|
| `BookshopApp` 挂载（会话恢复） | Supabase `auth.getSession` | 有会话直接进店，无则显示登录窗 |
| `LoginWindow` 登录 | Supabase `auth.signInWithPassword` | 前端 SDK |
| `LoginWindow` 注册 | Supabase `auth.signUp` → `PATCH /me/profile` | 注册后补 username/display_name |
| `LoginWindow` 注册用户名即时校验 | `GET /public/username-available?u=`（**免登录**公开端点） | 输入防抖 400ms，显示 可用/已占用/格式错误 |
| `LoginWindow` 重发确认邮件 | Supabase `auth.resend({type:'signup'})` | 需邮箱确认时显示链接 |
| `BookshopApp` 进门后 | `GET /me` + `GET /board` | 载入身份与信件墙 |
| `ProfilePanel` 打开 | `GET /me` | 头像/用户名回填 |
| `ProfilePanel` 保存 | `PATCH /me/profile`（+ 头像直传 + `auth.updateUser` 改密码） | 见 §6、§7 |
| `ProfilePanel` 用户名输入校验 | `GET /me/username-available?u=` | 唯一性即时校验 |
| `ProfilePanel` 退出登录 | Supabase `auth.signOut` → reload | 回登录窗 |
| `BookstorePreview` 信件墙 `LetterWall` 列表 | `GET /board` | 5 封 delivery + AI `summary` |
| `LetterWall` 打开某信 | `POST /deliveries/{id}/open` | 标记已读，取全文 |
| `LetterWall` 跳过/隐藏 | `POST /deliveries/{id}/skip` `…/hide` | 可选交互 |
| `LetterWall` 回信投递 | `POST /deliveries/{id}/reply` | 首次回复建 conversation |
| `LetterWriter`（书桌）投递 | `POST /letters` → `POST /letters/{id}/publish` | 公开或定向（recipient），带可选 `subject` 标题 |
| `LetterWriter` 存草稿（Put in drafts） | `POST /letters`(draft) 或 `PATCH /letters/{id}` | 存服务端草稿并关闭；见 §6 |
| `LetterWriter` 草稿箱（Drafts 抽屉） | `GET /letters/mine?status=draft` + `DELETE /letters/{id}` | 列表「继续/丢弃」，见 §6 |
| `Correspondence`（书柜）分组列表 | `GET /mailbox` | 按对象分组的会话 |
| `Correspondence` 打开某人 | `GET /conversations/{id}` | 该会话全部 messages |
| `Correspondence` / `LetterWall` 会话内回复 | `POST /conversations/{id}/messages` | 追加消息 |
| （未在 UI）AI 角色列表 | `GET /ai-characters` | 备用 |
| （未在 UI）屏蔽 / 举报 | `POST /users/{id}/block`、`POST /reports` | 备用 |

---

## 5. 信件墙（读信 / 回信）— `LetterWall` + `BookstorePreview`

前端现状：`lib/letters.ts` 里的 `SAMPLE_LETTERS`（5 封，含 `summary` 摘要、`isReply` 红戳）是**假数据**，上线时由 `GET /board` 替换。

### `GET /api/v1/board`
进入书店 / 点信件墙时拉取当前用户的一批投递（PRD §21.3 原子建 batch）。
- 响应：
  ```json
  {
    "batch_id": "uuid",
    "deliveries": [
      {
        "delivery_id": "uuid",
        "letter_id": "uuid",
        "position": 1,
        "summary": "She planted roses in her grandmother's memory.",
        "seal": "wax",              // 前端 seal 样式，可由后端稳定派生
        "is_reply": false,          // 是否别人写给「我」的回信 → 前端红戳
        "opened": false
      }
    ]
  }
  ```
- 字段对应前端：`summary`→卡片摘要；`is_reply`→`Postmark` 红戳；`seal`→`Seal` 图形。
- `summary` 来自 `public_letters.summary`（发布时 AI 生成，见 §8 schema deltas）。

### `POST /api/v1/deliveries/{delivery_id}/open`
打开某封信（详情视图）。写 `opened_at`，返回全文。
- 响应：`{ "letter": { "id","subject","title","body","author_display","language_code" } }`
  （前端 `LetterDetail` 用 `title`/`body`。）

### `POST /api/v1/deliveries/{delivery_id}/skip` / `…/hide`
跳过 / 永久隐藏该投递（写 `skipped_at` / `hidden_at`）。当前 UI 未强制使用，预留。

### `POST /api/v1/deliveries/{delivery_id}/reply`
在信件墙对一封投递写回信 → 首次回复创建 conversation（PRD：同一真人对同一公开信唯一 conversation），并写 `replied_at` + `created_conversation_id`。
- 请求：`{ "body": "Thank you for telling me her name." }`
- 响应：`{ "conversation_id": "uuid", "message_id": "uuid" }`
- 前端：`LetterReply.onPost` → 调用本端点 → 成功后触发 `handleReplyPosted`（播放 `mail_sent.mp4`，回书店）。

---

## 6. 写信（书桌）— `LetterWriter`

前端现状：书桌顶部有可选 **Title** 输入（→ `subject`）、正文、`To @handle`（留空=公开信）。写到一半可「Put in drafts」存服务端草稿，或点信件堆上的 **Drafts** 像素图标打开草稿箱抽屉（`DraftBox`）继续/丢弃。已不再使用 `localStorage` 草稿。

### `POST /api/v1/letters`
创建草稿。
- 请求：
  ```json
  { "body": "…", "subject": "可选标题", "recipient_username": "june_2am", "language_code": "en" }
  ```
  - `subject` 可选（留空 → `null`）；发布后作为信件墙/详情标题展示（缺省再回退到派生标题，不再恒为 "A letter"）。
  - `recipient_username` 为空 → `audience='public'`；非空 → 后端解析为 `recipient_user_id` 且 `audience='directed'`。
  - 解析失败（用户名不存在）→ 400 `recipient_not_found`。
- 响应：`{ "letter_id": "uuid", "status": "draft" }`

### `POST /api/v1/letters/{letter_id}/publish`
发布。触发：①发布前安全分类（明显违规→422 拒绝，PRD §23）；②生成 `summary`（AI 摘要）；③公开信进入投递池，定向信直接投递给 `recipient_user_id`。
- 响应：`{ "status": "published", "published_at": "…" }`
- 前端：书桌 `Post letter` → `POST /letters` → `publish` → 成功后播放 `mail_sent.mp4`。

### 作者端 / 草稿箱（已落地）
- `GET /api/v1/letters/mine?status=draft`：我的草稿列表，按 `updated_at desc`（最近编辑在前）。DTO 含 `body` / `subject` / `updated_at` / `recipient_username`（join `profiles`），供草稿箱回填标题、正文与 `To @handle`。
- `PATCH /api/v1/letters/{id}`：更新草稿（`body` / `subject` / `recipient_username`）。
- `DELETE /api/v1/letters/{id}`：软删除（`deleted_at`），对应草稿箱「Discard」。
- `POST /api/v1/letters/{id}/close`：关闭会话/信件（可选，UI 后续接）。

### 草稿策略（服务端草稿，已落地）
前端 `lib/api.ts` 用 `saveDraft({ draftId?, body, subject, recipient_username })` 统一处理：有 `draftId` 走 `PATCH`，否则 `POST` 建新草稿；`postLetter` 则先 `saveDraft` 再 `publish`。草稿跨设备可用，替代原 `localStorage` 方案。`DraftBox` 抽屉展示标题（`subject` 或正文首行）、「Edited X ago」相对时间与「继续 / 丢弃」按钮；发布后该草稿从列表消失。

---

## 7. 个人资料 — `ProfilePanel`

### `GET /api/v1/me`
返回当前用户 profile，用于 chip 与设置弹窗回填。
```json
{
  "user_id": "uuid",
  "username": "june_2am",
  "display_name": "June",
  "avatar_url": "https://…/storage/v1/object/public/avatars/<uid>/<uuid>.png",
  "language_code": "en",
  "allow_ai_replies": true,
  "allow_human_replies": true
}
```
> `avatar_url` 由后端用 `avatar_path` 拼公开 URL 返回（bucket 为 public）。

### `GET /api/v1/me/username-available?u=<handle>`（需登录）
资料面板里改名时的唯一性即时校验（`ProfilePanel`，带 Bearer）。
- 响应：`{ "available": true }`；格式非法 → `{ "available": false, "reason": "format" }`。

### `GET /api/v1/public/username-available?u=<handle>`（免登录）
注册页专用：此时还没有 session，故走公开端点；按 IP 限流（`LOOKUP_LIMIT = 60/min`）以缓解用户名枚举。响应结构同上。前端 `LoginWindow` 对输入做 400ms 防抖后调用，展示「Checking… / @handle is available / already taken / 格式错误」。

### `PATCH /api/v1/me/profile`
保存资料（用户名 / 头像路径 / 语言 / 开关）。
- 请求（字段皆可选）：
  ```json
  { "username": "june_2am", "display_name": "June", "avatar_path": "avatars/<uid>/<uuid>.png" }
  ```
- 冲突（用户名被占）→ 409 `username_taken`；格式错→400。

### 头像上传（客户端直传 Storage，见 `schema.sql` 的 avatars 策略）
1. `ProfilePanel` 选图 → 前端用 Supabase Storage 客户端上传到 `avatars/<auth.uid>/<uuid>.<ext>`（RLS 只允许写自己 uid 目录）。
2. 上传成功拿到 `path` → `PATCH /me/profile { avatar_path }`。
3. 后端只存 `avatar_path`，不经手文件字节。
> 前端现状：`ProfilePanel` 用本地 `URL.createObjectURL` 预览；接后端时把「保存」改为「先直传 Storage 再 PATCH」。

### 改密码
`supabase.auth.updateUser({ password })`（Auth 操作走前端 SDK）。MVP 不校验旧密码；如需更严可要求重新登录后再改。

---

## 8. 往来信件（书柜）— `Correspondence`

前端现状：`CORRESPONDENTS`（5 个人，每人若干信）是**假数据**，上线由 `GET /mailbox` 替换。前端「按人分组的信堆」对应后端「按 conversation 对象聚合」。

### `GET /api/v1/mailbox`
返回当前用户参与的会话，按对象聚合成 bundle。
```json
{
  "bundles": [
    {
      "correspondent": { "type": "human", "username": "june_2am", "display_name": "June", "avatar_url": "…" },
      "conversation_id": "uuid",
      "letter_count": 5,
      "last_message_at": "…",
      "tie": "twine-wax"          // 前端 BundleTieMark 样式，可由后端稳定派生
    }
  ]
}
```
> 对象可能是真人或 AI 角色（`type: "ai_character"`）。前端 bundle 名用 `display_name`。

### `GET /api/v1/conversations/{conversation_id}`
打开某个 bundle → 该会话全部消息。
```json
{
  "conversation_id": "uuid",
  "root_letter": { "id":"uuid","title":"…","body":"…" },
  "messages": [
    { "id":"uuid","sender":"user|correspondent","body":"…","created_at":"…","is_reply":true }
  ]
}
```
前端把 messages 映射为 `LetterCard`/`LetterDetail`；别人发来的用红戳（`is_reply`）。

### `POST /api/v1/conversations/{conversation_id}/messages`
在会话里追加消息（书柜或信件墙详情里的「回信」）。
- 请求：`{ "body": "…" }`；响应：`{ "message_id": "uuid" }`
- 成功后前端走统一 `handleReplyPosted`（`mail_sent.mp4` → 回书店）。

### `POST /api/v1/conversations/{conversation_id}/close`
关闭会话（可选，UI 后续接）。

---

## 9. 其它可用端点（PRD 已定义，当前 UI 未接）

- `GET /api/v1/ai-characters`：AI 角色列表（写信/回信人格；MVP 场景里不渲染）。
- `POST /api/v1/users/{user_id}/block`、`DELETE …/block`：屏蔽/解除。
- `POST /api/v1/reports`：举报（`target_type`+`target_id`+`reason`+`details`）。

---

## 10. 后台任务（Cloud Scheduler → 受保护内部端点）

- `POST /internal/jobs/deliver-messages`：把到点的 `messages`（`delivery_status='scheduled'` 且 `scheduled_for<=now`）置为 `delivered`。
- `POST /internal/jobs/process-ai-replies`：扫描 `ai_response_jobs`（`status='scheduled'` 且到期），调用 LLM 生成 AI 回复（生成后再跑一次安全审核），懒建 AI 会话并写入 `messages`。
- `POST /internal/jobs/assign-ai-penpals`：**「公开信无人回 → 派 AI」生产者**。扫描发布超过 `AI_UNANSWERED_GRACE_HOURS`（默认 24h）仍无任何会话的公开信（且信件+作者都 `allow_ai_replies=true`），随机选一个 active AI 角色入队 `ai_response_jobs(trigger_reason='unanswered_public_letter')`，`scheduled_for` 加人性化随机延迟；幂等，已有会话/已派单的信不会重复派。
- 保护：仅接受来自 Scheduler 的带密钥/OIDC 的调用，不暴露公网匿名访问。

> **AI 笔友 seed**：以上 AI 相关 job 需先有 active 角色 + active prompt。跑 `PYTHONPATH=. python scripts/seed_ai_characters.py` 播种「夜常客 / 旅人」两个角色（形象复用 `Frontend/public/assets/pixel/characters/{night_regular,traveler}`）。选角规则 MVP 为随机，后续可用 `ai_characters.topic_preferences` 做偏好选角。

---

## 11. Schema 相对 PRD 的改动（`schema.sql` 中 `[ADDED]`）

为支撑当前前端功能，在 PRD 的 DDL 基础上新增：

1. `profiles.username citext unique` + 格式约束、`avatar_path text`（前几次已加入 PRD）。
2. `public_letters.recipient_user_id uuid`（可空）+ `audience enum('public','directed')`：支持 `LetterWriter` 的定向写信。含约束：directed 必须有 recipient、public 必须无、且 recipient≠author。投递池索引加 `audience='public'` 过滤，新增定向信索引。
3. `public_letters.summary varchar(280)`：信件墙/书柜卡片展示的 AI 摘要（`LetterCard.summary`）。发布时生成。
4. Storage `avatars` bucket + RLS（唯一的客户端直传路径）。

> 均为**新增**、不破坏 PRD 既有结构；`schema.sql` 可直接建库。若你希望我把这些同步回 `stationary_prd.docx` 的 DDL，说一声即可。

---

## 12. 数据库审核结论

- ✅ PRD 的表/枚举/索引/触发器结构完整且自洽（会话身份约束、部分唯一索引保证「单活跃 batch」「每信每真人唯一会话」「每角色唯一 active prompt」等）。已 1:1 保留进 `schema.sql`。
- ✅ RLS 策略与「前端不碰业务表」一致：全表启用、无宽松 policy。
- ⚠️ **缺口（已在 schema 补上）**：定向信收件人、卡片摘要字段——PRD 正文只在说明里提到 `recipient_user_id` 但 DDL 未落地；现已加。
- ✅ **注册需用户名（已完成）**：`LoginWindow` 注册表单已加 **USERNAME** 字段，`signUp` 成功后走 `PATCH /me/profile` 引导创建 profile（邮箱确认开启时于首次登录补做）。见 §2.1 / §2.2。
- ✅ **`board` 的 seal/tie 样式（已完成）**：后端 `services/derive.py` 按 `letter_id`/`conversation_id` 做 sha1 取模稳定派生，`GET /board` 直接返回 `seal`、`GET /mailbox` 返回 `tie`；前端 `Seal`/`BundleTieMark` 直接渲染（对话内单条消息的 seal 由前端按 `message.id` 同法派生）。
- ℹ️ 头像 bucket 目前设为 public（便于直接出图）。PRD 说明里建议私有+signed URL；若头像视为敏感可切私有，改由后端签发 URL。

---

## 13. 前端「假数据 / 占位」清单（联网时替换）

| 位置 | 现状 | 替换为 |
|---|---|---|
| ~~`lib/letters.ts` `SAMPLE_LETTERS`~~ | ✅ 已删除，`LetterWall` 改接 `GET /board` → `POST /deliveries/{id}/open` → `POST /deliveries/{id}/reply` | 完成 |
| ~~`lib/letters.ts` `CORRESPONDENTS`~~ | ✅ 已删除，`Correspondence` 改接 `GET /mailbox` → `GET /conversations/{id}` → `POST /conversations/{id}/messages` | 完成 |
| ~~`ProfilePanel` 默认 `username="reader"`~~ | ✅ 挂载时 `GET /me` 回填（未登录时保留占位） | 完成 |
| ~~`ProfilePanel` 头像本地预览~~ | ✅ 选图仍本地预览，保存时 `uploadAvatar` 直传 `avatars` bucket → `PATCH /me/profile { avatar_path }`；改密走 `auth.updateUser` | 完成 |
| ~~`LetterWriter` 投递~~ | ✅ 「Post letter」已接 `POST /letters` → `POST /letters/{id}/publish`（发布时跑安全审核 + AI 摘要），带可选 `subject` 标题 | 完成 |
| ~~`LetterWriter` 草稿（localStorage）~~ | ✅ 改为服务端草稿：`saveDraft`（`POST`/`PATCH`）+ `DraftBox` 抽屉（`GET /letters/mine?status=draft`、`DELETE /letters/{id}`），跨设备可用 | 完成 |
| ~~`LoginWindow` 提交~~ | ✅ 已接 Supabase Auth（signUp/signIn）+ `PATCH /me/profile` 引导；需确认时可「重发确认邮件」 | 完成 |
| ~~刷新需重新登录~~ | ✅ `BookshopApp` 挂载 `auth.getSession` 会话恢复，刷新免登 | 完成 |
| ~~无退出登录入口~~ | ✅ `ProfilePanel` 加 **Sign out**（`auth.signOut` → reload） | 完成 |

---

## 14. 环境与配置

前端（`.env.local`，见 `Frontend/.env.local.example`）：
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`（浏览器公开 key；RLS 仍生效。新版 `sb_publishable_…` 亦可，`supabase-js` 均兼容）
- `NEXT_PUBLIC_API_BASE_URL`（含 `/api/v1`；本地 `http://localhost:8080/api/v1`）

后端（Cloud Run 环境，见 `Backend/.env.example`）：
- `SUPABASE_URL`（取 JWKS 公钥验 ES256 token + 拼头像公开 URL）
- `DATABASE_URL`（asyncpg 直连 Supavisor pooler，业务读写；后端不需要 anon/service_role/secret key）
- `OPENROUTER_API_KEY` / `OPENROUTER_MODEL`（LLM）
- `INTERNAL_JOB_TOKEN`（保护 `/internal/jobs/*`）
- `CORS_ORIGINS`（逗号分隔）：本地默认同时允许 `http://localhost:3000` 与 `http://127.0.0.1:3000`（两个 host 别名都能用），生产环境覆盖为正式域名。

> 鉴权说明：两个 Supabase 项目均启用**非对称 JWT 签名（ES256 + JWKS）**，后端用 `SUPABASE_URL` 的 `/auth/v1/.well-known/jwks.json` 公钥验证，无需共享密钥，也无需任何 API key。

数据库初始化：把 `Backend/db/schema.sql` 粘进 Supabase SQL Editor 执行一次即可。测试库用 `Stationary_Test`，生产库用 `Stationary`。
