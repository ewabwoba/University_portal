import { ValidationError } from '../../../../shared/domain/domain-error.js';
import { Email } from './email.vo.js';

describe('Email', () => {
  it('normalises case and surrounding whitespace so uniqueness is case-insensitive', () => {
    expect(Email.create('  Jane.Doe@University.AC.KE ').value).toBe(
      'jane.doe@university.ac.ke',
    );
    expect(Email.create('A@b.co').equals(Email.create('a@B.CO'))).toBe(true);
  });

  it.each([
    '',
    '   ',
    'no-at-sign',
    'two@@signs.com',
    'spaces in@mail.com',
    'missing@tld',
    `${'a'.repeat(250)}@x.com`,
  ])('rejects %j', (raw) => {
    expect(() => Email.create(raw)).toThrow(ValidationError);
  });
});
