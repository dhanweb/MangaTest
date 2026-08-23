# OpenList 接口说明

本文档整理本项目实际调用的 OpenList（Alist 兼容）HTTP 接口、请求/响应结构，以及项目内的映射类型。

**实现位置：** `apps/web/src/modules/downloads/providers/openlist/connection.ts`

**相关设置键：**

| 设置 | 含义 |
|------|------|
| `openlistEnabled` | 是否启用 OpenList provider |
| `openlistBaseUrl` | OpenList 服务地址（可带 path 前缀，如 `http://127.0.0.1:5244/root`） |
| `openlistToken` | 访问 token |
| `openlistUsername` / `openlistPassword` | token 过期时自动重登凭据 |
| `openlistOfflineSavePath` | 离线下载保存路径（默认 `/115Open/Temp`） |
| `openlistLibraryScanRoot` | 云端库索引根（默认 `/115Open/HENTAI/exhentai`） |

---

## 通用约定

| 项 | 说明 |
|----|------|
| Base URL | `openlistBaseUrl`，去掉多余尾部 `/` 后与 endpoint 拼接 |
| 鉴权 | 除公开/登录接口外，Header：`Authorization: <token>` |
| 成功判定 | HTTP 成功且业务 `code` 为空或 `code === 200` |
| 响应信封 | `{ code: number, message: string, data?: T }` |
| 密码哈希 | `sha256(password + "-https://github.com/alist-org/alist")`（常量 `OPENLIST_PASSWORD_HASH_SALT`） |
| 超时 | 多数请求 5s；`add_offline_download` 15s；`fs/link` 10s |
| 路径规范化 | `normalizeOpenListResourcePath`：支持纯路径、`openlist:` / `openlist://`、HTTP URL path；输出以 `/` 开头的绝对路径 |

**业务层 Endpoint 摘要类型 `OpenListEndpointCheck`：**

```ts
{
  endpoint: string;      // 已脱敏：origin + pathname
  ok: boolean;
  status: number | null; // HTTP status
  code: number | null;   // payload.code
  message: string | null;
}
```

---

## 接口一览

| Method | Path | 鉴权 | 用途 |
|--------|------|------|------|
| GET | `api/public/offline_download_tools` | 否 | 连通性探测 |
| GET | `api/me` | Token | Token / 账号校验 |
| POST | `api/auth/login/hash` | 否（账号密码） | 登录取 token |
| POST | `api/fs/get` | Token | 文件/目录元数据 |
| POST | `api/fs/list` | Token | 分页列目录 |
| POST | `api/fs/link` | Token | 下载直链 + 请求头 |
| POST | `api/fs/add_offline_download` | Token | 提交离线下载 |
| GET | `api/task/offline_download/undone` | Token | 未完成离线任务列表 |
| GET | `api/task/offline_download/done` | Token | 已完成离线任务列表 |

本仓库**未**调用 `api/fs/search`；云端库索引通过分页 `fs/list` 实现。

---

## 1. 连接探测

### 1.1 `GET api/public/offline_download_tools`

- **用途：** 判断 OpenList 服务是否可达（不带 token）
- **项目函数：** `checkOpenListConnection`

**成功响应示例：**

```json
{
  "code": 200,
  "message": "success"
}
```

### 1.2 `GET api/me`

- **用途：** 校验 token 是否有效
- **Headers：** `Authorization: <token>`
- **项目函数：** `checkOpenListConnection`

**失败：** HTTP 或业务 `401` / `403` → 项目 `status: "unauthorized"`

### 项目返回：`OpenListConnectionCheckResult`

```ts
{
  ok: boolean;
  status:
    | "disabled"
    | "missing_settings"
    | "reachable"
    | "unauthorized"
    | "unreachable"
    | "invalid_response";
  checkedAt: string;
  baseUrl: string | null;
  tokenConfigured: boolean;
  message: string;
  publicApi: OpenListEndpointCheck | null;
  accountApi: OpenListEndpointCheck | null;
}
```

说明：连接检查在 provider **未启用**时仍会探测（只要配置了 baseUrl + token）。

---

## 2. 登录

### `POST api/auth/login/hash`

- **用途：** 用户名 + 哈希密码登录，获取 token
- **项目函数：** `loginOpenList`、`ensureOpenListToken`（自动重登）

**Headers：**

```
Content-Type: application/json
Client-Id: mangatest-local
```

