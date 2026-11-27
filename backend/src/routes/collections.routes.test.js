import test from 'node:test';
import assert from 'node:assert';
import {
  extractDriveFileIdsFromFolderHtml,
  isDriveFolderUrl,
  normalizeDriveFolderUrl,
  normalizeImportedClinicalCaseRows,
  sanitizeClinicalCasePayload,
  sanitizeQcmPayload,
  sanitizeDiagramPayload,
} from './collections.routes.js';

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

test('isDriveFolderUrl should detect a Drive folder URL with usp=drive_link', () => {
  const url = 'https://drive.google.com/drive/folders/1he3ekNZ0OTlWjNyh8Rn519Zzqk-4Lj8x?usp=drive_link';
  assert.strictEqual(isDriveFolderUrl(url), true);
});

test('extractDriveFileIdsFromFolderHtml should extract multiple image file IDs from a Drive folder HTML', () => {
  const html = `
    <a href="https://drive.google.com/file/d/1ZxYwVuTsRqPoNmLkJiHg/view">Figure 01.jpeg</a>
    <a href="https://drive.google.com/file/d/1a2b3c4d5e6f7g8h9i0j/view">Figure 02.jpeg</a>
    <a href="https://drive.google.com/drive/folders/1FolderIdExample1234567890"></a>
  `;

  const { fileIds, folderIds } = extractDriveFileIdsFromFolderHtml(html, '1FolderIdExample1234567890');

  assert.deepStrictEqual(fileIds.sort(), ['1ZxYwVuTsRqPoNmLkJiHg', '1a2b3c4d5e6f7g8h9i0j'].sort());
  assert.deepStrictEqual(folderIds, []);
});

// ── Cas cliniques : les questions sont importées même si les réponses sont vides ──
// Même logique que les parties QCM et QROC : réponse manquante => statut "pas_encore",
// aucune bonne réponse sélectionnée par défaut, mais la question n'est jamais ignorée.

test('clinical case import keeps QCM question when no correct answer is provided', () => {
  const { cases, invalidRows } = normalizeImportedClinicalCaseRows([
    {
      videoTitle: 'ORL',
      caseNumber: '1',
      description: 'Cas clinique...',
      qcmQuestion: 'Quel est le diagnostic ?',
      qcmOptions: ['Otite moyenne', 'Cholestéatome', 'Otite externe'],
      qcmCorrectOptionIndexes: [],
    },
  ]);

  assert.strictEqual(invalidRows.length, 0);
  assert.strictEqual(cases.length, 1);
  assert.strictEqual(cases[0].questions.length, 1);

  const question = cases[0].questions[0];
  assert.strictEqual(question.kind, 'qcm');
  assert.strictEqual(question.prompt, 'Quel est le diagnostic ?');
  assert.deepStrictEqual(question.correctOptionIndexes, []);
  assert.strictEqual(question.correctOptionIndex, null);
  assert.strictEqual(question.qcmStatus, 'pas_encore');
});

test('clinical case import keeps QROC question when answer is empty', () => {
  const { cases } = normalizeImportedClinicalCaseRows([
    {
      videoTitle: 'ORL',
      caseNumber: '1',
      description: 'Cas clinique...',
      openQuestion: 'Quel traitement proposer ?',
      openAnswer: '',
    },
  ]);

  assert.strictEqual(cases[0].questions.length, 1);
  const question = cases[0].questions[0];
  assert.strictEqual(question.kind, 'open');
  assert.strictEqual(question.prompt, 'Quel traitement proposer ?');
  assert.strictEqual(question.answer, '');
  assert.strictEqual(question.answerStatus, 'pas_encore');
});

test('clinical case import keeps selector question when no correct answer is provided', () => {
  const { cases } = normalizeImportedClinicalCaseRows([
    {
      videoTitle: 'ORL',
      caseNumber: '1',
      description: 'Cas clinique...',
      selectQuestion: 'Quelle structure est atteinte ?',
      selectOptions: ['Tympan', 'Cochlée', 'Marteau'],
      selectCorrectOptionIndexes: [],
    },
  ]);

  assert.strictEqual(cases[0].questions.length, 1);
  const question = cases[0].questions[0];
  assert.strictEqual(question.kind, 'select');
  assert.strictEqual(question.prompt, 'Quelle structure est atteinte ?');
  assert.strictEqual(question.correctOptionIndex, null);
  assert.deepStrictEqual(question.correctOptionIndexes, []);
  assert.strictEqual(question.qcmStatus, 'pas_encore');
});

