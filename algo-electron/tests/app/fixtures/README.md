# App Config Fixtures

## 职责

存放 `tests/app/configCompatibility.test.ts` 用来验收 electron-store 文件兼容性的真实 `config.json` 样本（design §3 的硬性要求：样本必须来自真实存量文件，不得凭空编造）。

## 当前覆盖

- `rc1-config.json`：开发者机器上 `%APPDATA%\algo-electron\config.json` 的真实样本（2.0.0-rc.1 起写入格式未变：2 空格缩进、`homeShortcuts/coach/search/zoomByOrigin/appearance` 顺序）。唯一改动：`coach.llm.encrypted_api_key` 的值替换为等长假 envelope——被测对象是字段形状，真实加密材料不入库。

## 边界规则

新样本必须来自真实存量文件并在来源注释里写明出处；凡包含 `encrypted_api_key`、Cookie 等敏感字段的，值一律做无害化替换（保留字段本身）。不得把任何真实用户数据原样提交进仓库。

## 验证入口

`npx vitest run tests/app`（configCompatibility.test.ts 消费本目录样本）；全量门见 `pnpm run test:core`。
