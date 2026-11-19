import { ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AiWorkflowApi } from '../../../shared/ipc-contract';
import { AI_WORKFLOW_BRIDGE } from './electron-api';
import { ReportingErrorHandler } from './error-reporter';

function setup(bridge: Pick<AiWorkflowApi, 'log'> | null) {
  TestBed.configureTestingModule({
    providers: [
      { provide: AI_WORKFLOW_BRIDGE, useValue: bridge },
      { provide: ErrorHandler, useClass: ReportingErrorHandler },
    ],
  });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  return TestBed.inject(ErrorHandler);
}

describe('ReportingErrorHandler', () => {
  it('sends name, message and stack to the main-process log', () => {
    const bridge = { log: { rendererError: vi.fn().mockResolvedValue(undefined) } };
    const handler = setup(bridge);
    const error = new TypeError('x is undefined');
    handler.handleError(error);
    expect(bridge.log.rendererError).toHaveBeenCalledWith({
      name: 'TypeError',
      message: 'x is undefined',
      stack: error.stack,
    });
    expect(console.error).toHaveBeenCalled();
  });

  it('handles non-Error values and a failing bridge without throwing', () => {
    const bridge = { log: { rendererError: vi.fn().mockRejectedValue(new Error('gone')) } };
    const handler = setup(bridge);
    expect(() => handler.handleError('plain string')).not.toThrow();
    expect(bridge.log.rendererError).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Error', message: 'plain string' }),
    );
  });

  it('works without the desktop bridge', () => {
    expect(() => setup(null).handleError(new Error('x'))).not.toThrow();
  });
});
