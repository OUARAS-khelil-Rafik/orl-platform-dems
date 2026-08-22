export type SupportChatAttachmentKind = 'image' | 'pdf';

export type SupportChatAttachment = {
  url: string;
  name: string;
  kind: SupportChatAttachmentKind;
  publicId?: string;
};

export const SUPPORT_CHAT_ATTACHMENT_ACCEPT = '.pdf,image/*';

const trimFileName = (fileName: string) => {
  return String(fileName || '')
    .split(/[\\/]/)
    .pop()
    ?.trim() || 'fichier';
};

export const getSupportChatAttachmentKind = (file: File): SupportChatAttachmentKind | null => {
  const mimeType = String(file.type || '').toLowerCase();
  const fileName = String(file.name || '').toLowerCase();

  if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
    return 'pdf';
  }

  if (mimeType.startsWith('image/')) {
    return 'image';
  }

  return null;
};

export const isSupportChatAttachmentFile = (file: File) => {
  return Boolean(getSupportChatAttachmentKind(file));
};

export const buildSupportChatAttachment = (file: File, url: string, publicId?: string): SupportChatAttachment | null => {
  const kind = getSupportChatAttachmentKind(file);
  const safeUrl = String(url || '').trim();
  if (!kind || !safeUrl) {
    return null;
  }

  return {
    url: safeUrl,
    name: trimFileName(file.name || 'fichier'),
    kind,
    publicId,
  };
};

export const buildSupportChatLastMessage = (text: string, attachment?: SupportChatAttachment | null, attachments?: SupportChatAttachment[]) => {
  const trimmedText = String(text || '').trim();
  const allAttachments = attachments?.length ? attachments : (attachment ? [attachment] : []);
  const attachmentLabels = allAttachments.map((att) => `${att.kind === 'pdf' ? 'PDF' : 'Photo'} : ${att.name}`);
  const attachmentLabel = attachmentLabels.join(', ');

  if (trimmedText && attachmentLabel) {
    return `${trimmedText} — ${attachmentLabel}`;
  }

  if (trimmedText) {
    return trimmedText;
  }

  if (attachmentLabel) {
    return attachmentLabel;
  }

  return '';
};
