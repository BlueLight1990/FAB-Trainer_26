/**
 * Image processing utilities for mobile and web.
 * Resizes and compresses images to JPEG Data URLs to store safely in IndexedDB
 * without consuming excessive storage.
 */

export interface CompressImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

export function compressImageFile(
  file: File,
  options: CompressImageOptions = {}
): Promise<string> {
  const { maxWidth = 1200, maxHeight = 1200, quality = 0.82 } = options;

  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Die ausgewählte Datei ist kein gültiges Bild.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Fehler beim Einlesen der Bilddatei.'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Fehler beim Decodieren des Bildes.'));
      img.onload = () => {
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          if (width / maxWidth > height / maxHeight) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        // Fill white background in case of transparent PNG/WebP to prevent black artifacts in JPEG
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.drawImage(img, 0, 0, width, height);

        try {
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl);
        } catch (canvasErr) {
          // Fallback to original read if canvas fails
          resolve(e.target?.result as string);
        }
      };

      img.src = e.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
}
