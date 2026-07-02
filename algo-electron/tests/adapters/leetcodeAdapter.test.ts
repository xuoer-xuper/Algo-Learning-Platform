import { leetcodeAdapter } from '../../electron/adapters/leetcode.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const problem = await leetcodeAdapter.parseProblem('https://leetcode.cn/problems/two-sum/', {
  url: 'https://leetcode.cn/problems/two-sum/',
})
assert(problem, 'LeetCode problem URL should parse')
assert(problem.platform === 'leetcode-cn', 'Parsed platform should be leetcode-cn')
assert(problem.platformProblemId === 'two-sum', 'Parsed problem id should use slug before content metadata is available')

assert(leetcodeAdapter.parseSubmissionResult, 'LeetCode adapter should parse realtime submission payloads')
const submission = leetcodeAdapter.parseSubmissionResult({
  adapterId: 'leetcode-cn',
  pageUrl: 'https://leetcode.cn/problems/two-sum/',
  requestUrl: 'https://leetcode.cn/submissions/detail/123456/check/',
  response: {
    state: 'SUCCESS',
    status_msg: 'Accepted',
    lang: 'cpp',
    runtime: '4 ms',
    memory: '9.4 MB',
    title_slug: 'two-sum',
    frontend_question_id: '1',
  },
})

assert(submission, 'Successful LeetCode check response should parse as a submission')
assert(submission.platformSubmissionId === '123456', 'Submission id should be extracted from check URL')
assert(submission.verdict === 'AC', 'Accepted should normalize to AC')
assert(submission.runtimeMs === 4, 'Runtime should parse to milliseconds')
assert(submission.memoryKb === 9626, 'Memory should parse to KiB')

const codeOnlySubmission = leetcodeAdapter.parseSubmissionResult({
  adapterId: 'leetcode-cn',
  pageUrl: 'https://leetcode.cn/problems/two-sum/',
  requestUrl: 'https://leetcode.cn/submissions/detail/223344/check/',
  response: {
    state_code: 'SUCCESS',
    status_code: 10,
    pretty_lang: 'C++',
    status_runtime: '8 ms',
    status_memory: '12.5 MB',
    question_id: '1',
  },
})

assert(codeOnlySubmission, 'LeetCode status_code-only check response should parse as a submission')
assert(codeOnlySubmission.platformSubmissionId === '223344', 'Status-code response should still extract submission id')
assert(codeOnlySubmission.verdict === 'AC', 'LeetCode status_code 10 should normalize to AC')
assert(codeOnlySubmission.language === 'C++', 'pretty_lang should be used as language fallback')
assert(codeOnlySubmission.runtimeMs === 8, 'status_runtime should parse as runtime fallback')
assert(codeOnlySubmission.memoryKb === 12800, 'status_memory should parse as memory fallback')

const graphqlSubmission = leetcodeAdapter.parseSubmissionResult({
  adapterId: 'leetcode-cn',
  pageUrl: 'https://leetcode.cn/problems/number-of-strings-that-appear-as-substrings-in-word/submissions/733343549/',
  requestUrl: 'https://leetcode.cn/graphql/',
  response: {
    data: {
      submissionDetails: {
        id: '733343549',
        statusDisplay: 'Accepted',
        langName: 'Python3',
        runtimeDisplay: '36 ms',
        memoryDisplay: '16.8 MB',
        question: {
          titleSlug: 'number-of-strings-that-appear-as-substrings-in-word',
          translatedTitle: '作为子字符串出现在单词中的字符串数目',
          questionFrontendId: '1967',
        },
      },
    },
  },
})

assert(graphqlSubmission, 'LeetCode GraphQL submissionDetails response should parse as a submission')
assert(graphqlSubmission.platformSubmissionId === '733343549', 'GraphQL response should use nested submission id')
assert(graphqlSubmission.verdict === 'AC', 'GraphQL statusDisplay should normalize to AC')
assert(graphqlSubmission.language === 'Python3', 'GraphQL langName should be used as language')
assert(graphqlSubmission.runtimeMs === 36, 'GraphQL runtimeDisplay should parse as runtime')
assert(graphqlSubmission.memoryKb === 17203, 'GraphQL memoryDisplay should parse as memory')

