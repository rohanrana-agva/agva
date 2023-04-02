const bcrypt = require('bcrypt');
const { makeId } = require('../helper/helperFunctions');
const JWTR = require('jwt-redis').default;
const Users = require('../model/users');
const ForgetPassword = require('../model/forgetPassword');
const Email = require('../utils/email');
let redisClient = require('../config/redisInit');
const { validationResult } = require('express-validator');

const jwtr = new JWTR(redisClient);
/**
 * api      POST @/api/logger/register
 * desc     @register for logger access only
 */
const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const emailTaken = await Users.findOne({ email: email });

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

    if (emailTaken) {
      // throw new AppError(`Email already taken`, 409);
      return res.status(409).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Email already taken',
            msg: 'Email already taken',
            type: 'Duplicate Key Error',
          },
        },
      });
    }

    if (!email || !name || !password) {
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

    const salt = await bcrypt.genSalt();
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await new Users({
      name,
      email,
      isSuperAdmin: false,
      passwordHash,
      image: '',
    });

    const savedUser = await user.save(user);

    if (savedUser) {
      const url = `${req.protocol}://${req.get('host')}/welcome`;

      new Email(email, url).sendWelcome();

      res.status(201).json({
        status: 1,
        data: { name: savedUser.name, avatar: savedUser.image },
        message: 'Registered successfully!',
      });
    } else {
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

/**
 *
 * @param {email, password} req
 * @param {token} res
 * @api     POST @/api/logger/login
 */

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

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

    const isUserExist = await Users.findOne({ email: email });

    if (!isUserExist) {
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'User not available with this email address.',
            msg: 'User not available with this email address.',
            type: 'Internal Server Error',
          },
        },
      });
    }

    const isPasswordCorrect = await bcrypt.compare(
      password,
      isUserExist.passwordHash
    );

    if (!isPasswordCorrect) {
      return res.status(401).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Password is incorrect',
            msg: 'Password is incorrect',
            type: 'Internal Server Error',
          },
        },
      });
    }

    const id = { user: isUserExist._id };
    const token = await jwtr.sign(id, process.env.JWT_SECRET, {
      expiresIn: '15d',
    });

    return res.status(200).json({
      status: 1,
      message: `Logged in Successfully`,
      data: {
        token: token,
        name: isUserExist.name,
        email: isUserExist.email,
        image: isUserExist.image,
        isSuperAdmin: isUserExist.isSuperAdmin,
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

const updateUserProfile = async (req, res) => {
  try {
    const { name } = req.body;
    const user = await Users.findById(req.user);
    if (!user) {
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'User does not found',
            msg: 'User does not found',
            type: 'Mongodb Error',
          },
        },
      });
    }

    // store data in DB
    user.name = name || user.name;

    const isSaved = await user.save();

    if (!isSaved) {
      return res.status(500).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'User profile update fail',
            msg: 'User profile update fail',
            type: 'Internal Server Error',
          },
        },
      });
    }

    return res.status(200).json({
      message: 'User details updated successfully!',
      name: isSaved.name,
      avatar: isSaved.image,
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

const userForgetPassword = async (req, res) => {
  try {
    const { email } = req.body;

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

    const user = await Users.findOne({ email });

    if (!user) {
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Email does not exist!',
            msg: 'Email does not exist!',
            type: 'Internal Server Error',
          },
        },
      });
    }

    const otp = makeId(6);

    // store email in ForgetPassword Model
    const store = await new ForgetPassword({
      email: user.email,
      otp,
      user: user._id,
    });

    const storeOTP = await store.save(store);
    if (!storeOTP) {
      return res.status(500).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Otp not send.',
            msg: 'Otp not send.',
            type: 'Internal ServerError',
          },
        },
      });
    }

    const url = `${otp}`;

    new Email(email, url).forgetPassword();

    return res
      .status(200)
      .json({ success: true, message: `Email send to you!` });
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
 * @desc        Reset password
 * @Endpoint    Post @/api/users/resetPasemailsword
 * @access      Token access
 */
