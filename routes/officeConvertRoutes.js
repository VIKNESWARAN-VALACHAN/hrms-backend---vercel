// routes/officeConvertRoutes.js
const express = require('express');
const router = express.Router();
const path = require('path');
const { officeToPdf } = require('../utils/officeConverter');

// If you want auth, uncomment and wire your middleware:
// const auth = require('../middleware/authMiddleware');

function pickUploadedFile(files) {
  if (!files) return null;
  // express-fileupload may use "file" or any custom field; try common names
  return files.file || files.upload || files.document || Object.values(files)[0] || null;
}

router.post('/office-to-pdf', /*auth,*/ async (req, res) => {
  try {
    const f = pickUploadedFile(req.files);
    if (!f) return res.status(400).json({ error: 'No file uploaded (use form field "file")' });

    const name = f.name || 'input.xlsx';
    const allowed = ['.xlsx', '.xlsm', '.xls', '.csv', '.docx', '.doc', '.rtf', '.odt', '.pptx', '.ppt'];
    const ext = path.extname(name).toLowerCase();
    if (!allowed.includes(ext)) {
      return res.status(400).json({ error: `Unsupported file type: ${ext}` });
    }

    // express-fileupload puts the Buffer in f.data
    const { pdf, pdfName } = await officeToPdf(f.data, name);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdfName}"`);
    res.send(pdf);
  } catch (err) {
    console.error('office-to-pdf error:', err && err.message || err);
    res.status(500).json({ error: 'Conversion failed' });
  }
});

module.exports = router;
