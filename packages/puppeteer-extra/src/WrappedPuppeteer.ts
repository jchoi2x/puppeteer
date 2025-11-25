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

import type {PuppeteerWorkersWithUse} from './wrapPuppeteer.js';

import type {PluginData, PuppeteerExtraPlugin} from './index.js';

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
export class WrappedPuppeteer implements PuppeteerWorkersWithUse {
  readonly #puppeteer: PuppeteerWorkers;
  readonly #plugins: PuppeteerExtraPlugin[] = [];

  /**
   * @internal
   */
  constructor(puppeteer: PuppeteerWorkers) {
    this.#puppeteer = puppeteer;
  }

  /**
   * Get a list of all registered plugins.
   *
   * @returns Array of registered plugins
   */
  get plugins(): PuppeteerExtraPlugin[] {
    return this.#plugins;
  }

  /**
   * Get the names of all registered plugins.
   *
   * @returns Array of plugin names
   */
  get pluginNames(): string[] {
    return this.#plugins.map(p => {
      return p.name;
    });
  }

  /**
   * The **main interface** to register `puppeteer-extra` plugins.
   *
   * @example
   * puppeteer.use(plugin1).use(plugin2)
   *
   * @param plugin - The plugin to register
   * @returns The WrappedPuppeteer instance for chaining
   */
  use(plugin: PuppeteerExtraPlugin): this {
    // Validate plugin is a proper PuppeteerExtraPlugin
    if (
      typeof plugin !== 'object' ||
      (plugin._isPuppeteerExtraPlugin !== undefined &&
        !plugin._isPuppeteerExtraPlugin)
    ) {
      console.error(
        'Warning: Plugin is not derived from PuppeteerExtraPlugin, ignoring.',
        plugin
      );
      return this;
    }

    if (!plugin.name) {
      console.error(
        'Warning: Plugin with no name registering, ignoring.',
        plugin
      );
      return this;
    }

    // Set up getDataFromPlugins if the plugin requires it
    if (plugin.requirements?.has('dataFromPlugins')) {
      plugin.getDataFromPlugins = this.getPluginData.bind(this);
    }

    // Call plugin's _register method if it exists
    if (typeof plugin._register === 'function') {
      plugin._register(Object.getPrototypeOf(plugin));
    }

    this.#plugins.push(plugin);

    // Also call onPluginRegistered for backwards compatibility
    if (plugin.onPluginRegistered) {
      plugin.onPluginRegistered();
    }

    return this;
  }

  /**
   * Collects the exposed `data` property of all registered plugins.
   * Will be reduced/flattened to a single array.
   *
   * Can be accessed by plugins that listed the `dataFromPlugins` requirement.
   *
   * @param name - Filter data by optional plugin name
   * @returns Array of plugin data
   */
  getPluginData(name?: string): PluginData[] {
    const data = this.#plugins
      .map(p => {
        return Array.isArray(p.data) ? p.data : p.data ? [p.data] : [];
      })
      .reduce((acc, arr) => {
        return [...acc, ...arr];
      }, []);
    return name
      ? data.filter(d => {
          return d.name === name;
        })
      : data;
  }

  /**
   * Get all plugins that feature a given property/class method.
   *
   * @param prop - The property name to check
   * @returns Array of plugins that have the property
   */
  #getPluginsByProp(prop: string): PuppeteerExtraPlugin[] {
    return this.#plugins.filter(plugin => {
      return prop in plugin;
    });
  }

  /**
   * Order plugins that have expressed a special placement requirement.
   * Plugins with 'runLast' requirement will be moved to the end.
   */
  #orderPlugins(): void {
    const runLast = this.#plugins
      .filter(p => {
        return p.requirements?.has('runLast');
      })
      .map(p => {
        return p.name;
      });
    for (const name of runLast) {
      const index = this.#plugins.findIndex(p => {
        return p.name === name;
      });
      if (index !== -1) {
        this.#plugins.push(this.#plugins.splice(index, 1)[0]!);
      }
    }
  }

  /**
   * Lightweight plugin requirement checking.
   * The main intent is to notify the user when a plugin won't work as expected.
   *
   * @param opts - Context options
   */
  #checkPluginRequirements(opts: {context: string; options?: unknown}): void {
    for (const plugin of this.#plugins) {
      if (!plugin.requirements) {
        continue;
      }
      for (const requirement of plugin.requirements) {
        if (opts.context === 'connect' && requirement === 'launch') {
          console.warn(
            `Warning: Plugin '${plugin.name}' doesn't support puppeteer.connect().`
          );
        }
      }
    }
  }

  /**
   * Call plugins sequentially with the same values.
   * Plugins that expose the supplied property will be called.
   *
   * @param prop - The plugin property to call
   * @param values - Values to pass to the plugin method
   */
  async #callPlugins(prop: string, ...values: unknown[]): Promise<void> {
    for (const plugin of this.#getPluginsByProp(prop)) {
      const method = plugin[prop];
      if (typeof method === 'function') {
        await (method as Function).apply(plugin, values);
      }
    }
  }

  /**
   * Call plugins sequentially and pass on a value (waterfall style).
   * Plugins that expose the supplied property will be called.
   *
   * The plugins can either modify the value or return an updated one.
   * Will return the latest, updated value which ran through all plugins.
   *
   * @param prop - The plugin property to call
   * @param value - The value to transform
   * @returns The transformed value
   */
  async #callPluginsWithValue(prop: string, value: unknown): Promise<unknown> {
    for (const plugin of this.#getPluginsByProp(prop)) {
      const method = plugin[prop];
      if (typeof method === 'function') {
        const newValue = await (method as Function).call(plugin, value);
        if (newValue) {
          value = newValue;
        }
      }
    }
    return value;
  }

  /**
   * Launch a browser session.
   *
   * @remarks
   * Augments the original launch method with plugin lifecycle methods.
   * All registered plugins that have a `beforeLaunch` method will be called
   * in sequence to potentially update the options before launching.
   *
   * @param endpoint - Cloudflare worker binding
   * @param options - Launch options
   * @returns A browser session or throws
   */
  async launch(
    endpoint: BrowserWorker,
    options?: WorkersLaunchOptions
  ): Promise<Browser> {
    this.#orderPlugins();

    // Give plugins the chance to modify the options before launch
    options = (await this.#callPluginsWithValue(
      'beforeLaunch',
      options || {}
    )) as WorkersLaunchOptions;

    const opts = {
      context: 'launch',
      options,
    };

    // Check plugin requirements after plugin had the chance to modify options
    this.#checkPluginRequirements(opts);

    const browser = await this.#puppeteer.launch(endpoint, options);

    // Call _bindBrowserEvents for all plugins that have it
    await this.#callPlugins('_bindBrowserEvents', browser, opts);

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
   * Augments the original connect method with plugin lifecycle methods.
   * All registered plugins that have a `beforeConnect` method will be called
   * in sequence to potentially update the options before connecting.
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
    this.#orderPlugins();

    // Give plugins the chance to modify the options before connect
    const connectOptions = {endpoint, sessionId};
    await this.#callPluginsWithValue('beforeConnect', connectOptions);

    const opts = {
      context: 'connect',
      options: connectOptions,
    };

    // Check plugin requirements after plugin had the chance to modify options
    this.#checkPluginRequirements(opts);

    const browser = await this.#puppeteer.connect(endpoint, sessionId);

    // Call _bindBrowserEvents for all plugins that have it
    await this.#callPlugins('_bindBrowserEvents', browser, opts);

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
    await this.#callPlugins('onBrowser', browser);

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

    // Set up disconnect handler if the browser supports events
    if (typeof browser.on === 'function') {
      browser.on('disconnected', () => {
        for (const plugin of plugins) {
          if (plugin.onDisconnected) {
            void plugin.onDisconnected(browser);
          }
        }
      });
    }

    return browser;
  }
}
