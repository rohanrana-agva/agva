const fs = require('fs');
const Projects = require('../model/project');
const alert_ventilator_collection = require('../model/alert_ventilator_collection');
const ventilator_collection = require('../model/ventilator_collection');
const event_ventilator_collection = require('../model/event_ventilator_collection');
const { getDaysArray } = require('../helper/helperFunctions');
const Device = require('../model/device');
const Email = require('../utils/email');
const decompress = require('decompress');
const { validationResult } = require('express-validator');
const AWS = require('aws-sdk');
const path = require('path');
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  Bucket: process.env.S3_BUCKET,
  region: 'ap-south-1',
});

// This function will be replaced by createLogsV2
const createLogs = async (req, res) => {
  try {
    const { project_code } = req.params;
    // check project exist or not
    const findProjectWithCode = await Projects.findOne({ code: project_code });

    if (!findProjectWithCode) {
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project not found',
            msg: 'Project not found',
            type: 'Validation Error',
          },
        },
      });
    }

    const collectionName = findProjectWithCode.collection_name;
    // console.log(collectionName,'collectionName')

    const modelReference = require(`../model/${collectionName}`);
    console.log(modelReference, 'modelReference')

    const { did, version, type, log, device } = req.body;

    //  above details will be put in project tables

    //  Make entries in Device
    const Dvc = await new Device({
      did: device.did,
      name: device.name,
      manufacturer: device.manufacturer,
      os: {
        name: device.os.name,
        type: device.os.type,
      },
      battery: device.battery,
    });

    const isDeviceSaved = await Dvc.save(Dvc);

    if (!isDeviceSaved) {
      res.status(500).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Device not saved',
            msg: 'Device not saved',
            type: 'MongodbError',
          },
        },
      });
    }



    const putDataIntoLoggerDb = await new modelReference({

      version: version,
      type: type,
      did: did,
      device: isDeviceSaved._id,    //make changes here for save device_id in database
      log: {

        file: log.file,
        date: log.date,
        message: decodeURI(log.msg),
        type: log.type,
      },

    });
    //console.log(log.date,'log.date');

    const isLoggerSaved = await putDataIntoLoggerDb.save(putDataIntoLoggerDb);

    if (!isLoggerSaved) {
      return res.status(500).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project not saved',
            msg: 'Project not saved',
            type: 'Internal Server Error',
          },
        },
      });
    }

    if (log.type == 'error') {
      findProjectWithCode.reportEmail.map((email) => {
        const url = `${log.msg}`;

        new Email(email, url).sendCrash();
      });
    }

    res.status(201).json({
      status: 1,
      data: {},
      message: 'Successful',
    });
  } catch (err) {
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
};


const createLogsV2 = async (req, res) => {
  try {
    const { project_code } = req.params;
    // check project exist or not
    const findProjectWithCode = await Projects.findOne({ code: project_code });

    if (!findProjectWithCode) {
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project not found',
            msg: 'Project not found',
            type: 'Validation Error',
          },
        },
      });
    }

    const collectionName = findProjectWithCode.collection_name;

    const modelReference = require(`../model/${collectionName}`);

    const d = new Date();

    if (req.contentType === 'json') {
      const { version, type, log, device } = req.body;

      const Dvc = await new Device({
        did: device.did,
        name: device.name,
        manufacturer: device.manufacturer,
        os: {
          name: device.os.name,
          type: device.os.type,
        },
        battery: device.battery,
      });

      const isDeviceSaved = await Dvc.save(Dvc);

      if (!isDeviceSaved) {
        res.status(500).json({
          status: 0,
          data: {
            err: {
              generatedTime: new Date(),
              errMsg: 'Device not saved',
              msg: 'Device not saved',
              type: 'MongodbError',
            },
          },
        });
      }

      if (!log.msg) {
        return res.status(400).json({
          status: 0,
          data: {
            err: {
              generatedTime: new Date(),
              errMsg: 'Log message is required',
              msg: 'Log message is required',
              type: 'ValidationError',
            },
          },
        });
      }

      const putDataIntoLoggerDb = await new modelReference({
        version: version,
        type: type,
        device: isDeviceSaved._id,
        log: {
          file: log.file,
          date: log.date || d.toISOString(),
          filePath: '',
          message: decodeURI(log.msg),
          type: log.type,
        },
      });

      const isLoggerSaved = await putDataIntoLoggerDb.save(putDataIntoLoggerDb);

      if (!isLoggerSaved) {
        return res.status(500).json({
          status: 0,
          data: {
            err: {
              generatedTime: new Date(),
              errMsg: 'Project not saved',
              msg: 'Project not saved',
              type: 'Internal Server Error',
            },
          },
        });
      } else {
        var sentEmails = [];
        var sentEmailErrArr = [];
        var sentEmailErrMsgArr = [];

        if (log.type == 'error' && findProjectWithCode.reportEmail.length) {
          let emailPromise = findProjectWithCode.reportEmail.map((email) => {
            const url = `${log.msg}`;
            // console.log(url)
            return new Email(email, url).sendCrash();
          });

          sentEmails = await Promise.allSettled(emailPromise);

          sentEmails.length
            ? sentEmails.map((sentEmail) => {
              sentEmailErrArr.push(sentEmail.status);
              if (sentEmail.status === 'rejected') {
                sentEmailErrMsgArr.push(sentEmail.reason.message);
              }
            })
            : sentEmailErrArr,
            (sentEmailErrMsgArr = []);
        }

        res.status(201).json({
          status: 1,
          data: {
            crashEmail:
              log.type === 'error'
                ? {
                  status: sentEmailErrArr.includes('rejected') ? 0 : 1,
                  errMsg: sentEmailErrMsgArr.length
                    ? sentEmailErrMsgArr.join(' | ')
                    : '',
                  msg: sentEmailErrMsgArr.length
                    ? `Error sending ${sentEmailErrMsgArr.length} out of ${sentEmails.length} log(s)`
                    : 'Email(s) sent successfully.',
                }
                : {},
          },
          message: 'Successful',
        });
      }
    } else if (req.contentType === 'formData') {
      const files = await decompress(
        req.file.path,
        `./public/uploads/${req.body.did}`
      );

      // Delete zip file after unzipping it
      fs.unlinkSync(`./${req.file.path}`);

      console.log('files length: ', files.length);
      const Dvc = await new Device({
        did: req.body.did,
        name: req.body.deviceName,
        manufacturer: req.body.manufacturer,
        os: {
          name: req.body.osName,
          type: req.body.osType,
        },
        battery: req.body.battery,
      });

      const isDeviceSaved = await Dvc.save(Dvc);

      if (!isDeviceSaved) {
        return res.status(500).json({
          status: 0,
          data: {
            err: {
              generatedTime: new Date(),
              errMsg: 'Device not saved',
              msg: 'Device not saved',
              type: 'MongodbError',
            },
          },
        });
      }

      let s3Promise =
        files.length &&
        files.map((file) => {
          const fileContent = fs.readFileSync(
            `${__dirname}/../public/uploads/${req.body.did}/${file.path}`
          );
          // Setting up S3 upload parameters
          const params = {
            Bucket: process.env.S3_BUCKET,
            Key: `${req.body.did}/${file.path}`,
            Body: fileContent,
          };
          console.log('params', params);
          return s3.upload(params).promise();
        });

      let fileNamePromise =
        files.length &&
        files.map(async (file) => {
          console.log(file.path);
          let putDataIntoLoggerDb = await new modelReference({
            version: req.body.version,
            type: req.body.type,
            device: isDeviceSaved._id,
            log: {
              file: file.path,
              date: d.toISOString(),
              filePath: `${req.body.did}/${file.path}`,
              message: '',
              type: 'error',
            },
          });
          return putDataIntoLoggerDb.save(putDataIntoLoggerDb);
        });

      let s3Response = await Promise.allSettled(s3Promise);
      let logs = await Promise.allSettled(fileNamePromise);

      var logsErrArr = [];
      var logsErrMsgArr = [];

      logs.length &&
        logs.map((log) => {
          logsErrArr.push(log.status);
          if (log.status === 'rejected') {
            logsErrMsgArr.push(log.reason.message);
          }
        });

      if (!logsErrArr.includes('fulfilled')) {
        return res.status(400).json({
          status: logsErrMsgArr.length === logs.length ? -1 : 0,
          data: {
            err: {
              generatedTime: new Date(),
              errMsg: logsErrMsgArr.join(' | '),
              msg: `Error saving ${logsErrMsgArr.length} out of ${logs.length} log(s)`,
              type: 'ValidationError',
            },
          },
        });
      } else {
        var s3ResponseStatus = [];
        var emailPromise = [];
        var sentEmails = [];
        var sentEmailErrArr = [];
        var sentEmailErrMsgArr = [];

        if (findProjectWithCode.reportEmail.length) {
          emailPromise = findProjectWithCode.reportEmail.map((email) => {
            logs.map((log) => {
              const url = `${log.value.log.filePath}`;
              return new Email(email, url).sendCrash();
            });
          });

          sentEmails = await Promise.allSettled(emailPromise);

          sentEmails.length
            ? sentEmails.map((sentEmail) => {
              sentEmailErrArr.push(sentEmail.status);
              if (sentEmail.status === 'rejected') {
                sentEmailErrMsgArr.push(sentEmail.reason.message);
              }
            })
            : sentEmailErrArr,
            (sentEmailErrMsgArr = []);
        }

        s3ResponseStatus =
          s3Response.length && s3Response.map((s3Res) => s3Res.status);

        // Delete Files after saving to DB and S3
        if (!s3ResponseStatus.includes('rejected')) {
          files.length &&
            files.map(async (file) => {
              fs.unlinkSync(
                path.join('public', 'uploads', `${req.body.did}/${file.path}`)
              );
            });
        }

        res.status(201).json({
          status: 1,
          data: {
            crashEmail: sentEmails.length
              ? {
                status:
                  sentEmailErrArr.length &&
                    sentEmailErrArr.includes('rejected')
                    ? 0
                    : 1,
                errMsg: sentEmailErrMsgArr.length
                  ? sentEmailErrMsgArr.join(' | ')
                  : '',
                msg: sentEmailErrMsgArr.length
                  ? `Error sending ${sentEmailErrMsgArr.length} out of ${sentEmails.length} log(s)`
                  : 'Email(s) sent successfully.',
              }
              : {},
          },
          message: 'Successful',
        });
      }
    }
  } catch (err) {
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
};

