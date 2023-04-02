const express = require("express");
const { body } = require('express-validator');
const router = express.Router();
// const {
//     isAuth
// } = require('../middleware/authMiddleware');
const { registerDevice,
     getAllRegisteredDevice,
     getRegisterDeviceById,
    UpdateRegisterDeviceDetails
} = require("../controller/RegisterDevice");




router.post('/RegisterDevice',
    body('DeviceId').notEmpty(),
    body('IMEI_NO').notEmpty(),
    body('Hospital_Name').notEmpty(),
    body('Ward_No').notEmpty(),
    body('Ventilator_Operator').notEmpty(),
    body('Doctor_Name').notEmpty(),
    registerDevice);
router.get('/',getAllRegisteredDevice); 
router.get('/DeviceById/:did',getRegisterDeviceById);
router.put('/Update/:DeviceId',UpdateRegisterDeviceDetails);   

module.exports = router; 