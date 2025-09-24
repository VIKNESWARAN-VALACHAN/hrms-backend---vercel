const express = require("express");
const router = express.Router();
const controller = require("../controllers/bankCurrencyController");

// Banks
router.get("/banks", controller.getBanks);
router.post("/banks", controller.addBank);
router.put("/banks/:id", controller.updateBank);
router.delete("/banks/:id", controller.deleteBank);

// Currency Codes
router.get("/currencies", controller.getCurrencies);
router.post("/currencies", controller.addCurrency);
router.put("/currencies/:id", controller.updateCurrency);
router.delete("/currencies/:id", controller.deleteCurrency);

// Currency Rates
router.get("/rates", controller.getRates);
router.get("/rates/active", controller.getActiveRates);
router.get("/rates/latest", controller.getLatestRate);
router.post("/rates", controller.addRate);
router.put("/rates/:id", controller.updateRate);
router.delete("/rates/:id", controller.deleteRate);
router.post("/rates/bulk", controller.addRatesBulk);


// Rate Logs
router.get('/rates/logs', controller.getRateLogs);

router.get("/rates/month-summary", controller.getRateMonthSummary);
router.get('/rates/history', controller.getRateHistory);


module.exports = router;
