/**
 * @license
 * Copyright 2025 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Browser, Page} from '@cloudflare/puppeteer';

/**
 * Plugin data that can be shared between plugins.
 *
 * @public
 */
export interface PluginData {
  name: string;
  value: Record<string, unknown>;
}

/**
 * Requirements that a plugin may have.
 *
 * @public
 */
export type PluginRequirements =
  | 'launch'
  | 'headful'
  | 'runLast'
  | 'dataFromPlugins';

/**
 * Base interface for Puppeteer Extra plugins.
 *
 * @remarks
 * This interface is inspired by the puppeteer-extra plugin system but adapted
 * for Cloudflare Workers. Plugins can hook into browser and page lifecycle
 * events to extend Puppeteer functionality.
 *
 * @public
 */
export interface PuppeteerExtraPlugin {
  /**
   * Indicates this is a valid PuppeteerExtraPlugin.
   * Used for validation in the `use()` method.
   */
  _isPuppeteerExtraPlugin?: boolean;

  /**
   * Plugin name for identification purposes.
   */
  readonly name: string;

  /**
   * Plugin requirements (e.g., 'launch', 'headful', 'runLast', 'dataFromPlugins').
   */
  requirements?: Set<PluginRequirements>;

  /**
   * Plugin dependencies - names of other plugins this plugin depends on.
   */
  dependencies?: Set<string>;

  /**
   * Data exposed by the plugin for other plugins to consume.
   */
  data?: PluginData | PluginData[];

  /**
   * Called when the plugin is registered.
   * This is called by the plugin host during `use()`.
   *
   * @param prototype - The plugin prototype
   */
  _register?(prototype: unknown): void;

  /**
   * Get missing dependencies for this plugin.
   *
   * @param plugins - Currently registered plugins
   * @returns Set of missing dependency names
   */
  _getMissingDependencies?(plugins: PuppeteerExtraPlugin[]): Set<string>;

  /**
   * Bind browser events for this plugin.
   *
   * @param browser - The browser instance
   * @param opts - Context options
   */
  _bindBrowserEvents?(
    browser: Browser,
    opts: {context: string; options: unknown}
  ): Promise<void> | void;

  /**
   * Called when the plugin is registered with `use()`.
   * Override this method to perform any initialization logic.
   */
  onPluginRegistered?(): void;

  /**
   * Called before launching a browser.
   * Can modify launch options.
   *
   * @param options - The launch options
   * @returns Modified options or void
   */
  beforeLaunch?(options: unknown): Promise<unknown> | unknown;

  /**
   * Called before connecting to a browser.
   * Can modify connect options.
   *
   * @param options - The connect options
   * @returns Modified options or void
   */
  beforeConnect?(options: unknown): Promise<unknown> | unknown;

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

  /**
   * Called when the browser is disconnected.
   *
   * @param browser - The browser instance
   */
  onDisconnected?(browser: Browser): Promise<void> | void;

  /**
   * Called when the browser is closed.
   *
   * @param browser - The browser instance
   */
  onClose?(browser: Browser): Promise<void> | void;

  /**
   * Function to get data from other plugins.
   * Set by the plugin host when 'dataFromPlugins' requirement is present.
   */
  getDataFromPlugins?(name?: string): PluginData[];

  /**
   * Allow additional properties for plugin extensibility.
   */
  [propName: string]: unknown;
}

export {wrapPuppeteer} from './wrapPuppeteer.js';
export {wrapPuppeteer as default} from './wrapPuppeteer.js';
export type {PuppeteerWorkersWithUse} from './wrapPuppeteer.js';
