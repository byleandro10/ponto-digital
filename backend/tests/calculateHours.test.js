const { calculateWorkedHours, calculateOvertime } = require('../src/utils/calculateHours');

describe('calculateWorkedHours', () => {
  test('calcula horas trabalhadas com jornada completa', () => {
    const entries = [
      { type: 'CLOCK_IN', timestamp: '2025-01-15T08:00:00' },
      { type: 'BREAK_START', timestamp: '2025-01-15T12:00:00' },
      { type: 'BREAK_END', timestamp: '2025-01-15T13:00:00' },
      { type: 'CLOCK_OUT', timestamp: '2025-01-15T17:00:00' }
    ];
    const result = calculateWorkedHours(entries);
    expect(result.totalMinutes).toBe(480); // 8h = 480min
    expect(result.formatted).toBe('08:00');
    expect(result.hours).toBe(8);
    expect(result.minutes).toBe(0);
  });

  test('calcula horas com intervalo de almoço', () => {
    const entries = [
      { type: 'CLOCK_IN', timestamp: '2025-01-15T09:00:00' },
      { type: 'BREAK_START', timestamp: '2025-01-15T12:00:00' },
      { type: 'BREAK_END', timestamp: '2025-01-15T13:30:00' },
      { type: 'CLOCK_OUT', timestamp: '2025-01-15T18:00:00' }
    ];
    const result = calculateWorkedHours(entries);
    // 9h de trabalho bruto (09:00-18:00) - 1h30 de almoço = 7h30 = 450min
    expect(result.totalMinutes).toBe(450);
    expect(result.formatted).toBe('07:30');
  });

  test('calcula horas somente com entrada e saída (sem almoço)', () => {
    const entries = [
      { type: 'CLOCK_IN', timestamp: '2025-01-15T08:00:00' },
      { type: 'CLOCK_OUT', timestamp: '2025-01-15T12:00:00' }
    ];
    const result = calculateWorkedHours(entries);
    expect(result.totalMinutes).toBe(240); // 4h
    expect(result.formatted).toBe('04:00');
  });

  test('retorna zero para lista vazia', () => {
    const result = calculateWorkedHours([]);
    expect(result.totalMinutes).toBe(0);
    expect(result.formatted).toBe('00:00');
  });

  test('retorna zero somente com entrada (sem saída)', () => {
    const entries = [
      { type: 'CLOCK_IN', timestamp: '2025-01-15T08:00:00' }
    ];
    const result = calculateWorkedHours(entries);
    expect(result.totalMinutes).toBe(0);
  });

  test('ordena entradas fora de ordem', () => {
    const entries = [
      { type: 'CLOCK_OUT', timestamp: '2025-01-15T17:00:00' },
      { type: 'BREAK_END', timestamp: '2025-01-15T13:00:00' },
      { type: 'CLOCK_IN', timestamp: '2025-01-15T08:00:00' },
      { type: 'BREAK_START', timestamp: '2025-01-15T12:00:00' }
    ];
    const result = calculateWorkedHours(entries);
    expect(result.totalMinutes).toBe(480);
  });

  test('não muta o array original', () => {
    const entries = [
      { type: 'CLOCK_OUT', timestamp: '2025-01-15T17:00:00' },
      { type: 'CLOCK_IN', timestamp: '2025-01-15T08:00:00' }
    ];
    const originalFirst = entries[0].type;
    calculateWorkedHours(entries);
    expect(entries[0].type).toBe(originalFirst);
  });
});

describe('calculateOvertime', () => {
  test('calcula hora extra quando trabalhou mais que o esperado', () => {
    const result = calculateOvertime(540, 8); // 9h trabalhadas, carga de 8h
    expect(result.overtimeMinutes).toBe(60);
    expect(result.deficitMinutes).toBe(0);
    expect(result.overtimeFormatted).toBe('01:00');
    expect(result.deficitFormatted).toBe('00:00');
  });

  test('calcula déficit quando trabalhou menos que o esperado', () => {
    const result = calculateOvertime(420, 8); // 7h trabalhadas, carga de 8h
    expect(result.overtimeMinutes).toBe(0);
    expect(result.deficitMinutes).toBe(60);
    expect(result.overtimeFormatted).toBe('00:00');
    expect(result.deficitFormatted).toBe('01:00');
  });

  test('zero extras e zero déficit quando bateu exatamente', () => {
    const result = calculateOvertime(480, 8); // 8h exatas
    expect(result.overtimeMinutes).toBe(0);
    expect(result.deficitMinutes).toBe(0);
  });

  test('calcula com carga horária parcial (6h)', () => {
    const result = calculateOvertime(420, 6); // 7h trabalhadas, carga de 6h
    expect(result.overtimeMinutes).toBe(60);
  });

  test('lida com zero minutos trabalhados', () => {
    const result = calculateOvertime(0, 8);
    expect(result.deficitMinutes).toBe(480);
  });
});
