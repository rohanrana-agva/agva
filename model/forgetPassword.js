const mongoose = require('mongoose');

const forgetPasswordSchema = mongoose.Schema({
    email:{
        type:String,
        require:true
    },
    otp:{
        type:String,
        default:null
    },
    user:{
        type: mongoose.Schema.Types.ObjectId,
        ref:'User'
    }
},
{timestamps:true});

forgetPasswordSchema.index({createdAt: 1},{expireAfterSeconds: 300});

const ForgetPassword = mongoose.model('ForgetPassword',forgetPasswordSchema);

module.exports = ForgetPassword