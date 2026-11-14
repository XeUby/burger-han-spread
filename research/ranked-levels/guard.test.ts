import { test } from 'node:test'
import assert from 'node:assert/strict'
import { allowMutation, nextAvailable } from './guard.ts'
test('ranked mutation deadline is exclusive; reads remain available', () => {
  for (const method of ['POST', 'DELETE']) {
    assert.equal(allowMutation(999, 1000, method), true)
    assert.equal(allowMutation(1000, 1000, method), false)
    assert.equal(allowMutation(1001, 1000, method), false)
  }
  assert.equal(allowMutation(1001, 1000, 'GET'), true)
})
test('scheduler skips occupied levels without discarding their runs', () => {
  const queue = [{level:1,run:2},{level:2,run:1},{level:1,run:3}]
  assert.deepEqual(nextAvailable(queue,new Set([1])), {level:2,run:1})
  assert.equal(nextAvailable(queue,new Set([1])), undefined)
  assert.equal(queue.length,2)
  assert.deepEqual(nextAvailable(queue,new Set()), {level:1,run:2})
})