const resetForgetPassword = async (req, res) => {
  try {
    const { email, otp, password, passwordVerify } = req.body;

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

    if (password !== passwordVerify) {
      return res.status(401).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Make sure your passwords match.',
            msg: 'Make sure your passwords match.',
            type: 'ValidationError',
          },
        },
      });
    }

    // find user using email
    const user = await Users.findOne({ email });
    const fp = await ForgetPassword.findOne({ otp });

    if (!fp) {
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'OTP does not exist!',
            msg: 'OTP does not exist!',
            type: 'Internal Server Error',
          },
        },
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (isMatch) {
      return res.status(401).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg:
              'You cannot set your previous password as new password, Enter new password!',
            msg: 'You cannot set your previous password as new password, Enter new password!',
            type: 'Internal Server Error',
          },
        },
      });
    }

    if (user.email === fp.email) {
      // update password of user
      const salt = await bcrypt.genSalt();
      const passwordHash = await bcrypt.hash(password, salt);
      user.passwordHash = passwordHash;
      const saveUser = await user.save();
      if (!saveUser) {
        return res.status(500).json({
          status: 0,
          data: {
            err: {
              generatedTime: new Date(),
              errMsg: 'User not saved',
              msg: 'User not saved',
              type: 'MongodbError',
            },
          },
        });
      }

      // delete the document from forget password using email
      await ForgetPassword.deleteMany({ user: user._id });

      // SENDING FORGET MAIL USER

      // delete cookie email and other token
      return res
        .status(200)
        .json({ status: 1, data: {}, message: 'Password reset successfully' });
    } else {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'OTP does not match, try again!',
            msg: 'OTP does not match, try again!',
            type: 'Internal Server Error',
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

const logoutUser = async (req, res) => {
  try {
    // const gettoken = req.headers["authorization"].split(" ")[1];
    await jwtr.destroy(req.jti);
    return res
      .status(200)
      .json({ status: 1, data: {}, message: 'Logged out successfully!' });
    // return res.json({'message':'Logged out successfully!','token':token});
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

// update user profile
const userPasswordChange = async (req, res) => {
  try {
    var { currentPassword, newPassword } = req.body;
    // console.log(currentPassword);

    //  currentPassword could not be empty -----
    if (!currentPassword) {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Current password should not be empty',
            msg: 'Current password should not be empty',
            type: 'Client  Error',
          },
        },
      });
    }
    //  new password could not be empty -----
    if (!newPassword) {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'new password should not be empty',
            msg: 'new password should not be empty',
            type: 'Client  Error',
          },
        },
      });
    }
    //  new password should not match current password -----
    if (currentPassword === newPassword) {
      return res.status(400).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Current and New password should not be same`',
            msg: 'Current and New password should not be same`',
            type: 'Client  Error',
          },
        },
      });
    }

    const user = await Users.findById(req.user);

    const salt = await bcrypt.genSalt();

    //  current password correct checking -----
    const passwordCompare = await bcrypt.compare(
      currentPassword,
      user.passwordHash
    );
    if (!passwordCompare) {
      return res.status(401).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'Current password is incorrect',
            msg: 'Current password is incorrect',
            type: 'Internal Server Error',
          },
        },
      });
    }
    // checking new password and hashing it
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    user.passwordHash = newPasswordHash;

    await user.save();

    return res
      .status(200)
      .json({ status: 1, data: {}, message: 'Password changed successfully!' });
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

const getUserByUserId = async (req, res) => {
  try {
    const user = await Users.findById(req.user).select('-passwordHash');

    if (!user) {
      return res.status(404).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: 'User not found',
            msg: 'User not found',
            type: 'MongoDBError',
          },
        },
      });
    }

    res.status(200).json({
      status: 1,
      data: { user },
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

module.exports = {
  registerUser,
  loginUser,
  updateUserProfile,
  logoutUser,
  userForgetPassword,
  resetForgetPassword,
  userPasswordChange,
  getUserByUserId,
};
