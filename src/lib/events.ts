/** Typed events for @create-figma-plugin/utilities emit/on. */

import type { EventHandler } from '@create-figma-plugin/utilities'
import type {
  ExportRequest,
  ExportResult,
  ProgressMessage,
  PluginSettings,
  StateMessage,
  StoredFontMeta,
} from './types'

export interface UiReadyHandler extends EventHandler {
  name: 'UI_READY'
  handler: () => void
}

export interface StateHandler extends EventHandler {
  name: 'STATE'
  handler: (state: StateMessage) => void
}

export interface ExportHandler extends EventHandler {
  name: 'EXPORT'
  handler: (request: ExportRequest) => void
}

export interface ExportResultHandler extends EventHandler {
  name: 'EXPORT_RESULT'
  handler: (result: ExportResult) => void
}

export interface ExportErrorHandler extends EventHandler {
  name: 'EXPORT_ERROR'
  handler: (message: string) => void
}

export interface ProgressHandler extends EventHandler {
  name: 'PROGRESS'
  handler: (progress: ProgressMessage) => void
}

export interface SaveSettingsHandler extends EventHandler {
  name: 'SAVE_SETTINGS'
  handler: (settings: PluginSettings) => void
}

export interface StoreFontHandler extends EventHandler {
  name: 'STORE_FONT'
  handler: (meta: StoredFontMeta, bytes: Uint8Array) => void
}

export interface DeleteFontHandler extends EventHandler {
  name: 'DELETE_FONT'
  handler: (id: string) => void
}

export interface StoredFontsHandler extends EventHandler {
  name: 'STORED_FONTS'
  handler: (fonts: Array<{ meta: StoredFontMeta; bytes: Uint8Array }>) => void
}

export interface NotifyHandler extends EventHandler {
  name: 'NOTIFY'
  handler: (message: string, error?: boolean) => void
}

export interface ResizeHandler extends EventHandler {
  name: 'RESIZE'
  handler: (width: number, height: number) => void
}