const getAlertsById = async (req, res) => {
  try {
    const { did } = req.params;
    const findDeviceById = await alert_ventilator_collection.find({ did: did });

    //console.log(findDeviceById, 'findDeviceById');
    if (!findDeviceById) {
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'device not found',
            msg: 'device not found',
            type: 'Client Error',
          },
        },
      });
    }
    // const collectionName=require(`../model/${findDeviceById.collection_name}.js`);
    // console.log(collectionName,'collectionName');
    return res.status(200).json({
      status: 1,
      data: {
        findDeviceById: findDeviceById
      },
      message: 'successfull'
    });

  }
  catch (err) {
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
}
const getLogsById = async (req, res) => {
  try {
    const { device } = req.params;
    const findDeviceById = await ventilator_collection.find({ did: device });
    if (!findDeviceById) {
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: newDate(),
            errMsg: 'device not found',
            msg: 'device not found',
            type: 'client Error',
          },
        },
      });
    }
    return res.status(200).json({
      status: 1,
      data: {
        findDeviceById: findDeviceById
      },
      message: 'successfull'
    });

  }
  catch (err) {
    return res.status(500).json({
      status: -1,
      data: {
        err: {
          generatedTime: newDate(),
          errMsg: err.stack,
          msg: err.message,
          type: err.name,
        },

      },
    });
  }

}
const getEventsById = async (req, res) => {
  try {
    const { did } = req.params;
    const findDeviceById = await event_ventilator_collection.find({ did: did });
    // console.log(findDeviceById,'findDeviceById');
    // let dt1=findDeviceById.map(a=>a.date);



    // console.log(findDeviceById[0].date);
    // console.log(findDeviceById,'findDeviceById')
    const maxDate = new Date(
      Math.max(
        ...findDeviceById.map(element => {
          return new Date(element.date);
        }),
      ),
    );
    //console.log(maxDate);  
    const dt1 = new Date(maxDate);
    //console.log(dt1)
    const dt2 = new Date();
    // dt=new Date(maxDate);
    //dt=new Date();
    var diff = (dt2.getTime() - dt1.getTime()) / 1000;
    diff = Math.trunc(Math.abs(diff / (60 * 60)));
    //console.log(diff)
    if (diff >= 24 || diff < 0) {
      state = 'inactive';
    }
    else {
      state = 'active';
    }

    // const dt1=await findDeviceById.find(date);
    // console.log(dt1);
    // dt1=event_testdate_collection.date;
    // console.log(dt1);



    //console.log(findDeviceById, 'findDeviceById');
    if (!findDeviceById) {
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'device not found',
            msg: 'device not found',
            type: 'Client Error',
          },
        },
      });
    }
    // const collectionName=require(`../model/${findDeviceById.collection_name}.js`);
    // console.log(collectionName,'collectionName');
    return res.status(200).json({
      status: 1,
      data: {
        findDeviceById: findDeviceById,
      },
      message: 'successfull',
      //state:findDeviceById.find().sort({date:-1}).limit(1)
      state: state
    });

  }
  catch (err) {
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
}
const getAllEvents = async (req, res) => {
  try {

    const allEvents = await event_ventilator_collection.find();
    //console.log(allEvents);


    return res.status(200).json({
      status: 1,
      data: { data: allEvents },
      message: 'Successful',
    });
  } catch (err) {
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
};



/**
 * desc     Alert
 * api      POST @/api/logger/logs/alerts/:projectCode
 */
const createAlerts = async (req, res, next) => {
  try {
    const { project_code } = req.params;
    // check project exist or not
    const findProjectWithCode = await Projects.findOne({ code: project_code });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: errors
              .array()
              .map((err) => {
                return `${err.msg}: ${err.param}`;
              })
              .join(' | '),
            msg: 'Invalid data entered.',
            type: 'ValidationError',
          },
        },
      });
    }

    if (!findProjectWithCode) {
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project does not exist',
            msg: 'Project does not exist',
            type: 'MongoDb Error',
          },
        },
      });
    }
    const collectionName = findProjectWithCode.alert_collection_name;

    const modelReference = require(`../model/${collectionName}`);
    const { did, type, ack, priority, date } = req.body;
    let dbSavePromise = ack.map(async (ac) => {
      const putDataIntoLoggerDb = await new modelReference({
        did: did,
        ack: {
          msg: ac.msg,
          code: ac.code,
          date: ac.timestamp,
        },
        type: type,
        priority: priority,
        date: date


      });

      return putDataIntoLoggerDb.save(putDataIntoLoggerDb);
    });

    let alerts = await Promise.allSettled(dbSavePromise);
    //console.log(alerts,'alerts');

    var alertsErrArr = [];
    var alertsErrMsgArr = [];

    alerts.map((alert) => {
      alertsErrArr.push(alert.status);
      if (alert.status === 'rejected') {
        alertsErrMsgArr.push(alert.reason.message);
      }
    });

    if (!alertsErrArr.includes('rejected')) {
      return res.status(201).json({
        status: 1,
        data: { alertCount: alerts.length },
        message: 'Successful',
      });
    } else {
      res.status(400).json({
        status: alertsErrArr.length === alerts.length ? -1 : 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: alertsErrMsgArr.join(' | '),
            msg: `Error saving ${alertsErrMsgArr.length} out of ${alerts.length} alert(s)`,
            type: 'ValidationError',
          },
        },
      });
    }
  } catch (err) {
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
};
const createEvents = async (req, res, next) => {
  try {

    const { project_code } = req.params;
    const findProjectWithCode = await Projects.findOne({ code: project_code });
    //console.log(findProjectWithCode,'findProjectWithProjectCode----')

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: errors
              .array()
              .map((err) => {
                return `${err.msg}: ${err.param}`;
              })
              .join(' | '),
            msg: 'Invalid data entered.',
            type: 'ValidationError',
          },
        },
      });
    }
    if (!findProjectWithCode) {
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project does not exist',
            msg: 'Project does not exist',
            type: 'MongoDb Error',
          },
        },
      });
    }



    const collectionName = findProjectWithCode.event_collection_name;
    //console.log(collectionName,'collectionName-----')
    const modelReference = require(`../model/${collectionName}`);
    //console.log(modelReference,'modelReference');
    const { did, type, message, date } = req.body;
    if (!did || !type || !message || !date) {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Please fill all the details.',
            msg: 'Please fill all the details.',
            type: 'Client Error',
          },
        },
      });

    }
    const events = await new modelReference({
      did: did,
      message: message,
      type: type,
      date: date
    });
    const SaveEvents = await events.save(events);
    if (SaveEvents) {
      res.status(201).json({
        status: 1,
        data: { eventCounts: SaveEvents.length },
        message: 'Event add!',

      });
    }

    else {
      res.status(500).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Some error happened during registration',
            msg: 'Some error happened during registration',
            type: 'MongodbError',
          },
        },
      }); I
    }



  }
  catch (err) {
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
};


