const mongoose = require("mongoose");

const logsSchema = mongoose.Schema(
  {
   
   
    file: {
      type: String,
      required: [true, "Log file name is required."],
    },
    date: {
      type: String,
      required: [true, "Log date is required."],
      default: Date.now()
    },
    message: {
      type: String,
      // required: [true, "Log message is required"],
    },
    filePath: {
      type: String
    },
    type: {
      type: String,
      default: "verbose",
      enum: ["warn", "info", "error", "debug","verbose"],
    },
  },
  { timestamps: true }
);

const log = mongoose.model("Log", logsSchema);

module.exports = logsSchema;
