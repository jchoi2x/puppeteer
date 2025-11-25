import puppeteer from '@cloudflare/puppeteer';
import type {BrowserWorker} from '@cloudflare/puppeteer';
import {env} from 'cloudflare:workers';
import {expect} from 'expect';
import {wrapPuppeteer} from 'puppeteer-extra';
import type {PuppeteerExtraPlugin} from 'puppeteer-extra';

/**
 * E2E tests for puppeteer-extra plugin system in Cloudflare Workers.
 * These tests verify that the plugin system works correctly when running
 * inside a Cloudflare Worker with a real browser session.
 */

test('should wrap puppeteer with plugin support @smoke', async () => {
  const puppeteerExtra = wrapPuppeteer(puppeteer);

  expect(typeof puppeteerExtra.use).toBe('function');
  expect(typeof puppeteerExtra.launch).toBe('function');
  expect(typeof puppeteerExtra.connect).toBe('function');
  expect(typeof puppeteerExtra.sessions).toBe('function');
  expect(typeof puppeteerExtra.history).toBe('function');
  expect(typeof puppeteerExtra.limits).toBe('function');
  expect(typeof puppeteerExtra.acquire).toBe('function');
});

test('should register plugins with use() method @smoke', async () => {
  const puppeteerExtra = wrapPuppeteer(puppeteer);

  const plugin: PuppeteerExtraPlugin = {
    name: 'test-plugin',
  };

  puppeteerExtra.use(plugin);

  expect(puppeteerExtra.plugins).toHaveLength(1);
  expect(puppeteerExtra.pluginNames).toEqual(['test-plugin']);
});

test('should support plugin chaining @smoke', async () => {
  const puppeteerExtra = wrapPuppeteer(puppeteer);

  const plugin1: PuppeteerExtraPlugin = {name: 'plugin-1'};
  const plugin2: PuppeteerExtraPlugin = {name: 'plugin-2'};

  const result = puppeteerExtra.use(plugin1).use(plugin2);

  expect(result).toBe(puppeteerExtra);
  expect(puppeteerExtra.plugins).toHaveLength(2);
  expect(puppeteerExtra.pluginNames).toEqual(['plugin-1', 'plugin-2']);
});

test('should call onPluginRegistered when plugin is registered @smoke', async () => {
  const puppeteerExtra = wrapPuppeteer(puppeteer);

  let registered = false;
  const plugin: PuppeteerExtraPlugin = {
    name: 'test-plugin',
    onPluginRegistered: () => {
      registered = true;
    },
  };

  puppeteerExtra.use(plugin);

  expect(registered).toBe(true);
});

test('should call onBrowser hook when launching browser @smoke', async () => {
  const puppeteerExtra = wrapPuppeteer(puppeteer);

  let browserHookCalled = false;
  let receivedBrowser: unknown = null;

  const plugin: PuppeteerExtraPlugin = {
    name: 'test-plugin',
    onBrowser: browser => {
      browserHookCalled = true;
      receivedBrowser = browser;
    },
  };

  puppeteerExtra.use(plugin);

  const browser = await puppeteerExtra.launch(env.BROWSER as BrowserWorker);

  expect(browserHookCalled).toBe(true);
  expect(receivedBrowser).toBe(browser);

  await browser.close();
});

test('should call onPageCreated hook when creating page @smoke', async () => {
  const puppeteerExtra = wrapPuppeteer(puppeteer);

  let pageHookCalled = false;
  let receivedPage: unknown = null;

  const plugin: PuppeteerExtraPlugin = {
    name: 'test-plugin',
    onPageCreated: page => {
      pageHookCalled = true;
      receivedPage = page;
    },
  };

  puppeteerExtra.use(plugin);

  const browser = await puppeteerExtra.launch(env.BROWSER as BrowserWorker);
  const page = await browser.newPage();

  expect(pageHookCalled).toBe(true);
  expect(receivedPage).toBe(page);

  await browser.close();
});

