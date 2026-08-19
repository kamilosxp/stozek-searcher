function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(fetchFn, url, token, maxRetries, delayMs) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const res = await fetchFn(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) await sleep(delayMs);
    }
  }
  throw new Error(`Request to ${url} failed after ${maxRetries} attempts: ${lastError.message}`);
}

async function fetchProducts(token, options = {}) {
  const {
    fetchFn = fetch,
    baseUrl = 'https://www.stozek.pl/webapi/rest/products',
    limit = 50,
    maxRetries = 3,
    delayMs = 200,
  } = options;

  const all = [];
  let page = 1;
  let totalPages = 1;

  do {
    const url = `${baseUrl}?page=${page}&limit=${limit}`;
    const data = await fetchPage(fetchFn, url, token, maxRetries, delayMs);
    all.push(...(data.list || []));
    totalPages = data.pages || 1;
    page += 1;
    if (page <= totalPages) await sleep(delayMs);
  } while (page <= totalPages);

  return all;
}

module.exports = { fetchProducts };
