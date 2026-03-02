const {
  isValidEmail,
  isValidCPF,
  formatCPF,
  isValidCNPJ,
  formatCNPJ,
  isValidPassword,
  getPasswordErrors,
  sanitize,
  isValidPhone
} = require('../src/utils/validators');

describe('Validators', () => {

  // ─── E-MAIL ──────────────────────────────────────────────
  describe('isValidEmail', () => {
    test('aceita e-mails válidos', () => {
      expect(isValidEmail('usuario@empresa.com')).toBe(true);
      expect(isValidEmail('joao.silva@gmail.com')).toBe(true);
      expect(isValidEmail('admin@ponto-digital.com.br')).toBe(true);
      expect(isValidEmail('user+tag@domain.co')).toBe(true);
      expect(isValidEmail('test.user@sub.domain.com')).toBe(true);
    });

    test('rejeita e-mails inválidos', () => {
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

    test('trata espaços ao redor', () => {
      expect(isValidEmail('  user@domain.com  ')).toBe(true);
    });
  });

  // ─── CPF ──────────────────────────────────────────────────
  describe('isValidCPF', () => {
    test('aceita CPFs válidos', () => {
      expect(isValidCPF('52998224725')).toBe(true);       // CPF válido sem máscara
      expect(isValidCPF('529.982.247-25')).toBe(true);    // CPF válido com máscara
    });

    test('rejeita CPFs inválidos', () => {
      expect(isValidCPF('')).toBe(false);
      expect(isValidCPF(null)).toBe(false);
      expect(isValidCPF(undefined)).toBe(false);
      expect(isValidCPF('00000000000')).toBe(false);
      expect(isValidCPF('11111111111')).toBe(false);
      expect(isValidCPF('12345678900')).toBe(false);
      expect(isValidCPF('123')).toBe(false);
      expect(isValidCPF('1234567890123')).toBe(false);    // 13 dígitos
      expect(isValidCPF(12345678901)).toBe(false);        // número
    });

    test('rejeita CPFs com todos dígitos iguais', () => {
      for (let i = 0; i <= 9; i++) {
        expect(isValidCPF(String(i).repeat(11))).toBe(false);
      }
    });
  });

  describe('formatCPF', () => {
    test('remove caracteres não numéricos', () => {
      expect(formatCPF('529.982.247-25')).toBe('52998224725');
      expect(formatCPF('123.456.789-09')).toBe('12345678909');
    });

    test('retorna undefined/null para valores vazios', () => {
      expect(formatCPF(null)).toBe(null);
      expect(formatCPF(undefined)).toBe(undefined);
      expect(formatCPF('')).toBe('');
    });
  });

  // ─── CNPJ ──────────────────────────────────────────────────
  describe('isValidCNPJ', () => {
    test('aceita CNPJs válidos', () => {
      expect(isValidCNPJ('11222333000181')).toBe(true);
      expect(isValidCNPJ('11.222.333/0001-81')).toBe(true);
    });

    test('rejeita CNPJs inválidos', () => {
      expect(isValidCNPJ('')).toBe(false);
      expect(isValidCNPJ(null)).toBe(false);
      expect(isValidCNPJ(undefined)).toBe(false);
      expect(isValidCNPJ('00000000000000')).toBe(false);
      expect(isValidCNPJ('11111111111111')).toBe(false);
      expect(isValidCNPJ('123')).toBe(false);
      expect(isValidCNPJ('12345678901234')).toBe(false);  // dígitos verificadores errados
    });

    test('rejeita CNPJs com todos dígitos iguais', () => {
      for (let i = 0; i <= 9; i++) {
        expect(isValidCNPJ(String(i).repeat(14))).toBe(false);
      }
    });
  });

  describe('formatCNPJ', () => {
    test('remove caracteres não numéricos', () => {
      expect(formatCNPJ('11.222.333/0001-81')).toBe('11222333000181');
    });

    test('retorna undefined/null para valores vazios', () => {
      expect(formatCNPJ(null)).toBe(null);
      expect(formatCNPJ(undefined)).toBe(undefined);
    });
  });

  // ─── SENHA ──────────────────────────────────────────────────
  describe('isValidPassword', () => {
    test('aceita senhas válidas (>= 6 chars)', () => {
      expect(isValidPassword('123456')).toBe(true);
      expect(isValidPassword('senhaMuitoForte123!')).toBe(true);
      expect(isValidPassword('abcdef')).toBe(true);
    });

    test('rejeita senhas inválidas', () => {
      expect(isValidPassword('')).toBe(false);
      expect(isValidPassword(null)).toBe(false);
      expect(isValidPassword(undefined)).toBe(false);
      expect(isValidPassword('12345')).toBe(false);       // 5 chars
      expect(isValidPassword('abc')).toBe(false);
      expect(isValidPassword(123456)).toBe(false);         // número
    });
  });

  describe('getPasswordErrors', () => {
    test('retorna array vazio para senhas válidas', () => {
      expect(getPasswordErrors('123456')).toHaveLength(0);
    });

    test('retorna erros para senha nula', () => {
      const errors = getPasswordErrors(null);
      expect(errors.length).toBeGreaterThan(0);
    });

    test('retorna erro para senha curta', () => {
      const errors = getPasswordErrors('123');
      expect(errors).toContain('Senha deve ter no mínimo 6 caracteres.');
    });
  });

  // ─── SANITIZE ──────────────────────────────────────────────
  describe('sanitize', () => {
    test('remove espaços em branco ao redor', () => {
      expect(sanitize('  hello  ')).toBe('hello');
      expect(sanitize('  João Silva  ')).toBe('João Silva');
    });

    test('retorna valores não-string sem alteração', () => {
      expect(sanitize(null)).toBe(null);
      expect(sanitize(undefined)).toBe(undefined);
      expect(sanitize(123)).toBe(123);
    });

    test('retorna string vazia como string vazia', () => {
      expect(sanitize('')).toBe('');
    });
  });

  // ─── TELEFONE ──────────────────────────────────────────────
  describe('isValidPhone', () => {
    test('aceita telefones válidos', () => {
      expect(isValidPhone('11999887766')).toBe(true);     // celular
      expect(isValidPhone('1133445566')).toBe(true);      // fixo
      expect(isValidPhone('(11) 99988-7766')).toBe(true); // com máscara
    });

    test('retorna true para valores vazios (campo opcional)', () => {
      expect(isValidPhone('')).toBe(true);
      expect(isValidPhone(null)).toBe(true);
      expect(isValidPhone(undefined)).toBe(true);
    });

    test('rejeita telefones inválidos', () => {
      expect(isValidPhone('123')).toBe(false);
      expect(isValidPhone('123456789012345')).toBe(false); // muito longo
    });
  });
});
