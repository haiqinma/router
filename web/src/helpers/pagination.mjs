export function writePagedRows(previousRows, page, pageSize, pageRows) {
  const normalizedRows = Array.isArray(previousRows) ? [...previousRows] : [];
  const normalizedPage = Number(page) > 0 ? Number(page) : 1;
  const normalizedPageSize = Number(pageSize) > 0 ? Number(pageSize) : 1;
  const nextRows = Array.isArray(pageRows) ? pageRows : [];
  const startIndex = (normalizedPage - 1) * normalizedPageSize;
  nextRows.forEach((row, idx) => {
    normalizedRows[startIndex + idx] = row;
  });
  return normalizedRows;
}

export function hasLoadedPagedRows(rows, page, pageSize) {
  if (!Array.isArray(rows)) {
    return false;
  }
  const normalizedPage = Number(page) > 0 ? Number(page) : 1;
  const normalizedPageSize = Number(pageSize) > 0 ? Number(pageSize) : 1;
  const startIndex = (normalizedPage - 1) * normalizedPageSize;
  const endIndex = startIndex + normalizedPageSize;
  for (let idx = startIndex; idx < endIndex; idx += 1) {
    if (idx in rows && rows[idx]) {
      return true;
    }
  }
  return false;
}
