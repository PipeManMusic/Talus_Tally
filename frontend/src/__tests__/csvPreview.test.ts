import { describe, expect, it } from 'vitest';
import { parseCsvPreview, CsvParseError } from '../utils/csvPreview';

const makeFile = (content: string): File => ({
  text: () => Promise.resolve(content),
} as unknown as File);

describe('parseCsvPreview', () => {
  it('parses headers and sample rows from a basic CSV', async () => {
    const file = makeFile('name,type,notes\nGearbox,mechanical,Primary drive\nRotor,electrical,Auxiliary');

    const preview = await parseCsvPreview(file, { maxRows: 2 });

    expect(preview.headers).toEqual(['name', 'type', 'notes']);
    expect(preview.rows).toEqual([
      ['Gearbox', 'mechanical', 'Primary drive'],
      ['Rotor', 'electrical', 'Auxiliary'],
    ]);
  });

  it('handles quoted values with commas and trims whitespace', async () => {
    const file = makeFile('name,description\n"Motor, Primary","  drives core ",\n"Spare Rotor",""');

    const preview = await parseCsvPreview(file, { maxRows: 3 });

    expect(preview.headers).toEqual(['name', 'description']);
    expect(preview.rows).toEqual([
      ['Motor, Primary', 'drives core'],
      ['Spare Rotor', ''],
    ]);
  });

  it('throws on unterminated quoted value', async () => {
    const file = makeFile('name,description\n"Motor');

    await expect(parseCsvPreview(file)).rejects.toBeInstanceOf(CsvParseError);
  });
});
