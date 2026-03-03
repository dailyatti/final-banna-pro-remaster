export enum AspectRatio {
  SQUARE = "1:1",
  PORTRAIT = "3:4",
  LANDSCAPE = "4:3",
  MOBILE = "9:16",
  YOUTUBE = "16:9",
}

export type ExportFormat = 'image/png' | 'image/jpeg' | 'image/webp';

export interface ImageMetadata {
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
}

export type ProcessStatus = 'idle' | 'processing' | 'success' | 'error';

export interface ImageItem {
  id: string;
  originalFile: File;
  previewUrl: string; // Object URL for display
  metadata: ImageMetadata;

  // Processing State
  status: ProcessStatus;
  errorMessage?: string;

  // Result
  resultUrl?: string;
  resultMetadata?: ImageMetadata;
}

export interface GenerationSettings {
  prompt: string;
  aspectRatio: AspectRatio;
  exportFormat: ExportFormat;
}

export interface CreditInfo {
  sessionGenerations: number;
  estimatedSessionCost: number;
  costPerImage: number;
}