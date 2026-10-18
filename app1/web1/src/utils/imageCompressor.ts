import { db } from '../offline/db';

export interface ImageCompressionOptions {
  maxDimension?: number; // Default 1280px
  maxSizeBytes?: number; // Default 200 KB (204,800 bytes)
  initialQuality?: number; // Default 0.82
  mimeType?: string; // Default 'image/jpeg'
}

export interface CompressedImageResult {
  blobId: string;
  blob: Blob;
  previewUrl: string;
  fileName: string;
  mimeType: string;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  width: number;
  height: number;
  compressionRatio: number; // e.g. 0.85 means 85% reduction
}

const DEFAULT_OPTIONS: Required<ImageCompressionOptions> = {
  maxDimension: 1280,
  maxSizeBytes: 200 * 1024, // 200 KB
  initialQuality: 0.82,
  mimeType: 'image/jpeg',
};

/**
 * Client-side canvas-based image downscaler & compressor.
 * Strips EXIF metadata and optimizes files to <= 200 KB for rural 2G connectivity.
 */
export async function compressImage(
  file: File | Blob,
  fileName = 'medical_photo.jpg',
  userOptions?: ImageCompressionOptions
): Promise<CompressedImageResult> {
  const options = { ...DEFAULT_OPTIONS, ...userOptions };
  const originalSizeBytes = file.size;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to parse image data'));
      img.onload = async () => {
        try {
          let { width, height } = img;
          const maxDim = options.maxDimension;

          // Scale dimensions while preserving aspect ratio
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            throw new Error('Canvas 2D context not available');
          }

          // Draw image to canvas (this automatically strips EXIF data for DPDP privacy)
          ctx.drawImage(img, 0, 0, width, height);

          // Iteratively compress quality if size exceeds budget
          let quality = options.initialQuality;
          let compressedBlob: Blob | null = null;
          let previewUrl = '';

          for (let attempt = 0; attempt < 4; attempt++) {
            const dataUrl = canvas.toDataURL(options.mimeType, quality);
            previewUrl = dataUrl;

            // Convert dataUrl to Blob
            const byteString = atob(dataUrl.split(',')[1]);
            const mimeType = dataUrl.split(',')[0].split(':')[1].split(';')[0];
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
              ia[i] = byteString.charCodeAt(i);
            }
            compressedBlob = new Blob([ab], { type: mimeType });

            if (compressedBlob.size <= options.maxSizeBytes || quality <= 0.4) {
              break;
            }

            // Reduce quality for next pass
            quality -= 0.15;
          }

          if (!compressedBlob) {
            throw new Error('Image compression failed to produce output blob');
          }

          const compressedSizeBytes = compressedBlob.size;
          const savedBytes = Math.max(0, originalSizeBytes - compressedSizeBytes);
          const compressionRatio = originalSizeBytes > 0 ? savedBytes / originalSizeBytes : 0;
          const blobId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

          resolve({
            blobId,
            blob: compressedBlob,
            previewUrl,
            fileName,
            mimeType: options.mimeType,
            originalSizeBytes,
            compressedSizeBytes,
            width,
            height,
            compressionRatio,
          });
        } catch (err) {
          reject(err);
        }
      };

      img.src = reader.result as string;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Persist compressed image directly into Dexie db.mediaBlobs
 */
export async function saveCompressedImageToDb(
  result: CompressedImageResult
): Promise<string> {
  await db.mediaBlobs.put({
    blobId: result.blobId,
    mime: result.mimeType,
    sizeBytes: result.compressedSizeBytes,
    blob: result.blob,
    status: 'pending-upload',
    createdAt: Date.now(),
  });
  return result.blobId;
}
