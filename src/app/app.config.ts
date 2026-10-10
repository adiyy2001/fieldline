import {
  type ApplicationConfig,
  EnvironmentInjector,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { isAutomationRequested } from './automation/automation-query';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAppInitializer(() => {
      if (!isAutomationRequested(window.location.search)) {
        return undefined;
      }
      const injector = inject(EnvironmentInjector);
      return import('./automation/automation').then(({ Automation }) => {
        injector.get(Automation).installIfRequested(window, window.location.search);
      });
    }),
  ],
};