/**
 * desc     get project withpt filter
 * api      @/api/logger/projects/getDetails/:projectCode
 *
 */

const getFilteredLogs = async (req, res) => {
  try {
    const { projectCode } = req.params;

    if (!req.query.projectType) {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project type is required',
            msg: 'Project type is required',
            type: 'Client Error',
          },
        },
      });
    }
    console.time('TIME TAKEN IN THE OPERATION');
    const isProjectExist = await Projects.findOne({ code: projectCode });
    if (!isProjectExist) {
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project not found',
            msg: 'Project not found',
            type: 'Client Error',
          },
        },
      });
    }

    const collectionName = require(`../model/${isProjectExist.collection_name}.js`);
    //console.log(collectionName,'collectionName');

    let dt = new Date(req.query.endDate);
    dt.setDate(dt.getDate() + 1);

    var sortOperator = { $sort: {} };
    let sort = req.query.sort || '-createdAt';

    sort.includes('-')
      ? (sortOperator['$sort'][sort.replace('-', '')] = -1)
      : (sortOperator['$sort'][sort] = 1);

    var matchOperator = {
      $match: {
        'log.date': {
          $gte: new Date(req.query.startDate),
          $lte: dt,
        },
        type: req.query.projectType,
      },
    };
    let logMatch = req.query.logType;
    logMatch
      ? (matchOperator['$match']['log.type'] = logMatch)
      : delete matchOperator['$match']['log.type'];

    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 500;
    let skip = (page - 1) * limit;

    const data = await collectionName.aggregate([
      {
        $facet: {
          totalRecords: [
            matchOperator,
            {
              $count: 'total',
            },
          ],
          data: [
            matchOperator,
            {
              $lookup: {
                from: 'devices',
                localField: 'device',
                foreignField: '_id',
                as: 'device',
              },
            },
            {
              $unwind: '$device',
            },
            sortOperator,
            { $skip: skip },
            { $limit: limit },
          ],
        },
      },
    ]);
    console.timeEnd('TIME TAKEN IN THE OPERATION');
    return res.status(200).json({
      status: 1,
      message: 'Getting all logs',
      data: {
        count: data[0]?.totalRecords[0]?.total,
        pageLimit: data[0]?.data.length,
        logs: data[0]?.data,
      },

    });
  } catch (err) {
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
};

/**
 * desc     get project with filter
 * api      @/api/logger/projects/getDetails/:projectCode
 *
 */

