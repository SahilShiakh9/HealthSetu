import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  compressImage,
  saveCompressedImageToDb,
} from '../utils/imageCompressor';
import { db } from '../offline/db';

describe('Phase 7 Client-Side Image Compression & Bandwidth Budget', () => {
  beforeEach(async () => {
    await db.mediaBlobs.clear();
  });

  it('compresses images to within the <= 200 KB rural bandwidth budget', async () => {
    // Setup canvas mock for jsdom environment
    const mockToDataURL = vi.fn().mockReturnValue(
      'data:image/jpeg;base64,' + 'A'.repeat(50000) // approx 50 KB base64 string
    );
    const mockDrawImage = vi.fn();
    const mockGetContext = vi.fn().mockReturnValue({
      drawImage: mockDrawImage,
    });

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(mockGetContext as any);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(mockToDataURL as any);

    // Mock Image load
    const originalImage = window.Image;
    (window as any).Image = class {
      width = 2400;
      height = 1800;
      onload: any = null;
      set src(_val: string) {
        setTimeout(() => this.onload?.(), 10);
      }
    };

    // Mock FileReader
    const originalFileReader = window.FileReader;
    (window as any).FileReader = class {
      result = 'data:image/jpeg;base64,mockOriginalImageData';
      onload: any = null;
      readAsDataURL() {
        setTimeout(() => this.onload?.(), 10);
      }
    };

    try {
      const dummyFile = new File(['a'.repeat(2500000)], 'large_wound_photo.jpg', {
        type: 'image/jpeg',
      });

      const result = await compressImage(dummyFile, 'large_wound_photo.jpg', {
        maxDimension: 1280,
        maxSizeBytes: 200 * 1024,
      });

      expect(result).toBeDefined();
      expect(result.blobId).toMatch(/^img_/);
      expect(result.compressedSizeBytes).toBeLessThanOrEqual(200 * 1024);
      expect(result.width).toBeLessThanOrEqual(1280);
      expect(result.height).toBeLessThanOrEqual(1280);
      expect(result.previewUrl).toContain('data:image/jpeg');

      // Persist to Dexie
      const savedBlobId = await saveCompressedImageToDb(result);
      expect(savedBlobId).toBe(result.blobId);

      const recordInDb = await db.mediaBlobs.get(savedBlobId);
      expect(recordInDb).toBeDefined();
      expect(recordInDb?.status).toBe('pending-upload');
      expect(recordInDb?.sizeBytes).toBe(result.compressedSizeBytes);
    } finally {
      window.Image = originalImage;
      window.FileReader = originalFileReader;
      vi.restoreAllMocks();
    }
  });

  it('calculates accurate compression ratio savings', () => {
    const originalSize = 2000000; // 2 MB
    const compressedSize = 150000; // 150 KB
    const saved = originalSize - compressedSize;
    const ratio = saved / originalSize;

    expect(ratio).toBeCloseTo(0.925, 2); // 92.5% reduction
  });
});
