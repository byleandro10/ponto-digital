const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-key-for-unit-tests';

const { authMiddleware, employeeAuth } = require('../src/middlewares/auth');
const { roleGuard } = require('../src/middlewares/roleGuard');

// Mock de req, res, next
function mockReq(overrides = {}) {
  return { headers: {}, ...overrides };
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function mockNext() {
  return jest.fn();
}

describe('authMiddleware', () => {
  test('rejeita requisição sem header Authorization', async () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token não fornecido.' });
    expect(next).not.toHaveBeenCalled();
  });

  test('rejeita token sem prefixo Bearer', async () => {
    const req = mockReq({ headers: { authorization: 'InvalidToken' } });
    const res = mockRes();
    const next = mockNext();
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejeita token inválido', async () => {
    const req = mockReq({ headers: { authorization: 'Bearer invalid.token.here' } });
    const res = mockRes();
    const next = mockNext();
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token inválido ou expirado.' });
  });

  test('aceita token válido e popula req', async () => {
    const payload = { id: 'user-1', role: 'ADMIN', companyId: 'comp-1', type: 'admin' };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const res = mockRes();
    const next = mockNext();
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.userId).toBe('user-1');
    expect(req.userRole).toBe('ADMIN');
    expect(req.companyId).toBe('comp-1');
  });

  test('rejeita token expirado', async () => {
    const payload = { id: 'user-1', role: 'ADMIN', companyId: 'comp-1' };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '0s' });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const res = mockRes();
    const next = mockNext();
    // Aguardar 1ms para garantir expiração
    await new Promise(r => setTimeout(r, 50));
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('employeeAuth', () => {
  test('rejeita requisição sem token', async () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();
    await employeeAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('rejeita token de admin (type !== employee)', async () => {
    const payload = { id: 'user-1', role: 'ADMIN', companyId: 'comp-1', type: 'admin' };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const res = mockRes();
    const next = mockNext();
    await employeeAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Acesso restrito a funcionários.' });
  });

  test('aceita token de employee', async () => {
    const payload = { id: 'emp-1', companyId: 'comp-1', type: 'employee' };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const res = mockRes();
    const next = mockNext();
    await employeeAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.employeeId).toBe('emp-1');
    expect(req.companyId).toBe('comp-1');
  });
});

describe('roleGuard', () => {
  test('permite acesso para role autorizada', () => {
    const middleware = roleGuard('ADMIN', 'SUPER_ADMIN');
    const req = mockReq({ userRole: 'ADMIN' });
    const res = mockRes();
    const next = mockNext();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('bloqueia acesso para role não autorizada', () => {
    const middleware = roleGuard('ADMIN', 'SUPER_ADMIN');
    const req = mockReq({ userRole: 'MANAGER' });
    const res = mockRes();
    const next = mockNext();
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Sem permissão para acessar este recurso.' });
  });

  test('bloqueia acesso sem role definida', () => {
    const middleware = roleGuard('ADMIN');
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('aceita múltiplas roles', () => {
    const middleware = roleGuard('ADMIN', 'SUPER_ADMIN', 'MANAGER');
    const req = mockReq({ userRole: 'MANAGER' });
    const res = mockRes();
    const next = mockNext();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
