const express = require('express');
const router = express.Router();
const AWS = require('aws-sdk');
const { dbPromise } = require('../models/db');
const { deleteFromS3 } = require('../utils/awsUtils');
require('dotenv').config(); // Add this to load environment variables

// Configure AWS S3 with proper environment variables
const AWS_REGION = process.env.AWS_REGION;
const S3_BUCKET = process.env.AWS_BUCKET_NAME;

const { authMiddleware } = require('../middleware/authMiddleware');

// Validate required environment variables
if (!AWS_REGION || !S3_BUCKET || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.error('Missing required AWS environment variables:', {
    region: AWS_REGION,
    bucket: S3_BUCKET,
    hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
    hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY
  });
  //throw new Error('Missing required AWS environment variables');
}

// Configure AWS S3 client
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: AWS_REGION,
  signatureVersion: 'v4',
  endpoint: `https://s3.${AWS_REGION}.amazonaws.com` // Explicitly set the endpoint
});

// Helper function to get S3 URL with correct region
function getS3Url(key) {
  return `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`;
}

/**
 * @route   POST /api/employees/:id/documents/upload-request
 * @desc    Get a signed URL to upload a document to S3
 * @access  Private
 */
router.post('/:id/documents/upload-request', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { documentType, filename, contentType, moduleName } = req.body;
    console.log('Request body:', req.body);
    console.log('AWS Config:', {
      region: AWS_REGION,
      bucket: S3_BUCKET,
      endpoint: s3.endpoint.href
    });
    
    if (!id || !documentType || !filename) {
      return res.status(400).json({ 
        success: false, 
        message: 'Employee ID, document type, and filename are required' 
      });
    }
    
    // Check if employee exists
    const [employee] = await dbPromise.query('SELECT id FROM employees WHERE id = ?', [id]);
    
    if (!employee || employee.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Employee not found' 
      });
    }
    
    // Generate a unique key for S3 object using the specified format
    const s3Key = `employees/${id}/${moduleName}/${documentType}/${Date.now()}_${filename}`;
    console.log('Generated S3 Key:', s3Key);
    
    // Create a signed URL for S3 upload with proper bucket addressing
    const params = {
      Bucket: S3_BUCKET,
      Key: s3Key,
      Expires: 3600,
      ContentType: contentType || 'application/octet-stream'
    };
    console.log('S3 Parameters:', params);
    
    const uploadUrl = s3.getSignedUrl('putObject', params);
    console.log('Generated Upload URL:', uploadUrl);
    
    // Verify the URL is properly formed
    if (!uploadUrl.includes(AWS_REGION) || !uploadUrl.includes(S3_BUCKET)) {
      throw new Error('Generated upload URL is malformed');
    }
    
    const response = {
      success: true,
      uploadUrl,
      s3Key,
      contentType: params.ContentType,
      bucket: S3_BUCKET,
      region: AWS_REGION
    };
    console.log('Response being sent:', response);
    
    res.status(200).json(response);
  } catch (error) {
    console.error('Error generating upload URL:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate upload URL',
      error: error.message
    });
  }
});

/**
 * Helper function to determine MIME type from filename
 */
function getMimeTypeFromFileName(filename) {
  const extension = filename.split('.').pop().toLowerCase();
  const mimeTypes = {
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'txt': 'text/plain'
  };
  
  return mimeTypes[extension] || null;
}

/**
 * @route   POST /api/employees/:id/documents
 * @desc    Save document metadata to database
 * @access  Private
 */
