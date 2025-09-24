const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');

// Products
router.get('/products', inventoryController.getAllProducts);
router.post('/products', inventoryController.createProduct);
router.get('/products/:id', inventoryController.getProductById);
router.put('/products/:id', inventoryController.updateProduct);
router.delete('/products/:id', inventoryController.deleteProduct);

// Stock Movements
router.get('/stock-movements', inventoryController.getAllStockMovements);
router.post('/stock-movements', inventoryController.createStockMovement);
router.get('/stock-movements/:id', inventoryController.getStockMovementById);
router.put('/stock-movements/:id', inventoryController.updateStockMovement);
router.delete('/stock-movements/:id', inventoryController.deleteStockMovement);


// Assets
router.get('/assets', inventoryController.getAllAssets);
router.post('/assets', inventoryController.createAsset);
router.patch('/assets/:id/assign', inventoryController.assignAsset);
router.post('/assets/:id/return', inventoryController.returnAsset);
router.get('/assets/:id', inventoryController.getAssetById);
router.put('/assets/:id', inventoryController.updateAsset);
router.delete('/assets/:id', inventoryController.deleteAsset);

// Asset Requests
router.get('/asset-requests', inventoryController.getAllAssetRequests);
router.post('/asset-requests', inventoryController.createAssetRequest);
router.get('/asset-requests/:id', inventoryController.getAssetRequestById);
//getAssetRequestsById
router.get('/my-asset-requests', inventoryController.getAssetRequestsById); // Optional alias


router.put('/asset-requests/:id', inventoryController.updateAssetRequest);
router.delete('/asset-requests/:id', inventoryController.deleteAssetRequest);
router.get('/asset-requests-paging', inventoryController.getAllAssetRequestsPaging);
router.get('/master/asset-request-statuses', inventoryController.getAssetRequestStatuses);
router.get('/asset-requests/:id/history', inventoryController.getAssetRequestHistory);


// Master Tables
router.get('/master/categories', inventoryController.getProductCategories);
router.get('/master/statuses', inventoryController.getAssetStatuses);
router.get('/master/types', inventoryController.getAssetTypes);
router.get('/master/locations', inventoryController.getAssetLocations);

// Dashboard Stats
router.get('/assets/stats', inventoryController.getAssetStats);

// QR Code Routes
router.get('/assets/:id/qrcode-data', inventoryController.getAssetQRCodeData);
router.get('/assets/search', inventoryController.searchAssetWithQR);

// Asset Grouping
router.post('/asset-groups', inventoryController.createAssetGroup);
router.get('/asset-groups', inventoryController.getAllAssetGroups);
router.get('/asset-groups/:id', inventoryController.getAssetGroupById);
router.put('/asset-groups/:id', inventoryController.updateAssetGroup);
router.delete('/asset-groups/:id', inventoryController.deleteAssetGroup);
router.get('/inventory/assets/unassigned', inventoryController.getUnassignedAssets);


// Assign / Return Asset Groups
router.post('/asset-groups/:id/assign', inventoryController.assignAssetGroup);
router.post('/asset-groups/:id/return', inventoryController.returnAssetGroup);

// Asset Transfer
router.post('/assets/:id/transfer', inventoryController.transferAsset);

// Asset History Log
router.get('/assets/:id/history', inventoryController.getAssetHistory);

// QR Code Print Output (PDF)
router.get('/assets/:id/print-label', inventoryController.generateAssetLabelPDF);

// Barcode for SKU
router.get('/products/:id/barcode', inventoryController.generateProductBarcode);

// Low Stock Notification
router.get('/stock/low-alert', inventoryController.getLowStockAlerts);

// Stock Import/Export via Excel
router.post('/stock/import', inventoryController.importStockFromExcel);
router.get('/stock/export', inventoryController.exportStockToExcel);

// Inventory Summary Charts
router.get('/assets/summary/charts', inventoryController.getInventorySummaryCharts);

// Asset Usage/Movement Logs
router.get('/assets/movement-logs', inventoryController.getAssetMovementLogs);