const getAlertsWithFilter = async (req, res) => {
  try {
    const { projectCode } = req.params;

    if (!req.query.projectType) {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project type is required',
            msg: 'Project type is required',
            type: 'Client Error',
          },
        },
      });
    }

    const isProjectExist = await Projects.findOne({ code: projectCode });
    if (!isProjectExist) {
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project not found.',
            msg: 'Project not found.',
            type: 'Internal Server Error',
          },
        },
      });
    }

    const collectionName = require(`../model/${isProjectExist.alert_collection_name}.js`);

    let dt = new Date(req.query.endDate);
    dt.setDate(dt.getDate() + 1);

    var sortOperator = { $sort: {} };
    let sort = req.query.sort || '-createdAt';

    sort.includes('-')
      ? (sortOperator['$sort'][sort.replace('-', '')] = -1)
      : (sortOperator['$sort'][sort] = 1);

    var matchOperator = {
      $match: {
        createdAt: {
          $gte: new Date(req.query.startDate),
          $lte: dt,
        },
        type: req.query.projectType,
      },
    };

    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 500;
    let skip = (page - 1) * limit;
    //console.log(sortOperator);

    const data = await collectionName.aggregate([
      {
        $facet: {
          totalRecords: [
            matchOperator,
            {
              $count: 'total',
            },
          ],
          data: [
            matchOperator,
            sortOperator,
            { $skip: skip },
            { $limit: limit },
          ],
        },
      },
    ]);
    //console.log(data,'data');

    return res.status(200).json({
      status: 1,
      message: 'Getting all alerts',
      data: {
        count: data[0]?.totalRecords[0]?.total,
        pageLimit: data[0]?.data.length,
        alerts: data[0]?.data,
      },
    });
  } catch (err) {
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
};

