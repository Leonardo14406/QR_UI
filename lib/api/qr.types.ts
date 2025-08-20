export type ContentBlockType = 'heading' | 'paragraph' | 'image';

export interface BaseContentBlock {
  id: string;
  type: ContentBlockType;
  style?: React.CSSProperties;
}

export interface TextContentBlock extends BaseContentBlock {
  type: 'heading' | 'paragraph';
  text: string;
}

export interface ImageContentBlock extends BaseContentBlock {
  type: 'image';
  url: string;
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
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface QRCodeResponse {
  id: string;
  code: string;
  type: string;
  oneTime: boolean;
  expiresAt?: string;
  createdAt: string;
  pageId?: string;
  creator: Creator;
  url?: string; // Added URL field for site QR codes
  scannedAt?: string; // For scanned QR codes
  scanned?: boolean; // Whether the QR code was scanned by the user
  isValid?: boolean; // Whether the QR code is still valid
  validatedAt?: string; // When the QR code was validated
  payload?: any; // The payload of the QR code
  title?: string; // Title for display in the UI
}

export interface GenerateQRResponse {
  qr: QRCodeResponse;
  url?: string;
}

export interface GeneratePageQRParams {
  title?: string;
  description?: string;
  blocks: ContentBlock[];
  style?: PageStyle;
}

export interface GenerateSimpleQRParams {
  payload: string;
  oneTime?: boolean;
  expiresAt?: string;
}

export interface QRHistoryResponse {
  items: QRCodeResponse[];
}
