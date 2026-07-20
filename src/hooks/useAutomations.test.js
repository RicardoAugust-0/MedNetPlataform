import { describe, expect, it } from 'vitest';
import {
  getAutomationPollingDelay,
  mergeOptimisticAutomationLogs,
} from './useAutomations.js';

describe('getAutomationPollingDelay', () => {
  it('applies bounded exponential backoff after consecutive failures', () => {
    expect(getAutomationPollingDelay(2000, 0)).toBe(2000);
    expect(getAutomationPollingDelay(2000, 1)).toBe(4000);
    expect(getAutomationPollingDelay(2000, 4)).toBe(32000);
    expect(getAutomationPollingDelay(2000, 20)).toBe(120000);
  });

  it('supports a larger cap for the VPS healthcheck', () => {
    expect(getAutomationPollingDelay(30000, 1, 240000)).toBe(60000);
    expect(getAutomationPollingDelay(30000, 8, 240000)).toBe(240000);
  });
});

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