const pendingSubmission = leetcodeAdapter.parseSubmissionResult({
  adapterId: 'leetcode-cn',
  pageUrl: 'https://leetcode.cn/problems/two-sum/',
  requestUrl: 'https://leetcode.cn/submissions/detail/223345/check/',
  response: {
    state_code: 'PENDING',
    status_code: 10,
  },
})
assert(pendingSubmission === null, 'Non-success LeetCode check responses should be ignored until final result')

const pendingWithoutStateSubmission = leetcodeAdapter.parseSubmissionResult({
  adapterId: 'leetcode-cn',
  pageUrl: 'https://leetcode.cn/problems/two-sum/',
  requestUrl: 'https://leetcode.cn/submissions/detail/223346/check/',
  response: {
    status_msg: 'Pending',
    title_slug: 'two-sum',
  },
})
assert(pendingWithoutStateSubmission === null, 'Pending LeetCode verdict text should not be inserted even without state fields')

const nestedPendingSubmission = leetcodeAdapter.parseSubmissionResult({
  adapterId: 'leetcode-cn',
  pageUrl: 'https://leetcode.cn/problems/two-sum/',
  requestUrl: 'https://leetcode.cn/submissions/detail/223347/check/',
  response: {
    state: 'SUCCESS',
    status_msg: 'Accepted',
    title_slug: 'two-sum',
    judge: {
      state: 'STARTED',
    },
  },
})
assert(nestedPendingSubmission === null, 'Nested pending LeetCode judge fields should block early insertion')

assert(leetcodeAdapter.resolveProblemIdentity, 'LeetCode adapter should resolve problem identity from submission metadata')
const identity = leetcodeAdapter.resolveProblemIdentity(submission, {
  adapterId: 'leetcode-cn',
  pageUrl: 'https://leetcode.cn/problems/two-sum/',
  requestUrl: 'https://leetcode.cn/submissions/detail/123456/check/',
  response: {
    title_slug: 'two-sum',
    frontend_question_id: '1',
  },
})

assert(identity, 'Submission metadata should resolve a problem identity')
assert(identity.platformProblemId === 'two-sum', 'Resolved LeetCode identity should stay consistent with URL slug')
assert(identity.problemIndex === '1', 'Resolved LeetCode identity should preserve frontend question id as metadata')

const graphqlIdentity = leetcodeAdapter.resolveProblemIdentity(graphqlSubmission, {
  adapterId: 'leetcode-cn',
  pageUrl: 'https://leetcode.cn/problems/number-of-strings-that-appear-as-substrings-in-word/submissions/733343549/',
  requestUrl: 'https://leetcode.cn/graphql/',
  response: {
    data: {
      submissionDetails: {
        id: '733343549',
        statusDisplay: 'Accepted',
        question: {
          titleSlug: 'number-of-strings-that-appear-as-substrings-in-word',
          translatedTitle: '作为子字符串出现在单词中的字符串数目',
          questionFrontendId: '1967',
        },
      },
    },
  },
})

assert(graphqlIdentity, 'GraphQL submission details should resolve problem identity')
assert(graphqlIdentity.platformProblemId === 'number-of-strings-that-appear-as-substrings-in-word', 'GraphQL identity should use nested title slug')
assert(graphqlIdentity.title === undefined, 'GraphQL translated title should not be used without browser tab title metadata')
assert(graphqlIdentity.problemIndex === '1967', 'GraphQL identity should preserve nested frontend question id')

const titleFromTabIdentity = leetcodeAdapter.resolveProblemIdentity(graphqlSubmission, {
  adapterId: 'leetcode-cn',
  pageUrl: 'https://leetcode.cn/problems/number-of-strings-that-appear-as-substrings-in-word/submissions/733343549/',
  requestUrl: 'https://leetcode.cn/problems/number-of-strings-that-appear-as-substrings-in-word/submissions/733343549/',
  response: {
    id: '733343549',
    status_msg: 'Accepted',
    title: 'Number of Strings That Appear as Substrings in Word',
  },
  meta: {
    pageTitle: '1967. 作为子字符串出现在单词中的字符串数目 - 力扣（LeetCode）',
  },
})

