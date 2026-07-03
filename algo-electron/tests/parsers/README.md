# Parser Tests

## 1. 职责

`tests/parsers/` 覆盖 URL 识别、浏览器标题清洗、标题兜底脚本和自定义站点 pattern 规则。

## 2. 当前覆盖

- `siteRules.test.ts`：七个内置 OJ 的有效/无效 URL 和关键身份字段。
- `browserTitle.test.ts`：浏览器标题到题目身份的兜底解析。
- `problemTitleFallback.test.ts`：DOM 标题兜底脚本生成。
- `titleValidation.test.ts`：标题有效性过滤。

## 3. 运行方式

```powershell
cd algo-electron
npx --yes tsx tests\parsers\siteRules.test.ts
```

全量 parser 测试可按 `tests/README.md` 中的批量 esbuild 命令运行。

## 4. 新增规则

新增站点 URL 模式、标题兜底策略或题目身份字段时，先补有效和无效样例。测试只断言解析结果，不访问真实网页。