test('clinical case import keeps QCM/QROC/selector with empty answers together on the same case', () => {
  const { cases } = normalizeImportedClinicalCaseRows([
    {
      videoTitle: 'ORL',
      caseNumber: '1',
      description: 'Cas clinique...',
      qcmQuestion: 'QCM sans réponse ?',
      qcmOptions: ['A', 'B'],
      qcmCorrectOptionIndexes: [],
      openQuestion: 'QROC sans réponse ?',
      openAnswer: '',
      selectQuestion: 'Sélecteur sans réponse ?',
      selectOptions: ['X', 'Y'],
      selectCorrectOptionIndexes: [],
    },
  ]);

  const kinds = cases[0].questions.map((q) => q.kind).sort();
  assert.deepStrictEqual(kinds, ['open', 'qcm', 'select']);
});

test('clinical case questions with empty answers survive sanitizeClinicalCasePayload', () => {
  const { cases } = normalizeImportedClinicalCaseRows([
    {
      videoTitle: 'ORL',
      caseNumber: '1',
      description: 'Cas clinique...',
      qcmQuestion: 'QCM sans réponse ?',
      qcmOptions: ['A', 'B'],
      qcmCorrectOptionIndexes: [],
      openQuestion: 'QROC sans réponse ?',
      openAnswer: '',
      selectQuestion: 'Sélecteur sans réponse ?',
      selectOptions: ['X', 'Y'],
      selectCorrectOptionIndexes: [],
    },
  ]);

  const sanitized = sanitizeClinicalCasePayload({ ...cases[0], videoId: 'video-1' });
  assert.strictEqual(sanitized.questions.length, 3);

  const qcm = sanitized.questions.find((q) => q.kind === 'qcm');
  const open = sanitized.questions.find((q) => q.kind === 'open');
  const select = sanitized.questions.find((q) => q.kind === 'select');

  assert.strictEqual(qcm.qcmStatus, 'pas_encore');
  assert.deepStrictEqual(qcm.correctOptionIndexes, []);
  assert.strictEqual(open.answerStatus, 'pas_encore');
  assert.strictEqual(select.qcmStatus, 'pas_encore');
});

test('/clinicalCases/import inserts clinical-case questions even when answers are empty', async () => {
  const express = (await import('express')).default;
  const mongoose = (await import('mongoose')).default;
  const { default: router } = await import('./collections.routes.js');

  const inserted = { clinicalCases: [], videos: [] };
  const fakeCollection = (name) => ({
    find: () => ({ toArray: async () => [] }),
    insertOne: async (doc) => { inserted.videos.push(doc); return { insertedId: 'vid-1' }; },
    insertMany: async (docs) => { inserted.clinicalCases.push(...docs); return { insertedCount: docs.length }; },
    updateOne: async () => ({ acknowledged: true }),
  });

  const previousDb = mongoose.connection.db;
  mongoose.connection.db = { collection: fakeCollection };

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/data', router);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/data/clinicalCases/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: [
          {
            videoTitle: 'ORL',
            caseNumber: '1',
            description: 'Cas clinique...',
            qcmQuestion: 'QCM sans réponse ?',
            qcmOptions: ['A', 'B'],
            qcmCorrectOptionIndexes: [],
            openQuestion: 'QROC sans réponse ?',
            openAnswer: '',
            selectQuestion: 'Sélecteur sans réponse ?',
            selectOptions: ['X', 'Y'],
            selectCorrectOptionIndexes: [],
          },
        ],
      }),
    });

    assert.strictEqual(response.status, 201);
    const body = await response.json();
    assert.strictEqual(body.imported, 1);
    assert.deepStrictEqual(body.invalidRows, []);

    assert.strictEqual(inserted.clinicalCases.length, 1);
    const questions = inserted.clinicalCases[0].questions;
    assert.strictEqual(questions.length, 3);

    const qcm = questions.find((q) => q.kind === 'qcm');
    const open = questions.find((q) => q.kind === 'open');
    const select = questions.find((q) => q.kind === 'select');

    assert.ok(qcm, 'QCM question must not be ignored');
    assert.strictEqual(qcm.qcmStatus, 'pas_encore');
    assert.ok(open, 'QROC question must not be ignored');
    assert.strictEqual(open.answerStatus, 'pas_encore');
    assert.ok(select, 'Selector question must not be ignored');
    assert.strictEqual(select.qcmStatus, 'pas_encore');
  } finally {
    server.close();
    mongoose.connection.db = previousDb;
  }
});

