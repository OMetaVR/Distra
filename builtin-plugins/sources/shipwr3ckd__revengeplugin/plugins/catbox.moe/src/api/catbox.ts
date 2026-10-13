import { storage } from "@vendetta/plugin";

export async function uploadToCatbox(media: any): Promise<string | null> {
  try {
    const fileUri =
      media?.item?.originalUri ||
      media?.uri ||
      media?.fileUri ||
      media?.path ||
      media?.sourceURL;

    if (!fileUri) throw new Error("Missing file URI");

    const filename = media.filename ?? "upload";
    const userhash = storage.userhash?.trim();

    const formData = new FormData();
    formData.append("reqtype", "fileupload");
    if (userhash) formData.append("userhash", userhash);
    formData.append("fileToUpload", {
      uri: fileUri,
      name: filename,
      type: media.mimeType ?? "application/octet-stream",
    } as any);

    const response = await fetch("https://catbox.moe/user/api.php", {
      method: "POST",
      body: formData,
    });

    const text = await response.text();
    if (!text.startsWith("https://")) throw new Error(text);
    return text;
  } catch (err) {
    console.error("[CatboxUploader] Upload failed:", err);
    return null;
  }
}