import { Routes } from '@angular/router';
import { feature } from './core/feature-flags';
import { Home } from './home/home';
import { WorkspaceShell } from './shell/workspace-shell';

export const routes: Routes = [
  {
    // Workspace sections share the sidebar (VAI-203).
    path: '',
    component: WorkspaceShell,
    children: [
      { path: '', pathMatch: 'full', component: Home, title: 'AI Workflow' },
      // Behind feature flags (VAI-109): with the flag off the route doesn't match, its code is
      // never loaded, and the URL falls through to Home.
      {
        path: 'meetings',
        title: 'Meetings · AI Workflow',
        canMatch: [feature('meetings')],
        loadComponent: () => import('./meetings/meetings').then((m) => m.Meetings),
      },
      {
        path: 'agents',
        title: 'Agent chats · AI Workflow',
        canMatch: [feature('agents')],
        loadComponent: () => import('./agents/agents').then((m) => m.Agents),
      },
      {
        path: 'dictations',
        title: 'Dictations · AI Workflow',
        loadComponent: () => import('./dictations/dictations').then((m) => m.Dictations),
      },
    ],
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./settings/settings-layout/settings-layout').then((m) => m.SettingsLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'ai-servers' },
      {
        path: 'ai-servers',
        title: 'AI servers · Settings · AI Workflow',
        loadComponent: () => import('./settings/ai-servers/ai-servers').then((m) => m.AiServers),
      },
      {
        path: 'diagnostics',
        title: 'Diagnostics · Settings · AI Workflow',
        loadComponent: () =>
          import('./settings/diagnostics/diagnostics').then((m) => m.Diagnostics),
      },
    ],
  },
  {
    path: 'gallery',
    title: 'Component gallery · AI Workflow',
    loadComponent: () => import('./gallery/gallery').then((m) => m.Gallery),
  },
  { path: '**', redirectTo: '' },
];