// Warranty Expiry Notifications
router.get('/assets/warranty-expiry', inventoryController.getWarrantyExpiries);

// Configuration
router.get('/master/brands', inventoryController.getBrands);
router.get('/master/models', inventoryController.getModels);
router.post('/master/models', inventoryController.createModel);
router.get('/master/models/:brandId', inventoryController.getModelsByBrand);


router.get('/alert-configs', inventoryController.getAlertConfigs);
router.post('/alert-configs', inventoryController.upsertAlertConfig);
router.delete('/alert-configs/:id', inventoryController.deleteAlertConfig);


router.get('/products-paging', inventoryController.getAllProductsPaging);
router.get('/stock-movements-paging', inventoryController.getAllStockMovementsPaging);
router.get('/assets-paging', inventoryController.getAllAssetsPaging);
router.get('/asset-requests-paging', inventoryController.getAllAssetRequestsPaging);


router.get('/stock/balance', inventoryController.getStockBalance);
router.patch('/assets/:id/status', inventoryController.updateAssetStatus);
router.patch('/asset-requests/:id/status', inventoryController.updateAssetRequestStatus);


// In routes/inventory.js or similar
router.post('/asset-requests', inventoryController.createAssetRequest);
router.patch('/asset-requests/:id/approve', inventoryController.approveAssetRequest);

router.get('/dashboard/summary', inventoryController.getFullDashboardSummary);


router.post('/assets/:id/check-in', inventoryController.checkInAsset);
router.post('/assets/:id/check-out', inventoryController.checkOutAsset);
router.get('/assets/:id/checkinout-logs', inventoryController.getAssetCheckinoutLog);


router.get('/asset-return-conditions', inventoryController.getAssetReturnConditions);
router.get('/asset-return-reasons', inventoryController.getAssetReturnReasons);



// Brands
router.get('/brands', inventoryController.getAllBrands);
router.post('/brands', inventoryController.createBrand);
router.get('/brands/:id', inventoryController.getBrandById);
router.put('/brands/:id', inventoryController.updateBrand);
router.delete('/brands/:id', inventoryController.deleteBrand);


// Models
router.get('/models', inventoryController.getAllModels);
router.post('/models', inventoryController.createModel);
router.get('/models/:id', inventoryController.getModelById);
router.put('/models/:id', inventoryController.updateModel);
router.delete('/models/:id', inventoryController.deleteModel);

// Locations
router.get('/locations', inventoryController.getAllLocations);
router.post('/locations', inventoryController.createLocation);
router.get('/locations/:id', inventoryController.getLocationById);
router.put('/locations/:id', inventoryController.updateLocation);
router.delete('/locations/:id', inventoryController.deleteLocation);

// Types
router.get('/types', inventoryController.getAllTypes);
router.post('/types', inventoryController.createType);
router.get('/types/:id', inventoryController.getTypeById);
router.put('/types/:id', inventoryController.updateType);
router.delete('/types/:id', inventoryController.deleteType);

// Statuses
router.get('/statuses', inventoryController.getAllStatuses);
router.post('/statuses', inventoryController.createStatus);
router.get('/statuses/:id', inventoryController.getStatusById);
router.put('/statuses/:id', inventoryController.updateStatus);
router.delete('/statuses/:id', inventoryController.deleteStatus);

// Units
router.get('/units', inventoryController.getAllUnits);
router.post('/units', inventoryController.createUnit);
router.get('/units/:id', inventoryController.getUnitById);
router.put('/units/:id', inventoryController.updateUnit);
router.delete('/units/:id', inventoryController.deleteUnit);

// Categories
router.get('/categories', inventoryController.getAllCategories);
router.post('/categories', inventoryController.createCategory);
router.get('/categories/:id', inventoryController.getCategoryById);
router.put('/categories/:id', inventoryController.updateCategory);
router.delete('/categories/:id', inventoryController.deleteCategory);


router.patch('/requests/:id/status', inventoryController.updateAssetRequestStatusNew);


module.exports = router;
