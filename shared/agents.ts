/** The four agent personas (D-006). Used by avatars, chips, mentions and the sidebar. */

export type AgentId = 'notetaker' | 'researcher' | 'writer' | 'scheduler';

export interface AgentInfo {
  id: AgentId;
  name: string;
  letter: string;
  description: string;
}

export const AGENTS: readonly AgentInfo[] = [
  {
    id: 'notetaker',
    name: 'Notetaker',
    letter: 'N',
    description: 'Joins meetings, transcribes, answers from what was said',
  },
  {
    id: 'researcher',
    name: 'Researcher',
    letter: 'R',
    description: 'Searches the intranet, files and past meetings',
  },
  {
    id: 'writer',
    name: 'Writer',
    letter: 'W',
    description: 'Drafts emails, docs and status updates in your style',
  },
  {
    id: 'scheduler',
    name: 'Scheduler',
    letter: 'S',
    description: 'Reads calendars and proposes times',
  },
];

export function agentById(id: AgentId): AgentInfo {
  const agent = AGENTS.find((a) => a.id === id);
  if (!agent) throw new Error(`Unknown agent: ${id}`);
  return agent;
}
