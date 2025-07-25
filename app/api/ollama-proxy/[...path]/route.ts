import { NextRequest, NextResponse } from 'next/server';

const OLLAMA_BASE_URL = 'https://dypai.ccxai.uk';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  return handleRequest(request, resolvedParams, 'GET');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  return handleRequest(request, resolvedParams, 'POST');
}

async function handleRequest(
  request: NextRequest,
  params: { path: string[] },
  method: string
) {
  try {
    // Reconstruct the path from the dynamic route segments
    const path = params.path.join('/');
    const targetUrl = `${OLLAMA_BASE_URL}/${path}`;
    
    // Preserve query parameters
    const url = new URL(targetUrl);
    const searchParams = new URL(request.url).searchParams;
    searchParams.forEach((value, key) => {
      url.searchParams.set(key, value);
    });

    // Prepare headers - exclude host and other problematic headers
    const headers = new Headers();
    const excludeHeaders = new Set([
      'host',
      'x-forwarded-for',
      'x-forwarded-host',
      'x-forwarded-proto',
      'x-real-ip',
      'connection',
      'upgrade',
      'sec-websocket-key',
      'sec-websocket-version',
      'sec-websocket-extensions'
    ]);

    request.headers.forEach((value, key) => {
      if (!excludeHeaders.has(key.toLowerCase())) {
        headers.set(key, value);
      }
    });

    // Prepare request options
    const requestOptions: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(30000), // 30 second timeout
    };

    // Add body for POST requests
    if (method === 'POST' && request.body) {
      requestOptions.body = request.body;
      requestOptions.duplex = 'half'; // Required for streaming request bodies
    }

    // Make the proxied request
    const response = await fetch(url.toString(), requestOptions);

    // Create response headers with CORS
    const responseHeaders = new Headers();
    
    // Copy important headers from the upstream response including compression headers
    ['content-type', 'content-length', 'content-encoding', 'cache-control'].forEach(headerName => {
      const headerValue = response.headers.get(headerName);
      if (headerValue) {
        responseHeaders.set(headerName, headerValue);
      }
    });

    // Ensure proper CORS headers
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Return response with original body stream
    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });

  } catch (error) {
    console.error('Ollama proxy error:', error);
    
    // Return structured error response following the existing pattern
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Proxy request failed',
      timestamp: new Date().toISOString(),
    }, { 
      status: error instanceof Error && error.name === 'AbortError' ? 408 : 502,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  }
}

// Handle preflight CORS requests
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
} 