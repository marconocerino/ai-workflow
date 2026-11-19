import { Injectable, signal } from '@angular/core';
import { AGENTS, type AgentId } from '../../../shared/agents';

/** live: in a meeting or call right now · working: busy on a task · idle: waiting. */
export type AgentActivity = 'live' | 'working' | 'idle';

/**
 * What each agent is doing, and unread agent chats, for the sidebar (VAI-203).
 * No agent runtime exists yet, so every agent is idle and nothing is unread; the agent stories
 * (VAI-801+) will feed real values from the main process.
 */
@Injectable({ providedIn: 'root' })
export class AgentStatus {
  readonly activity = signal<Readonly<Record<AgentId, AgentActivity>>>(
    Object.fromEntries(AGENTS.map((a) => [a.id, 'idle'])) as Record<AgentId, AgentActivity>,
  );
  readonly unreadChats = signal(0);
}
