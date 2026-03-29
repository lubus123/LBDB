import http from 'http';

interface ApiResponse {
  status: number;
  data: any;
}

/** Make an HTTP request to the test server */
export function api(
  port: number,
  method: string,
  path: string,
  body?: any,
  token?: string,
): Promise<ApiResponse> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const payload = body ? JSON.stringify(body) : undefined;
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload).toString();

    const req = http.request({
      hostname: 'localhost',
      port,
      path,
      method,
      headers,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode!, data: data ? JSON.parse(data) : null });
        } catch {
          resolve({ status: res.statusCode!, data });
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}
