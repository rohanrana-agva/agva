const express = require("express");
const multer = require("multer");
const { body } = require('express-validator');
var maxSize = 1 * 1024 * 1024

// FILE UPLOAD WITH MULTER 
const storage = multer.diskStorage({
  destination: "./public/uploads/",
  filename: function (req, file, cb) {
    cb(null, file.originalname)
  }
});

var upload = multer({ storage: storage, limits: { fileSize: maxSize } });
var uploadFunc = upload.single("filePath")
const router = express.Router();
const {
  createLogs,
  createLogsV2,
  createAlerts,
  getLogsByLogType,
  dateWiseCrashCount,
  dateWiseLogOccurrencesByLogMsg,
  getLogsCountWithOs,
  getLogsCountWithModelName,
  getCrashOccurrenceByLogMsg,
  getErrorCountByOSArchitecture,
  crashlyticsData,
  crashFreeUsersDatewise,
  getFilteredLogs,
  getAlertsWithFilter,
  getErrorCountByVersion,
  createEvents,
  getEventsWithFilter,
  getEventsById,
  getAlertsById,
  getLogsById,
  getAllEvents,
  getCrashOccurrenceByLogMsgWithDeviceId,
  dateWiseLogOccurrencesByLogMsgWithDeviceId,
  crashlyticsData2
} = require("../controller/logs");

const { isAuth } = require("../middleware/authMiddleware");

const { validateHeader } = require("../middleware/validateMiddleware");

// Unprotected

// This route will be replaced by createLogsV2 
router.post("/:project_code", createLogs);

router.post(
  "/v2/:project_code",
  function (req, res, next) {
    uploadFunc(req, res, function (err) {
      if (err instanceof multer.MulterError) {
        // A Multer error occurred when uploading.
        return res.status(400).json({
          status: 0,
          data: {
            err: {
              generatedTime: new Date(),
              errMsg: err.stack,
              msg: err.message,
              type: err.name,
            },
          },
        });
      } else if (err) {
        console.log(err)
        // An unknown error occurred when uploading.
        return res.status(500).json({
          status: -1,
          data: {
            err: {
              generatedTime: new Date(),
              errMsg: err.stack,
              msg: err.message,
              type: err.name,
            },
          },
        });
      }
      // Everything went fine.
      next()
    })
  },
  validateHeader,
  createLogsV2
);
router.post("/alerts/:project_code",
  body('did').notEmpty(),
  body('type').notEmpty(),
  body('ack.*.code').notEmpty(),
  body('ack.*.timestamp').notEmpty(),
  createAlerts);
  router.post("/events/:project_code",
  body('did').notEmpty(),
  body('type').notEmpty(),
  body('ack.*.code').notEmpty(),
  body('ack.*.timestamp').notEmpty(),
  createEvents);

//Protected Route
router.get("/:projectCode", isAuth, getFilteredLogs);

router.get("/getLogsCount/:projectCode", isAuth, getLogsByLogType);
router.get("/datewiselogcount/:projectCode", isAuth, dateWiseCrashCount);
router.get(
  "/crashfree-users-datewise/:projectCode",
  isAuth,
  crashFreeUsersDatewise
);
router.get("/alerts/:projectCode", isAuth, getAlertsWithFilter);
router.get("/events/:projectCode",isAuth,getEventsWithFilter);
router.get("/deviceAlerts/:did",getAlertsById);
router.get("/deviceEvents/:did",getEventsById);
router.get("/deviceLogs/:device",getLogsById);
router.get("/Allevents/Events",getAllEvents);

router.get("/get-crashlytics-data/:projectCode", isAuth, crashlyticsData);
router.get("/log-occurrences-datewise/:projectCode", isAuth, dateWiseLogOccurrencesByLogMsg);
router.get("/logMsgOccurence/:projectCode", isAuth, getCrashOccurrenceByLogMsg);
router.get("/logMsgOccurence2/:did", isAuth, getCrashOccurrenceByLogMsgWithDeviceId);
router.get("/log-occurrences-datewise2/:did", isAuth, dateWiseLogOccurrencesByLogMsgWithDeviceId);
router.get("/get-crashlytics-data2/:did", isAuth, crashlyticsData2);

//router.get("/deviceLoges/:did",getLogesById)

// UNUSED ROUTES
router.get("/getLogsCountWithOs/:projectCode", isAuth, getLogsCountWithOs);
router.get(
  "/getLogsCountWithModelName/:projectCode",
  isAuth,
  getLogsCountWithModelName
);
router.get(
  "/getErrorCountByOSArchitecture/:projectCode",
  isAuth,
  getErrorCountByOSArchitecture
);
router.get(
  "/getErrorCountByVersion/:projectCode",
  isAuth,
  getErrorCountByVersion
);

module.exports = router;
