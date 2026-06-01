import { describe, expect, it } from 'vitest';
import {
  buildSupportChatAttachment,
  buildSupportChatLastMessage,
  getSupportChatAttachmentKind,
  isSupportChatAttachmentFile,
} from '@/lib/utils/support-chat-attachments';

describe('support chat attachments', () => {
  it('accepts pdf files', () => {
    const file = new File(['pdf'], 'report.pdf', { type: 'application/pdf' });

    expect(getSupportChatAttachmentKind(file)).toBe('pdf');
    expect(isSupportChatAttachmentFile(file)).toBe(true);
  });

  it('accepts image files', () => {
    const file = new File(['png'], 'photo.png', { type: 'image/png' });

    expect(getSupportChatAttachmentKind(file)).toBe('image');
    expect(isSupportChatAttachmentFile(file)).toBe(true);
  });

  it('rejects unsupported files', () => {
    const file = new File(['txt'], 'notes.txt', { type: 'text/plain' });

    expect(getSupportChatAttachmentKind(file)).toBeNull();
    expect(isSupportChatAttachmentFile(file)).toBe(false);
  });

  it('builds a readable last message summary', () => {
    const attachment = buildSupportChatAttachment(
      new File(['pdf'], 'scan.pdf', { type: 'application/pdf' }),
      'https://example.com/scan.pdf',
    );

    expect(buildSupportChatLastMessage('', attachment)).toBe('PDF : scan.pdf');
    expect(buildSupportChatLastMessage('Bonjour', attachment)).toBe('Bonjour — PDF : scan.pdf');
  });
});
