import {
  buildInteractivePublishManifestJson,
  buildInteractivePublishPointerJson,
  type InteractiveDeploymentAdapter,
  type InteractiveDeploymentReceipt,
  type InteractivePublishSnapshot,
} from "./resumeInteractivePublishing";

export interface MultipartInteractiveDeploymentAdapterOptions {
  endpoint: string;
  credentials?: RequestCredentials;
  headers?:
    | Record<string, string>
    | (() => Record<string, string>);
  fetchImpl?: typeof fetch;
}

/**
 * Generic deployment adapter for a future Werkpages/backend publish endpoint.
 *
 * Request:
 *   multipart/form-data
 *     indexHtml  -> immutable standalone HTML
 *     manifest   -> immutable deployment manifest
 *     pointer    -> mutable slug pointer body
 *
 * Expected JSON response:
 *   {
 *     publicUrl: string,
 *     publishedAt?: string,
 *     artifactKey?: string,
 *     provider?: string
 *   }
 *
 * The adapter intentionally does not know anything about S3, CloudFront,
 * Cloudflare, Netlify, etc. The server owns credentials, atomic pointer
 * switching, DNS/TLS work and slug collision enforcement.
 */
export function createMultipartInteractiveDeploymentAdapter(
  options: MultipartInteractiveDeploymentAdapterOptions,
): InteractiveDeploymentAdapter {
  return {
    async publish(
      snapshot: InteractivePublishSnapshot,
    ): Promise<InteractiveDeploymentReceipt> {
      const fetchImpl =
        options.fetchImpl ??
        (
          typeof fetch !== "undefined"
            ? fetch
            : undefined
        );

      if (!fetchImpl) {
        throw new Error(
          "No fetch implementation is available for Interactive publishing.",
        );
      }

      const endpoint = options.endpoint.trim();
      if (!endpoint) {
        throw new Error(
          "Interactive deployment endpoint is missing.",
        );
      }

      const form = new FormData();
      form.append(
        "indexHtml",
        new Blob([snapshot.html], {
          type: "text/html;charset=utf-8",
        }),
        "index.html",
      );
      form.append(
        "manifest",
        new Blob(
          [
            buildInteractivePublishManifestJson(
              snapshot,
            ),
          ],
          {
            type: "application/json;charset=utf-8",
          },
        ),
        "manifest.json",
      );
      form.append(
        "pointer",
        new Blob(
          [
            buildInteractivePublishPointerJson(
              snapshot,
            ),
          ],
          {
            type: "application/json;charset=utf-8",
          },
        ),
        "current.json",
      );

      const headers =
        typeof options.headers === "function"
          ? options.headers()
          : options.headers;

      const response = await fetchImpl(
        endpoint,
        {
          method: "POST",
          body: form,
          credentials:
            options.credentials ?? "include",
          headers,
        },
      );

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = undefined;
      }

      if (!response.ok) {
        const detail =
          body &&
          typeof body === "object" &&
          "message" in body
            ? String(
                (body as { message?: unknown })
                  .message ?? "",
              )
            : "";

        throw new Error(
          detail ||
            `Interactive deployment failed (${response.status}).`,
        );
      }

      if (!body || typeof body !== "object") {
        throw new Error(
          "Interactive deployment returned an invalid response.",
        );
      }

      const source = body as Record<
        string,
        unknown
      >;
      const publicUrl =
        typeof source.publicUrl === "string"
          ? source.publicUrl.trim()
          : "";

      if (!publicUrl) {
        throw new Error(
          "Interactive deployment response did not include publicUrl.",
        );
      }

      return {
        publicUrl,
        publishedAt:
          typeof source.publishedAt === "string"
            ? source.publishedAt
            : undefined,
        artifactKey:
          typeof source.artifactKey === "string"
            ? source.artifactKey
            : undefined,
        provider:
          typeof source.provider === "string"
            ? source.provider
            : undefined,
      };
    },
  };
}