router.post('/:id/documents', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { documentType, s3Key, originalFilename, fileSize, contentType } = req.body;
    
    if (!id || !documentType || !s3Key || !originalFilename) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID, document type, S3 key, and original filename are required'
      });
    }
    
    // Check if employee exists
    const [employee] = await dbPromise.query('SELECT id FROM employees WHERE id = ?', [id]);
    
    if (!employee || employee.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
    // Save document metadata to database - using only columns that exist in the table
    const [result] = await dbPromise.query(
      `INSERT INTO employee_documents (
        employee_id, document_type, s3_key, original_filename, 
        file_size, content_type
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        documentType,
        s3Key,
        originalFilename,
        fileSize || null,
        contentType || 'application/octet-stream'
      ]
    );
    
    const documentId = result.insertId;
    const fileUrl = getS3Url(s3Key);
    
    res.status(201).json({
      success: true,
      message: 'Document metadata saved successfully',
      documentId,
      fileUrl,
      s3Key
    });
  } catch (error) {
    console.error('Error saving document metadata:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save document metadata',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/employees/:id/documents
 * @desc    Get all documents for an employee
 * @access  Private
 */
router.get('/:id/documents', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if employee exists
    const [employee] = await dbPromise.query('SELECT id FROM employees WHERE id = ?', [id]);
    
    if (!employee || employee.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
    // Get all documents for the employee
    const [documents] = await dbPromise.query(
      `SELECT 
        id, employee_id, document_type, s3_key, 
        original_filename, file_size, content_type, uploaded_at
       FROM employee_documents 
       WHERE employee_id = ? 
       ORDER BY uploaded_at DESC`,
      [id]
    );
    
    // Format documents for initialDocuments prop
    const formattedDocuments = documents.map(doc => ({
      id: doc.id,
      name: doc.original_filename,
      url: getS3Url(doc.s3_key),
      key: doc.s3_key,
      uploadDate: doc.uploaded_at,
      documentType: doc.document_type,
      size: doc.file_size,
      contentType: doc.content_type
    }));
    
    res.status(200).json({
      success: true,
      documents: formattedDocuments
    });
  } catch (error) {
    console.error('Error fetching employee documents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employee documents',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/employees/:employeeId/documents/:documentId
 * @desc    Delete an employee document from S3 and database
 * @access  Private
 */
router.delete('/:employeeId/documents/:documentId', authMiddleware, async (req, res) => {
  try {
    const { employeeId, documentId } = req.params;

    // Check if employee exists
    const [employee] = await dbPromise.query('SELECT id FROM employees WHERE id = ?', [employeeId]);
    if (!employee || employee.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Get the document to verify ownership and get S3 key
    const [documents] = await dbPromise.query(
      'SELECT s3_key FROM employee_documents WHERE id = ? AND employee_id = ?',
      [documentId, employeeId]
    );

    if (!documents || documents.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Document not found or does not belong to the specified employee'
      });
    }

    const s3Key = documents[0].s3_key;

    // Delete from S3 using the utility function
    try {
      await deleteFromS3(s3Key);
    } catch (s3Error) {
      console.error('Error deleting from S3:', s3Error);
      // Continue with database deletion even if S3 deletion fails
    }

    // Delete from database
    await dbPromise.query(
      'DELETE FROM employee_documents WHERE id = ? AND employee_id = ?',
      [documentId, employeeId]
    );

    res.status(200).json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete document',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/employees/:id/documents/:docId/view-url
 * @desc    Get a signed URL to view a specific document
 * @access  Private
 */
router.get('/:id/documents/:docId/view-url', authMiddleware, async (req, res) => {
  try {
    const { id, docId } = req.params;

    // Check if employee exists
    const [employee] = await dbPromise.query('SELECT id FROM employees WHERE id = ?', [id]);
    if (!employee || employee.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Get the document metadata and verify ownership
    const [documents] = await dbPromise.query(
      'SELECT s3_key FROM employee_documents WHERE id = ? AND employee_id = ?',
      [docId, id]
    );

    if (!documents || documents.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Document not found or does not belong to the specified employee'
      });
    }

    const s3Key = documents[0].s3_key;

    // Generate a signed URL for viewing the document
    const params = {
      Bucket: S3_BUCKET,
      Key: s3Key,
      Expires: 3600 // URL expires in 1 hour
    };

    const viewUrl = s3.getSignedUrl('getObject', params);

    res.status(200).json({
      success: true,
      viewUrl
    });
  } catch (error) {
    console.error('Error generating view URL:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate view URL',
      error: error.message
    });
  }
});

module.exports = router; 