const getEventsWithFilter = async (req, res) => {
  try {
    const { projectCode } = req.params;

    if (!req.query.projectType) {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project type is required',
            msg: 'Project type is required',
            type: 'Client Error',
          },
        },
      });
    }

    const isProjectExist = await Projects.findOne({ code: projectCode });
    if (!isProjectExist) {
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project not found.',
            msg: 'Project not found.',
            type: 'Internal Server Error',
          },
        },
      });
    }

    const collectionName = require(`../model/${isProjectExist.event_collection_name}.js`);

    let dt = new Date(req.query.endDate);
    dt.setDate(dt.getDate() + 1);

    var sortOperator = { $sort: {} };
    let sort = req.query.sort || '-createdAt';

    sort.includes('-')
      ? (sortOperator['$sort'][sort.replace('-', '')] = -1)
      : (sortOperator['$sort'][sort] = 1);

    var matchOperator = {
      $match: {
        createdAt: {
          $gte: new Date(req.query.startDate),
          $lte: dt,
        },
        type: req.query.projectType,
      },
    };

    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 500;
    let skip = (page - 1) * limit;
    console.log(sortOperator);
    const data = await collectionName.aggregate([
      {
        $facet: {
          totalRecords: [
            matchOperator,
            {
              $count: 'total',
            },
          ],
          data: [
            matchOperator,
            sortOperator,
            { $skip: skip },
            { $limit: limit },
          ],
        },
      },
    ]);

    return res.status(200).json({
      status: 1,
      message: 'Getting all events',
      data: {
        count: data[0]?.totalRecords[0]?.total,
        pageLimit: data[0]?.data.length,
        events: data[0]?.data,
      },
    });
  } catch (err) {
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
};
const crashFreeUsersDatewise = async (req, res) => {
  try {
    const { projectCode } = req.params;

    if (!req.query.projectType) {
    }

    if (!projectCode) {
      return res.status(500).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: '`Project code not provided.',
            msg: '`Project code not provided.',
            type: 'Internal Server Error',
          },
        },
      });
    }
    const projectCollection = await Projects.findOne({ code: projectCode });
    if (!projectCollection) {
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project not found.',
            msg: 'Project not found.',
            type: 'MongoDB Error',
          },
        },
      });
    }
    const collectionName = require(`../model/${projectCollection.collection_name}.js`);
    console.log('collectionName', collectionName)

    let dt = new Date(req.query.endDate);
    dt.setDate(dt.getDate() + 1);

    const countResponse = await collectionName.aggregate([
      {
        $match: {
          $and: [
            {
              'log.date': {
                $gte: new Date(req.query.startDate),
                $lte: dt,
              },
            },
            { 'log.type': { $ne: 'error' } },
            { type: req.query.projectType },
          ],
        },
      },
      {
        $lookup: {
          from: 'devices',
          localField: 'device',
          foreignField: '_id',
          as: 'device',
        },
      },
      {
        $group: {
          _id: '$device.did',
        },
      },
    ]);
    const response = await collectionName.aggregate([
      {
        $match: {
          $and: [
            {
              'log.date': {
                $gte: new Date(req.query.startDate),
                $lte: dt,
              },
            },
            { 'log.type': { $ne: 'error' } },
            { type: req.query.projectType },
          ],
        },
      },
      {
        $lookup: {
          from: 'devices',
          localField: 'device',
          foreignField: '_id',
          as: 'device',
        },
      },
      {
        $group: {
          _id: {
            DATE: { $substr: ['$log.date', 0, 10] },
            did: '$device.did',
          },
          data: { $sum: 1 },
        },
      },
      // // { $sort: { "DATE": -1 } },
      {
        $project: {
          _id: 0,
          date: '$_id.DATE',
          did: '$_id.did',
          data: 1,
        },
      },
      {
        $group: {
          _id: null,
          stats: { $push: '$$ROOT' },
        },
      },
      {
        $project: {
          stats: {
            $map: {
              input: getDaysArray(new Date(req.query.startDate), dt),
              as: 'date_new',
              in: {
                $let: {
                  vars: {
                    dateIndex: { $indexOfArray: ['$stats.date', '$$date_new'] },
                  },
                  in: {
                    $cond: {
                      if: { $ne: ['$$dateIndex', -1] },
                      then: {
                        $arrayElemAt: ['$stats', '$$dateIndex'],
                      },
                      else: {
                        date: { $substr: [{ $toDate: '$$date_new' }, 0, 10] },
                        did: null,
                        data: 0,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      {
        $unwind: '$stats',
      },
      {
        $replaceRoot: {
          newRoot: '$stats',
        },
      },
    ]);
    res.status(200).json({
      status: 1,
      data: { response, count: countResponse.length || 0 },
      message: 'Crash free users on the basis of date.',
    });
  } catch (err) {
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
};

const crashlyticsData = async (req, res) => {
  try {
    const { projectCode } = req.params;

    if (!req.query.projectType) {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'project type is required',
            msg: 'project type is required',
            type: 'Client Error',
          },
        },
      });
    }

    if (!req.query.logMsg) {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Log message not provided.',
            msg: 'Log message not provided.',
            type: 'ValidationError',
          },
        },
      });
    }

    var trimmedLogMsg;
    if (req.query.logMsg.length > 26) {
      trimmedLogMsg = req.query.logMsg.substring(0, 26);
    } else trimmedLogMsg = req.query.logMsg;
    trimmedLogMsg = trimmedLogMsg.replace('[', '');
    console.log(trimmedLogMsg, 'trimmedLogMsg');

    if (!projectCode) {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project code not provided.',
            msg: 'Project code not provided.',
            type: 'Mongodb Error',
          },
        },
      });
    }
    const projectCollection = await Projects.findOne({ code: projectCode });
    if (!projectCollection) {
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project not found',
            msg: 'Project not found',
            type: 'Internal Server Error',
          },
        },
      });
    }
    // console.log(projectCollection);
    const collectionName = require(`../model/${projectCollection.collection_name}.js`);
    console.log(collectionName, 'collectionName');
    const versionResponse = await collectionName.aggregate([
      {
        $match: {
          $and: [
            // {$unwind : '$log'},
            {
              'log.date': {
                $gte: new Date(req.query.startDate),
                $lte: new Date(req.query.endDate),
              },
            },
            { 'log.message': { $regex: trimmedLogMsg } },
            { type: req.query.projectType },
          ],
        },
      },
      {
        $group: {
          _id: '$version',
          data: { $sum: 1 },
        },
      },
    ]);
    console.log(versionResponse, 'versionResponse');
    const osArchitectureResponse = await collectionName.aggregate([
      {
        $match: {
          $and: [
            // {$unwind : '$log'},
            {
              'log.date': {
                $gte: new Date(req.query.startDate),
                $lte: new Date(req.query.endDate),
              },
            },
            { 'log.message': { $regex: trimmedLogMsg } },
            { type: req.query.projectType },
          ],
        },
      },
      {
        $lookup: {
          from: 'devices',
          localField: 'device',
          foreignField: '_id',
          as: 'device',
        },
      },
      {
        $group: {
          _id: '$device.os.name',
          data: { $sum: 1 },
        },
      },
    ]);
    console.log(osArchitectureResponse, 'osArchitectureResponse')
    const modelNameResponse = await collectionName.aggregate([
      {
        $match: {
          $and: [
            // {$unwind : '$log'},
            {
              'log.date': {
                $gte: new Date(req.query.startDate),
                $lte: new Date(req.query.endDate),
              },
            },
            { 'log.message': { $regex: trimmedLogMsg } },
            { type: req.query.projectType },
          ],
        },
      },
      {
        $lookup: {
          from: 'devices',
          localField: 'device',
          foreignField: '_id',
          as: 'device',
        },
      },
      {
        $group: {
          _id: '$device.name',
          data: { $sum: 1 },
        },
      },
    ]);
    console.log(modelNameResponse, 'modelNameResponse')
    res.status(200).json({
      status: 1,
      data: { versionResponse, osArchitectureResponse, modelNameResponse },
      message: 'Crashlytics data on the basis of date.',
    });
  } catch (err) {
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
};
const crashlyticsData2 = async (req, res) => {
  try {
    const { did } = req.params;

    // if (!req.query.projectType) {
    //   return res.status(400).json({
    //     status: 0,
    //     data: {
    //       err: {
    //         generatedTime: new Date(),
    //         errMsg: 'project type is required',
    //         msg: 'project type is required',
    //         type: 'Client Error',
    //       },
    //     },
    //   });
    // }

    if (!req.query.logMsg) {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Log message not provided.',
            msg: 'Log message not provided.',
            type: 'ValidationError',
          },
        },
      });
    }

    var trimmedLogMsg;
    if (req.query.logMsg.length > 26) {
      trimmedLogMsg = req.query.logMsg.substring(0, 26);
    } else trimmedLogMsg = req.query.logMsg;
    trimmedLogMsg = trimmedLogMsg.replace('[', '');
    console.log(trimmedLogMsg, 'trimmedLogMsg');

    if (!did) {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'DeviceId not provided.',
            msg: 'DeviceId not provided.',
            type: 'Mongodb Error',
          },
        },
      });
    }
    const projectCollection = await Projects.findOne({ did: did });
    if (!projectCollection) {
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project not found',
            msg: 'Project not found',
            type: 'Internal Server Error',
          },
        },
      });
    }
    // console.log(projectCollection);
    const collectionName = require(`../model/${projectCollection.collection_name}.js`);
    console.log(collectionName, 'collectionName');
    const versionResponse = await collectionName.aggregate([
      {
        $match: {
          $and: [
            // {$unwind : '$log'},
            {
              'log.date': {
                $gte: new Date(req.query.startDate),
                $lte: new Date(req.query.endDate),
              },
            },
            { 'log.message': { $regex: trimmedLogMsg } },
            { type: req.query.projectType },
          ],
        },
      },
      {
        $group: {
          _id: '$version',
          data: { $sum: 1 },
        },
      },
    ]);
    console.log(versionResponse, 'versionResponse');
    const osArchitectureResponse = await collectionName.aggregate([
      {
        $match: {
          $and: [
            // {$unwind : '$log'},
            {
              'log.date': {
                $gte: new Date(req.query.startDate),
                $lte: new Date(req.query.endDate),
              },
            },
            { 'log.message': { $regex: trimmedLogMsg } },
            { type: req.query.projectType },
          ],
        },
      },
      {
        $lookup: {
          from: 'devices',
          localField: 'device',
          foreignField: '_id',
          as: 'device',
        },
      },
      {
        $group: {
          _id: '$device.os.name',
          data: { $sum: 1 },
        },
      },
    ]);
    console.log(osArchitectureResponse, 'osArchitectureResponse')
    const modelNameResponse = await collectionName.aggregate([
      {
        $match: {
          $and: [
            // {$unwind : '$log'},
            {
              'log.date': {
                $gte: new Date(req.query.startDate),
                $lte: new Date(req.query.endDate),
              },
            },
            { 'log.message': { $regex: trimmedLogMsg } },
            { type: req.query.projectType },
          ],
        },
      },
      {
        $lookup: {
          from: 'devices',
          localField: 'device',
          foreignField: '_id',
          as: 'device',
        },
      },
      {
        $group: {
          _id: '$device.name',
          data: { $sum: 1 },
        },
      },
    ]);
    console.log(modelNameResponse, 'modelNameResponse')
    res.status(200).json({
      status: 1,
      data: { versionResponse, osArchitectureResponse, modelNameResponse },
      message: 'Crashlytics data on the basis of date.',
    });
  } catch (err) {
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
};

