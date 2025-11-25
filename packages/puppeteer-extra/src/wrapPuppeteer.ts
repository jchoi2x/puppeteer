/**
 * @license
 * Copyright 2025 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Browser} from '@cloudflare/puppeteer';
import type {PuppeteerWorkers} from '@cloudflare/puppeteer';

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
  const plugins: PuppeteerExtraPlugin[] = [];

  // Store reference to original launch method
  const originalLaunch = puppeteer.launch.bind(puppeteer);

  // Store reference to original connect method
  const originalConnect = puppeteer.connect.bind(puppeteer);

  /**
   * Register a plugin with the wrapped puppeteer instance.
   */
  function use(
    this: PuppeteerWorkersWithUse,
    plugin: PuppeteerExtraPlugin
  ): PuppeteerWorkersWithUse {
    plugins.push(plugin);
    if (plugin.onPluginRegistered) {
      plugin.onPluginRegistered();
    }
    return this;
  }

  /**
   * Wrap a browser instance to trigger plugin hooks on new pages.
   */
  async function wrapBrowser(browser: Browser): Promise<Browser> {
    // Call onBrowser hooks for all plugins
    for (const plugin of plugins) {
      if (plugin.onBrowser) {
        await plugin.onBrowser(browser);
      }
    }

    // Store original newPage method
    const originalNewPage = browser.newPage.bind(browser);

    // Override newPage to trigger onPageCreated hooks
    browser.newPage = async function (
      ...args: Parameters<typeof originalNewPage>
    ) {
      const page = await originalNewPage(...args);

      // Call onPageCreated hooks for all plugins
      for (const plugin of plugins) {
        if (plugin.onPageCreated) {
          await plugin.onPageCreated(page);
        }
      }

      return page;
    };

    return browser;
  }

  // Override launch method
  (puppeteer as PuppeteerWorkersWithUse).launch = async function (
    ...args: Parameters<typeof originalLaunch>
  ): Promise<Browser> {
    const browser = await originalLaunch(...args);
    return await wrapBrowser(browser);
  };

  // Override connect method
  (puppeteer as PuppeteerWorkersWithUse).connect = async function (
    ...args: Parameters<typeof originalConnect>
  ): Promise<Browser> {
    const browser = await originalConnect(...args);
    return await wrapBrowser(browser);
  };

  // Add the use method
  (puppeteer as PuppeteerWorkersWithUse).use = use;

  return puppeteer as PuppeteerWorkersWithUse;
}
