export type ContentBlockType = 'heading' | 'paragraph' | 'image';

export interface BaseContentBlock {
  id: string;
  type: ContentBlockType;
  style?: React.CSSProperties;
}

export interface TextContentBlock extends BaseContentBlock {
  type: 'heading' | 'paragraph';
  content: string;
}

export interface ImageContentBlock extends BaseContentBlock {
  type: 'image';
  content: string;
  alt?: string;
  width?: string;
  height?: string;
}

export type ContentBlock = TextContentBlock | ImageContentBlock;

export interface PageStyle {
  backgroundColor?: string;
  textColor?: string;
  fontFamily?: string;
  maxWidth?: string;
  padding?: string;
}

export interface QRPageContent {
  title?: string;
  description?: string;
  blocks: ContentBlock[];
  style?: PageStyle;
}

export interface Creator {
  id?: string;
  firstName: string;
  lastName: string;
  email?: string;
}

export interface QRCodeResponse {
  id: string;
  code: string;
  type: string;
  oneTime: boolean;
  expiresAt: string | null;
  createdAt: string;
  pageId?: string;
  creator: Creator;
  url?: string; // Added URL field for site QR codes
  scannedAt?: string; // For scanned QR codes
  scanned?: boolean; // Whether the QR code was scanned by the user
  isValid: boolean; // Whether the QR code is still valid
  validatedAt: string | null; // When the QR code was validated
  payload: string | { content?: string; [key: string]: any }; // Relaxed payload shape
  title?: string; // Title for display in the UI
}

export interface GenerateQRResponse {
  qr: QRCodeResponse;
  url?: string;
  message?: string;
}

// Result shape returned by validate/scan-image endpoints used by Scan page
export interface HumanReadableScan {
  id: string;
  code: string;
  payload: string | { content?: string; [key: string]: any };
  type: string;
  oneTime: boolean;
  isValid: boolean;
  createdAt: string;
  validatedAt: string | null;
  expiresAt: string | null;
  creator: string;
}

export interface ScanResult {
  qr: QRCodeResponse | null;
  message: string;
  humanReadable?: HumanReadableScan;
}

export interface GeneratePageQRParams {
  title?: string;
  description?: string;
  blocks: ContentBlock[];
  style?: PageStyle;
}

export interface GenerateSimpleQRParams {
  payload: string | { content?: string; [key: string]: any };
  oneTime?: boolean;
  expiresAt?: string;
}

export interface QRHistoryResponse {
  items: QRCodeResponse[];
}
