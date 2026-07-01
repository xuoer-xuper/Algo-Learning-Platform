# LeetCode.cn 实时监听验收步骤

## 前置条件

- 在应用内浏览器打开并登录 `https://leetcode.cn`。
- 设置页里 `LeetCode.cn` 站点处于启用状态。
- 设置页“实时监听诊断”中 `IPC` 显示“已注册”。

## 验收流程

1. 在应用内浏览器打开任意 LeetCode.cn 题目页，例如 `https://leetcode.cn/problems/two-sum/`。
2. 打开设置页，点击“实时监听诊断”的“刷新”。
3. 期望“页面”显示 `已识别：leetcode-cn`。
4. 期望“Hook”显示 `已注入`，并且 URL 是当前 LeetCode.cn 题目页。
5. 回到题目页提交一份代码，等待 LeetCode 返回最终判题结果。
6. 再次打开设置页并点击“刷新”。
7. 期望“提交”显示 `已写入提交记录`。
8. 在提交记录或题目详情中确认新增了一条 `leetcode-cn` 提交记录，题目 slug 与当前题目一致。

## 异常定位

- `页面` 不是 `已识别：leetcode-cn`：优先检查当前 URL 是否为 `leetcode.cn/problems/{slug}/`。
- `Hook` 不是 `已注入`：检查站点是否启用，或查看 Hook 错误信息。
- `提交` 显示 `未写入`：查看错误文本；常见原因是重复提交、payload 与 sender URL 不匹配、站点被禁用。
- `提交` 一直是 `尚未检测到提交`：说明页面没有触发 `/submissions/detail/{id}/check/` 响应，需确认提交完成且仍在应用内浏览器页面内。
