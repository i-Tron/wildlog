# WildLog staging infrastructure

第一阶段、可回滚的本地/staging 模板；不表示已部署服务器，也不修改 `cses-exam`。

## 启动

```bash
cp .env.example .env
# 替换所有 __REPLACE_WITH_*__ 值
docker compose --env-file .env -f infra/docker-compose.staging.yml --profile staging up -d
docker compose --env-file .env -f infra/docker-compose.staging.yml ps
```

API/worker 当前是 Alpine 占位服务，接入真实应用时替换它们的 image/command，保留 `db`、`minio` 服务名。MySQL 首次创建卷时执行 `infra/mysql/001_init.sql`。停止：`docker compose --env-file .env -f infra/docker-compose.staging.yml --profile staging down`；删除卷需显式 `down -v`。

## 腾讯 COS

本地默认 MinIO 的 S3 兼容端点 `http://minio:9000`。腾讯 COS 上海区域为 `ap-shanghai`，S3 兼容端点形如 `https://cos.ap-shanghai.myqcloud.com`。应用通过 S3 SDK 的 endpoint、region、bucket、access key/secret key 配置访问；签名、临时密钥、权限策略和分片上传以腾讯云文档为准，不能假设 MinIO 管理 API 全部存在。真实密钥应放 secret manager，不写进 `.env.example`、Git 或日志。

## 微信小程序接入

现有小程序在 cses-exam 仓库，本目录不修改它。请求层配置 HTTPS API 基址（如 `https://staging.example.com/api`），由 API 提供鸟讯列表、筛选、详情、来源和审核状态，地图只返回区域级/模糊坐标；在微信公众平台加入 staging request 合法域名及 COS 图片域名。网页和小程序共用 API 数据契约，可先兼容 `content/sightings.json` 再切换 MySQL。
