import assert from 'node:assert'
import {
  hasCjkText,
  isBadScrapedTitle,
  isValidScrapedTitle,
  shouldReplaceScrapedTitle,
} from '../../electron/parsers/titleValidation.ts'

assert.strictEqual(
  isBadScrapedTitle('number-of-strings-that-appear-as-substrings-in-word'),
  true,
  'URL slug titles should be treated as bad scraped titles',
)
assert.strictEqual(
  isValidScrapedTitle('作为子字符串出现在单词中的字符串数目'),
  true,
  'Chinese LeetCode titles should be valid scraped titles',
)
assert.strictEqual(
  isBadScrapedTitle('Problem - E'),
  true,
  'Codeforces placeholder tab titles should be treated as bad scraped titles',
)
assert.strictEqual(
  shouldReplaceScrapedTitle('Problem - E', 'Zhily and Signpost'),
  true,
  'DOM titles should replace existing Codeforces placeholder tab titles',
)
assert.strictEqual(hasCjkText('作为子字符串出现在单词中的字符串数目'), true)
assert.strictEqual(hasCjkText('Number of Strings That Appear as Substrings in Word'), false)
assert.strictEqual(
  shouldReplaceScrapedTitle(
    'number-of-strings-that-appear-as-substrings-in-word',
    '作为子字符串出现在单词中的字符串数目',
  ),
  true,
  'Chinese titles should replace existing slug titles',
)
assert.strictEqual(
  shouldReplaceScrapedTitle(
    'Number of Strings That Appear as Substrings in Word',
    '作为子字符串出现在单词中的字符串数目',
  ),
  true,
  'Chinese titles should replace existing non-Chinese titles',
)
assert.strictEqual(
  shouldReplaceScrapedTitle(
    '作为子字符串出现在单词中的字符串数目',
    'Number of Strings That Appear as Substrings in Word',
  ),
  false,
  'English titles should not replace existing Chinese titles',
)
