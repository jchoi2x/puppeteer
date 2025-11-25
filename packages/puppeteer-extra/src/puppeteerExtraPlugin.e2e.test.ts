/**
 * @license
 * Copyright 2025 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

import {describe, it} from 'node:test';

import type {Browser, Page} from '@cloudflare/puppeteer';
import expect from 'expect';
import sinon from 'sinon';

import {wrapPuppeteer} from './wrapPuppeteer.js';

import type {
  PluginData,
  PluginRequirements,
  PuppeteerExtraPlugin,
} from './index.js';

/**
 * Mock PuppeteerExtraPlugin class that mirrors the puppeteer-extra-plugin interface
 * from https://github.com/berstend/puppeteer-extra/blob/master/packages/puppeteer-extra-plugin/src/index.ts
 *
 * This class tests that all plugin lifecycle methods are properly invoked.
 */
class MockPuppeteerExtraPlugin implements PuppeteerExtraPlugin {
  readonly _isPuppeteerExtraPlugin = true;
  private _opts: Record<string, unknown>;
  private _childClassMembers: string[] = [];

  // Index signature for extensibility (required by PuppeteerExtraPlugin interface)
  [propName: string]: unknown;

  // Spies for all lifecycle methods
  public spies = {
    _register: sinon.spy(),
    onPluginRegistered: sinon.spy(),
    beforeLaunch: sinon.spy(),
    beforeConnect: sinon.spy(),
    _bindBrowserEvents: sinon.spy(),
    onBrowser: sinon.spy(),
    onPageCreated: sinon.spy(),
    onDisconnected: sinon.spy(),
    onClose: sinon.spy(),
    _getMissingDependencies: sinon.spy(),
  };

  constructor(
    private _name: string,
    opts: Record<string, unknown> = {}
  ) {
    this._opts = {...this.defaults, ...opts};
  }

  get name(): string {
    return this._name;
  }

  get defaults(): Record<string, unknown> {
    return {};
  }

  get requirements(): Set<PluginRequirements> {
    return new Set([]);
  }

  get dependencies(): Set<string> {
    return new Set([]);
  }

  get data(): PluginData[] {
    return [];
  }

  get opts(): Record<string, unknown> {
    return this._opts;
  }

  /**
   * Called during use() to register the plugin.
   */
  _register(prototype: unknown): void {
    this.spies._register(prototype);
    this._registerChildClassMembers(prototype);
  }

  /**
   * Called after the plugin is registered.
   */
  onPluginRegistered(): void {
    this.spies.onPluginRegistered();
  }

  /**
   * Called before browser launch.
   */
  async beforeLaunch(options: unknown): Promise<unknown> {
    this.spies.beforeLaunch(options);
    return options;
  }

  /**
   * Called before browser connect.
   */
  async beforeConnect(options: unknown): Promise<unknown> {
    this.spies.beforeConnect(options);
    return options;
  }

  /**
   * Called to bind browser events after launch/connect.
   */
  async _bindBrowserEvents(
    browser: Browser,
    opts: {context: string; options: unknown}
  ): Promise<void> {
    this.spies._bindBrowserEvents(browser, opts);
  }

  /**
   * Called when browser is available.
   */
  async onBrowser(browser: Browser): Promise<void> {
    this.spies.onBrowser(browser);
  }

  /**
   * Called when a new page is created.
   */
  async onPageCreated(page: Page): Promise<void> {
    this.spies.onPageCreated(page);
  }

  /**
   * Called when browser disconnects.
   */
  async onDisconnected(browser: Browser): Promise<void> {
    this.spies.onDisconnected(browser);
  }

  /**
   * Called when browser closes.
   */
  async onClose(browser: Browser): Promise<void> {
    this.spies.onClose(browser);
  }

  /**
   * Get missing dependencies.
   */
  _getMissingDependencies(plugins: PuppeteerExtraPlugin[]): Set<string> {
    this.spies._getMissingDependencies(plugins);
    const pluginNames = new Set(plugins.map(p => p.name));
    return new Set(
      Array.from(this.dependencies.values()).filter(x => !pluginNames.has(x))
    );
  }

