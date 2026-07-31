import assert from 'node:assert/strict';
import { hasLoadedPagedRows, writePagedRows } from '../src/helpers/pagination.mjs';

const ITEMS_PER_PAGE = 10;

function testJumpToFarPageWritesAtAbsoluteOffset() {
  const firstPageRows = Array.from({ length: ITEMS_PER_PAGE }, (_, idx) => `p1-${idx}`);
  const hundredthPageRows = Array.from({ length: ITEMS_PER_PAGE }, (_, idx) => `p100-${idx}`);
  const merged = writePagedRows(firstPageRows, 100, ITEMS_PER_PAGE, hundredthPageRows);

  assert.equal(merged.length, 1000, 'expected sparse cache to extend to the requested page');
  assert.deepEqual(
    merged.slice(0, ITEMS_PER_PAGE),
    firstPageRows,
    'expected existing first-page rows to stay intact'
  );
  assert.deepEqual(
    merged.slice(990, 1000),
    hundredthPageRows,
    'expected far page rows to land at the correct absolute offset'
  );
  assert.equal(
    hasLoadedPagedRows(merged, 100, ITEMS_PER_PAGE),
    true,
    'expected explicitly written far page to be treated as loaded'
  );
  assert.equal(
    hasLoadedPagedRows(merged, 50, ITEMS_PER_PAGE),
    false,
    'expected sparse empty page before the far page to be treated as not loaded'
  );
}

function testRewriteLoadedPageReplacesOnlyThatPage() {
  const firstPageRows = Array.from({ length: ITEMS_PER_PAGE }, (_, idx) => `p1-${idx}`);
  const secondPageRows = Array.from({ length: ITEMS_PER_PAGE }, (_, idx) => `p2-${idx}`);
  const seed = writePagedRows(firstPageRows, 2, ITEMS_PER_PAGE, secondPageRows);
  const updatedSecondPageRows = Array.from({ length: ITEMS_PER_PAGE }, (_, idx) => `p2b-${idx}`);
  const merged = writePagedRows(seed, 2, ITEMS_PER_PAGE, updatedSecondPageRows);

  assert.deepEqual(
    merged.slice(0, ITEMS_PER_PAGE),
    firstPageRows,
    'expected unrelated pages to remain unchanged'
  );
  assert.deepEqual(
    merged.slice(10, 20),
    updatedSecondPageRows,
    'expected targeted page rows to be overwritten in place'
  );
}

testJumpToFarPageWritesAtAbsoluteOffset();
testRewriteLoadedPageReplacesOnlyThatPage();

console.log('writePagedRows tests passed');
