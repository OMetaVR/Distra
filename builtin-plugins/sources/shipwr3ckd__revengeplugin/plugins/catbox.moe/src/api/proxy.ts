import { getRandomString } from "../lib/utils";
import settings from "../pages/settings";

export async function uploadToProxy(
  media: any,
  {
    uploadId = getRandomString(8),
    filename,
    proxyBaseUrl,
    userhash,
    destination,
    duration = "1h",
    revProxy = settings.revProxy,
  }: {
    uploadId: string;
    filename: string;
    proxyBaseUrl: string;
    userhash?: string;
    destination: "catbox" | "litterbox" | "pomf";
    duration?: string;
    revProxy?: string;
  }
): Promise<string | null> {
  try {
    const fileUri =
      media?.item?.originalUri ||
      media?.uri ||
      media?.fileUri ||
      media?.path ||
      media?.sourceURL;

    if (!fileUri) throw new Error("Missing file URI");

    const formData = new FormData();
    formData.append("destination", destination);
    formData.append("time", duration);
    if (userhash) formData.append("userhash", userhash);

    formData.append("file", {
      uri: fileUri,
      name: filename,
      type: media.mimeType ?? "application/octet-stream",
    } as any);

    const response = await fetch(`${proxyBaseUrl}/direct`, {
      method: "POST",
      body: formData,
    });

    const json = await response.json();
    if (!response.ok || !json?.url) throw new Error(json?.error ?? "Unknown upload error");

    if (revProxy) {
      try {
        const original = new URL(json.url);
        const fname = original.pathname.split("/").pop();
        return `${proxyBaseUrl}/${destination}/${fname}`;
      } catch {
        return json.url;
      }
    }

    return json.url;
  } catch {
    return null;
  }
}