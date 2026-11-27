import { describe, it, expect } from 'vitest';
import {
  parseClinicalCaseImportFile,
  mapImportedClinicalCaseObject,
} from '../components/features/admin/content-manager';

// Cas cliniques : les questions sont importées même si les réponses sont vides (pas de réponse).
// Même logique que les parties QCM et QROC.

describe('mapImportedClinicalCaseObject', () => {
  it('keeps a QCM question in a clinical case when no answer is selected', () => {
    const payload = mapImportedClinicalCaseObject({
      'NOM VIDEO': 'ORL',
      'N CAS CLINIQUE': '1',
      'ENONCE (CAS CLINIQUE)': 'Cas clinique...',
      'ENONCE (QCM)': 'Quel est le diagnostic ?',
      A: 'Otite moyenne',
      B: 'Cholestéatome',
      'REPONSE A': 'FALSE',
      'REPONSE B': 'FALSE',
    });

    expect(payload).not.toBeNull();
    expect(payload?.qcmQuestion).toBe('Quel est le diagnostic ?');
    expect(payload?.qcmCorrectOptionIndexes).toEqual([]);
  });

  it('keeps a QROC question in a clinical case when the answer is empty', () => {
    const payload = mapImportedClinicalCaseObject({
      'NOM VIDEO': 'ORL',
      'N CAS CLINIQUE': '1',
      'ENONCE (CAS CLINIQUE)': 'Cas clinique...',
      'ENONCE (QROC)': 'Quel traitement ?',
      'REPONSE (QROC)': '',
    });

    expect(payload).not.toBeNull();
    expect(payload?.openQuestion).toBe('Quel traitement ?');
    expect(payload?.openAnswer).toBe('');
  });

  it('keeps a selector question in a clinical case when no answer is selected', () => {
    const payload = mapImportedClinicalCaseObject({
      'NOM VIDEO': 'ORL',
      'N CAS CLINIQUE': '1',
      'ENONCE (CAS CLINIQUE)': 'Cas clinique...',
      'ENONCE (SELECTEUR)': 'Quelle structure ?',
      'A (SELECTEUR)': 'Tympan',
      'B (SELECTEUR)': 'Cochlée',
      'REPONSE A (SELECTEUR)': 'FALSE',
      'REPONSE B (SELECTEUR)': 'FALSE',
    });

    expect(payload).not.toBeNull();
    expect(payload?.selectQuestion).toBe('Quelle structure ?');
    expect(payload?.selectCorrectOptionIndexes).toEqual([]);
  });

  it('does not drop a clinical-case question row just because answers are empty', () => {
    const payload = mapImportedClinicalCaseObject({
      'NOM VIDEO': 'ORL',
      'ENONCE (QCM)': 'QCM sans réponse ?',
      'ENONCE (QROC)': 'QROC sans réponse ?',
      'ENONCE (SELECTEUR)': 'Sélecteur sans réponse ?',
    });

    expect(payload).not.toBeNull();
    expect(payload?.qcmQuestion).toBe('QCM sans réponse ?');
    expect(payload?.openQuestion).toBe('QROC sans réponse ?');
    expect(payload?.selectQuestion).toBe('Sélecteur sans réponse ?');
  });
});

describe('parseClinicalCaseImportFile', () => {
  it('imports clinical-case questions with empty answers from CSV', async () => {
    const header = [
      'NOM VIDEO', 'N CAS CLINIQUE', 'ENONCE (CAS CLINIQUE)',
      'ENONCE (QCM)', 'A', 'B', 'REPONSE A', 'REPONSE B',
      'ENONCE (QROC)', 'REPONSE (QROC)',
      'ENONCE (SELECTEUR)', 'A (SELECTEUR)', 'B (SELECTEUR)', 'REPONSE A (SELECTEUR)', 'REPONSE B (SELECTEUR)',
    ].join(';');
    const row = [
      'ORL', '1', 'Cas clinique...',
      'QCM sans réponse ?', 'Oui', 'Non', 'FALSE', 'FALSE',
      'QROC sans réponse ?', '',
      'Sélecteur sans réponse ?', 'X', 'Y', 'FALSE', 'FALSE',
    ].join(';');
    const file = new File([`${header}\n${row}\n`], 'cas.csv', { type: 'text/csv' });

    const rows = await parseClinicalCaseImportFile(file);

    expect(rows.length).toBe(1);
    expect(rows[0].qcmQuestion).toBe('QCM sans réponse ?');
    expect(rows[0].qcmCorrectOptionIndexes).toEqual([]);
    expect(rows[0].openQuestion).toBe('QROC sans réponse ?');
    expect(rows[0].openAnswer).toBe('');
    expect(rows[0].selectQuestion).toBe('Sélecteur sans réponse ?');
    expect(rows[0].selectCorrectOptionIndexes).toEqual([]);
  });
});
