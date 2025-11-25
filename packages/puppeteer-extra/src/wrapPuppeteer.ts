/**
 * @license
 * Copyright 2025 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

import type {PuppeteerWorkers} from '@cloudflare/puppeteer';

import {WrappedPuppeteer} from './WrappedPuppeteer.js';

import type {PuppeteerExtraPlugin} from './index.js';

/**
 * Extended PuppeteerWorkers interface with plugin support.
 *
 * @public
 */
export interface PuppeteerWorkersWithUse extends PuppeteerWorkers {
  /**
   * Register a plugin to extend Puppeteer functionality.
   *
   * @param plugin - The plugin to register
   * @returns The PuppeteerWorkersWithUse instance for chaining
   */
  use(plugin: PuppeteerExtraPlugin): this;
}

/**
 * Wraps a PuppeteerWorkers instance to add plugin support.
 *
 * @remarks
 * This function creates a wrapped version of PuppeteerWorkers that
 * supports plugins through the `use()` method. Plugins can hook into
 * browser and page lifecycle events.
 *
 * @example
 *
 * ```ts
 * import puppeteer from '@cloudflare/puppeteer';
 * import {wrapPuppeteer} from 'puppeteer-extra';
 *
 * const puppeteerExtra = wrapPuppeteer(puppeteer);
 *
 * puppeteerExtra.use({
 *   name: 'my-plugin',
 *   onBrowser: async browser => {
 *     console.log('Browser launched!');
 *   },
 * });
 * ```
 *
 * @param puppeteer - The PuppeteerWorkers instance to wrap
 * @returns A wrapped PuppeteerWorkers instance with plugin support
 *
 * @public
 */
export function wrapPuppeteer(
  puppeteer: PuppeteerWorkers
): PuppeteerWorkersWithUse {
  return new WrappedPuppeteer(puppeteer);
}
