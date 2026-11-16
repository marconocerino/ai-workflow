import type { IpcMainInvokeEvent } from 'electron';
import type { IpcArgs, IpcChannel, IpcResponse } from '../../shared/ipc-contract';

export type IpcHandler<C extends IpcChannel> = (
  event: IpcMainInvokeEvent,
  ...args: IpcArgs<C>
) => IpcResponse<C> | Promise<IpcResponse<C>>;

/** The part of Electron's ipcMain we need (injectable for tests). */
export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
  ): void;
}

export class UntrustedSenderError extends Error {
  constructor(channel: string) {
    super(`Rejected IPC call on "${channel}" from an untrusted sender`);
    this.name = 'UntrustedSenderError';
  }
}

/**
 * Returns a typed `handle()` that only answers calls from trusted frames.
 * Usage: `handle('app:get-info', () => getAppInfo(...))` — channel and return type are checked.
 */
export function createIpcRegistrar(
  ipcMain: IpcMainLike,
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean,
) {
  return function handle<C extends IpcChannel>(channel: C, handler: IpcHandler<C>): void {
    ipcMain.handle(channel, (event, ...args) => {
      if (!isTrustedSender(event)) {
        throw new UntrustedSenderError(channel);
      }
      return handler(event, ...(args as IpcArgs<C>));
    });
  };
}
