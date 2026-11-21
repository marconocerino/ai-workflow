import { Routes } from '@angular/router';
import { feature } from './core/feature-flags';
import { Home } from './home/home';
import { WorkspaceShell } from './shell/workspace-shell';

const comingSoon = () => import('./settings/coming-soon/coming-soon').then((m) => m.ComingSoon);

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
      { path: '', pathMatch: 'full', redirectTo: 'dictation' },
      {
        path: 'dictation',
        title: 'Dictation · Settings · AI Workflow',
        loadComponent: () =>
          import('./settings/dictation/dictation').then((m) => m.DictationSettings),
      },
      {
        path: 'transcription',
        title: 'Transcription · Settings · AI Workflow',
        loadComponent: comingSoon,
        data: {
          heading: 'Transcription',
          lead: 'How your speech is turned into text.',
          coming: 'Language and speech-to-text options will be here.',
        },
      },
      {
        path: 'ai-servers',
        title: 'AI servers · Settings · AI Workflow',
        loadComponent: () => import('./settings/ai-servers/ai-servers').then((m) => m.AiServers),
      },
      {
        path: 'ai-cleanup',
        title: 'AI cleanup · Settings · AI Workflow',
        loadComponent: () =>
          import('./settings/ai-cleanup/ai-cleanup').then((m) => m.AiCleanupSettings),
      },
      {
        path: 'vocabulary',
        title: 'Vocabulary · Settings · AI Workflow',
        loadComponent: () =>
          import('./settings/vocabulary/vocabulary').then((m) => m.VocabularySettings),
      },
      {
        path: 'style',
        title: 'Style per app · Settings · AI Workflow',
        loadComponent: () => import('./settings/style/style').then((m) => m.StyleSettings),
      },
      {
        path: 'about',
        title: 'About & diagnostics · Settings · AI Workflow',
        loadComponent: () => import('./settings/about/about').then((m) => m.About),
      },
      // Old address (VAI-107).
      { path: 'diagnostics', redirectTo: 'about' },
    ],
  },
  {
    path: 'gallery',
    title: 'Component gallery · AI Workflow',
    loadComponent: () => import('./gallery/gallery').then((m) => m.Gallery),
  },
  {
    // The hidden audio window's page (VAI-302); no UI.
    path: 'audio-engine',
    title: 'AI Workflow audio',
    loadComponent: () => import('./audio-engine/audio-engine').then((m) => m.AudioEngineHost),
  },
  {
    // The floating dictation bar's window (VAI-305): transparent, never focused.
    path: 'overlay',
    title: 'AI Workflow dictation',
    loadComponent: () => import('./overlay/overlay-page').then((m) => m.OverlayPage),
  },
  { path: '**', redirectTo: '' },
];
