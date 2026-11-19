import { Routes } from '@angular/router';
import { Home } from './home/home';

export const routes: Routes = [
  { path: '', component: Home, title: 'AI Workflow' },
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
