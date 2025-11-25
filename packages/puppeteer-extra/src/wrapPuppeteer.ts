/**
 * @license
 * Copyright 2025 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ActiveSession,
  AcquireResponse,
  Browser,
  BrowserWorker,
  ClosedSession,
  ConnectOptions,
  LimitsResponse,
  PuppeteerWorkers,
  WorkersLaunchOptions,
} from '@cloudflare/puppeteer';

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
 * Wrapped PuppeteerWorkers class with plugin support.
 *
 * @remarks
 * This class wraps a PuppeteerWorkers instance and adds plugin support
 * through the `use()` method. Plugins can hook into browser and page
 * lifecycle events.
 *
 * @public
 */
class WrappedPuppeteer implements PuppeteerWorkersWithUse {
  readonly #puppeteer: PuppeteerWorkers;
  readonly #plugins: PuppeteerExtraPlugin[] = [];

  /**
   * @internal
   */
  constructor(puppeteer: PuppeteerWorkers) {
    this.#puppeteer = puppeteer;
  }

  /**
   * Register a plugin to extend Puppeteer functionality.
   *
   * @param plugin - The plugin to register
   * @returns The WrappedPuppeteer instance for chaining
   */
  use(plugin: PuppeteerExtraPlugin): this {
    this.#plugins.push(plugin);
    if (plugin.onPluginRegistered) {
      plugin.onPluginRegistered();
    }
    return this;
  }

  /**
   * Launch a browser session.
   *
   * @param endpoint - Cloudflare worker binding
   * @param options - Launch options
   * @returns A browser session or throws
   */
  async launch(
    endpoint: BrowserWorker,
    options?: WorkersLaunchOptions
  ): Promise<Browser> {
    const browser = await this.#puppeteer.launch(endpoint, options);
    return await this.#wrapBrowser(browser);
  }

  /**
   * Establish a devtools connection to an existing session.
   *
   * @remarks
   * This method supports two calling patterns:
   *
   * 1. With BrowserWorker endpoint and sessionId for Cloudflare Workers
   * 2. With ConnectOptions for standard Puppeteer connections
   *
   * @param endpoint - Cloudflare worker binding or connect options
   * @param sessionId - Session ID obtained from a .sessions() call (optional)
   * @returns A browser instance
   */
  connect(
    endpoint: BrowserWorker | ConnectOptions,
    sessionId?: string
  ): Promise<Browser>;
  async connect(
    endpoint: BrowserWorker | ConnectOptions,
    sessionId?: string
  ): Promise<Browser> {
    const browser = await this.#puppeteer.connect(endpoint, sessionId);
    return await this.#wrapBrowser(browser);
  }

  /**
   * Returns active sessions.
   *
   * @param endpoint - Cloudflare worker binding
   * @returns List of active sessions
   */
  async sessions(endpoint: BrowserWorker): Promise<ActiveSession[]> {
    return await this.#puppeteer.sessions(endpoint);
  }

  /**
   * Returns recent sessions (active and closed).
   *
   * @param endpoint - Cloudflare worker binding
   * @returns List of recent sessions
   */
  async history(endpoint: BrowserWorker): Promise<ClosedSession[]> {
    return await this.#puppeteer.history(endpoint);
  }

  /**
   * Returns current limits.
   *
   * @param endpoint - Cloudflare worker binding
   * @returns Current limits
   */
  async limits(endpoint: BrowserWorker): Promise<LimitsResponse> {
    return await this.#puppeteer.limits(endpoint);
  }

  /**
   * Acquire a new browser session.
   *
   * @param endpoint - Cloudflare worker binding
   * @param options - Launch options
   * @returns A new browser session
   */
  async acquire(
    endpoint: BrowserWorker,
    options?: WorkersLaunchOptions
  ): Promise<AcquireResponse> {
    return await this.#puppeteer.acquire(endpoint, options);
  }

  /**
   * Wrap a browser instance to trigger plugin hooks on new pages.
   */
  async #wrapBrowser(browser: Browser): Promise<Browser> {
    // Call onBrowser hooks for all plugins
    for (const plugin of this.#plugins) {
      if (plugin.onBrowser) {
        await plugin.onBrowser(browser);
      }
    }

    // Store reference to plugins for closure
    const plugins = this.#plugins;

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