// UNUSED
const getErrorCountByOSArchitecture = async (req, res) => {
  try {
    const { projectCode } = req.params;
    const isProjectExist = await Projects.findOne({ code: projectCode });

    if (!req.query.projectType) {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project code not provided.',
            msg: 'Project code not provided.',
            type: 'Mongodb Error',
          },
        },
      });
    }

    if (!isProjectExist) {
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project not found',
            msg: 'Project not found',
            type: 'Internal Server Error',
          },
        },
      });
    }

    const collectionName = require(`../model/${isProjectExist.collection_name}.js`);
    const typeWiseCount = await collectionName.aggregate([
      { $match: { 'log.type': 'error', type: req.query.projectType } },
      {
        $lookup: {
          from: 'devices',
          localField: 'device',
          foreignField: '_id',
          as: 'device',
        },
      },
      { $group: { _id: '$device.os.name', count: { $sum: 1 } } },
    ]);

    return res.status(200).json({
      status: 1,
      data: {
        typeWiseCount,
      },
      message: 'successfull',
    });
  } catch (err) {
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
};
const getLogsByLogType = async (req, res) => {
  try {
    const { projectCode } = req.params;

    if (!req.params.projectCode) {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project type not provided.',
            msg: 'Project type not provided.',
            type: 'Mongodb Error',
          },
        },
      });
    }

    const isProjectExist = await Projects.findOne({ code: projectCode });
    if (!isProjectExist) {
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project not found',
            msg: 'Project not found',
            type: 'Internal Server Error',
          },
        },
      });
    }

    if (!req.query.projectType) {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project type not provided.',
            msg: 'Project type not provided.',
            type: 'Mongodb Error',
          },
        },
      });
    }

    if (!req.query.startDate || !req.query.endDate) {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Provide start date and end date.',
            msg: 'Provide start date and end date.',
            type: 'ValidationError',
          },
        },
      });
    }

    const collectionName = require(`../model/${isProjectExist.collection_name}.js`);
    console.log(collectionName, 'collectionName')

    let dt = new Date(req.query.endDate);
    dt.setDate(dt.getDate() + 1);

    const typeWiseCount = await collectionName.aggregate([
      {
        $match: {
          'log.date': {
            $gte: new Date(req.query.startDate),
            $lte: dt,
          },
          type: req.query.projectType,
        },
      },
      { $group: { _id: '$log.type', count: { $sum: 1 } } },
      { $project: { logType: '$_id', count: 1, _id: 0 } },
    ]);
    const totalLogCount = await collectionName.aggregate([
      {
        $match: {
          'log.date': {
            $gte: new Date(req.query.startDate),
            $lte: dt,
          },
          type: req.query.projectType,
        },
      },
      { $group: { _id: 'null', count: { $sum: 1 } } },
    ]);
    const lastLogEntry = await collectionName.findOne().sort({ createdAt: -1 });

    return res.status(200).json({
      status: 1,
      data: {
        totalLogCount: totalLogCount.length ? totalLogCount[0].count : null,
        typeWiseCount,
        lastLogEntry: lastLogEntry ? lastLogEntry.createdAt : null,
      },
      message: 'successfull',
    });
  } catch (err) {
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
};

