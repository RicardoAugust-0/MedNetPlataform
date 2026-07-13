import { describe, expect, it } from 'vitest';
import { mergeOptimisticAutomationLogs } from './useAutomations.js';

describe('mergeOptimisticAutomationLogs', () => {
  const optimistic = {
    id: 'optimistic-auto-1',
    automationId: 'auto-1',
    status: 'running',
    date: '2026-07-13T17:00:00.000Z',
    logs: [],
  };

  it('mantem o estado imediato enquanto o banco ainda nao criou o log', () => {
    const result = mergeOptimisticAutomationLogs({}, { 'auto-1': optimistic });

    expect(result.logs['auto-1']).toEqual([optimistic]);
    expect(result.optimisticRuns['auto-1']).toEqual(optimistic);
  });

  it('substitui o estado imediato assim que o log real chega', () => {
    const databaseLog = {
      id: 'db-log-1',
      automationId: 'auto-1',
      status: 'running',
      date: '2026-07-13T17:00:01.000Z',
      logs: [],
    };
    const result = mergeOptimisticAutomationLogs(
      { 'auto-1': [databaseLog] },
      { 'auto-1': optimistic },
    );

    expect(result.logs['auto-1']).toEqual([databaseLog]);
    expect(result.optimisticRuns).toEqual({});
  });
});
