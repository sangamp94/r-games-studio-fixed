export interface Env {
  GAMES_BUCKET: R2Bucket;
  MAIN_SITE_ORIGIN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const url = new URL(request.url);
    const objectKey = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    if (!objectKey || objectKey.includes("..")) {
      return new Response("Not Found", { status: 404 });
    }

    const object = await env.GAMES_BUCKET.get(objectKey);
    if (!object) {
      return new Response("Not Found", { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("ETag", object.httpEtag);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set(
      "Content-Security-Policy",
      `frame-ancestors ${env.MAIN_SITE_ORIGIN};`
    );
    headers.set("Access-Control-Allow-Origin", env.MAIN_SITE_ORIGIN);
    headers.set("Cross-Origin-Resource-Policy", "cross-origin");

    if (object.customMetadata?.coi === "true") {
      headers.set("Cross-Origin-Opener-Policy", "same-origin");
      headers.set("Cross-Origin-Embedder-Policy", "require-corp");
    }

    return new Response(request.method === "HEAD" ? null : object.body, {
      status: 200,
      headers,
    });
  },
};
