// utils/officeConverter.js
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const execFileP = promisify(execFile);

// Map file extensions to LibreOffice export filters
// (plain "pdf" also works; these preserve app-specific nuances)
const FILTERS = {
  // Excel
  '.xlsx': 'pdf:calc_pdf_Export',
  '.xlsm': 'pdf:calc_pdf_Export',
  '.xls':  'pdf:calc_pdf_Export',
  '.csv':  'pdf:calc_pdf_Export',
  // Word
  '.docx': 'pdf:writer_pdf_Export',
  '.doc':  'pdf:writer_pdf_Export',
  '.rtf':  'pdf:writer_pdf_Export',
  '.odt':  'pdf:writer_pdf_Export',
  // PowerPoint (optional, supported)
  '.pptx': 'pdf:impress_pdf_Export',
  '.ppt':  'pdf:impress_pdf_Export',
};

// Resolve soffice binary on Windows
function resolveSofficePath() {
  if (process.env.LIBREOFFICE_PATH) return process.env.LIBREOFFICE_PATH;
  // Common default paths
  const guesses = [
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe'
  ];
  return guesses[0]; // try default; let exec fail if missing
}

// Build a file:// URL for the per-job LibreOffice user profile
function buildUserProfileUrl(baseDir) {
  // On Windows, use pathToFileURL to get proper file:///C:/... URL
  const profilePath = path.join(baseDir, 'lo-profile-' + crypto.randomUUID());
  return pathToFileURL(profilePath).href; // e.g., file:///C:/.../lo-profile-uuid
}

/**
 * Convert one Office file (Excel/Word/PPT) buffer to PDF Buffer.
 * @param {Buffer} buffer
 * @param {string} originalName
 * @returns {Promise<{pdf:Buffer, pdfName:string}>}
 */
async function officeToPdf(buffer, originalName = 'input.xlsx') {
  const soffice = resolveSofficePath();
  const ext = path.extname((originalName || '').toLowerCase());
  const filter = FILTERS[ext] || 'pdf';

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'office2pdf-'));
  const safeName = (originalName || 'input').replace(/[^a-z0-9_.-]/gi, '_');
  const inputPath = path.join(tmpDir, safeName);
  await fs.writeFile(inputPath, buffer);

  // LibreOffice writes output next to input
  const outputPdfPath = inputPath.replace(/\.[^.]+$/g, '') + '.pdf';

  // Per-job user profile prevents cache corruption under load
  const userProfileUrl = buildUserProfileUrl(tmpDir);

  const args = [
    `-env:UserInstallation=${userProfileUrl}`,
    '--headless',
    '--nologo',
    '--norestore',
    '--nolockcheck',
    '--convert-to', filter,
    '--outdir', tmpDir,
    inputPath
  ];

  try {
    // Timeout guard: kill hung conversions
    await execFileP(soffice, args, { timeout: 120000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });

    const pdf = await fs.readFile(outputPdfPath);
    const pdfName = path.basename(outputPdfPath);
    return { pdf, pdfName };
  } finally {
    // Cleanup temp files
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { officeToPdf };