const dateWiseCrashCount = async (req, res) => {
  try {
    const { projectCode } = req.params;

    if (!req.query.projectType) {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project type not provided.',
            msg: 'Project type not provided.',
            type: 'Mongodb Error',
          },
        },
      });
    }

    if (!projectCode) {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project code not provided.',
            msg: 'Project code not provided.',
            type: 'Mongodb Error',
          },
        },
      });
    }
    const projectCollection = await Projects.findOne({ code: projectCode });
    if (!projectCollection) {
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project not found',
            msg: 'Project not found',
            type: 'Internal Server Error',
          },
        },
      });
    }
    const collectionName = require(`../model/${projectCollection.collection_name}.js`);

    let dt = new Date(req.query.endDate);
    dt.setDate(dt.getDate() + 1);

    const countResponse = await collectionName.aggregate([
      {
        $match: {
          $and: [
            {
              'log.date': {
                $gte: new Date(req.query.startDate),
                $lte: dt,
              },
            },
            { type: req.query.projectType },
            { 'log.type': 'error' },
          ],
        },
      },
      {
        $lookup: {
          from: 'devices',
          localField: 'device',
          foreignField: '_id',
          as: 'device',
        },
      },
      {
        $group: {
          _id: '$device.did',
        },
      },
    ]);
    const response = await collectionName.aggregate([
      {
        $match: {
          'log.date': {
            $gte: new Date(req.query.startDate),
            $lte: dt,
          },
          'log.type': 'error',
          type: req.query.projectType,
        },
      },
      {
        $group: {
          _id: {
            DATE: { $substr: ['$log.date', 0, 10] },
          },
          data: { $sum: 1 },
        },
      },
      // { $sort: { "DATE": -1 } },
      {
        $project: {
          _id: 0,
          date: '$_id.DATE',
          data: 1,
        },
      },
      {
        $group: {
          _id: null,
          stats: { $push: '$$ROOT' },
        },
      },
      {
        $project: {
          stats: {
            $map: {
              input: getDaysArray(new Date(req.query.startDate), dt),
              as: 'date_new',
              in: {
                $let: {
                  vars: {
                    dateIndex: { $indexOfArray: ['$stats.date', '$$date_new'] },
                  },
                  in: {
                    $cond: {
                      if: { $ne: ['$$dateIndex', -1] },
                      then: {
                        $arrayElemAt: ['$stats', '$$dateIndex'],
                      },
                      else: {
                        date: { $substr: [{ $toDate: '$$date_new' }, 0, 10] },
                        data: 0,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      {
        $unwind: '$stats',
      },
      {
        $replaceRoot: {
          newRoot: '$stats',
        },
      },
    ]);
    res.status(200).json({
      status: 1,
      data: { response, count: countResponse.length || 0 },
      message: 'Log count on the basis of date.',
    });
  } catch (err) {
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
};

const dateWiseLogOccurrencesByLogMsg = async (req, res) => {
  try {
    const { projectCode } = req.params;

    if (!req.query.projectType) {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project Type not provided.',
            msg: 'Project Type not provided.',
            type: 'Mongodb Error',
          },
        },
      });
    }

    if (!projectCode) {
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project not found',
            msg: 'Project not found',
            type: 'Internal Server Error',
          },
        },
      });
    }
    const projectCollection = await Projects.findOne({ code: projectCode });
    if (!projectCollection) {
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project not found',
            msg: 'Project not found',
            type: 'Internal Server Error',
          },
        },
      });
    }

    if (!req.query.logMsg) {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Log message not provided.',
            msg: 'Log message not provided.',
            type: 'ValidationError',
          },
        },
      });
    }

    var trimmedLogMsg;
    if (req.query.logMsg.length > 26) {
      trimmedLogMsg = req.query.logMsg.substring(0, 26);
    } else trimmedLogMsg = req.query.logMsg;
    if (trimmedLogMsg.includes('(') && !trimmedLogMsg.includes(')')) {
      trimmedLogMsg = trimmedLogMsg.concat(')');
    }
    trimmedLogMsg = trimmedLogMsg.replace('[', '');

    const collectionName = require(`../model/${projectCollection.collection_name}.js`);
    const response = await collectionName.aggregate([
      {
        $match: {
          $and: [
            // {$unwind : '$log'},
            {
              'log.date': {
                $gte: new Date(req.query.startDate),
                $lte: new Date(req.query.endDate),
              },
            },
            { 'log.message': { $regex: trimmedLogMsg } },
            { type: req.query.projectType },
          ],
        },
      },
      {
        $group: {
          _id: {
            DATE: { $substr: ['$log.date', 0, 10] },
          },
          data: { $sum: 1 },
        },
      },
      // { $sort: { "DATE": -1 } },
      {
        $project: {
          _id: 0,
          date: '$_id.DATE',
          data: 1,
        },
      },
      {
        $group: {
          _id: null,
          stats: { $push: '$$ROOT' },
        },
      },
      {
        $project: {
          stats: {
            $map: {
              input: getDaysArray(
                new Date(req.query.startDate),
                new Date(req.query.endDate)
              ),
              as: 'date_new',
              in: {
                $let: {
                  vars: {
                    dateIndex: { $indexOfArray: ['$stats.date', '$$date_new'] },
                  },
                  in: {
                    $cond: {
                      if: { $ne: ['$$dateIndex', -1] },
                      then: {
                        $arrayElemAt: ['$stats', '$$dateIndex'],
                      },
                      else: {
                        date: { $substr: [{ $toDate: '$$date_new' }, 0, 10] },
                        data: 0,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      {
        $unwind: '$stats',
      },
      {
        $replaceRoot: {
          newRoot: '$stats',
        },
      },
    ]);
    res.status(200).json({
      status: 1,
      data: { response },
      message: 'Log count per log message on the basis of date.',
    });
  } catch (err) {
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
};
const dateWiseLogOccurrencesByLogMsgWithDeviceId = async (req, res) => {
  try {
    const { did } = req.params;

    // if (!req.query.projectType) {
    //   return res.status(400).json({
    //     status: 0,
    //     data: {
    //       err: {
    //         generatedTime: new Date(),
    //         errMsg: 'Project Type not provided.',
    //         msg: 'Project Type not provided.',
    //         type: 'Mongodb Error',
    //       },
    //     },
    //   });
    // }

    if (!did) {
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'DeviceId not found',
            msg: 'DeviceId not found',
            type: 'Internal Server Error',
          },
        },
      });
    }
    const projectCollection = await Projects.findOne({ did: did });
    if (!projectCollection) {
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project not found',
            msg: 'Project not found',
            type: 'Internal Server Error',
          },
        },
      });
    }

    if (!req.query.logMsg) {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Log message not provided.',
            msg: 'Log message not provided.',
            type: 'ValidationError',
          },
        },
      });
    }

    var trimmedLogMsg;
    if (req.query.logMsg.length > 26) {
      trimmedLogMsg = req.query.logMsg.substring(0, 26);
    } else trimmedLogMsg = req.query.logMsg;
    if (trimmedLogMsg.includes('(') && !trimmedLogMsg.includes(')')) {
      trimmedLogMsg = trimmedLogMsg.concat(')');
    }
    trimmedLogMsg = trimmedLogMsg.replace('[', '');

    const collectionName = require(`../model/${projectCollection.collection_name}.js`);
    const response = await collectionName.aggregate([
      {
        $match: {
          $and: [
            // {$unwind : '$log'},
            {
              'log.date': {
                $gte: new Date(req.query.startDate),
                $lte: new Date(req.query.endDate),
              },
            },
            { 'log.message': { $regex: trimmedLogMsg } },
            { type: req.query.projectType },
          ],
        },
      },
      {
        $group: {
          _id: {
            DATE: { $substr: ['$log.date', 0, 10] },
          },
          data: { $sum: 1 },
        },
      },
      // { $sort: { "DATE": -1 } },
      {
        $project: {
          _id: 0,
          date: '$_id.DATE',
          data: 1,
        },
      },
      {
        $group: {
          _id: null,
          stats: { $push: '$$ROOT' },
        },
      },
      {
        $project: {
          stats: {
            $map: {
              input: getDaysArray(
                new Date(req.query.startDate),
                new Date(req.query.endDate)
              ),
              as: 'date_new',
              in: {
                $let: {
                  vars: {
                    dateIndex: { $indexOfArray: ['$stats.date', '$$date_new'] },
                  },
                  in: {
                    $cond: {
                      if: { $ne: ['$$dateIndex', -1] },
                      then: {
                        $arrayElemAt: ['$stats', '$$dateIndex'],
                      },
                      else: {
                        date: { $substr: [{ $toDate: '$$date_new' }, 0, 10] },
                        data: 0,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      {
        $unwind: '$stats',
      },
      {
        $replaceRoot: {
          newRoot: '$stats',
        },
      },
    ]);
    res.status(200).json({
      status: 1,
      data: { response },
      message: 'Log count per log message on the basis of date.',
    });
  } catch (err) {
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
};

// UNUSED
const getLogsCountWithOs = async (req, res) => {
  try {
    const { projectCode } = req.params;
    if (!projectCode) {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project code not provided.',
            msg: 'Project code not provided.',
            type: 'Mongodb Error',
          },
        },
      });
    }

    const projectCollection = await Projects.findOne({ code: projectCode });
    if (!projectCollection) {
      // throw new AppError(`Project not found.`, 404); // NJ-changes 13 Apr
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project not found',
            msg: 'Project not found',
            type: 'Internal Server Error',
          },
        },
      });
    }

    const collectionName = require(`../model/${projectCollection.collection_name}.js`);

    const osTotalCount = await collectionName.countDocuments();
    const osParticularCount = await collectionName.aggregate([
      {
        $lookup: {
          from: 'devices',
          localField: 'device',
          foreignField: '_id',
          as: 'device',
        },
      },
      { $group: { _id: '$device.os.name', count: { $sum: 1 } } },
      { $project: { osArchitecture: '$_id', count: 1, _id: 0 } },
    ]);

    // console.log(osParticularCount);
    return res.status(200).json({
      status: 1,
      data: {
        deviceCount: osTotalCount,
        osParticularCount: osParticularCount[0].count,
      },
      message: 'successfull',
    });
  } catch (err) {
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
};

// UNUSED
const getLogsCountWithModelName = async (req, res) => {
  try {
    const { projectCode } = req.params;
    if (!projectCode) {
      // throw new AppError(`Project code not provided.`, 400); // NJ-changes 13 Apr
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project Code not found',
            msg: 'Project Code not found',
            type: 'Mongodb Error',
          },
        },
      });
    }

    const projectCollection = await Projects.findOne({ code: projectCode });
    if (!projectCollection) {
      // throw new AppError(`Project not found.`, 404); // NJ-changes 13 Apr
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project not found',
            msg: 'Project not found',
            type: 'Internal Server Error',
          },
        },
      });
    }

    const collectionName = require(`../model/${projectCollection.collection_name}.js`);

    const modelTotalCount = await collectionName.countDocuments();
    const modelNameParticularCount = await collectionName.aggregate([
      {
        $lookup: {
          from: 'devices',
          localField: 'device',
          foreignField: '_id',
          as: 'device',
        },
      },
      { $group: { _id: '$device.name', count: { $sum: 1 } } },
      { $project: { modelName: '$_id', count: 1, _id: 0 } },
    ]);
    return res.status(200).json({
      status: 1,
      data: {
        deviceCount: modelTotalCount,
        modelNameParticularCount: modelNameParticularCount[0].count,
      },
      message: 'successfull',
    });
  } catch (err) {
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
};
const getCrashOccurrenceByLogMsgWithDeviceId = async (req, res) => {
  try {
    const { did } = req.params;
    if (!did) {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'DeviceId is required',
            msg: 'DeviceId is required',
            type: 'mongodb Error'

          }
        }
      });
    }
    // if (!projectCode) {
    //   return res.status(400).json({
    //     status: 0,
    //     data: {
    //       err: {
    //         generatedTime: new Date(),
    //         errMsg: 'Project code not provided.',
    //         msg: 'Project code not provided.',
    //         type: 'Mongodb Error',
    //       },
    //     },
    //   });
    // }


    if (!req.query.logMsg) {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Message not provided.',
            msg: 'Message not provided.',
            type: 'Mongodb Error',
          },
        },
      });
    }
    console.log(req.query.logMsg, 'ftrtdefffffffff');
    var trimmedLogMsg;
    if (req.query.logMsg.length > 26) {
      trimmedLogMsg = req.query.logMsg.substring(0, 26);
    } else trimmedLogMsg = req.query.logMsg;
    trimmedLogMsg = trimmedLogMsg.replace('[', '');

    const projectCollection = await Projects.findOne({ did: did });
    console.log(projectCollection, "projectCollection");
    if (!projectCollection) {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project code not provided.',
            msg: 'Project code not provided.',
            type: 'Mongodb Error',
          },
        },
      });
    }

    const collectionName = require(`../model/${projectCollection.collection_name}.js`);
    console.log(collectionName);

    const response = await collectionName.aggregate([
      {
        $match: {
          $and: [
            // {did:req.query.macId },
            { 'log.message': { $regex: trimmedLogMsg } },
            { 'log.type': 'error' },
            { type: req.query.projectType },
          ],
        },
      },
      {
        $lookup: {
          from: 'devices',
          localField: 'device',
          foreignField: '_id',
          as: 'device',
        },
      },
      {
        $group: {
          _id: '$device.did',
          count: { $sum: 1 }
        }
      },
    ]);
    console.log(response, 'response');


    return res.status(200).json({
      status: 1,
      data: {
        response,
      },
      message: 'successfull',
    });


  }
  catch (err) {
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
}