// ── "Au lieu d'ignoré, écrasé" : les doublons sont écrasés / re-modifiés, pas ignorés ──

const buildApp = async () => {
  const express = (await import('express')).default;
  const mongoose = (await import('mongoose')).default;
  const { default: router } = await import('./collections.routes.js');
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/data', router);
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  return { mongoose, server, port: server.address().port };
};

test('clinical case question duplicates are overwritten (last wins), not ignored', () => {
  const sanitized = sanitizeClinicalCasePayload({
    videoId: 'v',
    title: 'Cas',
    questions: [
      { id: 'q1', kind: 'open', prompt: 'Question ?', answer: '', answerStatus: 'pas_encore' },
      { id: 'q2', kind: 'open', prompt: 'Question ?', answer: 'Réponse finale', answerStatus: 'termine' },
    ],
  });

  assert.strictEqual(sanitized.questions.length, 1);
  assert.strictEqual(sanitized.questions[0].id, 'q2');
  assert.strictEqual(sanitized.questions[0].answer, 'Réponse finale');
  assert.strictEqual(sanitized.questions[0].answerStatus, 'termine');
});

test('clinical-case question with empty answer is kept, not ignored', () => {
  const sanitized = sanitizeClinicalCasePayload({
    videoId: 'v',
    title: 'Cas',
    questions: [{ id: 'q1', kind: 'open', prompt: 'Question ?', answer: '', answerStatus: 'pas_encore' }],
  });
  assert.strictEqual(sanitized.questions.length, 1);
  assert.strictEqual(sanitized.questions[0].answerStatus, 'pas_encore');
});

test('/clinicalCases/import overwrites an already existing clinical case instead of skipping it', async () => {
  const { mongoose, server, port } = await buildApp();
  const previousDb = mongoose.connection.db;
  const updates = [];
  let inserted = [];

  mongoose.connection.db = {
    collection: (name) => ({
      find: () => ({
        toArray: async () => {
          if (name === 'videos') return [{ _id: 'vid-1', title: 'ORL' }];
          if (name === 'clinicalCases') return [{ _id: 'case-existing', videoId: 'vid-1', title: 'Cas clinique 1 — ORL' }];
          return [];
        },
      }),
      insertOne: async (doc) => ({ insertedId: 'vid-x' }),
      insertMany: async (docs) => { inserted = docs; return { insertedCount: docs.length }; },
      updateOne: async (filter, update) => { updates.push({ filter, update }); return { acknowledged: true }; },
    }),
  };

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/data/clinicalCases/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: [{ videoTitle: 'ORL', caseNumber: '1', description: 'Cas clinique...', openQuestion: 'QROC sans réponse ?', openAnswer: '' }],
      }),
    });

    assert.strictEqual(response.status, 201);
    const body = await response.json();
    assert.strictEqual(body.skippedDuplicates, 0, 'nothing should be reported as ignored');
    assert.strictEqual(body.overwritten, 1);
    assert.strictEqual(inserted.length, 0, 'existing case should be updated, not re-added');

    const caseUpdate = updates.find((u) => u.filter._id === 'case-existing');
    assert.ok(caseUpdate, 'existing clinical case must be overwritten');
    assert.strictEqual(caseUpdate.update.$set.questions.length, 1, 'QROC question must be present on overwrite');
    assert.strictEqual(caseUpdate.update.$set.questions[0].answerStatus, 'pas_encore');
  } finally {
    server.close();
    mongoose.connection.db = previousDb;
  }
});

