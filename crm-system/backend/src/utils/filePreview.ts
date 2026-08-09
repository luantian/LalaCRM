import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import { Response } from 'express'
import logger from './logger'

const execFileAsync = promisify(execFile)

// 查找 LibreOffice 可执行文件路径
const findLibreOfficePath = (): string => {
  // 常见安装路径（Windows）
  const commonPaths = [
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    '/usr/bin/soffice',
    '/usr/lib/libreoffice/program/soffice'
  ]
  
  for (const p of commonPaths) {
    if (fs.existsSync(p)) {
      return p
    }
  }
  
  // 默认返回 soffice（依赖 PATH）
  return 'soffice'
}

const LIBREOFFICE_PATH = findLibreOfficePath()

// MIME types for directly-serveable formats (images + PDF)
const DIRECT_MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp',
  pdf: 'application/pdf'
}

// Office extensions supported for conversion
const OFFICE_EXTENSIONS = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']

// Track ongoing conversions to deduplicate concurrent requests for the same file
const pendingConversions = new Map<number, Promise<boolean>>()

// Cache directory for converted PDFs
const PREVIEW_CACHE_DIR = path.resolve(path.join(__dirname, '../uploads/previews'))

/**
 * Get the file extension (lowercase, without dot)
 */
const getExt = (fileName: string): string =>
  fileName.split('.').pop()?.toLowerCase() || ''

/**
 * Check if a file is a directly previewable format (image or PDF)
 */
export const isDirectlyPreviewable = (fileName: string): boolean =>
  !!DIRECT_MIME_TYPES[getExt(fileName)]

/**
 * Check if a file is an Office document (Word/Excel) that can be converted to PDF
 */
export const isOfficeFile = (fileName: string): boolean =>
  OFFICE_EXTENSIONS.includes(getExt(fileName))

/**
 * Get the MIME type for a directly-previewable file
 */
export const getMimeType = (fileName: string): string =>
  DIRECT_MIME_TYPES[getExt(fileName)] || 'application/octet-stream'

/**
 * Get the cache path for a converted PDF
 */
export const getPreviewCachePath = (fileId: number): string =>
  path.join(PREVIEW_CACHE_DIR, `${fileId}.pdf`)

/**
 * Ensure the cache directory exists
 */
const ensureCacheDir = () => {
  if (!fs.existsSync(PREVIEW_CACHE_DIR)) {
    fs.mkdirSync(PREVIEW_CACHE_DIR, { recursive: true })
  }
}

/**
 * Convert an Office document to PDF using LibreOffice headless.
 * Returns true on success, false on failure.
 */
const convertToPdf = async (inputPath: string, outputPath: string, fileId: number): Promise<boolean> => {
  ensureCacheDir()

  const outDir = path.dirname(outputPath)
  const inputAbsPath = path.resolve(inputPath)
  const inputBaseName = path.basename(inputPath, path.extname(inputPath))
  const libreOfficeOutputPath = path.join(outDir, `${inputBaseName}.pdf`)

  // Use a unique user profile per conversion to avoid lock conflicts
  const uniqueProfileDir = `/tmp/lo-profile-${fileId}-${Date.now()}`

  try {
    await execFileAsync(LIBREOFFICE_PATH, [
      '--headless',
      '--norestore',
      `-env:UserProfile=file://${uniqueProfileDir}`,
      '--convert-to', 'pdf',
      '--outdir', outDir,
      inputAbsPath
    ], { timeout: 30000, maxBuffer: 1024 * 1024 })

    // LibreOffice names output as <input-basename>.pdf; rename to our target path if needed
    if (libreOfficeOutputPath !== outputPath) {
      if (fs.existsSync(libreOfficeOutputPath)) {
        fs.renameSync(libreOfficeOutputPath, outputPath)
      } else {
        return false
      }
    }

    return fs.existsSync(outputPath)
  } catch (error) {
    logger.error(`LibreOffice conversion failed for fileId=${fileId}:`, error)
    return false
  } finally {
    // Clean up the temporary user profile
    try {
      if (fs.existsSync(uniqueProfileDir)) {
        fs.rmSync(uniqueProfileDir, { recursive: true, force: true })
      }
    } catch { /* ignore cleanup errors */ }
  }
}

/**
 * Serve a file as a download (fallback when preview is not possible)
 */
const serveAsDownload = (res: Response, fileName: string, filePath: string) => {
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)
  res.setHeader('Content-Type', 'application/octet-stream')
  fs.createReadStream(filePath).pipe(res)
}

/**
 * Serve a file for preview in the browser.
 * - Images/PDF: served directly with proper Content-Type
 * - Office documents (doc/docx/xls/xlsx): converted to PDF on first request, cached, then served
 * - On any failure for Office documents: fallback to downloading the original file
 *
 * @param res Express response object
 * @param fileId Unique file ID (used for cache key)
 * @param fileName Original file name (used for extension detection and Content-Disposition)
 * @param filePath Absolute path to the original file on disk
 */
export const servePreview = async (
  res: Response,
  fileId: number,
  fileName: string,
  filePath: string
): Promise<void> => {
  const ext = getExt(fileName)

  // Case 1: Directly previewable (image or PDF)
  if (DIRECT_MIME_TYPES[ext]) {
    res.setHeader('Content-Type', DIRECT_MIME_TYPES[ext])
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`)
    fs.createReadStream(filePath).pipe(res)
    return
  }

  // Case 2: Office document - needs conversion
  if (OFFICE_EXTENSIONS.includes(ext)) {
    const cachePath = getPreviewCachePath(fileId)

    // If cache doesn't exist, trigger conversion (with dedup)
    if (!fs.existsSync(cachePath)) {
      let conversionPromise = pendingConversions.get(fileId)
      if (!conversionPromise) {
        conversionPromise = convertToPdf(filePath, cachePath, fileId)
        pendingConversions.set(fileId, conversionPromise)
        // Clean up the map entry when done (success or failure)
        conversionPromise.finally(() => pendingConversions.delete(fileId))
      }

      try {
        const success = await conversionPromise
        if (!success) {
          // Conversion failed - fallback to download
          serveAsDownload(res, fileName, filePath)
          return
        }
      } catch {
        // Unexpected error - fallback to download
        serveAsDownload(res, fileName, filePath)
        return
      }
    }

    // Serve the cached PDF
    const pdfFileName = fileName.replace(/\.(doc|docx|xls|xlsx|ppt|pptx)$/i, '.pdf')
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(pdfFileName)}"`)
    fs.createReadStream(cachePath).pipe(res)
    return
  }

  // Case 3: Unsupported format - fallback to download
  serveAsDownload(res, fileName, filePath)
}

/**
 * Delete the cached preview PDF for a file (call when the original file is deleted)
 */
export const cleanupPreviewCache = (fileId: number): void => {
  const cachePath = getPreviewCachePath(fileId)
  try {
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath)
    }
  } catch (error) {
    logger.error(`Failed to cleanup preview cache for fileId=${fileId}:`, error)
  }
}