assert(titleFromTabIdentity, 'LeetCode identity should resolve from URL plus browser tab title')
assert(titleFromTabIdentity.title === '作为子字符串出现在单词中的字符串数目', 'LeetCode identity should extract Chinese title from browser tab title')

const hook = leetcodeAdapter.injectHookScript?.()
assert(typeof hook === 'string' && hook.includes('__algo_submission_v1'), 'Hook should report through the OJ bridge channel')
assert(hook.includes('/submissions'), 'Hook should target LeetCode submission check requests')

const hookReports: any[] = []
const fakeLocation = { href: 'https://leetcode.cn/problems/two-sum/' }
function createJsonResponse(json: unknown) {
  return {
    clone() {
      return {
        json: async () => json,
      }
    },
  }
}
const fakeResponse = createJsonResponse({
  state: 'SUCCESS',
  status_msg: 'Accepted',
  title_slug: 'two-sum',
})
const fakeSubmitResponse = createJsonResponse({
  submission_id: '123456',
})
const addTwoSubmitResponse = createJsonResponse({
  submission_id: '654321',
})
const fakeRunResponse = createJsonResponse({
  interpret_id: '333444',
})
const fakeRunCheckResponse = createJsonResponse({
  state: 'SUCCESS',
  status_msg: 'Accepted',
  title_slug: 'two-sum',
})
const fakeWindow: any = {
  __algo_submission_v1: {
    reportSubmission(payload: unknown) {
      hookReports.push(payload)
    },
  },
  fetch: async (input: string) => {
    const url = String(input)
    if (url.includes('/problems/add-two-numbers/submit/')) return addTwoSubmitResponse
    if (url.includes('/submit/')) return fakeSubmitResponse
    if (url.includes('/interpret_solution/')) return fakeRunResponse
    if (url.includes('/submissions/detail/333444/check/')) return fakeRunCheckResponse
    return fakeResponse
  },
}

new Function('window', 'location', hook!)(fakeWindow, fakeLocation)
await fakeWindow.fetch('https://leetcode.cn/problems/two-sum/interpret_solution/')
await fakeWindow.fetch('https://leetcode.cn/submissions/detail/333444/check/')
await new Promise((resolve) => setTimeout(resolve, 0))
assert(hookReports.length === 0, 'Hooked fetch should ignore LeetCode run-code/self-test results')

const pendingHookReports: any[] = []
const pendingHookWindow: any = {
  __algo_submission_v1: {
    reportSubmission(payload: unknown) {
      pendingHookReports.push(payload)
    },
  },
  fetch: async (input: string) => {
    const url = String(input)
    if (url.includes('/submit/')) return createJsonResponse({ submission_id: '223347' })
    return createJsonResponse({
      state: 'SUCCESS',
      status_msg: 'Accepted',
      judge: { state: 'STARTED' },
      title_slug: 'two-sum',
    })
  },
}
new Function('window', 'location', hook!)(pendingHookWindow, fakeLocation)
await pendingHookWindow.fetch('https://leetcode.cn/problems/two-sum/submit/')
await pendingHookWindow.fetch('https://leetcode.cn/submissions/detail/223347/check/')
await new Promise((resolve) => setTimeout(resolve, 0))
assert(pendingHookReports.length === 0, 'Hooked fetch should ignore nested pending LeetCode check payloads')

await fakeWindow.fetch('https://leetcode.cn/problems/two-sum/submit/')
const wrappedResponse = await fakeWindow.fetch('https://leetcode.cn/submissions/detail/123456/check/')
await new Promise((resolve) => setTimeout(resolve, 0))

assert(wrappedResponse === fakeResponse, 'Hooked fetch should return the original response')
assert(hookReports.length === 1, 'Hooked fetch should report one matching submitted check response')
assert(hookReports[0].adapterId === 'leetcode-cn', 'Hook report should include adapter id')
assert(hookReports[0].pageUrl === 'https://leetcode.cn/problems/two-sum/', 'Hook report should include current page URL')
assert(hookReports[0].requestUrl.includes('/submissions/detail/123456/check/'), 'Hook report should include request URL')
assert('meta' in hookReports[0], 'Hook report should include metadata')