test('/qcms/import overwrites an already existing QCM instead of skipping it', async () => {
  const { mongoose, server, port } = await buildApp();
  const previousDb = mongoose.connection.db;
  const updates = [];
  let inserted = [];

  mongoose.connection.db = {
    collection: (name) => ({
      find: () => ({
        toArray: async () => {
          if (name === 'videos') return [{ _id: 'vid-1', title: 'ORL' }];
          if (name === 'qcms') return [{ _id: 'qcm-existing', videoId: 'vid-1', question: 'Question ?' }];
          return [];
        },
      }),
      insertOne: async () => ({ insertedId: 'vid-x' }),
      insertMany: async (docs) => { inserted = docs; return { insertedCount: docs.length }; },
      updateOne: async (filter, update) => { updates.push({ filter, update }); return { acknowledged: true }; },
    }),
  };

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/data/qcms/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: [{ videoTitle: 'ORL', question: 'Question ?', options: ['A', 'B'], correctOptionIndexes: [], answer: undefined }],
      }),
    });

    assert.strictEqual(response.status, 201);
    const body = await response.json();
    assert.strictEqual(body.skippedDuplicates, 0, 'nothing should be reported as ignored');
    assert.strictEqual(body.overwritten, 1);
    assert.strictEqual(inserted.length, 0, 'existing QCM should be updated, not re-added');

    const qcmUpdate = updates.find((u) => u.filter._id === 'qcm-existing');
    assert.ok(qcmUpdate, 'existing QCM must be overwritten');
    // QCM sans bonne réponse conservé + statut pas_encore (logique QCM)
    assert.deepStrictEqual(qcmUpdate.update.$set.correctOptionIndexes, []);
    assert.strictEqual(qcmUpdate.update.$set.qcmStatus, 'pas_encore');
  } finally {
    server.close();
    mongoose.connection.db = previousDb;
  }
});

test('/openQuestions/import overwrites an already existing QROC instead of skipping it', async () => {
  const { mongoose, server, port } = await buildApp();
  const previousDb = mongoose.connection.db;
  const updates = [];
  let inserted = [];

  mongoose.connection.db = {
    collection: (name) => ({
      find: () => ({
        toArray: async () => {
          if (name === 'videos') return [{ _id: 'vid-1', title: 'ORL' }];
          if (name === 'openQuestions') return [{ _id: 'qroc-existing', videoId: 'vid-1', question: 'Question ?' }];
          return [];
        },
      }),
      insertOne: async () => ({ insertedId: 'vid-x' }),
      insertMany: async (docs) => { inserted = docs; return { insertedCount: docs.length }; },
      updateOne: async (filter, update) => { updates.push({ filter, update }); return { acknowledged: true }; },
    }),
  };

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/data/openQuestions/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: [{ videoTitle: 'ORL', question: 'Question ?', answer: '' }],
      }),
    });

    assert.strictEqual(response.status, 201);
    const body = await response.json();
    assert.strictEqual(body.skippedDuplicates, 0, 'nothing should be reported as ignored');
    assert.strictEqual(body.overwritten, 1);
    assert.strictEqual(inserted.length, 0, 'existing QROC should be updated, not re-added');

    const qrocUpdate = updates.find((u) => u.filter._id === 'qroc-existing');
    assert.ok(qrocUpdate, 'existing QROC must be overwritten');
    // QROC sans réponse conservé + statut pas_encore (logique QROC)
    assert.strictEqual(qrocUpdate.update.$set.answer, '');
    assert.strictEqual(qrocUpdate.update.$set.answerStatus, 'pas_encore');
  } finally {
    server.close();
    mongoose.connection.db = previousDb;
  }
});

// ── Règle unifiée du statut de réponse (QCM / Cas Clinique / QROC / Schéma) ──
// réponse vide -> Pas encore ; réponses toutes FALSE -> Pas encore ; sinon -> Terminé

