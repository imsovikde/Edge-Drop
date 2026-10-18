import type { DiffLine, DiffResult } from '../../shared/types'

/**
 * Tokenize string into words, whitespace, and punctuation for intra-line diffing.
 */
function tokenizeWords(str: string): string[] {
  const matches = str.match(/\s+|[a-zA-Z0-9]+|[^\s\w]/g)
  return matches || (str ? [str] : [])
}

/**
 * Longest Common Subsequence (LCS) matrix computation for generic arrays.
 */
function computeLCS<T>(a: T[], b: T[], equals: (x: T, y: T) => boolean): { lcs: T[]; diffOps: Array<{ type: 'common' | 'add' | 'remove'; itemA?: T; itemB?: T }> } {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (equals(a[i], b[j])) {
        dp[i + 1][j + 1] = dp[i][j] + 1
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }

  // Backtrack to assemble diff sequence
  let i = m
  let j = n
  const reversedOps: Array<{ type: 'common' | 'add' | 'remove'; itemA?: T; itemB?: T }> = []

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && equals(a[i - 1], b[j - 1])) {
      reversedOps.push({ type: 'common', itemA: a[i - 1], itemB: b[j - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      reversedOps.push({ type: 'add', itemB: b[j - 1] })
      j--
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      reversedOps.push({ type: 'remove', itemA: a[i - 1] })
      i--
    }
  }

  const diffOps = reversedOps.reverse()
  const lcs = diffOps.filter((op) => op.type === 'common').map((op) => op.itemA!)
  return { lcs, diffOps }
}

/**
 * Intra-line word-level diff between an old line and a new line.
 */
export function computeIntraLineDiff(
  oldLine: string,
  newLine: string
): {
  oldTokens: { type: 'common' | 'remove'; value: string }[]
  newTokens: { type: 'common' | 'add'; value: string }[]
} {
  const tokensA = tokenizeWords(oldLine)
  const tokensB = tokenizeWords(newLine)

  const { diffOps } = computeLCS(tokensA, tokensB, (x, y) => x === y)

  const oldTokens: { type: 'common' | 'remove'; value: string }[] = []
  const newTokens: { type: 'common' | 'add'; value: string }[] = []

  for (const op of diffOps) {
    if (op.type === 'common') {
      oldTokens.push({ type: 'common', value: op.itemA! })
      newTokens.push({ type: 'common', value: op.itemB! })
    } else if (op.type === 'remove') {
      oldTokens.push({ type: 'remove', value: op.itemA! })
    } else if (op.type === 'add') {
      newTokens.push({ type: 'add', value: op.itemB! })
    }
  }

  return { oldTokens, newTokens }
}

/**
 * Compute line-by-line diff between two text strings.
 */
export function computeDiff(oldText: string, newText: string): DiffResult {
  const linesA = oldText ? oldText.split(/\r?\n/) : []
  const linesB = newText ? newText.split(/\r?\n/) : []

  const { diffOps } = computeLCS(linesA, linesB, (x, y) => x === y)

  const lines: DiffLine[] = []
  let lineNumA = 1
  let lineNumB = 1
  let additions = 0
  let deletions = 0
  let unchanged = 0

  for (let idx = 0; idx < diffOps.length; idx++) {
    const op = diffOps[idx]

    if (op.type === 'common') {
      lines.push({
        type: 'common',
        value: op.itemA!,
        lineA: lineNumA++,
        lineB: lineNumB++
      })
      unchanged++
    } else if (op.type === 'remove') {
      // Check if next op is 'add' for intra-line highlighting
      const nextOp = diffOps[idx + 1]
      let intraOld: { type: 'add' | 'remove' | 'common'; value: string }[] | undefined

      if (nextOp && nextOp.type === 'add') {
        const intra = computeIntraLineDiff(op.itemA!, nextOp.itemB!)
        intraOld = intra.oldTokens
      }

      lines.push({
        type: 'remove',
        value: op.itemA!,
        lineA: lineNumA++,
        intraLineChanges: intraOld
      })
      deletions++
    } else if (op.type === 'add') {
      // Check if previous op was 'remove' for intra-line highlighting
      const prevOp = diffOps[idx - 1]
      let intraNew: { type: 'add' | 'remove' | 'common'; value: string }[] | undefined

      if (prevOp && prevOp.type === 'remove') {
        const intra = computeIntraLineDiff(prevOp.itemA!, op.itemB!)
        intraNew = intra.newTokens
      }

      lines.push({
        type: 'add',
        value: op.itemB!,
        lineB: lineNumB++,
        intraLineChanges: intraNew
      })
      additions++
    }
  }

  return {
    lines,
    stats: {
      additions,
      deletions,
      unchanged
    }
  }
}

/**
 * Format a DiffResult into standard Git unified patch text for 1-click clipboard copy.
 */
export function formatUnifiedDiff(diff: DiffResult, labelA = 'Previous Copy', labelB = 'Current Content'): string {
  const header = `--- a/${labelA}\n+++ b/${labelB}\n@@ -1,${diff.stats.deletions + diff.stats.unchanged} +1,${diff.stats.additions + diff.stats.unchanged} @@\n`
  const body = diff.lines
    .map((line) => {
      const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '
      return `${prefix}${line.value}`
    })
    .join('\n')
  return header + body
}