fakeLocation.href = 'https://leetcode.cn/problems/add-two-numbers/'
await fakeWindow.fetch('/problems/add-two-numbers/submit/')
await fakeWindow.fetch('/submissions/detail/654321/check/')
await new Promise((resolve) => setTimeout(resolve, 0))

assert(hookReports.length === 2, 'Hooked fetch should keep reporting after SPA page URL changes')
assert(hookReports[1].pageUrl === 'https://leetcode.cn/problems/add-two-numbers/', 'Hook report should use the live SPA page URL')
assert(hookReports[1].requestUrl === '/submissions/detail/654321/check/', 'Hook report should preserve relative submission check URLs')

await fakeWindow.fetch('/graphql/')
await new Promise((resolve) => setTimeout(resolve, 0))
assert(hookReports.length === 2, 'Hooked fetch should ignore unrelated GraphQL JSON responses')

const graphqlReports: any[] = []
const graphqlWindow: any = {
  __algo_submission_v1: {
    reportSubmission(payload: unknown) {
      graphqlReports.push(payload)
    },
  },
  fetch: async () => ({
    clone() {
      return {
        json: async () => ({
          data: {
            submissionDetails: {
              id: '733343549',
              statusDisplay: 'Accepted',
              question: { titleSlug: 'number-of-strings-that-appear-as-substrings-in-word' },
            },
          },
        }),
      }
    },
  }),
}

new Function('window', 'location', hook!)(graphqlWindow, {
  href: 'https://leetcode.cn/problems/number-of-strings-that-appear-as-substrings-in-word/submissions/733343549/',
  pathname: '/problems/number-of-strings-that-appear-as-substrings-in-word/submissions/733343549/',
})
await graphqlWindow.fetch('/graphql/')
await new Promise((resolve) => setTimeout(resolve, 0))
assert(graphqlReports.length === 1, 'Hooked fetch should report LeetCode GraphQL submissionDetails responses')
assert(graphqlReports[0].requestUrl === '/graphql/', 'GraphQL hook report should preserve request URL')
assert(graphqlReports[0].response.data.submissionDetails.id === '733343549', 'GraphQL hook report should include response body')

const xhrReports: any[] = []
class FakeXMLHttpRequest {
  __algoRequestUrl?: string
  responseText = ''

  private listeners = new Map<string, Array<() => void>>()

  open(_method: string, _url: string) {}

  send() {
    this.responseText = String(this.__algoRequestUrl).includes('/submit/')
      ? JSON.stringify({ submission_id: '777888' })
      : JSON.stringify({
        stateCode: 'SUCCESS',
        statusMsg: 'Wrong Answer',
        titleSlug: 'add-two-numbers',
      })
    for (const listener of this.listeners.get('load') ?? []) {
      listener.call(this)
    }
  }

  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }

  getResponseHeader(name: string) {
    return name.toLowerCase() === 'content-type' ? 'application/json' : null
  }
}

const xhrWindow: any = {
  __algo_submission_v1: {
    reportSubmission(payload: unknown) {
      xhrReports.push(payload)
    },
  },
  XMLHttpRequest: FakeXMLHttpRequest,
}

new Function('window', 'location', hook!)(xhrWindow, { href: 'https://leetcode.cn/problems/add-two-numbers/' })
const submitXhr = new xhrWindow.XMLHttpRequest()
submitXhr.open('POST', '/problems/add-two-numbers/submit/')
submitXhr.send()
const xhr = new xhrWindow.XMLHttpRequest()
xhr.open('GET', '/submissions/detail/777888/check/')
xhr.send()

assert(xhrReports.length === 1, 'Hooked XHR should report one matching submitted check response')
assert(xhrReports[0].pageUrl === 'https://leetcode.cn/problems/add-two-numbers/', 'XHR hook should include current page URL')
assert(xhrReports[0].requestUrl === '/submissions/detail/777888/check/', 'XHR hook should include request URL')
assert(xhrReports[0].response.statusMsg === 'Wrong Answer', 'XHR hook should parse JSON response text')

