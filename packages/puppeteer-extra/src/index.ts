/**
 * @license
 * Copyright 2025 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Browser, Page} from '@cloudflare/puppeteer';

/**
 * Base interface for Puppeteer Extra plugins.
 *
 * @public
 */
export interface PuppeteerExtraPlugin {
  /**
   * Plugin name for identification purposes.
   */
  readonly name: string;

  /**
   * Called when the plugin is registered with `use()`.
   * Override this method to perform any initialization logic.
   */
  onPluginRegistered?(): void;

  /**
   * Called when a new browser is launched or connected.
   *
   * @param browser - The browser instance
   */
  onBrowser?(browser: Browser): Promise<void> | void;

  /**
   * Called when a new page is created.
   *
   * @param page - The page instance
   */
  onPageCreated?(page: Page): Promise<void> | void;
}

export {wrapPuppeteer} from './wrapPuppeteer.js';
export type {PuppeteerWorkersWithUse} from './wrapPuppeteer.js';
