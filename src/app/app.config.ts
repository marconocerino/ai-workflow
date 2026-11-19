import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { ReportingErrorHandler } from './core/error-reporter';
import { FeatureFlags } from './core/feature-flags';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Flags before the first screen, so hidden features never flash (VAI-109).
    provideAppInitializer(() => inject(FeatureFlags).load()),
    // Route data → component inputs (Settings "coming soon" pages).
    provideRouter(routes, withComponentInputBinding()),
    { provide: ErrorHandler, useClass: ReportingErrorHandler },
  ],
};
