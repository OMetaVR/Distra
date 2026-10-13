export async function uploadToPomf(media: any): Promise<string | null> {
  try {
    const fileUri =
      media?.item?.originalUri ||
      media?.uri ||
      media?.fileUri ||
      media?.path ||
      media?.sourceURL;

    if (!fileUri) throw new Error("Missing file URI");

    const filename = media.filename ?? "upload";

    const formData = new FormData();
    formData.append("files[]", {
      uri: fileUri,
      name: filename,
      type: media.mimeType ?? "application/octet-stream",
    } as any);

    const response = await fetch("https://pomf.lain.la/upload.php", {
      method: "POST",
      body: formData,
    });

    const json = await response.json();

    if (!json?.success) {
      throw new Error(json?.error ?? "Unknown error");
    }

    const fileInfo = json?.files?.[0];
    if (!fileInfo?.url) throw new Error("No URL returned from Pomf");

    return fileInfo.url;
  } catch (err) {
    console.error("[PomfUploader] Upload failed:", err);
    return null;
  }
}