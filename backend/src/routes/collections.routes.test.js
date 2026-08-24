import test from 'node:test';
import assert from 'node:assert';
import {
  extractDriveFileIdsFromFolderHtml,
  isDriveFolderUrl,
  normalizeDriveFolderUrl,
} from './data.routes.js';

test('extractDriveFileIdsFromFolderHtml should extract file IDs from embedded Drive folder HTML', () => {
  const html = `
    <a href="https://drive.google.com/open?id=1a2b3c4d5e6f7g8h9i0j"></a>
    <img src="https://lh3.googleusercontent.com/abcdefg" />
    <div data-id="1ZxYwVuTsRqPoNmLkJiHg"></div>
    <a href="https://drive.google.com/drive/folders/1FolderIdExample1234567890"></a>
    <a href="https://drive.google.com/drive/folders/1NestedFolderIdExample123456789"></a>
  `;

  const { fileIds, folderIds } = extractDriveFileIdsFromFolderHtml(html, '1FolderIdExample1234567890');

  assert.deepStrictEqual(fileIds.sort(), ['1ZxYwVuTsRqPoNmLkJiHg', '1a2b3c4d5e6f7g8h9i0j'].sort());
  assert.deepStrictEqual(folderIds, ['1NestedFolderIdExample123456789']);
});

test('isDriveFolderUrl should detect Drive folder URLs', () => {
  const urls = [
    'https://drive.google.com/drive/folders/1FolderIdExample1234567890',
    'https://drive.google.com/embeddedfolderview?id=1FolderIdExample1234567890',
    'https://docs.google.com/drive/folders/1FolderIdExample1234567890',
  ];

  for (const url of urls) {
    assert.strictEqual(isDriveFolderUrl(url), true);
  }
});

test('normalizeDriveFolderUrl should preserve resourcekey and sharing parameters', () => {
  const url = 'https://drive.google.com/drive/folders/1FolderIdExample1234567890?usp=sharing&resourcekey=ABC123';
  const normalized = normalizeDriveFolderUrl(url);

  assert.ok(normalized.includes('drive/folders/1FolderIdExample1234567890'));
  assert.ok(normalized.includes('usp=sharing'));
  assert.ok(normalized.includes('resourcekey=ABC123'));
});