const getCrashOccurrenceByLogMsg = async (req, res) => {
  try {
    const { projectCode } = req.params;

    if (!req.query.projectType) {
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project type not found',
            msg: 'Project type not found',
            type: 'Internal Server Error',
          },
        },
      });
    }

    if (!projectCode) {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project code not provided.',
            msg: 'Project code not provided.',
            type: 'Mongodb Error',
          },
        },
      });
    }

    if (!req.query.msg) {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Message not provided.',
            msg: 'Message not provided.',
            type: 'Mongodb Error',
          },
        },
      });
    }

    var trimmedLogMsg;
    if (req.query.msg.length > 26) {
      trimmedLogMsg = req.query.msg.substring(0, 26);
    } else trimmedLogMsg = req.query.msg;
    trimmedLogMsg = trimmedLogMsg.replace('[', '');

    const projectCollection = await Projects.findOne({ code: projectCode });
    console.log(projectCollection, "projectCollection");

    if (!projectCollection) {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project code not provided.',
            msg: 'Project code not provided.',
            type: 'Mongodb Error',
          },
        },
      });
    }
    //console.log(collectionName);

    const collectionName = require(`../model/${projectCollection.collection_name}.js`);
    console.log(collectionName);

    const response = await collectionName.aggregate([
      {
        $match: {
          $and: [
            // {did:req.query.macId },
            { 'log.message': { $regex: trimmedLogMsg } },
            { 'log.type': 'error' },
            { type: req.query.projectType },
          ],
        },
      },
      {
        $lookup: {
          from: 'devices',
          localField: 'device',
          foreignField: '_id',
          as: 'device',
        },
      },
      {
        $group: {
          _id: '$device.did',
          count: { $sum: 1 }
        }
      },
    ]);
    console.log(response, 'response');


    return res.status(200).json({
      status: 1,
      data: {
        response,
      },
      message: 'successfull',
    });
  } catch (err) {
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
};

// UNUSED
const getErrorCountByVersion = async (req, res) => {
  try {
    const { projectCode } = req.params;
    const isProjectExist = await Projects.findOne({ code: projectCode });

    if (!req.query.projectType) {
      // throw new AppError(`project type is required`, 400); // NJ-changes 13 Apr
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project type not found',
            msg: 'Project type not found',
            type: 'Internal server Error',
          },
        },
      });
    }

    if (!isProjectExist) {
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Project not found',
            msg: 'Project not found',
            type: 'Internal Server Error',
          },
        },
      });
    }

    const collectionName = require(`../model/${isProjectExist.collection_name}.js`);
    const typeWiseCount = await collectionName.aggregate([
      { $match: { 'log.type': 'error', type: req.query.projectType } },
      { $group: { _id: '$version', count: { $sum: 1 } } },
    ]);

    return res.status(200).json({
      status: 1,
      data: {
        typeWiseCount,
      },
      message: 'successfull',
    });
  } catch (err) {
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
};

module.exports = {
  createLogs,
  createLogsV2,
  createAlerts,
  getFilteredLogs,
  getAlertsById,
  getEventsById,
  getAlertsWithFilter,
  getEventsWithFilter,
  crashFreeUsersDatewise,
  crashlyticsData,
  getErrorCountByOSArchitecture,
  getLogsByLogType,
  dateWiseCrashCount,
  dateWiseLogOccurrencesByLogMsg,
  getLogsCountWithOs,
  getLogsCountWithModelName,
  getCrashOccurrenceByLogMsg,
  getErrorCountByVersion,
  createEvents,
  getLogsById,
  getAllEvents,
  crashlyticsData2,
  getCrashOccurrenceByLogMsgWithDeviceId,
  dateWiseLogOccurrencesByLogMsgWithDeviceId
};