test('QROC status: empty answer -> pas_encore, all FALSE -> pas_encore, else termine', async () => {
  const { normalizeImportedOpenQuestionRow } = await import('./collections.routes.js');
  const video = { videoTitle: 'ORL', question: 'Q ?' };

  assert.strictEqual(normalizeImportedOpenQuestionRow({ ...video, answer: '' }, 1).row.answerStatus, 'pas_encore');
  assert.strictEqual(normalizeImportedOpenQuestionRow({ ...video, answer: '   ' }, 1).row.answerStatus, 'pas_encore');
  assert.strictEqual(normalizeImportedOpenQuestionRow({ ...video, answer: 'FALSE' }, 1).row.answerStatus, 'pas_encore');
  assert.strictEqual(normalizeImportedOpenQuestionRow({ ...video, answer: 'false' }, 1).row.answerStatus, 'pas_encore');
  assert.strictEqual(normalizeImportedOpenQuestionRow({ ...video, answer: 'faux' }, 1).row.answerStatus, 'pas_encore');
  assert.strictEqual(normalizeImportedOpenQuestionRow({ ...video, answer: 'Une réponse' }, 1).row.answerStatus, 'termine');

  // réponse normalisée : FALSE pur => vide ; vraie réponse conservée
  assert.strictEqual(normalizeImportedOpenQuestionRow({ ...video, answer: 'FALSE' }, 1).row.answer, '');
  assert.strictEqual(normalizeImportedOpenQuestionRow({ ...video, answer: 'Non' }, 1).row.answer, 'Non');
  assert.strictEqual(normalizeImportedOpenQuestionRow({ ...video, answer: 'Non' }, 1).row.answerStatus, 'termine');
});

test('QCM status: no correct answer / all FALSE -> pas_encore, at least one TRUE -> termine', () => {
  const sanitized = (row) => sanitizeClinicalCasePayload({ videoId: 'v', title: 'Cas', questions: [row] }).questions[0];

  // QCM dans cas clinique
  assert.strictEqual(sanitized({ id: 'q', kind: 'qcm', prompt: 'Q ?', options: ['A', 'B'], correctOptionIndexes: [] }).qcmStatus, 'pas_encore');
  assert.strictEqual(sanitized({ id: 'q', kind: 'qcm', prompt: 'Q ?', options: ['A', 'B'], correctOptionIndexes: [], correctOptionIndex: null }).qcmStatus, 'pas_encore');
  assert.strictEqual(sanitized({ id: 'q', kind: 'qcm', prompt: 'Q ?', options: ['A', 'B'], correctOptionIndexes: [1] }).qcmStatus, 'termine');
  // Sélecteur dans cas clinique
  assert.strictEqual(sanitized({ id: 'q', kind: 'select', prompt: 'Q ?', options: ['A', 'B'], correctOptionIndex: null }).qcmStatus, 'pas_encore');
  assert.strictEqual(sanitized({ id: 'q', kind: 'select', prompt: 'Q ?', options: ['A', 'B'], correctOptionIndexes: [] }).qcmStatus, 'pas_encore');
  assert.strictEqual(sanitized({ id: 'q', kind: 'select', prompt: 'Q ?', options: ['A', 'B'], correctOptionIndex: 1 }).qcmStatus, 'termine');
  // QROC dans cas clinique : vide / FALSE -> pas_encore
  assert.strictEqual(sanitized({ id: 'q', kind: 'open', prompt: 'Q ?', answer: '' }).answerStatus, 'pas_encore');
  assert.strictEqual(sanitized({ id: 'q', kind: 'open', prompt: 'Q ?', answer: 'FALSE' }).answerStatus, 'pas_encore');
  assert.strictEqual(sanitized({ id: 'q', kind: 'open', prompt: 'Q ?', answer: 'Une réponse' }).answerStatus, 'termine');
});

test('QCM sanitize: qcmStatus derived from correct answers, not trusted blindly', () => {
  const base = { videoId: 'v', question: 'Q ?', options: ['A', 'B'] };
  assert.strictEqual(sanitizeQcmPayload({ ...base, correctOptionIndexes: [], correctOptionIndex: null, qcmStatus: 'termine' }).qcmStatus, 'pas_encore');
  assert.strictEqual(sanitizeQcmPayload({ ...base, correctOptionIndexes: [0], correctOptionIndex: 0, qcmStatus: 'pas_encore' }).qcmStatus, 'termine');
});

test('Schéma status: no annotation -> pas_encore, marker(s) -> termine', () => {
  const noMarkers = sanitizeDiagramPayload({ videoId: 'v', title: 'S', imageUrl: '', markers: [] });
  assert.strictEqual(noMarkers.diagramStatus, 'pas_encore');

  const withMarkers = sanitizeDiagramPayload({ videoId: 'v', title: 'S', imageUrl: '', markers: [{ number: 1, label: 'Tympan', x: 10, y: 10, description: '' }] });
  assert.strictEqual(withMarkers.diagramStatus, 'termine');
});
