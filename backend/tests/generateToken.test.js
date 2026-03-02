const jwt = require('jsonwebtoken');

// Definir variável de ambiente para testes
process.env.JWT_SECRET = 'test-secret-key-for-unit-tests';
process.env.JWT_EXPIRES_IN = '1h';

const { generateToken } = require('../src/utils/generateToken');

describe('generateToken', () => {
  test('gera um token JWT válido', () => {
    const payload = { id: '123', role: 'ADMIN', companyId: 'comp-1', type: 'admin' };
    const token = generateToken(payload);
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3); // JWT tem 3 partes
  });

  test('token contém os dados corretos', () => {
    const payload = { id: 'user-1', role: 'ADMIN', companyId: 'comp-1', type: 'admin' };
    const token = generateToken(payload);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    expect(decoded.id).toBe('user-1');
    expect(decoded.role).toBe('ADMIN');
    expect(decoded.companyId).toBe('comp-1');
    expect(decoded.type).toBe('admin');
  });

  test('token tem expiração definida', () => {
    const payload = { id: '123' };
    const token = generateToken(payload);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    expect(decoded.exp).toBeDefined();
    expect(decoded.iat).toBeDefined();
  });

  test('token para funcionário contém type employee', () => {
    const payload = { id: 'emp-1', companyId: 'comp-1', type: 'employee' };
    const token = generateToken(payload);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    expect(decoded.type).toBe('employee');
  });
});
