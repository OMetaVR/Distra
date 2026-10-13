import { uploadToCatbox } from "../api/catbox";
import { uploadToLitterbox } from "../api/litterbox";
import { getRandomString } from "./utils";

export function createWarmupFile() {
  const randomName = `warmup_${getRandomString()}.bin`;
  const sizeInBytes = Math.floor(Math.random() * 1_048_576) + 1;

  return {
    uri: "data:application/octet-stream;base64,AA==",
    filename: randomName,
    mimeType: "application/octet-stream",
    preCompressionSize: sizeInBytes,
  };
}

export function warmUpUploader() {
  setTimeout(async () => {
    const file = createWarmupFile();

    try {
      const catboxLink = await uploadToCatbox(file);
      console.log(`[WarmUp] Catbox upload complete: ${catboxLink}`);
    } catch (err) {
      console.warn("[WarmUp] Catbox upload failed:", err);
    }

    try {
      const litterboxLink = await uploadToLitterbox(file, "1h");
      console.log(`[WarmUp] Litterbox upload complete: ${litterboxLink}`);
    } catch (err) {
      console.warn("[WarmUp] Litterbox upload failed:", err);
    }
  }, 0);
}