**请求体：**

```json
{
  "username": "admin",
  "password": "<sha256 哈希后的密码>",
  "otp_code": "123456"
}
```

- `otp_code` 可选；无 OTP 时可不传或为空。

**成功响应：**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "token": "openlist-login-token"
  }
}
```

### 项目返回：`OpenListLoginResult`

```ts
{
  ok: boolean;
  status:
    | "missing_settings"
    | "success"
    | "unauthorized"
    | "unreachable"
    | "invalid_response";
  checkedAt: string;
  baseUrl: string | null;
  token: string | null;       // 仅结果顶层，不放进 authApi
  tokenConfigured: boolean;
  message: string;
  authApi: OpenListEndpointCheck | null;
}
```

### 自动刷新：`ensureOpenListToken`

- `forceRefresh=false` 且已有 token → 不请求登录
- 否则用已保存的 `openlistUsername` / `openlistPassword` 调登录，成功后写回 `openlistToken`
- 缺凭据时返回明确错误，提示到设置页重新登录

---

## 3. 文件元数据

### `POST api/fs/get`

- **用途：** 查询单个路径是文件还是目录，以及安全元数据
- **项目函数：** `inspectOpenListResource`；`resolveOpenListDownloadLink` 也会先调此接口

**Headers：**

```
Authorization: <token>
Content-Type: application/json
```

**请求体：**

```json
{
  "path": "/Library/Comic.cbz",
  "password": "",
  "page": 1,
  "per_page": 0,
  "refresh": false
}
```

**OpenList 成功响应 `data`（原始字段）：**

```ts
{
  name: string;
  size: number;
  is_dir: boolean;
  modified?: string;
  provider?: string;
  type?: number;
  // 直链候选（inspect 不对外暴露 URL 明文）
  raw_url?: string;
  url?: string;
  download_url?: string;
  sign_url?: string;
}
```

**成功响应示例：**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "is_dir": false,
    "modified": "2026-01-01T00:00:00Z",
    "name": "Comic.cbz",
    "provider": "Local",
    "raw_url": "https://private.example/download/Comic.cbz?sign=secret",
    "size": 2097152,
    "type": 4
  }
}
```

### 项目映射：`OpenListRemoteResource`

```ts
{
  name: string;
  sizeBytes: number | null;
  isDirectory: boolean;
  modifiedAt: string | null;
  provider: string | null;
  type: number | null;
  rawUrlAvailable: boolean; // 仅布尔，不包含 URL
}
```

解析规则：`name` 与 `is_dir` 必须有效，否则视为无效响应。

### 项目返回：`OpenListResourceProbeResult`

```ts
{
  ok: boolean;
  status:
    | "disabled"
    | "missing_settings"
    | "missing_resource"
    | "file_ready"
    | "directory"
    | "file_without_raw_url"
    | "unauthorized"
    | "not_found"
    | "unreachable"
    | "invalid_response";
  checkedAt: string;
  baseUrl: string | null;
  path: string | null;
  tokenConfigured: boolean;
  message: string;
  resource: OpenListRemoteResource | null;
  fileApi: OpenListEndpointCheck | null;
}
```

- `404` / message 含 not found、不存在等 → `not_found`
- 目录 → `directory`（`ok: true`）
- 文件无 raw URL → `file_without_raw_url`
- 文件且有 raw URL → `file_ready`

---

## 4. 目录列表

### `POST api/fs/list`

- **用途：** 分页列举目录；云端扫描、10008 库索引、拉回本地选文件均依赖此接口
- **项目函数：** `listOpenListDirectory`

**请求体：**

```json
{
  "path": "/Library",
  "password": "",
  "page": 1,
  "per_page": 20,
  "refresh": false
}
```

| 字段 | 说明 |
|------|------|
| `page` | 默认 1，最小 1 |
| `per_page` | 默认 20，项目限制 **1–50** |
| `refresh` | `true` 时强制上游刷新列表（更耗时） |

**OpenList 成功响应 `data`：**

```ts
{
  content: Array<{
    name: string;
    size: number;
    is_dir: boolean;
    modified?: string;
    provider?: string;
    type?: number;
    raw_url?: string;
  }>;
  total?: number;
  page?: number;
  per_page?: number;
  has_more?: boolean;
  provider?: string;
}
```

