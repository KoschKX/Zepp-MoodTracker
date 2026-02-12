function compress(obj) {
  const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return str.replace(/"/g, '');
}

function decompress(str) {
  try {
  return str;
  } catch {
    return str;
  }
}

function deepMergeNoZero(target, source) {
    for (const y in source) {
    if (!target[y]) target[y] = {};
        for (const m in source[y]) {
            if (!target[y][m]) target[y][m] = {};
            for (const d in source[y][m]) {
            const val = source[y][m][d];
            if (val !== 0) {
                target[y][m][d] = val;
            } else if (target[y][m][d] !== undefined) {
                // Remove the entry if value is 0
                delete target[y][m][d];
            }
            }
        }
    }
    return target;
}

function deepMerge(target, source) {
    for (const y in source) {
        if (!target[y]) target[y] = {};
        for (const m in source[y]) {
            if (!target[y][m]) target[y][m] = {};
            for (const d in source[y][m]) {
            target[y][m][d] = source[y][m][d];
            }
        }
    }
    return target;
}

export { compress, decompress, deepMergeNoZero, deepMerge };