  /**
   * Register child class members for event binding.
   */
  private _registerChildClassMembers(prototype: unknown): void {
    if (prototype && typeof prototype === 'object') {
      this._childClassMembers = Object.getOwnPropertyNames(prototype);
    }
  }

  /**
   * Check if plugin has a child class member.
   */
  _hasChildClassMember(name: string): boolean {
    return this._childClassMembers.includes(name);
  }

  /**
   * Placeholder for getDataFromPlugins, set by the host.
   */
  getDataFromPlugins?(name?: string): PluginData[];

  /**
   * Reset all spies.
   */
  resetSpies(): void {
    Object.values(this.spies).forEach(spy => spy.resetHistory());
  }
}

/**
 * Mock plugin with dependencies that tests dynamic import resolution.
 */
class MockPluginWithDependencies extends MockPuppeteerExtraPlugin {
  private _dependencies: Set<string>;

  // Index signature for extensibility
  [propName: string]: unknown;

  constructor(name: string, dependencies: string[]) {
    super(name);
    this._dependencies = new Set(dependencies);
  }

  override get dependencies(): Set<string> {
    return this._dependencies;
  }

  override _getMissingDependencies(
    plugins: PuppeteerExtraPlugin[]
  ): Set<string> {
    this.spies._getMissingDependencies(plugins);
    const pluginNames = new Set(plugins.map(p => p.name));
    return new Set(
      Array.from(this._dependencies.values()).filter(x => !pluginNames.has(x))
    );
  }
}

/**
 * Create a mock PuppeteerWorkers instance with EventEmitter support.
 */
function createMockPuppeteerWorkersWithEvents() {
  // Event listeners storage
  const browserListeners: Record<string, Array<(...args: unknown[]) => void>> =
    {};

  const mockPage = {
    url: () => 'https://example.com',
    isClosed: () => false,
  };

  const mockBrowser = {
    newPage: sinon.stub().resolves(mockPage),
    close: sinon.stub().resolves(),
    on: sinon.stub().callsFake((event: string, callback) => {
      if (!browserListeners[event]) {
        browserListeners[event] = [];
      }
      browserListeners[event]!.push(callback);
    }),
    emit: (event: string, ...args: unknown[]) => {
      if (browserListeners[event]) {
        browserListeners[event]!.forEach(cb => cb(...args));
      }
    },
  };

  const mockPuppeteer = {
    launch: sinon.stub().resolves(mockBrowser),
    connect: sinon.stub().resolves(mockBrowser),
    sessions: sinon.stub().resolves([]),
    history: sinon.stub().resolves([]),
    limits: sinon.stub().resolves({}),
    acquire: sinon.stub().resolves({sessionId: 'mock-session-id'}),
  };

  return {mockPuppeteer, mockBrowser, mockPage, browserListeners};
}

