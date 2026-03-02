/**
 * Módulo de validação profissional
 * Valida e-mail, CPF, CNPJ, senha e outros campos
 */

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(email.trim());
}

function isValidCPF(cpf) {
  if (!cpf || typeof cpf !== 'string') return false;
  cpf = cpf.replace(/\D/g, '');
  if (cpf.length !== 11) return false;
  // Rejeita CPFs com todos os dígitos iguais
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  // Validação do primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf.charAt(i)) * (10 - i);
  let remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(cpf.charAt(9))) return false;
  // Validação do segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf.charAt(i)) * (11 - i);
  remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(cpf.charAt(10))) return false;
  return true;
}

function formatCPF(cpf) {
  if (!cpf) return cpf;
  return cpf.replace(/\D/g, '');
}

function isValidCNPJ(cnpj) {
  if (!cnpj || typeof cnpj !== 'string') return false;
  cnpj = cnpj.replace(/\D/g, '');
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  // Validação do primeiro dígito
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(cnpj.charAt(i)) * weights1[i];
  let remainder = sum % 11;
  const digit1 = remainder < 2 ? 0 : 11 - remainder;
  if (parseInt(cnpj.charAt(12)) !== digit1) return false;
  // Validação do segundo dígito
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  sum = 0;
  for (let i = 0; i < 13; i++) sum += parseInt(cnpj.charAt(i)) * weights2[i];
  remainder = sum % 11;
  const digit2 = remainder < 2 ? 0 : 11 - remainder;
  if (parseInt(cnpj.charAt(13)) !== digit2) return false;
  return true;
}

function formatCNPJ(cnpj) {
  if (!cnpj) return cnpj;
  return cnpj.replace(/\D/g, '');
}

function isValidPassword(password) {
  if (!password || typeof password !== 'string') return false;
  if (password.length < 6) return false;
  return true;
}

function getPasswordErrors(password) {
  const errors = [];
  if (!password || typeof password !== 'string') {
    errors.push('Senha é obrigatória.');
    return errors;
  }
  if (password.length < 6) errors.push('Senha deve ter no mínimo 6 caracteres.');
  return errors;
}

function sanitize(str) {
  if (!str || typeof str !== 'string') return str;
  return str.trim();
}

function isValidPhone(phone) {
  if (!phone) return true; // Telefone é opcional
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 11;
}

module.exports = {
  isValidEmail,
  isValidCPF,
  formatCPF,
  isValidCNPJ,
  formatCNPJ,
  isValidPassword,
  getPasswordErrors,
  sanitize,
  isValidPhone
};