**成功响应示例：**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "content": [
      {
        "is_dir": true,
        "name": "Series",
        "provider": "Local",
        "raw_url": "",
        "size": 0,
        "type": 1
      },
      {
        "is_dir": false,
        "name": "Comic.cbz",
        "provider": "Local",
        "raw_url": "https://private.example/Comic.cbz?sign=secret",
        "size": 42,
        "type": 4
      }
    ],
    "has_more": false,
    "page": 1,
    "per_page": 3,
    "provider": "Local",
    "total": 2
  }
}
```

### 项目映射：`OpenListDirectorySnapshot`

```ts
{
  entries: OpenListRemoteResource[];
  total: number | null;
  page: number | null;
  perPage: number | null;
  hasMore: boolean | null;
  provider: string | null;
}
```

要求 `data.content` 为数组，否则视为无效。

### 项目返回：`OpenListDirectoryListResult`

```ts
{
  ok: boolean;
  status:
    | "disabled"
    | "missing_settings"
    | "missing_resource"
    | "reachable"
    | "unauthorized"
    | "not_found"
    | "unreachable"
    | "invalid_response";
  checkedAt: string;
  baseUrl: string | null;
  path: string | null;
  tokenConfigured: boolean;
  message: string;
  directory: OpenListDirectorySnapshot | null;
  listApi: OpenListEndpointCheck | null;
}
```

---

## 5. 下载直链

### `POST api/fs/link`（优先）

- **用途：** 获取实际下载 URL 以及下游请求必需的 headers（115 等存储常依赖 UA/Referer）
- **项目函数：** `resolveOpenListDownloadLink`（先 `fs/get`，再 `fs/link`；link 失败则回退 get 的 raw URL）

**请求体：**

```json
{
  "path": "/115Open/Temp/Comic.cbz",
  "password": ""
}
```

**OpenList 成功响应 `data`：**

```ts
{
  // URL 字段兼容顺序：url | raw_url | download_url | sign_url
  url?: string;
  raw_url?: string;
  download_url?: string;
  sign_url?: string;
  // Go http.Header 序列化，值常为 string[]
  header?: Record<string, string | string[]>;
  headers?: Record<string, string | string[]>; // 兼容字段名
}
```

**成功响应示例：**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "url": "/d/115Open/Temp/Comic.cbz?sign=secret",
    "header": {
      "User-Agent": ["Mozilla/5.0 OpenList-115"],
      "Referer": ["https://115.com/"]
    }
  }
}
```

**项目处理：**

- 相对 URL 用 `joinOpenListDownloadUrl(baseUrl, url)` 拼成绝对地址
- `header` / `headers` 经 `normalizeOpenListRequestHeaders` 压成 `Record<string, string>`（数组取第一个非空字符串）

### 回退：`fs/get` 的 raw 字段

当 `fs/link` 不可用时，从 get 的 `raw_url` / `url` / `download_url` / `sign_url` 取链，headers 为空对象。

### 项目返回：`OpenListDownloadLinkResult`

在 `OpenListResourceProbeResult` 基础上增加：

```ts
{
  // ...OpenListResourceProbeResult 字段
  rawUrl: string | null;
  headers: Record<string, string>;
}
```

- `file_ready`：拿到可用下载 URL
- `file_without_raw_url`：文件存在但 link 与 raw 均无可用链接
- `directory`：路径是目录，不能当文件下载

---

## 6. 离线下载

### 6.1 `POST api/fs/add_offline_download`

- **用途：** 提交磁链（或 OpenList 路径 URL）到 115 等离线工具
- **项目函数：** `submitOpenListOfflineDownload`
- **默认 tool：** `"115 Open"`
- **默认 delete_policy：** `"delete_on_upload_succeed"`

**请求体：**

```json
{
  "path": "/115Open/Temp",
  "urls": ["magnet:?xt=urn:btih:..."],
  "tool": "115 Open",
  "delete_policy": "delete_on_upload_succeed"
}
```

