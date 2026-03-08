import { Hono } from "npm:hono";
import { Buffer } from "node:buffer";

interface UploadRouteDeps {
  supabase: any;
  bucketName: string;
}

export function createUploadRoutes(deps: UploadRouteDeps) {
  const upload = new Hono();

  upload.post("/upload-snapshot", async (c) => {
    try {
      const { image, plantId } = await c.req.json();
      if (!image) return c.json({ error: "No image data" }, 400);
      if (!plantId) return c.json({ error: "No plantId provided" }, 400);

      const matches = image.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!matches) {
        return c.json({ error: "Invalid image format", details: "Could not parse base64 data" }, 400);
      }

      const fileExt = matches[1] || "png";
      const base64Data = matches[2];
      const bytes = Buffer.from(base64Data, "base64");
      const timestamp = Date.now();
      const sanitizedPlantId = plantId.toString().replace(/[^a-zA-Z0-9]/g, "-");
      const fileName = `snapshot-${timestamp}.${fileExt}`;
      const filePath = `${sanitizedPlantId}/${fileName}`;

      const { error: uploadError } = await deps.supabase.storage
        .from(deps.bucketName)
        .upload(filePath, bytes, {
          contentType: `image/${fileExt}`,
          upsert: true,
        });

      if (uploadError) {
        const isNotFoundError = uploadError.message?.toLowerCase().includes("not found") ||
          (uploadError as any).status === 404 ||
          (uploadError as any).statusCode === "404" ||
          (uploadError as any).status === 400;

        if (isNotFoundError) {
          const { error: createError } = await deps.supabase.storage.createBucket(deps.bucketName, {
            public: true,
            fileSizeLimit: 20971520,
          });
          if (createError && !createError.message?.includes("already exists")) {
            console.error("Failed to create bucket during retry:", createError);
          }
          await new Promise((resolve) => setTimeout(resolve, 500));

          const { error: retryError } = await deps.supabase.storage
            .from(deps.bucketName)
            .upload(filePath, bytes, {
              contentType: `image/${fileExt}`,
              upsert: true,
            });

          if (retryError) throw retryError;
        } else {
          throw uploadError;
        }
      }

      const { data: signedUrlData, error: signedUrlError } = await deps.supabase.storage
        .from(deps.bucketName)
        .createSignedUrl(filePath, 31536000);

      if (signedUrlError) throw signedUrlError;

      return c.json({ success: true, url: signedUrlData.signedUrl, path: filePath });
    } catch (err: any) {
      console.error("Upload route catch block:", err);
      return c.json({
        error: "Failed to upload snapshot",
        details: err.message || "Unknown error during upload process",
        success: false,
      }, 500);
    }
  });

  return upload;
}
