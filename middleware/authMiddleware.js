const User = require("../model/users");

let redisClient = require("../config/redisInit");

const JWTR = require("jwt-redis").default;
const jwtr = new JWTR(redisClient);

const isAuth = async (req, res, next) => {
  try {
    if (!req.headers["authorization"]) {
      return res.status(401).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: "You are not logged in!!",
            msg: "You are not logged in!!",
            type: "AuthenticationError",
          },
        },
      });
    }
    
    const token = req.headers["authorization"].split(" ")[1];

    if (!token) {
      return res.status(401).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: "User is not authenticated.",
            msg: "User is not authenticated.",
            type: "AuthenticationError",
          },
        },
      }); // NJ-changes 13 Apr
    }

    const verified = await jwtr.verify(token, process.env.JWT_SECRET);
    if (!verified) {
      return res.status(401).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: "User is not authenticated.",
            msg: "User is not authenticated.",
            type: "AuthenticationError",
          },
        },
      });
    }
    req.user = verified.user;
    console.log("req user", req.user);
    req.jti = verified.jti;

    // proceed after authentication
    next();
  } catch (err) {
    res.status(500).json({
      status: -1,
      data: {
        err: {
          generatedTime: new Date(),
          errMsg: err.message,
          msg: "Internal Server Error.",
          type: err.name,
        },
      },
    });
  }
};

const isSuperAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user);
    console.log("Details of user", user);
    console.log(user.isSuperAdmin);

    if (!user.isSuperAdmin) {
      return res.status(403).json({
        status: 0,
        data: {
          err: {
            generatedTime: new Date(),
            errMsg: "You dont have permission to access this.",
            msg: "You dont have permission to access this.",
            type: "AuthenticationError",
          },
        },
      });
    }
    next();
  } catch (err) {
    res.status(500).json({
      status: -1,
      data: {
        err: {
          generatedTime: new Date(),
          errMsg: err.message,
          msg: "Internal Server Error",
          type: err.name,
        },
      },
    });
  }

  // console.log("request created",req.user)
};

module.exports = { isAuth, isSuperAdmin };