**成功响应示例：**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "tasks": [
      {
        "id": "ol-offline-1"
      }
    ]
  }
}
```

项目取 `data.tasks[0].id` 作为 `taskId`。

### 重复任务错误码 10008

OpenList/115 对「任务已存在」可能返回：

- 顶层 `code: 10008`，或
- 外层 `code` 为 500 等，message 嵌套 `code: 10008, message: 任务已存在...`

项目用 `extractOpenListErrorCode` + `isOpenListDuplicateOfflineError` 识别，返回：

```ts
status: "duplicate_task"
openlistCode: 10008
ok: false
```

后续进入云端库索引恢复流程（分页 `fs/list`），**不会**重复提交磁链。

### 项目返回：`OpenListOfflineDownloadResult`

```ts
{
  ok: boolean;
  status:
    | "disabled"
    | "missing_settings"
    | "submitted"
    | "duplicate_task"
    | "unauthorized"
    | "unreachable"
    | "invalid_response";
  checkedAt: string;
  baseUrl: string | null;
  tokenConfigured: boolean;
  message: string;
  taskId: string | null;
  apiCheck: OpenListEndpointCheck | null;
  openlistCode?: number | null;
}
```

### 6.2 `GET api/task/offline_download/undone` / `done`

- **用途：** 轮询离线任务进度（worker poll-only，提交只在创建/重试时做一次）
- **项目函数：** `listOpenListOfflineTasks(kind)`
- **Headers：** `Authorization: <token>`

**成功响应（项目期望）：**

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": "...",
      "name": "...",
      "state": 0,
      "status": "...",
      "progress": 0,
      "error": ""
    }
  ]
}
```

`listOpenListOfflineTasks` 仅在 `code === 200` 且 `data` 为**数组**时返回列表；否则返回 `[]`。

诊断脚本 `scripts/probe-openlist.mjs` 还会尝试 `?per_page=200`，并兼容 `data` 为数组或 `{ tasks: [] }`。

### 项目类型：`OpenListOfflineTaskItem`

```ts
{
  id: string;
  name: string;
  state: number; // 0=queued, 1=downloading, 2=done, 3=error
  status: string;
  progress: number;
  error: string;
}
```

`OpenListOfflineTaskState`：`0 | 1 | 2 | 3`（注释语义如上）。

---

## 鉴权失败与自动重试

以下接口在收到 401/403 或 message 匹配 token 失效等模式时，会尝试 `ensureOpenListToken(forceRefresh=true)` 后**整次重试一次**（`skipAuthRefresh` 防死循环）：

- `api/fs/get`
- `api/fs/list`
- `api/fs/link`
- `api/fs/add_offline_download`
- `api/task/offline_download/*`

`isOpenListUnauthorized` 判定：

- HTTP `401` / `403`
- payload `code` 为 `401` / `403`
- message 匹配：`token expired/invalid`、`please login`、`unauthorized`、`未登录`、`token 失效/过期` 等

---

## 路径格式

| 输入 | 规范化结果 |
|------|------------|
| `Library/Comic.cbz` | `/Library/Comic.cbz` |
| `openlist:/Library/Comic.cbz` | `/Library/Comic.cbz` |
| `openlist://Cloud/Library/Comic%20A.cbz` | `/Cloud/Library/Comic A.cbz` |
| 空、`/` | `null` |

---

## 安全约定

- 业务 API / readiness 结果中**不**回传 OpenList token、raw 下载 URL、query sign 等敏感串
- 日志与列表侧资源展示使用脱敏表示
- 不要将真实 token、密码、磁链提交进仓库

---

## 项目内调用关系（简图）

```text
设置页连接检查
  → GET public/offline_download_tools + GET me

设置页登录 / token 过期
  → POST auth/login/hash

资源准备 / 预检
  → POST fs/get
  → 若目录 → POST fs/list

transfer 下载执行
  → POST fs/get + POST fs/link（优先）
  → 流式下载或交给 aria2

magnet offline
  → POST fs/add_offline_download（创建/重试时一次）
  → GET task/offline_download/undone|done（worker 轮询）

10008 重复任务
  → 不重复提交
  → 分页 POST fs/list 扫库索引 → 匹配 zip/cbz → 创建 transfer
```

---

## 参考代码与测试

| 路径 | 说明 |
|------|------|
| `apps/web/src/modules/downloads/providers/openlist/connection.ts` | 全部 HTTP 调用与归一化 |
| `apps/web/src/modules/downloads/providers/openlist/index.ts` | provider adapter.prepare |
| `apps/web/src/modules/downloads/openlist-duplicate-error.ts` | 10008 结构化识别 |
| `apps/web/src/modules/downloads/providers/openlist/connection.test.ts` | 各接口 mock 契约 |
| `scripts/probe-openlist.mjs` | 本地诊断 undone/done 任务 |
| `docs/implemented-features.md` | 产品侧 OpenList 能力说明 |
