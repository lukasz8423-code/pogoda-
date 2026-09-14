import { Capacitor, CapacitorHttp } from '@capacitor/core';

/**
 * A hybrid fetch utility that uses Capacitor Native HTTP on native platforms
 * to bypass CORS, and standard fetch on web with strict timeout.
 */
export async function smartFetch(url: string, options: any = {}, timeoutMs = 5000) {
  const isNative = Capacitor.isNativePlatform();

  if (isNative) {
    const method = (options.method || 'GET').toUpperCase();
    let bodyData = options.body;
    if (typeof bodyData === 'string') {
      try {
        bodyData = JSON.parse(bodyData);
      } catch (e) {
        // Keep raw string if not JSON
      }
    }

    const httpOptions = {
      url,
      params: options.params || {},
      headers: options.headers || {},
      data: bodyData,
    };

    const requestPromise = (async () => {
      let response;
      if (method === 'POST') {
        response = await CapacitorHttp.post(httpOptions);
      } else if (method === 'PUT') {
        response = await CapacitorHttp.put(httpOptions);
      } else if (method === 'DELETE') {
        response = await CapacitorHttp.delete(httpOptions);
      } else if (method === 'PATCH') {
        response = await CapacitorHttp.patch(httpOptions);
      } else {
        response = await CapacitorHttp.get(httpOptions);
      }

      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        json: async () => response.data,
        text: async () => typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
      };
    })();

    let timeoutId: any;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Native HTTP timeout after ${timeoutMs}ms for ${url}`));
      }, timeoutMs);
    });

    try {
      const result: any = await Promise.race([requestPromise, timeoutPromise]);
      clearTimeout(timeoutId);
      return result;
    } catch (err) {
      clearTimeout(timeoutId);
      console.error(`Native fetch failed for ${url}:`, err);
      throw err;
    }
  }

  // Web fallback with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: options.signal || controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}