describe('PuppeteerExtraPlugin E2E Tests', () => {
  describe('Plugin Lifecycle Methods', () => {
    it('should call _register with plugin prototype during use()', () => {
      const {mockPuppeteer} = createMockPuppeteerWorkersWithEvents();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const plugin = new MockPuppeteerExtraPlugin('test-plugin');
      wrapped.use(plugin);

      expect(plugin.spies._register.callCount).toEqual(1);
      expect(plugin.spies._register.firstCall.args[0]).toBeDefined();
    });

    it('should call onPluginRegistered after registration', () => {
      const {mockPuppeteer} = createMockPuppeteerWorkersWithEvents();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const plugin = new MockPuppeteerExtraPlugin('test-plugin');
      wrapped.use(plugin);

      expect(plugin.spies.onPluginRegistered.callCount).toEqual(1);
    });

    it('should call _register before onPluginRegistered', () => {
      const {mockPuppeteer} = createMockPuppeteerWorkersWithEvents();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const callOrder: string[] = [];
      const plugin = new MockPuppeteerExtraPlugin('test-plugin');

      // Override spies to track call order
      plugin.spies._register = sinon.spy(() => callOrder.push('_register'));
      plugin.spies.onPluginRegistered = sinon.spy(() =>
        callOrder.push('onPluginRegistered')
      );

      // Need to re-assign methods since we changed the spies
      plugin._register = function (prototype) {
        plugin.spies._register(prototype);
      };
      plugin.onPluginRegistered = function () {
        plugin.spies.onPluginRegistered();
      };

      wrapped.use(plugin);

      expect(callOrder).toEqual(['_register', 'onPluginRegistered']);
    });

    it('should call beforeLaunch with options before launching browser', async () => {
      const {mockPuppeteer} = createMockPuppeteerWorkersWithEvents();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const plugin = new MockPuppeteerExtraPlugin('test-plugin');
      wrapped.use(plugin);

      const launchOptions = {keep_alive: 10000};
      await wrapped.launch({} as any, launchOptions);

      expect(plugin.spies.beforeLaunch.callCount).toEqual(1);
      expect(plugin.spies.beforeLaunch.firstCall.args[0]).toMatchObject(
        launchOptions
      );
    });

    it('should call beforeConnect with options before connecting to browser', async () => {
      const {mockPuppeteer} = createMockPuppeteerWorkersWithEvents();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const plugin = new MockPuppeteerExtraPlugin('test-plugin');
      wrapped.use(plugin);

      await wrapped.connect({} as any, 'session-id');

      expect(plugin.spies.beforeConnect.callCount).toEqual(1);
    });

    it('should call _bindBrowserEvents after browser launch', async () => {
      const {mockPuppeteer, mockBrowser} =
        createMockPuppeteerWorkersWithEvents();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const plugin = new MockPuppeteerExtraPlugin('test-plugin');
      wrapped.use(plugin);

      await wrapped.launch({} as any);

      expect(plugin.spies._bindBrowserEvents.callCount).toEqual(1);
      expect(plugin.spies._bindBrowserEvents.firstCall.args[0]).toBe(
        mockBrowser
      );
      expect(
        plugin.spies._bindBrowserEvents.firstCall.args[1]
      ).toMatchObject({context: 'launch'});
    });

    it('should call _bindBrowserEvents after browser connect', async () => {
      const {mockPuppeteer, mockBrowser} =
        createMockPuppeteerWorkersWithEvents();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const plugin = new MockPuppeteerExtraPlugin('test-plugin');
      wrapped.use(plugin);

      await wrapped.connect({} as any, 'session-id');

      expect(plugin.spies._bindBrowserEvents.callCount).toEqual(1);
      expect(plugin.spies._bindBrowserEvents.firstCall.args[0]).toBe(
        mockBrowser
      );
      expect(
        plugin.spies._bindBrowserEvents.firstCall.args[1]
      ).toMatchObject({context: 'connect'});
    });

    it('should call onBrowser after browser launch', async () => {
      const {mockPuppeteer, mockBrowser} =
        createMockPuppeteerWorkersWithEvents();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const plugin = new MockPuppeteerExtraPlugin('test-plugin');
      wrapped.use(plugin);

      await wrapped.launch({} as any);

      expect(plugin.spies.onBrowser.callCount).toEqual(1);
      expect(plugin.spies.onBrowser.firstCall.args[0]).toBe(mockBrowser);
    });

    it('should call onBrowser after browser connect', async () => {
      const {mockPuppeteer, mockBrowser} =
        createMockPuppeteerWorkersWithEvents();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const plugin = new MockPuppeteerExtraPlugin('test-plugin');
      wrapped.use(plugin);

      await wrapped.connect({} as any, 'session-id');

      expect(plugin.spies.onBrowser.callCount).toEqual(1);
      expect(plugin.spies.onBrowser.firstCall.args[0]).toBe(mockBrowser);
    });

    it('should call onPageCreated when newPage is called', async () => {
      const {mockPuppeteer, mockPage} = createMockPuppeteerWorkersWithEvents();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const plugin = new MockPuppeteerExtraPlugin('test-plugin');
      wrapped.use(plugin);

      const browser = await wrapped.launch({} as any);
      await browser.newPage();

      expect(plugin.spies.onPageCreated.callCount).toEqual(1);
      expect(plugin.spies.onPageCreated.firstCall.args[0]).toBe(mockPage);
    });

    it('should call onPageCreated for multiple pages', async () => {
      const {mockPuppeteer} = createMockPuppeteerWorkersWithEvents();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const plugin = new MockPuppeteerExtraPlugin('test-plugin');
      wrapped.use(plugin);

      const browser = await wrapped.launch({} as any);
      await browser.newPage();
      await browser.newPage();
      await browser.newPage();

      expect(plugin.spies.onPageCreated.callCount).toEqual(3);
    });

    it('should call onDisconnected when browser disconnects', async () => {
      const {mockPuppeteer, mockBrowser} =
        createMockPuppeteerWorkersWithEvents();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const plugin = new MockPuppeteerExtraPlugin('test-plugin');
      wrapped.use(plugin);

      await wrapped.launch({} as any);

      // Simulate browser disconnect
      mockBrowser.emit('disconnected');

      expect(plugin.spies.onDisconnected.callCount).toEqual(1);
    });
  });

  describe('Multiple Plugins Lifecycle', () => {
    it('should call lifecycle methods for all registered plugins', async () => {
      const {mockPuppeteer} = createMockPuppeteerWorkersWithEvents();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const plugin1 = new MockPuppeteerExtraPlugin('plugin-1');
      const plugin2 = new MockPuppeteerExtraPlugin('plugin-2');
      const plugin3 = new MockPuppeteerExtraPlugin('plugin-3');

      wrapped.use(plugin1).use(plugin2).use(plugin3);

      await wrapped.launch({} as any);

      // All plugins should have their lifecycle methods called
      expect(plugin1.spies._register.callCount).toEqual(1);
      expect(plugin2.spies._register.callCount).toEqual(1);
      expect(plugin3.spies._register.callCount).toEqual(1);

      expect(plugin1.spies.onPluginRegistered.callCount).toEqual(1);
      expect(plugin2.spies.onPluginRegistered.callCount).toEqual(1);
      expect(plugin3.spies.onPluginRegistered.callCount).toEqual(1);

      expect(plugin1.spies.beforeLaunch.callCount).toEqual(1);
      expect(plugin2.spies.beforeLaunch.callCount).toEqual(1);
      expect(plugin3.spies.beforeLaunch.callCount).toEqual(1);

      expect(plugin1.spies._bindBrowserEvents.callCount).toEqual(1);
      expect(plugin2.spies._bindBrowserEvents.callCount).toEqual(1);
      expect(plugin3.spies._bindBrowserEvents.callCount).toEqual(1);

      expect(plugin1.spies.onBrowser.callCount).toEqual(1);
      expect(plugin2.spies.onBrowser.callCount).toEqual(1);
      expect(plugin3.spies.onBrowser.callCount).toEqual(1);
    });

    it('should call lifecycle methods in registration order', async () => {
      const {mockPuppeteer} = createMockPuppeteerWorkersWithEvents();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const callOrder: string[] = [];

      const plugin1 = new MockPuppeteerExtraPlugin('plugin-1');
      const plugin2 = new MockPuppeteerExtraPlugin('plugin-2');

      plugin1.spies.onBrowser = sinon.spy(() => callOrder.push('plugin-1'));
      plugin2.spies.onBrowser = sinon.spy(() => callOrder.push('plugin-2'));

      plugin1.onBrowser = async () => {
        plugin1.spies.onBrowser();
      };
      plugin2.onBrowser = async () => {
        plugin2.spies.onBrowser();
      };

      wrapped.use(plugin1).use(plugin2);
      await wrapped.launch({} as any);

      expect(callOrder).toEqual(['plugin-1', 'plugin-2']);
    });

    it('should call onPageCreated for all plugins when page is created', async () => {
      const {mockPuppeteer} = createMockPuppeteerWorkersWithEvents();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const plugin1 = new MockPuppeteerExtraPlugin('plugin-1');
      const plugin2 = new MockPuppeteerExtraPlugin('plugin-2');

      wrapped.use(plugin1).use(plugin2);

      const browser = await wrapped.launch({} as any);
      await browser.newPage();

      expect(plugin1.spies.onPageCreated.callCount).toEqual(1);
      expect(plugin2.spies.onPageCreated.callCount).toEqual(1);
    });
  });

  describe('Plugin Requirements', () => {
    it('should set getDataFromPlugins for plugins with dataFromPlugins requirement', () => {
      const {mockPuppeteer} = createMockPuppeteerWorkersWithEvents();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      class PluginWithDataRequirement extends MockPuppeteerExtraPlugin {
        // Index signature for extensibility
        [propName: string]: unknown;

        override get requirements(): Set<PluginRequirements> {
          return new Set(['dataFromPlugins']);
        }
      }

      const plugin = new PluginWithDataRequirement('data-plugin');
      wrapped.use(plugin);

      expect(typeof plugin.getDataFromPlugins).toBe('function');
    });

    it('should allow plugin to access data from other plugins', () => {
      const {mockPuppeteer} = createMockPuppeteerWorkersWithEvents();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      // Plugin that exposes data
      class DataProviderPlugin extends MockPuppeteerExtraPlugin {
        // Index signature for extensibility
        [propName: string]: unknown;

        override get data(): PluginData[] {
          return [{name: 'user-data', value: {foo: 'bar'}}];
        }
      }

      // Plugin that consumes data
      class DataConsumerPlugin extends MockPuppeteerExtraPlugin {
        // Index signature for extensibility
        [propName: string]: unknown;

        override get requirements(): Set<PluginRequirements> {
          return new Set(['dataFromPlugins']);
        }
      }

      const provider = new DataProviderPlugin('provider');
      const consumer = new DataConsumerPlugin('consumer');

      wrapped.use(provider).use(consumer);

      // Consumer should be able to get data from provider
      const data = consumer.getDataFromPlugins!('user-data');
      expect(data.length).toEqual(1);
      expect(data[0]?.value).toMatchObject({foo: 'bar'});
    });

    it('should order plugins with runLast requirement to run last', async () => {
      const {mockPuppeteer} = createMockPuppeteerWorkersWithEvents();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const callOrder: string[] = [];

      class RunLastPlugin extends MockPuppeteerExtraPlugin {
        // Index signature for extensibility
        [propName: string]: unknown;

        override get requirements(): Set<PluginRequirements> {
          return new Set(['runLast']);
        }
      }

      const plugin1 = new RunLastPlugin('run-last-plugin');
      const plugin2 = new MockPuppeteerExtraPlugin('normal-plugin');

      plugin1.spies.onBrowser = sinon.spy(() =>
        callOrder.push('run-last-plugin')
      );
      plugin2.spies.onBrowser = sinon.spy(() => callOrder.push('normal-plugin'));

      plugin1.onBrowser = async () => {
        plugin1.spies.onBrowser();
      };
      plugin2.onBrowser = async () => {
        plugin2.spies.onBrowser();
      };

      // Register run-last plugin first
      wrapped.use(plugin1).use(plugin2);
      await wrapped.launch({} as any);

      // Even though plugin1 was registered first, it should run last
      expect(callOrder).toEqual(['normal-plugin', 'run-last-plugin']);
    });

    it('should warn when launch-only plugin is used with connect', async () => {
      const {mockPuppeteer} = createMockPuppeteerWorkersWithEvents();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      class LaunchOnlyPlugin extends MockPuppeteerExtraPlugin {
        // Index signature for extensibility
        [propName: string]: unknown;

        override get requirements(): Set<PluginRequirements> {
          return new Set(['launch']);
        }
      }

      const plugin = new LaunchOnlyPlugin('launch-only');

      // Capture console.warn
      const warnSpy = sinon.spy(console, 'warn');

      wrapped.use(plugin);
      await wrapped.connect({} as any, 'session-id');

      expect(warnSpy.called).toBe(true);
      expect(
        warnSpy.calledWith(
          sinon.match(/launch-only.*doesn't support puppeteer.connect/)
        )
      ).toBe(true);

      warnSpy.restore();
    });
  });

  describe('Plugin Dependencies and Dynamic Import', () => {
    it('should call _getMissingDependencies during launch', async () => {
      const {mockPuppeteer} = createMockPuppeteerWorkersWithEvents();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const plugin = new MockPuppeteerExtraPlugin('test-plugin');
      wrapped.use(plugin);

      await wrapped.launch({} as any);

      expect(plugin.spies._getMissingDependencies.callCount).toEqual(1);
    });

    it('should call _getMissingDependencies during connect', async () => {
      const {mockPuppeteer} = createMockPuppeteerWorkersWithEvents();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const plugin = new MockPuppeteerExtraPlugin('test-plugin');
      wrapped.use(plugin);

      await wrapped.connect({} as any, 'session-id');

      expect(plugin.spies._getMissingDependencies.callCount).toEqual(1);
    });

    it('should not try to import dependencies that are already registered', async () => {
      const {mockPuppeteer} = createMockPuppeteerWorkersWithEvents();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      // Plugin that depends on another plugin that's already registered
      const dependencyPlugin = new MockPuppeteerExtraPlugin('dependency');
      const dependentPlugin = new MockPluginWithDependencies('dependent', [
        'dependency',
      ]);

      // Register dependency first
      wrapped.use(dependencyPlugin);
      wrapped.use(dependentPlugin);

      // Should not throw since dependency is already registered
      await wrapped.launch({} as any);

      // Verify _getMissingDependencies was called
      expect(dependentPlugin.spies._getMissingDependencies.callCount).toEqual(
        1
      );
    });

    it('should throw error when trying to import missing dependency', async () => {
      const {mockPuppeteer} = createMockPuppeteerWorkersWithEvents();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      // Plugin that depends on a non-existent plugin
      const dependentPlugin = new MockPluginWithDependencies('dependent', [
        'non-existent-plugin',
      ]);

      wrapped.use(dependentPlugin);

      // Should throw because the dependency cannot be found
      await expect(wrapped.launch({} as any)).rejects.toThrow();
    });
  });

  describe('Complete Plugin Lifecycle Flow', () => {
    it('should call all lifecycle methods in correct order during launch', async () => {
      const {mockPuppeteer} = createMockPuppeteerWorkersWithEvents();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const callOrder: string[] = [];
      const plugin = new MockPuppeteerExtraPlugin('test-plugin');

      // Override all lifecycle methods to track order
      const originalRegister = plugin._register.bind(plugin);
      plugin._register = function (prototype) {
        callOrder.push('_register');
        originalRegister(prototype);
      };

      plugin.onPluginRegistered = function () {
        callOrder.push('onPluginRegistered');
      };

      plugin.beforeLaunch = async function (options) {
        callOrder.push('beforeLaunch');
        return options;
      };

      plugin._bindBrowserEvents = async function () {
        callOrder.push('_bindBrowserEvents');
      };

      plugin.onBrowser = async function () {
        callOrder.push('onBrowser');
      };

      plugin.onPageCreated = async function () {
        callOrder.push('onPageCreated');
      };

      wrapped.use(plugin);
      const browser = await wrapped.launch({} as any);
      await browser.newPage();

      expect(callOrder).toEqual([
        '_register',
        'onPluginRegistered',
        'beforeLaunch',
        '_bindBrowserEvents',
        'onBrowser',
        'onPageCreated',
      ]);
    });

    it('should call all lifecycle methods in correct order during connect', async () => {
      const {mockPuppeteer} = createMockPuppeteerWorkersWithEvents();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const callOrder: string[] = [];
      const plugin = new MockPuppeteerExtraPlugin('test-plugin');

      // Override all lifecycle methods to track order
      const originalRegister = plugin._register.bind(plugin);
      plugin._register = function (prototype) {
        callOrder.push('_register');
        originalRegister(prototype);
      };

      plugin.onPluginRegistered = function () {
        callOrder.push('onPluginRegistered');
      };

      plugin.beforeConnect = async function (options) {
        callOrder.push('beforeConnect');
        return options;
      };

      plugin._bindBrowserEvents = async function () {
        callOrder.push('_bindBrowserEvents');
      };

      plugin.onBrowser = async function () {
        callOrder.push('onBrowser');
      };

      plugin.onPageCreated = async function () {
        callOrder.push('onPageCreated');
      };

      wrapped.use(plugin);
      const browser = await wrapped.connect({} as any, 'session-id');
      await browser.newPage();

      expect(callOrder).toEqual([
        '_register',
        'onPluginRegistered',
        'beforeConnect',
        '_bindBrowserEvents',
        'onBrowser',
        'onPageCreated',
      ]);
    });
  });

  describe('beforeLaunch Option Modification', () => {
    it('should allow plugins to modify launch options', async () => {
      const {mockPuppeteer} = createMockPuppeteerWorkersWithEvents();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      class OptionModifyingPlugin extends MockPuppeteerExtraPlugin {
        // Index signature for extensibility
        [propName: string]: unknown;

        override async beforeLaunch(
          options: Record<string, unknown>
        ): Promise<Record<string, unknown>> {
          this.spies.beforeLaunch(options);
          return {...options, customOption: 'added-by-plugin'};
        }
      }

      const plugin = new OptionModifyingPlugin('modifier');
      wrapped.use(plugin);

      await wrapped.launch({} as any, {originalOption: 'value'} as any);

      // Verify beforeLaunch received the original options
      expect(plugin.spies.beforeLaunch.firstCall.args[0]).toMatchObject({
        originalOption: 'value',
      });
    });

    it('should pass modified options through plugin chain', async () => {
      const {mockPuppeteer} = createMockPuppeteerWorkersWithEvents();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      class Plugin1 extends MockPuppeteerExtraPlugin {
        // Index signature for extensibility
        [propName: string]: unknown;

        override async beforeLaunch(
          options: Record<string, unknown>
        ): Promise<Record<string, unknown>> {
          this.spies.beforeLaunch(options);
          return {...options, plugin1: true};
        }
      }

      class Plugin2 extends MockPuppeteerExtraPlugin {
        // Index signature for extensibility
        [propName: string]: unknown;

        override async beforeLaunch(
          options: Record<string, unknown>
        ): Promise<Record<string, unknown>> {
          this.spies.beforeLaunch(options);
          return {...options, plugin2: true};
        }
      }

      const plugin1 = new Plugin1('plugin-1');
      const plugin2 = new Plugin2('plugin-2');

      wrapped.use(plugin1).use(plugin2);
      await wrapped.launch({} as any, {});

      // Plugin2 should receive options modified by Plugin1
      expect(plugin2.spies.beforeLaunch.firstCall.args[0]).toMatchObject({
        plugin1: true,
      });
    });
  });

  describe('Plugin Validation', () => {
    it('should reject plugins without _isPuppeteerExtraPlugin when explicitly false', () => {
      const {mockPuppeteer} = createMockPuppeteerWorkersWithEvents();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      // Capture console.error
      const errorSpy = sinon.spy(console, 'error');

      const invalidPlugin = {
        name: 'invalid',
        _isPuppeteerExtraPlugin: false,
      } as PuppeteerExtraPlugin;

      wrapped.use(invalidPlugin);

      expect(errorSpy.called).toBe(true);
      expect(wrapped.plugins.length).toEqual(0);

      errorSpy.restore();
    });

    it('should accept plugins with _isPuppeteerExtraPlugin = true', () => {
      const {mockPuppeteer} = createMockPuppeteerWorkersWithEvents();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const validPlugin = new MockPuppeteerExtraPlugin('valid');
      wrapped.use(validPlugin);

      expect(wrapped.plugins.length).toEqual(1);
    });

    it('should accept plain object plugins without _isPuppeteerExtraPlugin', () => {
      const {mockPuppeteer} = createMockPuppeteerWorkersWithEvents();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const simplePlugin: PuppeteerExtraPlugin = {
        name: 'simple-plugin',
      };

      wrapped.use(simplePlugin);

      expect(wrapped.plugins.length).toEqual(1);
    });
  });
});