test('should call hooks for multiple plugins @smoke', async () => {
  const puppeteerExtra = wrapPuppeteer(puppeteer);

  const hookCalls: string[] = [];

  const plugin1: PuppeteerExtraPlugin = {
    name: 'plugin-1',
    onBrowser: () => {
      hookCalls.push('plugin-1:onBrowser');
    },
    onPageCreated: () => {
      hookCalls.push('plugin-1:onPageCreated');
    },
  };

  const plugin2: PuppeteerExtraPlugin = {
    name: 'plugin-2',
    onBrowser: () => {
      hookCalls.push('plugin-2:onBrowser');
    },
    onPageCreated: () => {
      hookCalls.push('plugin-2:onPageCreated');
    },
  };

  puppeteerExtra.use(plugin1).use(plugin2);

  const browser = await puppeteerExtra.launch(env.BROWSER as BrowserWorker);
  await browser.newPage();

  expect(hookCalls).toContain('plugin-1:onBrowser');
  expect(hookCalls).toContain('plugin-2:onBrowser');
  expect(hookCalls).toContain('plugin-1:onPageCreated');
  expect(hookCalls).toContain('plugin-2:onPageCreated');

  await browser.close();
});

test('should order plugins with runLast requirement @smoke', async () => {
  const puppeteerExtra = wrapPuppeteer(puppeteer);

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

  puppeteerExtra.use(plugin1).use(plugin2);

  const browser = await puppeteerExtra.launch(env.BROWSER as BrowserWorker);

  // plugin-2 should be called before plugin-1 because plugin-1 has runLast
  expect(callOrder).toEqual(['plugin-2', 'plugin-1']);

  await browser.close();
});

test('should collect plugin data @smoke', async () => {
  const puppeteerExtra = wrapPuppeteer(puppeteer);

  const plugin1: PuppeteerExtraPlugin = {
    name: 'plugin-1',
    data: {name: 'data-1', value: {foo: 'bar'}},
  };

  const plugin2: PuppeteerExtraPlugin = {
    name: 'plugin-2',
    data: [{name: 'data-2', value: {baz: 'qux'}}],
  };

  puppeteerExtra.use(plugin1).use(plugin2);

  const allData = puppeteerExtra.getPluginData();
  expect(allData).toHaveLength(2);

  const filteredData = puppeteerExtra.getPluginData('data-1');
  expect(filteredData).toHaveLength(1);
  expect(filteredData[0]?.name).toEqual('data-1');
});

test('should work with connect method @smoke', async () => {
  const puppeteerExtra = wrapPuppeteer(puppeteer);

  let browserHookCalled = false;

  const plugin: PuppeteerExtraPlugin = {
    name: 'test-plugin',
    onBrowser: () => {
      browserHookCalled = true;
    },
  };

  puppeteerExtra.use(plugin);

  // First acquire a session
  const {sessionId} = await puppeteerExtra.acquire(env.BROWSER as BrowserWorker);

  if (!sessionId) {
    throw new Error('Failed to acquire session: sessionId is undefined');
  }

  // Then connect to it
  const browser = await puppeteerExtra.connect(
    env.BROWSER as BrowserWorker,
    sessionId
  );

  expect(browserHookCalled).toBe(true);

  await browser.close();
});

test('should be able to navigate pages with plugins @smoke', async () => {
  const puppeteerExtra = wrapPuppeteer(puppeteer);

  let pageUrl = '';

  const plugin: PuppeteerExtraPlugin = {
    name: 'url-tracker',
    onPageCreated: async page => {
      page.on('load', () => {
        pageUrl = page.url();
      });
    },
  };

  puppeteerExtra.use(plugin);

  const browser = await puppeteerExtra.launch(env.BROWSER as BrowserWorker);
  const page = await browser.newPage();

  await page.goto('https://example.com/');

  expect(pageUrl).toBe('https://example.com/');

  await browser.close();
});

test('should provide getDataFromPlugins for plugins with dataFromPlugins requirement @smoke', async () => {
  const puppeteerExtra = wrapPuppeteer(puppeteer);

  const dataProviderPlugin: PuppeteerExtraPlugin = {
    name: 'data-provider',
    data: {name: 'shared-data', value: {secret: 42}},
  };

  const dataConsumerPlugin: PuppeteerExtraPlugin = {
    name: 'data-consumer',
    requirements: new Set(['dataFromPlugins']),
  };

  puppeteerExtra.use(dataProviderPlugin).use(dataConsumerPlugin);

  expect(typeof dataConsumerPlugin.getDataFromPlugins).toBe('function');

  const data = dataConsumerPlugin.getDataFromPlugins!('shared-data');
  expect(data).toHaveLength(1);
  expect(data[0]?.value).toEqual({secret: 42});
});
