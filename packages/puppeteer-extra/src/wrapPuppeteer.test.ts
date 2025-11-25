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
      // Cast as any since we're using a mock
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
  });
});
