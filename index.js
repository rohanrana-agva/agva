const express = require('express');
const path = require('path');
const cors = require('cors');
const connectDB = require('./config/db.js');
const morgan = require('morgan');
require('dotenv').config({ path: './.env' });

// importing router
const users = require('./route/users.js');
const projects = require('./route/projects');
const logs = require('./route/logs');
const RegisterDevice=require('./route/RegisterDevice')

// creating connection with DB
connectDB();

const app = express();
app.enable('trust proxy');

// DEVELOPMENT environment morgan logs
// if (process.env.NODE_ENV === "DEVELOPMENT") {
// app.use(morgan('tiny'));
app.use(morgan('dev'));
// }

app.use(cors());

// adding static folder
app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json({ limit: '1mb', extended: true }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

// Users Routing
app.use('/api/logger', users);

// Project Routing
app.use('/api/logger/projects', projects);

// Logs Routing
app.use('/api/logger/logs', logs);
//RegisterDevice
app.use('/api/logger/device',RegisterDevice);
// error handling for all routes which are not define
app.all('*', (req, res, next) => {
  res.status(400).json({
    status: 0,
    data: {
      err: {
        generatedTime: new Date(),
        errMsg: 'No Route Found',
        msg: 'No Route Found',
        type: 'Express Error',
      },
    },
  });

  next();
});

const PORT = process.env.PORT || 5000;

module.exports = app.listen(PORT, () => console.log(`active on port ${PORT}`));

// unhandledRejection Error handling
process.on('unhandledRejection', (err) => {
  console.log(err.name, err.message);
  console.log('UNHANDLED REJECTION! Shutting down...');
  process.exit(1);
});
