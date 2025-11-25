/**
 * @license
 * Copyright 2025 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

import {describe, it} from 'node:test';

import expect from 'expect';
import sinon from 'sinon';

import {wrapPuppeteer} from './wrapPuppeteer.js';

import type {PuppeteerExtraPlugin} from './index.js';

// Create a mock PuppeteerWorkers instance
function createMockPuppeteerWorkers() {
  // Create mock browser and page
  const mockPage = {
    url: () => {
      return 'https://example.com';
    },
  };

  const mockBrowser = {
    newPage: sinon.stub().resolves(mockPage),
    close: sinon.stub().resolves(),
  };

  // Create mock PuppeteerWorkers
  const mockPuppeteer = {
    launch: sinon.stub().resolves(mockBrowser),
    connect: sinon.stub().resolves(mockBrowser),
    sessions: sinon.stub().resolves([]),
    history: sinon.stub().resolves([]),
    limits: sinon.stub().resolves({}),
    acquire: sinon.stub().resolves({sessionId: 'mock-session-id'}),
  };

  return {mockPuppeteer, mockBrowser, mockPage};
}

describe('wrapPuppeteer', () => {
  describe('use', () => {
    it('should add use method to puppeteer instance', () => {
      const {mockPuppeteer} = createMockPuppeteerWorkers();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      expect(typeof wrapped.use).toBe('function');
    });

    it('should support chaining with use', () => {
      const {mockPuppeteer} = createMockPuppeteerWorkers();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const plugin: PuppeteerExtraPlugin = {name: 'test-plugin'};
      const result = wrapped.use(plugin);

      expect(result).toBe(wrapped);
    });

    it('should call onPluginRegistered when plugin is registered', () => {
      const {mockPuppeteer} = createMockPuppeteerWorkers();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const onPluginRegistered = sinon.spy();
      const plugin: PuppeteerExtraPlugin = {
        name: 'test-plugin',
        onPluginRegistered,
      };

      wrapped.use(plugin);

      expect(onPluginRegistered.callCount).toEqual(1);
    });

    it('should call _register when plugin has it', () => {
      const {mockPuppeteer} = createMockPuppeteerWorkers();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const _register = sinon.spy();
      const plugin: PuppeteerExtraPlugin = {
        name: 'test-plugin',
        _register,
      };

      wrapped.use(plugin);

      expect(_register.callCount).toEqual(1);
    });

    it('should ignore plugins without a name', () => {
      const {mockPuppeteer} = createMockPuppeteerWorkers();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const plugin = {} as PuppeteerExtraPlugin;
      wrapped.use(plugin);

      expect(wrapped.plugins.length).toEqual(0);
    });

    it('should set getDataFromPlugins for plugins with dataFromPlugins requirement', () => {
      const {mockPuppeteer} = createMockPuppeteerWorkers();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const plugin: PuppeteerExtraPlugin = {
        name: 'test-plugin',
        requirements: new Set(['dataFromPlugins']),
      };

      wrapped.use(plugin);

      expect(typeof plugin.getDataFromPlugins).toBe('function');
    });
  });

  describe('plugins and pluginNames', () => {
    it('should return list of registered plugins', () => {
      const {mockPuppeteer} = createMockPuppeteerWorkers();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const plugin1: PuppeteerExtraPlugin = {name: 'plugin-1'};
      const plugin2: PuppeteerExtraPlugin = {name: 'plugin-2'};

      wrapped.use(plugin1).use(plugin2);

      expect(wrapped.plugins.length).toEqual(2);
      expect(wrapped.pluginNames).toEqual(['plugin-1', 'plugin-2']);
    });
  });

  describe('getPluginData', () => {
    it('should collect data from all plugins', () => {
      const {mockPuppeteer} = createMockPuppeteerWorkers();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const plugin1: PuppeteerExtraPlugin = {
        name: 'plugin-1',
        data: {name: 'data-1', value: {foo: 'bar'}},
      };
      const plugin2: PuppeteerExtraPlugin = {
        name: 'plugin-2',
        data: [{name: 'data-2', value: {baz: 'qux'}}],
      };

      wrapped.use(plugin1).use(plugin2);

      const allData = wrapped.getPluginData();
      expect(allData.length).toEqual(2);
    });

    it('should filter data by name', () => {
      const {mockPuppeteer} = createMockPuppeteerWorkers();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const plugin1: PuppeteerExtraPlugin = {
        name: 'plugin-1',
        data: {name: 'data-1', value: {foo: 'bar'}},
      };
      const plugin2: PuppeteerExtraPlugin = {
        name: 'plugin-2',
        data: {name: 'data-2', value: {baz: 'qux'}},
      };

      wrapped.use(plugin1).use(plugin2);

      const filteredData = wrapped.getPluginData('data-1');
      expect(filteredData.length).toEqual(1);
      expect(filteredData[0]?.name).toEqual('data-1');
    });
  });

  describe('launch', () => {
    it('should call onBrowser when browser is launched', async () => {
      const {mockPuppeteer, mockBrowser} = createMockPuppeteerWorkers();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const onBrowser = sinon.spy();
      const plugin: PuppeteerExtraPlugin = {
        name: 'test-plugin',
        onBrowser,
      };

      wrapped.use(plugin);
      await wrapped.launch({} as any);

      expect(onBrowser.callCount).toEqual(1);
      expect(onBrowser.firstCall.args[0]).toBe(mockBrowser);
    });

    it('should call onPageCreated when page is created', async () => {
      const {mockPuppeteer, mockPage} = createMockPuppeteerWorkers();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const onPageCreated = sinon.spy();
      const plugin: PuppeteerExtraPlugin = {
        name: 'test-plugin',
        onPageCreated,
      };

      wrapped.use(plugin);
      const browser = await wrapped.launch({} as any);
      await browser.newPage();

      expect(onPageCreated.callCount).toEqual(1);
      expect(onPageCreated.firstCall.args[0]).toBe(mockPage);
    });

    it('should call beforeLaunch and allow option modification', async () => {
      const {mockPuppeteer} = createMockPuppeteerWorkers();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const beforeLaunch = sinon.stub().callsFake(options => {
        return {...options, modified: true};
      });
      const plugin: PuppeteerExtraPlugin = {
        name: 'test-plugin',
        beforeLaunch,
      };

      wrapped.use(plugin);
      await wrapped.launch({} as any, {keep_alive: 10000});

      expect(beforeLaunch.callCount).toEqual(1);
    });

    it('should call _bindBrowserEvents for plugins that have it', async () => {
      const {mockPuppeteer} = createMockPuppeteerWorkers();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const _bindBrowserEvents = sinon.spy();
      const plugin: PuppeteerExtraPlugin = {
        name: 'test-plugin',
        _bindBrowserEvents,
      };

      wrapped.use(plugin);
      await wrapped.launch({} as any);

      expect(_bindBrowserEvents.callCount).toEqual(1);
    });
  });

  describe('connect', () => {
    it('should call onBrowser when browser is connected', async () => {
      const {mockPuppeteer, mockBrowser} = createMockPuppeteerWorkers();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const onBrowser = sinon.spy();
      const plugin: PuppeteerExtraPlugin = {
        name: 'test-plugin',
        onBrowser,
      };

      wrapped.use(plugin);
      await wrapped.connect({} as any, 'session-id');

      expect(onBrowser.callCount).toEqual(1);
      expect(onBrowser.firstCall.args[0]).toBe(mockBrowser);
    });

    it('should call beforeConnect', async () => {
      const {mockPuppeteer} = createMockPuppeteerWorkers();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const beforeConnect = sinon.spy();
      const plugin: PuppeteerExtraPlugin = {
        name: 'test-plugin',
        beforeConnect,
      };

      wrapped.use(plugin);
      await wrapped.connect({} as any, 'session-id');

      expect(beforeConnect.callCount).toEqual(1);
    });
  });

  describe('multiple plugins', () => {
    it('should call hooks for all registered plugins', async () => {
      const {mockPuppeteer} = createMockPuppeteerWorkers();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const onBrowser1 = sinon.spy();
      const onBrowser2 = sinon.spy();

      const plugin1: PuppeteerExtraPlugin = {
        name: 'plugin-1',
        onBrowser: onBrowser1,
      };
      const plugin2: PuppeteerExtraPlugin = {
        name: 'plugin-2',
        onBrowser: onBrowser2,
      };

      wrapped.use(plugin1).use(plugin2);
      await wrapped.launch({} as any);

      expect(onBrowser1.callCount).toEqual(1);
      expect(onBrowser2.callCount).toEqual(1);
    });

    it('should order plugins with runLast requirement', async () => {
      const {mockPuppeteer} = createMockPuppeteerWorkers();
      const wrapped = wrapPuppeteer(mockPuppeteer as any);

      const callOrder: string[] = [];

      const plugin1: PuppeteerExtraPlugin = {
        name: 'plugin-1',
        requirements: new Set(['runLast']),
        onBrowser: () => {
          callOrder.push('plugin-1');
        },
      };
      const plugin2: PuppeteerExtraPlugin = {
        name: 'plugin-2',
        onBrowser: () => {
          callOrder.push('plugin-2');
        },
      };

      wrapped.use(plugin1).use(plugin2);
      await wrapped.launch({} as any);

      // plugin-2 should be called before plugin-1 because plugin-1 has runLast
      expect(callOrder).toEqual(['plugin-2', 'plugin-1']);
    });
  });
});
