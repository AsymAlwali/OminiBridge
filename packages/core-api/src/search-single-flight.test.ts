import assert from 'node:assert/strict'
import { test } from 'node:test'
import { coalesceSearchMiss, getInFlightSearchCount } from './search-single-flight.js'

test('shares one active search miss among concurrent callers', async () => {
  let releaseOperation!: () => void
  const operationGate = new Promise<void>((resolve) => {
    releaseOperation = resolve
  })
  const outcome = { body: { success: true, results: [] }, status: 200 as const }
  let calls = 0

  const requests = Array.from({ length: 8 }, () => coalesceSearchMiss('same-search', async () => {
    calls += 1
    await operationGate
    return outcome
  }))

  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls, 1)
  assert.equal(getInFlightSearchCount(), 1)
  releaseOperation()
  assert.deepEqual(await Promise.all(requests), Array.from({ length: 8 }, () => outcome))
  assert.equal(getInFlightSearchCount(), 0)
})

test('removes rejected work so a later search can retry', async () => {
  await assert.rejects(
    coalesceSearchMiss('retry-search', async () => {
      throw new Error('search failed')
    }),
    /search failed/
  )
  assert.equal(getInFlightSearchCount(), 0)

  const outcome = { body: { success: true }, status: 200 as const }
  assert.deepEqual(
    await coalesceSearchMiss('retry-search', async () => outcome),
    outcome
  )
})
