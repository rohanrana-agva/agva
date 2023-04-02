const express = require("express");
const { body } = require('express-validator');
const router = express.Router();


const {
    registerUser,
    loginUser,
    updateUserProfile,
    logoutUser,
    userForgetPassword,
    resetForgetPassword,
    userPasswordChange,
    getUserByUserId
} = require('../controller/users.js')

const {
    isAuth
} = require('../middleware/authMiddleware');
const { profileCache } = require("../middleware/cache.js");

// AUTH Route
// Unprotected
router.post('/auth/login',
    body('email').notEmpty().isEmail(),
    body('password').notEmpty().trim().escape(),
    loginUser)
router.post('/auth/register',
    body('name').notEmpty(),
    body('email').notEmpty().isEmail(),
    body('password').notEmpty().trim().escape(),
    registerUser)
router.post("/auth/forget",
    body('email').notEmpty().isEmail(),
    userForgetPassword);

// Token access
router.post("/auth/resetPassword",
    body('otp').notEmpty(),
    body('email').notEmpty().isEmail(),
    body('password').notEmpty().trim().escape(),
    body('passwordVerify').notEmpty().trim().escape(),
    resetForgetPassword);

// Protected
router.get('/auth/logout', isAuth, logoutUser)

// USERS Route
// Protected Route
router.get('/users', isAuth, profileCache(10), getUserByUserId)
router.put('/users/update', isAuth, updateUserProfile)
router.put("/users/changepassword", isAuth, userPasswordChange);

module.exports = router;
