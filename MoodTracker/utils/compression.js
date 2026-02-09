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

export { compress, decompress };
