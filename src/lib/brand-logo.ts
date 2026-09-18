import logoAsset from "@/assets/poppik-logo.png.asset.json";

let cached: string | null | undefined;

/** Loads the POPPiK logo as a data URL for embedding in generated PDFs. */
export async function getLogoDataUrl(): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    const res = await fetch(logoAsset.url);
    if (!res.ok) throw new Error(`logo fetch failed: ${res.status}`);
    const blob = await res.blob();
    cached = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    cached = null;
  }
  return cached;
}