const pageReports: any[] = []
const pageWindow: any = {
  __algo_submission_v1: {
    reportSubmission(payload: unknown) {
      pageReports.push(payload)
    },
  },
}
const pageDocument = {
  body: {
    innerText: 'Accepted Python3 36 ms 16.8 MB',
    textContent: 'Accepted Python3 36 ms 16.8 MB',
  },
  title: '1967. 作为子字符串出现在单词中的字符串数目 - 力扣（LeetCode）',
  querySelector(selector: string) {
    if (selector === 'a[href="/problems/number-of-strings-that-appear-as-substrings-in-word/"]') {
      return { textContent: '作为子字符串出现在单词中的字符串数目' }
    }
    return null
  },
}

new Function('window', 'location', 'document', hook!)(pageWindow, {
  href: 'https://leetcode.cn/problems/number-of-strings-that-appear-as-substrings-in-word/submissions/733343549/',
  pathname: '/problems/number-of-strings-that-appear-as-substrings-in-word/submissions/733343549/',
}, pageDocument)
await new Promise((resolve) => setTimeout(resolve, 10))

assert(pageReports.length >= 1, 'Hook should scan current LeetCode submission result pages as a fallback')
assert(pageReports[0].requestUrl.includes('/submissions/733343549/'), 'Submission page fallback should use current page URL as request URL')
assert(pageReports[0].response.id === '733343549', 'Submission page fallback should extract submission id from URL')
assert(pageReports[0].response.title_slug === 'number-of-strings-that-appear-as-substrings-in-word', 'Submission page fallback should extract title slug from URL')
assert(pageReports[0].response.status_msg === 'Accepted', 'Submission page fallback should extract verdict from visible page text')

const judgingPageReports: any[] = []
const judgingPageWindow: any = {
  __algo_submission_v1: {
    reportSubmission(payload: unknown) {
      judgingPageReports.push(payload)
    },
  },
}
const judgingPageDocument = {
  body: {
    innerText: 'Accepted Runtime 36 ms Memory 16.8 MB 正在判题',
    textContent: 'Accepted Runtime 36 ms Memory 16.8 MB 正在判题',
  },
  title: '1. 两数之和 - 力扣（LeetCode）',
}

new Function('window', 'location', 'document', hook!)(judgingPageWindow, {
  href: 'https://leetcode.cn/problems/two-sum/submissions/223347/',
  pathname: '/problems/two-sum/submissions/223347/',
}, judgingPageDocument)
await new Promise((resolve) => setTimeout(resolve, 10))
assert(judgingPageReports.length === 0, 'Submission page fallback should wait while LeetCode visible text still says judging')

const spaReinjectReports: any[] = []
const spaWindow: any = {
  __algo_submission_v1: {
    reportSubmission(payload: unknown) {
      spaReinjectReports.push(payload)
    },
  },
  fetch: async () => fakeResponse,
}
const spaLocation = {
  href: 'https://leetcode.cn/problems/two-sum/',
  pathname: '/problems/two-sum/',
}
const spaDocument = {
  body: {
    innerText: '',
    textContent: '',
  },
}

new Function('window', 'location', 'document', hook!)(spaWindow, spaLocation, spaDocument)
await new Promise((resolve) => setTimeout(resolve, 10))
assert(spaWindow.__ALGO_LEETCODE_NETWORK_HOOK_INSTALLED__ === true, 'First injection should install network hooks')

spaLocation.href = 'https://leetcode.cn/problems/two-sum/submissions/999000/'
spaLocation.pathname = '/problems/two-sum/submissions/999000/'
spaDocument.body.innerText = 'Wrong Answer C++ 4 ms 8.5 MB'
spaDocument.body.textContent = spaDocument.body.innerText
new Function('window', 'location', 'document', hook!)(spaWindow, spaLocation, spaDocument)
await new Promise((resolve) => setTimeout(resolve, 10))

assert(spaReinjectReports.some(report => report.response?.id === '999000'), 'SPA reinjection should run submission page fallback even after network hooks are installed')
