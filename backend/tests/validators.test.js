const {
  isValidEmail,
  isValidCPF,
  formatCPF,
  isValidCNPJ,
  formatCNPJ,
  isValidPassword,
  getPasswordErrors,
  sanitize,
  isValidPhone,
} = require('../src/utils/validators');

describe('Validators', () => {
  describe('isValidEmail', () => {
    test('accepts valid emails', () => {
      expect(isValidEmail('usuario@empresa.com')).toBe(true);
      expect(isValidEmail('joao.silva@gmail.com')).toBe(true);
      expect(isValidEmail('admin@ponto-digital.com.br')).toBe(true);
      expect(isValidEmail('user+tag@domain.co')).toBe(true);
      expect(isValidEmail('test.user@sub.domain.com')).toBe(true);
    });

    test('rejects invalid emails', () => {
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail(null)).toBe(false);
      expect(isValidEmail(undefined)).toBe(false);
      expect(isValidEmail('email_sem_arroba')).toBe(false);
      expect(isValidEmail('email@')).toBe(false);
      expect(isValidEmail('@dominio.com')).toBe(false);
      expect(isValidEmail('email@dominio')).toBe(false);
      expect(isValidEmail('email @dominio.com')).toBe(false);
      expect(isValidEmail('email@dominio .com')).toBe(false);
      expect(isValidEmail(123)).toBe(false);
    });

    test('trims surrounding spaces', () => {
      expect(isValidEmail('  user@domain.com  ')).toBe(true);
    });
  });

  describe('isValidCPF', () => {
    test('accepts valid CPF values', () => {
      expect(isValidCPF('52998224725')).toBe(true);
      expect(isValidCPF('529.982.247-25')).toBe(true);
    });

    test('rejects invalid CPF values', () => {
      expect(isValidCPF('')).toBe(false);
      expect(isValidCPF(null)).toBe(false);
      expect(isValidCPF(undefined)).toBe(false);
      expect(isValidCPF('00000000000')).toBe(false);
      expect(isValidCPF('11111111111')).toBe(false);
      expect(isValidCPF('12345678900')).toBe(false);
      expect(isValidCPF('123')).toBe(false);
      expect(isValidCPF('1234567890123')).toBe(false);
      expect(isValidCPF(12345678901)).toBe(false);
    });
  });

  describe('formatCPF', () => {
    test('removes non numeric characters', () => {
      expect(formatCPF('529.982.247-25')).toBe('52998224725');
      expect(formatCPF('123.456.789-09')).toBe('12345678909');
    });

    test('preserves emptyish values', () => {
      expect(formatCPF(null)).toBe(null);
      expect(formatCPF(undefined)).toBe(undefined);
      expect(formatCPF('')).toBe('');
    });
  });

  describe('isValidCNPJ', () => {
    test('accepts valid CNPJ values', () => {
      expect(isValidCNPJ('11222333000181')).toBe(true);
      expect(isValidCNPJ('11.222.333/0001-81')).toBe(true);
    });

    test('rejects invalid CNPJ values', () => {
      expect(isValidCNPJ('')).toBe(false);
      expect(isValidCNPJ(null)).toBe(false);
      expect(isValidCNPJ(undefined)).toBe(false);
      expect(isValidCNPJ('00000000000000')).toBe(false);
      expect(isValidCNPJ('11111111111111')).toBe(false);
      expect(isValidCNPJ('123')).toBe(false);
      expect(isValidCNPJ('12345678901234')).toBe(false);
    });
  });

  describe('formatCNPJ', () => {
    test('removes non numeric characters', () => {
      expect(formatCNPJ('11.222.333/0001-81')).toBe('11222333000181');
    });

    test('preserves emptyish values', () => {
      expect(formatCNPJ(null)).toBe(null);
      expect(formatCNPJ(undefined)).toBe(undefined);
    });
  });

  describe('isValidPassword', () => {
    test('accepts strong passwords', () => {
      expect(isValidPassword('SenhaForte123')).toBe(true);
      expect(isValidPassword('SenhaMuitoForte123!')).toBe(true);
      expect(isValidPassword('Abcdef12')).toBe(true);
    });

    test('rejects invalid passwords', () => {
      expect(isValidPassword('')).toBe(false);
      expect(isValidPassword(null)).toBe(false);
      expect(isValidPassword(undefined)).toBe(false);
      expect(isValidPassword('12345')).toBe(false);
      expect(isValidPassword('abcdef')).toBe(false);
      expect(isValidPassword(123456)).toBe(false);
    });
  });

  describe('getPasswordErrors', () => {
    test('returns no errors for a strong password', () => {
      expect(getPasswordErrors('SenhaForte123')).toHaveLength(0);
    });

    test('returns errors for null password', () => {
      const errors = getPasswordErrors(null);
      expect(errors.length).toBeGreaterThan(0);
    });

    test('returns minimum length error for short passwords', () => {
      const errors = getPasswordErrors('123');
      expect(errors).toContain('Senha deve ter no mínimo 8 caracteres.');
    });
  });

  describe('sanitize', () => {
    test('trims strings', () => {
      expect(sanitize('  hello  ')).toBe('hello');
      expect(sanitize('  Joao Silva  ')).toBe('Joao Silva');
    });

    test('keeps non string values untouched', () => {
      expect(sanitize(null)).toBe(null);
      expect(sanitize(undefined)).toBe(undefined);
      expect(sanitize(123)).toBe(123);
    });
  });

  describe('isValidPhone', () => {
    test('accepts valid phones', () => {
      expect(isValidPhone('11999887766')).toBe(true);
      expect(isValidPhone('1133445566')).toBe(true);
      expect(isValidPhone('(11) 99988-7766')).toBe(true);
    });

    test('returns true for empty optional phone values', () => {
      expect(isValidPhone('')).toBe(true);
      expect(isValidPhone(null)).toBe(true);
      expect(isValidPhone(undefined)).toBe(true);
    });

    test('rejects invalid phones', () => {
      expect(isValidPhone('123')).toBe(false);
      expect(isValidPhone('123456789012345')).toBe(false);
    });
  });
});
