# KnowGrove Cloud

言序云端的最小可部署服务，负责：

- Neon Auth 邮箱注册、登录、验证、密码重置和会话；
- Credit 不可变账本；
- 套餐订单与模拟支付；
- AI 任务的 Credit 预留、结算和失败释放；
- EdgeOne Makers 中国大陆与海外 Cloud Functions 部署。

## 当前状态

Neon 新加坡开发项目、邮箱认证和 Credit 数据库已经配置并通过真实数据库冒烟测试。EdgeOne 开发环境已部署到 `https://knowgrove-cloud-dev.edgeone.cool`，当前仍使用平台预览访问保护，不是公开生产地址，也不包含真实模型密钥和支付商户。

远端开发环境已验证健康检查、隔离测试账户、模拟订单、2,800 Credit 入账和重复回调幂等。真实邮箱 OTP、Obsidian 设备配对、模型网关和真实支付仍待验收。

只有 `APP_ENV=development` 且显式设置 `ALLOW_TEST_AUTH=true` 时，才允许使用测试身份请求头。正式环境必须关闭这一能力。

## 本地验证

```bash
cd cloud
pnpm check
pnpm test
pnpm build
```

## 数据库

Neon Auth 仅启用邮箱密码、邮箱 OTP 验证和密码重置。数据库变更由可重复执行的迁移脚本管理：

```bash
DATABASE_URL='...' pnpm migrate
DATABASE_URL='...' pnpm smoke:live
```

`smoke:live` 会创建隔离的测试账户，验证健康检查、账户、订单、Credit 入账与幂等性，完成后清理测试数据。数据库连接串和 Auth 配置只能写入本机进程环境或 EdgeOne 环境变量，禁止提交 `.env`。

## EdgeOne 部署

```bash
pnpm build
EDGEONE_TOKEN='...' pnpm dlx edgeone makers deploy dist \
  -n knowgrove-cloud-dev \
  -e preview
```

API Token 只用于部署进程，不写入仓库。当前开发部署 ID 为 `dpgx7ul2uaye`。部署后还必须：

1. 配置下列环境变量；
2. 将 EdgeOne 实际域名加入 Neon Auth 的可信域名；
3. 用远端地址验证页面、健康检查、邮箱会话和 Credit 接口；
4. 在私有 `KnowGrove-Platform/PRD.md` 记录部署地址与验收证据后，才可将状态标记为已部署；只有解除预览保护并完成干净设备验收后，才可描述为公开发布。

## EdgeOne 环境变量

- `APP_ENV`
- `DATABASE_URL`
- `NEON_AUTH_JWKS_URL`
- `NEON_AUTH_ISSUER`
- `NEON_AUTH_AUDIENCE`
- `ALLOW_TEST_AUTH`
- `TEST_AUTH_KEY`
- `CORS_ORIGIN`

正式环境必须设置 `APP_ENV=production`、`ALLOW_TEST_AUTH=false`，并删除 `TEST_AUTH_KEY`。
